/**
 * lineService.js
 * LINE Messaging API 整合服務
 * 負責推播通知、Flex Message 設計、Webhook 處理
 */

const https = require('https');

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://repair.pro080.com';

const isLineEnabled = () => !!LINE_CHANNEL_ACCESS_TOKEN;

// ── 基礎 API 呼叫 ─────────────────────────────────────────────
const lineApi = (path, method = 'POST', body = null) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.line.me',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let result = '';
      res.on('data', (chunk) => result += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); }
        catch { resolve({ status: res.statusCode, raw: result }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

// ── 推播訊息給單一用戶 ────────────────────────────────────────
const pushMessage = async (lineUserId, messages) => {
  if (!isLineEnabled() || !lineUserId) return;
  try {
    await lineApi('/v2/bot/message/push', 'POST', {
      to: lineUserId,
      messages: Array.isArray(messages) ? messages : [messages],
    });
  } catch (e) {
    console.error('LINE push error:', e.message);
  }
};

// ── 回覆訊息 ─────────────────────────────────────────────────
const replyMessage = async (replyToken, messages) => {
  if (!isLineEnabled()) return;
  try {
    await lineApi('/v2/bot/message/reply', 'POST', {
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages],
    });
  } catch (e) {
    console.error('LINE reply error:', e.message);
  }
};

// ── 狀態標籤設計 ─────────────────────────────────────────────
const STATUS_COLORS = {
  pending:     { bg: '#FF6B6B', label: '待受理' },
  accepted:    { bg: '#FFA94D', label: '已受理' },
  dispatched:  { bg: '#4DABF7', label: '派工中' },
  in_progress: { bg: '#69DB7C', label: '施工中' },
  signing:     { bg: '#CC5DE8', label: '簽收中' },
  completed:   { bg: '#51CF66', label: '已完成' },
  closed:      { bg: '#868E96', label: '已結案' },
  cancelled:   { bg: '#868E96', label: '已取消' },
};

const URGENCY_COLORS = {
  emergency: { bg: '#FF6B6B', label: '🔴 緊急' },
  normal:    { bg: '#FFA94D', label: '🟡 一般' },
  low:       { bg: '#69DB7C', label: '🟢 低' },
};

// ── Flex Message：案件狀態卡片 ────────────────────────────────
const buildCaseStatusFlex = (c, title, subtitle) => ({
  type: 'flex',
  altText: `${title}：${c.case_number}`,
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'SIGNIFY',
              color: '#FF6B00',
              size: 'xs',
              weight: 'bold',
            },
            {
              type: 'text',
              text: STATUS_COLORS[c.status]?.label || c.status,
              color: '#FFFFFF',
              size: 'xs',
              align: 'end',
              offsetTop: '0px',
            },
          ],
        },
        { type: 'text', text: title, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' },
        { type: 'text', text: subtitle, color: '#CCCCCC', size: 'sm', wrap: true },
      ],
      backgroundColor: '#1A1A2E',
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '案件編號', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.case_number, size: 'sm', weight: 'bold', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '工程類型', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.case_type || '--', size: 'sm', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '施工地點', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.location_address || '--', size: 'sm', flex: 3, wrap: true },
          ],
        },
        ...(c.engineer_name ? [{
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '負責工程師', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.engineer_name, size: 'sm', weight: 'bold', color: '#FF6B00', flex: 3 },
          ],
        }] : []),
        ...(c.scheduled_start ? [{
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '預計到場', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: new Date(c.scheduled_start).toLocaleString('zh-TW'), size: 'sm', flex: 3 },
          ],
        }] : []),
        {
          type: 'separator',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: STATUS_COLORS[c.status]?.bg || '#868E96',
              cornerRadius: '4px',
              paddingAll: '6px',
              contents: [
                {
                  type: 'text',
                  text: STATUS_COLORS[c.status]?.label || c.status,
                  color: '#FFFFFF',
                  size: 'sm',
                  weight: 'bold',
                  align: 'center',
                },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: URGENCY_COLORS[c.urgency]?.bg || '#FFA94D',
              cornerRadius: '4px',
              paddingAll: '6px',
              margin: 'sm',
              contents: [
                {
                  type: 'text',
                  text: URGENCY_COLORS[c.urgency]?.label || c.urgency,
                  color: '#FFFFFF',
                  size: 'sm',
                  weight: 'bold',
                  align: 'center',
                },
              ],
            },
          ],
        },
      ],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '查看案件詳情',
            uri: `${FRONTEND_URL}/track/${c.case_number}`,
          },
          style: 'primary',
          color: '#FF6B00',
          height: 'sm',
        },
      ],
      paddingAll: '12px',
    },
  },
});

// ── Flex Message：工程師派工通知 ──────────────────────────────
const buildEngineerDispatchFlex = (c, engineerName) => ({
  type: 'flex',
  altText: `新任務指派：${c.case_number}`,
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0F3460',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '🔧 新任務指派', color: '#FFFFFF', size: 'lg', weight: 'bold' },
        { type: 'text', text: `${engineerName}，您有新的工程任務`, color: '#AAAACC', size: 'sm', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '案件編號', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.case_number, size: 'sm', weight: 'bold', color: '#FF6B00', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '工程標題', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.title, size: 'sm', flex: 3, wrap: true },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '工程類型', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.case_type || '--', size: 'sm', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '施工地點', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.location_address || '--', size: 'sm', flex: 3, wrap: true },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '緊急程度', size: 'sm', color: '#888888', flex: 2 },
            {
              type: 'text',
              text: URGENCY_COLORS[c.urgency]?.label || c.urgency,
              size: 'sm',
              weight: 'bold',
              color: c.urgency === 'emergency' ? '#FF6B6B' : '#333333',
              flex: 3,
            },
          ],
        },
        ...(c.scheduled_start ? [{
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '預計到場', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: new Date(c.scheduled_start).toLocaleString('zh-TW'), size: 'sm', flex: 3, weight: 'bold' },
          ],
        }] : []),
        ...(c.description ? [{
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8F9FA',
          cornerRadius: '8px',
          paddingAll: '10px',
          margin: 'md',
          contents: [
            { type: 'text', text: '報修說明', size: 'xs', color: '#888888', margin: 'none' },
            { type: 'text', text: c.description, size: 'sm', wrap: true, margin: 'sm' },
          ],
        }] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '前往現場作業頁面',
            uri: `${FRONTEND_URL}/field`,
          },
          style: 'primary',
          color: '#0F3460',
          height: 'sm',
        },
      ],
    },
  },
});

// ── Flex Message：業主簽收確認 ────────────────────────────────
const buildSignatureFlex = (c) => ({
  type: 'flex',
  altText: `工程完成，請確認簽收：${c.case_number}`,
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#27AE60',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '✅ 工程已完成', color: '#FFFFFF', size: 'lg', weight: 'bold' },
        { type: 'text', text: '請確認工程結果並完成簽收', color: '#D5F5E3', size: 'sm', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '案件編號', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.case_number, size: 'sm', weight: 'bold', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '工程項目', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.title, size: 'sm', flex: 3, wrap: true },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '負責工程師', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: c.engineer_name || '--', size: 'sm', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FFF9C4',
          cornerRadius: '8px',
          paddingAll: '10px',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: '⚠️ 請確認工程師已完成所有工程項目後再進行簽收。簽收後即視為確認工程完工。',
              size: 'xs',
              color: '#856404',
              wrap: true,
            },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '✍️ 前往簽收頁面',
            uri: `${FRONTEND_URL}/cases/${c.id}/sign`,
          },
          style: 'primary',
          color: '#27AE60',
          height: 'sm',
        },
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '查看案件詳情',
            uri: `${FRONTEND_URL}/track/${c.case_number}`,
          },
          style: 'secondary',
          height: 'sm',
        },
      ],
    },
  },
});

// ── 報修表單 Flex Message ─────────────────────────────────────
const buildReportFormFlex = () => ({
  type: 'flex',
  altText: '線上報修申請',
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1A1A2E',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: 'SIGNIFY', color: '#FF6B00', size: 'xs', weight: 'bold' },
        { type: 'text', text: '線上報修申請', color: '#FFFFFF', size: 'xl', weight: 'bold', margin: 'sm' },
        { type: 'text', text: '請點擊下方按鈕填寫報修資料', color: '#AAAAAA', size: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '📋', size: 'xl', flex: 1 },
            {
              type: 'box',
              layout: 'vertical',
              flex: 5,
              contents: [
                { type: 'text', text: '填寫報修單', size: 'md', weight: 'bold' },
                { type: 'text', text: '填寫故障說明、地點等資訊', size: 'sm', color: '#888888', wrap: true },
              ],
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '🔍', size: 'xl', flex: 1 },
            {
              type: 'box',
              layout: 'vertical',
              flex: 5,
              contents: [
                { type: 'text', text: '查詢案件進度', size: 'md', weight: 'bold' },
                { type: 'text', text: '輸入案件編號即可查詢', size: 'sm', color: '#888888' },
              ],
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '✅', size: 'xl', flex: 1 },
            {
              type: 'box',
              layout: 'vertical',
              flex: 5,
              contents: [
                { type: 'text', text: '線上簽收確認', size: 'md', weight: 'bold' },
                { type: 'text', text: '工程完成後直接在 LINE 確認', size: 'sm', color: '#888888' },
              ],
            },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '📝 填寫報修單',
            uri: `${FRONTEND_URL}/public/report`,
          },
          style: 'primary',
          color: '#FF6B00',
          height: 'sm',
        },
        {
          type: 'button',
          action: {
            type: 'message',
            label: '🔍 查詢案件進度',
            text: '查詢案件',
          },
          style: 'secondary',
          height: 'sm',
        },
      ],
    },
  },
});

// ── 案件進度查詢回覆 ─────────────────────────────────────────
const buildQueryResultFlex = (cases) => {
  if (!cases.length) {
    return {
      type: 'text',
      text: '❌ 查無此案件，請確認案件編號是否正確（格式：WO-2026-0001）',
    };
  }
  const c = cases[0];
  return buildCaseStatusFlex(c, '案件查詢結果', `查詢時間：${new Date().toLocaleString('zh-TW')}`);
};

// ── 推播工具函式：案件狀態相關 ───────────────────────────────
const notifyOwner = async (caseData, event) => {
  if (!isLineEnabled()) return;
  const ownerLineId = caseData.owner_line_id;
  if (!ownerLineId) return;

  let message;
  switch (event) {
    case 'accepted':
      message = buildCaseStatusFlex(caseData, '✅ 您的報修已受理', '我們已收到您的報修申請，客服人員正在處理中');
      break;
    case 'dispatched':
      message = buildCaseStatusFlex(caseData, '🔧 工程師已指派', `工程師 ${caseData.engineer_name} 即將為您服務`);
      break;
    case 'in_progress':
      message = buildCaseStatusFlex(caseData, '👷 工程師已到場', '工程師已到達現場，開始進行維修作業');
      break;
    case 'signing':
      message = buildSignatureFlex(caseData);
      break;
    case 'completed':
      message = buildCaseStatusFlex(caseData, '🎉 工程已完成結案', '感謝您的配合，如有問題歡迎再次聯繫');
      break;
    default:
      return;
  }
  await pushMessage(ownerLineId, message);
};

const notifyEngineer = async (caseData, engineerLineId, engineerName) => {
  if (!isLineEnabled() || !engineerLineId) return;
  const message = buildEngineerDispatchFlex(caseData, engineerName);
  await pushMessage(engineerLineId, message);
};

module.exports = {
  isLineEnabled,
  pushMessage,
  replyMessage,
  buildCaseStatusFlex,
  buildEngineerDispatchFlex,
  buildSignatureFlex,
  buildReportFormFlex,
  buildQueryResultFlex,
  notifyOwner,
  notifyEngineer,
  LINE_CHANNEL_SECRET,
};
