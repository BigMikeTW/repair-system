const router = require('express').Router();
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/chat/:caseId/messages
router.get('/:caseId/messages', authenticate, asyncHandler(async (req, res) => {
  const { limit = 50, before } = req.query;
  let sql = `SELECT * FROM chat_messages WHERE case_id=$1`;
  const params = [req.params.caseId];
  if (before) { sql += ` AND created_at < $2`; params.push(before); }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit));

  const result = await query(sql, params);
  res.json(result.rows.reverse());
}));

// GET /api/chat/conversations - list all chats (admin/CS)
router.get('/conversations/list', authenticate, asyncHandler(async (req, res) => {
  let sql, params = [];
  
  if (['admin','customer_service'].includes(req.user.role)) {
    sql = `
      SELECT c.id, c.case_number, c.title, c.owner_name, c.owner_company, c.status,
        (SELECT message FROM chat_messages WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM chat_messages WHERE case_id=c.id AND is_read=false AND sender_id != $1) as unread_count
      FROM cases c
      WHERE EXISTS (SELECT 1 FROM chat_messages WHERE case_id=c.id)
      ORDER BY last_message_at DESC NULLS LAST
    `;
    params = [req.user.id];
  } else {
    sql = `
      SELECT c.id, c.case_number, c.title, c.status,
        (SELECT message FROM chat_messages WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM chat_messages WHERE case_id=c.id AND is_read=false AND sender_id != $1) as unread_count
      FROM cases c
      WHERE c.owner_id=$2 OR c.assigned_engineer_id=$2
      ORDER BY last_message_at DESC NULLS LAST
    `;
    params = [req.user.id, req.user.id];
  }

  const result = await query(sql, params);
  res.json(result.rows);
}));

// POST /api/chat/:caseId/messages - send message (REST fallback)
router.post('/:caseId/messages', authenticate, asyncHandler(async (req, res) => {
  const { message, message_type = 'text', file_url } = req.body;
  if (!message && !file_url) return res.status(400).json({ error: '訊息不可為空' });

  const result = await query(`
    INSERT INTO chat_messages (case_id, sender_id, sender_name, sender_role, message, message_type, file_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [req.params.caseId, req.user.id, req.user.name, req.user.role, message || '', message_type, file_url || null]);

  res.status(201).json(result.rows[0]);
}));

// PUT /api/chat/:caseId/read - mark as read
router.put('/:caseId/read', authenticate, asyncHandler(async (req, res) => {
  await query(
    `UPDATE chat_messages SET is_read=true WHERE case_id=$1 AND sender_id != $2`,
    [req.params.caseId, req.user.id]
  );
  res.json({ message: '已標為已讀' });
}));

module.exports = router;
