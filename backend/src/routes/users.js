const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { role, search, is_active } = req.query;
  let conditions = [], params = [], i = 1;
  if (role) { conditions.push(`role=$${i++}`); params.push(role); }
  if (is_active !== undefined) { conditions.push(`is_active=$${i++}`); params.push(is_active === 'true'); }
  if (search) { conditions.push(`(name ILIKE $${i} OR email ILIKE $${i})`); params.push(`%${search}%`); i++; }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await query(
    `SELECT id, name, email, phone, role, specialties, is_active, last_login, created_at FROM users ${where} ORDER BY created_at DESC`,
    params
  );
  res.json(result.rows);
}));

router.get('/engineers', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT u.id, u.name, u.phone, u.specialties,
      COUNT(c.id) FILTER (WHERE c.status IN ('dispatched','in_progress')) as active_tasks
    FROM users u LEFT JOIN cases c ON c.assigned_engineer_id = u.id
    WHERE u.role = 'engineer' AND u.is_active = true
    GROUP BY u.id ORDER BY u.name
  `);
  res.json(result.rows);
}));

// ⚠️ 通知路由必須在 /:id 之前定義
router.get('/notifications/mine', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(result.rows);
}));

router.put('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.user.id]);
  res.json({ message: '已全部標為已讀' });
}));

router.put('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
  res.json({ message: '已標為已讀' });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'customer_service' && req.user.id !== req.params.id)
    return res.status(403).json({ error: '權限不足' });
  const result = await query(
    `SELECT id, name, email, phone, role, specialties, avatar_url, is_active, last_login, created_at FROM users WHERE id=$1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: '用戶不存在' });
  res.json(result.rows[0]);
}));

router.post('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  let { name, email, password, phone, role, specialties } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: '姓名、Email、密碼、角色為必填' });
  if (password.length < 8)
    return res.status(400).json({ error: '密碼至少 8 碼' });
  // ── 長度保護 ──────────────────────────────────────────────────
  name  = String(name).trim().slice(0, 100);
  email = String(email).toLowerCase().trim().slice(0, 255);
  phone = phone ? String(phone).trim().slice(0, 20) : null;
  const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email 已存在' });
  const hashed = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (name, email, password, phone, role, specialties) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, phone, role, specialties, is_active`,
    [name, email, hashed, phone, role, specialties || null]
  );
  res.status(201).json(result.rows[0]);
}));

// ✅ 修復密碼更新
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  let { name, phone, role, specialties, is_active, password } = req.body;
  if (password && password.trim().length > 0) {
    if (password.trim().length < 8) return res.status(400).json({ error: '密碼至少 8 碼' });
    const hashed = await bcrypt.hash(password.trim(), 12);
    await query(`UPDATE users SET password=$1 WHERE id=$2`, [hashed, req.params.id]);
  }
  // ── 長度保護 ──────────────────────────────────────────────────
  name  = name  ? String(name).trim().slice(0, 100) : name;
  phone = phone ? String(phone).trim().slice(0, 20)  : null;
  const result = await query(
    `UPDATE users SET name=$1, phone=$2, role=$3, specialties=$4, is_active=$5 WHERE id=$6 RETURNING id, name, email, phone, role, specialties, is_active`,
    [name, phone, role, specialties || null, is_active !== false, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: '用戶不存在' });
  res.json(result.rows[0]);
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ error: '不能停用自己的帳號' });
  await query(`UPDATE users SET is_active=false WHERE id=$1`, [req.params.id]);
  res.json({ message: '帳號已停用' });
}));

module.exports = router;
