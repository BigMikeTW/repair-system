const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/users
router.get('/', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { role, search, is_active } = req.query;
  let conditions = [], params = [], i = 1;
  if (role) { conditions.push(`role=$${i++}`); params.push(role); }
  if (is_active !== undefined) { conditions.push(`is_active=$${i++}`); params.push(is_active === 'true'); }
  if (search) {
    conditions.push(`(name ILIKE $${i} OR email ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await query(
    `SELECT id, name, email, phone, role, specialties, is_active, last_login, created_at FROM users ${where} ORDER BY created_at DESC`,
    params
  );
  res.json(result.rows);
}));

// GET /api/users/engineers - available engineers list
router.get('/engineers', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT u.id, u.name, u.phone, u.specialties,
      COUNT(c.id) FILTER (WHERE c.status IN ('dispatched','in_progress')) as active_tasks
    FROM users u
    LEFT JOIN cases c ON c.assigned_engineer_id = u.id
    WHERE u.role = 'engineer' AND u.is_active = true
    GROUP BY u.id ORDER BY u.name
  `);
  res.json(result.rows);
}));

// GET /api/users/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'customer_service' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: '權限不足' });
  }
  const result = await query(
    `SELECT id, name, email, phone, role, specialties, avatar_url, is_active, last_login, created_at FROM users WHERE id=$1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: '用戶不存在' });
  res.json(result.rows[0]);
}));

// POST /api/users - admin creates user
router.post('/', authenticate, authorize('admin'), [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['admin','engineer','customer_service','owner'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, phone, role, specialties } = req.body;
  const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email 已存在' });

  const hashed = await bcrypt.hash(password, 12);
  const result = await query(`
    INSERT INTO users (name, email, password, phone, role, specialties)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, phone, role, specialties, is_active
  `, [name, email, hashed, phone || null, role, specialties ? specialties : null]);

  res.status(201).json(result.rows[0]);
}));

// PUT /api/users/:id
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { name, phone, role, specialties, is_active } = req.body;
  const result = await query(`
    UPDATE users SET name=$1, phone=$2, role=$3, specialties=$4, is_active=$5
    WHERE id=$6 RETURNING id, name, email, phone, role, specialties, is_active
  `, [name, phone, role, specialties, is_active, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '用戶不存在' });
  res.json(result.rows[0]);
}));

// DELETE /api/users/:id (soft delete)
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ error: '不能停用自己的帳號' });
  await query(`UPDATE users SET is_active=false WHERE id=$1`, [req.params.id]);
  res.json({ message: '帳號已停用' });
}));

// ===== NOTIFICATIONS =====
// GET /api/users/notifications/mine
router.get('/notifications/mine', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(result.rows);
}));

// PUT /api/users/notifications/read-all
router.put('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.user.id]);
  res.json({ message: '已全部標為已讀' });
}));

// PUT /api/users/notifications/:id/read
router.put('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
  res.json({ message: '已標為已讀' });
}));

module.exports = router;
