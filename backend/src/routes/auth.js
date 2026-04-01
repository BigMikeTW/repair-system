const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const { body, validationResult } = require('express-validator');
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const makeToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

const safeUser = (u) => {
  const { password, ...rest } = u;
  return rest;
};

// ── 一般登入 ─────────────────────────────────────────────────
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
  res.json({ token: makeToken(user.id, user.role), user: safeUser(user) });
}));

// ── 一般註冊 ─────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('姓名必填'),
  body('email').isEmail().normalizeEmail().withMessage('Email 格式不正確'),
  body('password').isLength({ min: 8 }).withMessage('密碼至少 8 碼'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, phone } = req.body;
  const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email 已被使用' });

  const hashed = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (name, email, password, phone, role) VALUES ($1,$2,$3,$4,'owner') RETURNING *`,
    [name.trim().slice(0,100), email, hashed, phone ? phone.slice(0,20) : null]
  );
  res.status(201).json({ token: makeToken(result.rows[0].id, 'owner'), user: safeUser(result.rows[0]) });
}));

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

// ── PUT /api/auth/profile ─────────────────────────────────────
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const result = await query(
    `UPDATE users SET name=$1, phone=$2 WHERE id=$3 RETURNING id, name, email, role, phone, specialties, avatar_url`,
    [name ? String(name).trim().slice(0,100) : req.user.name, phone ? String(phone).trim().slice(0,20) : null, req.user.id]
  );
  res.json({ user: result.rows[0] });
}));

// ── PUT /api/auth/change-password ─────────────────────────────
router.put('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 8)
    return res.status(400).json({ error: '密碼格式不正確' });

  const result = await query('SELECT password FROM users WHERE id=$1', [req.user.id]);
  if (!result.rows[0].password)
    return res.status(400).json({ error: '此帳號使用第三方登入，無法修改密碼' });

  const valid = await bcrypt.compare(oldPassword, result.rows[0].password);
  if (!valid) return res.status(400).json({ error: '舊密碼錯誤' });

  const hashed = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password=$1 WHERE id=$2', [hashed, req.user.id]);
  res.json({ message: '密碼更新成功' });
}));

// ────────────────────────────────────────────────────────────
// LINE Login OAuth
// ────────────────────────────────────────────────────────────

// GET /api/auth/line  → 重導向到 LINE 授權頁面
router.get('/line', (req, res) => {
  const { redirect } = req.query; // 登入後返回的路徑
  const state = Buffer.from(JSON.stringify({ redirect: redirect || '/' })).toString('base64');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: `${process.env.FRONTEND_URL}/api/auth/line/callback`,
    state,
    scope: 'profile openid',
  });
  res.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
});

// GET /api/auth/line/callback → LINE 回調
router.get('/line/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=line_failed`);

  // 1. 用 code 換 access_token
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.FRONTEND_URL}/api/auth/line/callback`,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return res.redirect(`${process.env.FRONTEND_URL}/login?error=line_failed`);

  // 2. 取得用戶 Profile
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profile = await profileRes.json();
  const { userId: lineId, displayName, pictureUrl } = profile;

  // 3. 查找或建立用戶
  let user = (await query('SELECT * FROM users WHERE line_id=$1', [lineId])).rows[0];
  if (!user) {
    const result = await query(
      `INSERT INTO users (name, line_id, avatar_url, role, oauth_provider)
       VALUES ($1,$2,$3,'owner','line') RETURNING *`,
      [displayName.slice(0,100), lineId, pictureUrl || null]
    );
    user = result.rows[0];
  } else {
    await query('UPDATE users SET avatar_url=$1, last_login=NOW() WHERE id=$2', [pictureUrl || user.avatar_url, user.id]);
  }

  const token = makeToken(user.id, user.role);
  let redirectPath = '/';
  try { redirectPath = JSON.parse(Buffer.from(state, 'base64').toString()).redirect || '/'; } catch {}

  res.redirect(`${process.env.FRONTEND_URL}/oauth-callback?token=${token}&redirect=${encodeURIComponent(redirectPath)}`);
}));

// ────────────────────────────────────────────────────────────
// Google OAuth
// ────────────────────────────────────────────────────────────

// GET /api/auth/google → 重導向到 Google 授權頁面
router.get('/google', (req, res) => {
  const { redirect } = req.query;
  const state = Buffer.from(JSON.stringify({ redirect: redirect || '/' })).toString('base64');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    state,
    scope: 'openid profile email',
    access_type: 'offline',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback → Google 回調
router.get('/google/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);

  // 1. 用 code 換 token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);

  // 2. 取得用戶資料
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profile = await profileRes.json();
  const { id: googleId, name, email, picture } = profile;

  // 3. 查找或建立用戶（先用 email 查找，再用 google_id）
  let user = (await query('SELECT * FROM users WHERE google_id=$1', [googleId])).rows[0];
  if (!user && email) {
    user = (await query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    if (user) {
      await query('UPDATE users SET google_id=$1, avatar_url=$2 WHERE id=$3', [googleId, picture || user.avatar_url, user.id]);
    }
  }
  if (!user) {
    const result = await query(
      `INSERT INTO users (name, email, google_id, avatar_url, role, oauth_provider)
       VALUES ($1,$2,$3,$4,'owner','google') RETURNING *`,
      [name.slice(0,100), email || null, googleId, picture || null]
    );
    user = result.rows[0];
  }
  await query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);

  const token = makeToken(user.id, user.role);
  let redirectPath = '/';
  try { redirectPath = JSON.parse(Buffer.from(state, 'base64').toString()).redirect || '/'; } catch {}

  res.redirect(`${process.env.FRONTEND_URL}/oauth-callback?token=${token}&redirect=${encodeURIComponent(redirectPath)}`);
}));

module.exports = router;
