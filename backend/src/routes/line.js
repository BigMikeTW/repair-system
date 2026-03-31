/**
 * line.js — LINE Webhook & API 路由
 * POST /api/line/webhook     LINE 事件接收
 * GET  /api/line/auth        LINE Login 綁定回調
 * POST /api/line/bind        手動綁定 LINE ID
 * GET  /api/line/status      查詢綁定狀態
 */

const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  replyMessage,
  buildCaseStatusFlex,
  buildReportFormFlex,
  buildQueryResultFlex,
  isLineEnabled,
  LINE_CHANNEL_SECRET,
} = require('../utils/lineService');

// ── 驗證 LINE Webhook 簽名 ────────────────────────────────────
const verifyLineSignature = (body, signature) => {
  if (!LINE_CHANNEL_SECRET) return true; // dev mode
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
};

// ── 處理文字訊息 ─────────────────────────────────────────────
const handleTextMessage = async (event) => {
  const { replyToken, source, message } = event;
  const lineUserId = source.userId;
  const text = message.text?.trim() || '';

  // 查詢案件：輸入案件編號（WO-xxxx-xxxx 格式）
  const caseNumberMatch = text.match(/WO-\d{4}-\d{4}/i);
  if (caseNumberMatch) {
    const caseNumber = caseNumberMatch[0].toUpperCase();
    const result = await query(`
      SELECT c.*, u.name as engineer_name
      FROM cases c
      LEFT JOIN users u ON c.assigned_engineer_id = u.id
      WHERE c.case_number = $1
    `, [caseNumber]);

    const replyMsg = buildQueryResultFlex(result.rows);
    await replyMessage(replyToken, replyMsg);
    return;
  }

  // 關鍵字：查詢案件
  if (['查詢', '查詢案件', '進度', '查進度', 'query'].includes(text)) {
    await replyMessage(replyToken, {
      type: 'text',
      text: '請直接輸入您的案件編號（格式：WO-2026-0001）即可查詢案件進度 🔍',
    });
    return;
  }

  // 關鍵字：報修
  if (['報修', '申請報修', '我要報修', 'repair'].includes(text)) {
    await replyMessage(replyToken, buildReportFormFlex());
    return;
  }

  // 關鍵字：綁定帳號
  if (text.startsWith('綁定') || text.startsWith('bind')) {
    const token = text.split(' ')[1];
    if (token) {
      // 查詢綁定 token
      const userResult = await query(
        `SELECT * FROM users WHERE line_bind_token = $1 AND line_bind_token_expires > NOW()`,
        [token]
      );
      if (userResult.rows.length) {
        const user = userResult.rows[0];
        await query(
          `UPDATE users SET line_user_id = $1, line_bind_token = NULL, line_bind_token_expires = NULL WHERE id = $2`,
          [lineUserId, user.id]
        );
        await replyMessage(replyToken, {
          type: 'text',
          text: `✅ 綁定成功！${user.name}，您的 LINE 帳號已與系統帳號連結。\n\n之後您可以直接輸入案件編號查詢進度，或輸入「報修」申請新的報修服務。`,
        });
      } else {
        await replyMessage(replyToken, {
          type: 'text',
          text: '❌ 綁定碼無效或已過期，請重新從系統取得綁定碼。',
        });
      }
      return;
    }
  }

  // 預設回覆
  await replyMessage(replyToken, {
    type: 'flex',
    altText: '您好！我是 皇祥工程設計 智慧客服',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '您好！我是 皇祥工程設計 智慧客服 👋', weight: 'bold', size: 'md' },
          { type: 'text', text: '我可以協助您：', size: 'sm', color: '#888888', margin: 'md' },
          { type: 'text', text: '📋 輸入「報修」→ 申請報修', size: 'sm' },
          { type: 'text', text: '🔍 輸入案件編號 → 查詢進度', size: 'sm' },
          { type: 'text', text: '例：WO-2026-0001', size: 'xs', color: '#888888' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '📝 申請報修', text: '報修' },
            style: 'primary',
            color: '#FF6B00',
            height: 'sm',
          },
        ],
      },
    },
  });
};

// ── POST /api/line/webhook ────────────────────────────────────
router.post('/webhook', asyncHandler(async (req, res) => {
  // 先回 200，LINE 要求在 1 秒內回應
  res.status(200).json({ status: 'ok' });

  const signature = req.headers['x-line-signature'];
  const rawBody = JSON.stringify(req.body);

  if (!verifyLineSignature(rawBody, signature)) {
    console.warn('LINE webhook signature verification failed');
    return;
  }

  const events = req.body.events || [];

  for (const event of events) {
    try {
      if (event.type === 'message' && event.message.type === 'text') {
        await handleTextMessage(event);
      } else if (event.type === 'follow') {
        // 用戶加入 LINE OA 時的歡迎訊息
        await replyMessage(event.replyToken, buildReportFormFlex());
      }
    } catch (e) {
      console.error('LINE event handling error:', e.message);
    }
  }
}));

// ── POST /api/line/bind ── 從系統發起綁定（產生 token）────────
router.post('/bind', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: '缺少 user_id' });

  // 產生 6 碼綁定碼，有效期 30 分鐘
  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expires = new Date(Date.now() + 30 * 60 * 1000);

  await query(
    `UPDATE users SET line_bind_token = $1, line_bind_token_expires = $2 WHERE id = $3`,
    [token, expires, user_id]
  );

  res.json({
    token,
    expires_at: expires,
    instruction: `請在 LINE 官方帳號中輸入：綁定 ${token}`,
    line_oa_url: `https://line.me/R/ti/p/@${process.env.LINE_OA_ID || 'your-oa-id'}`,
  });
}));

// ── GET /api/line/status/:userId ── 查詢綁定狀態 ─────────────
router.get('/status/:userId', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, name, line_user_id, line_bind_token_expires FROM users WHERE id = $1`,
    [req.params.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: '用戶不存在' });

  const user = result.rows[0];
  res.json({
    bound: !!user.line_user_id,
    line_user_id: user.line_user_id ? '已綁定' : null,
  });
}));

// ── DELETE /api/line/unbind/:userId ── 解除綁定 ──────────────
router.delete('/unbind/:userId', asyncHandler(async (req, res) => {
  await query(
    `UPDATE users SET line_user_id = NULL WHERE id = $1`,
    [req.params.userId]
  );
  res.json({ message: '已解除 LINE 綁定' });
}));

module.exports = router;
