const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
  if (!result.rows.length) return res.status(401).json({ error: '帳號或密碼錯誤' });

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: '帳號或密碼錯誤' });

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

  const { password: _, ...userData } = user;
  res.json({ token, user: userData });
}));

// POST /api/auth/register (owner self-registration)
router.post('/register', [
  body('name').trim().notEmpty().withMessage('姓名必填'),
  body('email').isEmail().normalizeEmail().withMessage('Email 格式不正確'),
  body('password').isLength({ min: 8 }).withMessage('密碼至少 8 碼'),
  body('phone').optional().isMobilePhone('zh-TW')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, phone, company } = req.body;
  const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email 已被使用' });

  const hashed = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (name, email, password, phone, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id, name, email, role, phone`,
    [name, email, hashed, phone || null]
  );

  const token = jwt.sign({ userId: result.rows[0].id, role: 'owner' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  res.status(201).json({ token, user: result.rows[0] });
}));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

// PUT /api/auth/profile
router.put('/profile', authenticate, [
  body('name').trim().notEmpty(),
  body('phone').optional()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, phone } = req.body;
  const result = await query(
    `UPDATE users SET name=$1, phone=$2 WHERE id=$3 RETURNING id, name, email, role, phone, specialties`,
    [name, phone, req.user.id]
  );
  res.json({ user: result.rows[0] });
}));

// PUT /api/auth/change-password
router.put('/change-password', authenticate, [
  body('oldPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { oldPassword, newPassword } = req.body;
  const result = await query('SELECT password FROM users WHERE id=$1', [req.user.id]);
  const valid = await bcrypt.compare(oldPassword, result.rows[0].password);
  if (!valid) return res.status(400).json({ error: '舊密碼錯誤' });

  const hashed = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password=$1 WHERE id=$2', [hashed, req.user.id]);
  res.json({ message: '密碼更新成功' });
}));

module.exports = router;
