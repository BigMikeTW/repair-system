require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'], credentials: false }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { error: '請求過於頻繁' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: '登入嘗試過多' } });
app.use('/api', limiter);
app.use('/api/auth/login', authLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/cases',      require('./routes/cases'));
app.use('/api/photos',     require('./routes/photos'));
app.use('/api/chat',       require('./routes/chat'));
app.use('/api/finance',    require('./routes/finance'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/backup',     require('./routes/backup'));
app.use('/api/case-types', require('./routes/caseTypes'));
app.use('/api/hr',         require('./routes/hr'));
app.use('/api/case-notes', require('./routes/caseNotes'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

app.use(require('./middleware/errorHandler').errorHandler);

// ── Socket.io ────────────────────────────────────────────────
const connectedUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch { next(new Error('Authentication error')); }
});

io.on('connection', (socket) => {
  connectedUsers.set(socket.userId, socket.id);
  socket.on('join_case', (caseId) => socket.join(`case:${caseId}`));
  socket.on('leave_case', (caseId) => socket.leave(`case:${caseId}`));
  socket.on('send_message', async ({ caseId, message, senderName, senderRole }) => {
    try {
      const result = await query(
        `INSERT INTO chat_messages (case_id, sender_id, sender_name, sender_role, message) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [caseId, socket.userId, senderName, senderRole, message]
      );
      io.to(`case:${caseId}`).emit('new_message', result.rows[0]);
    } catch { socket.emit('error', { message: '訊息發送失敗' }); }
  });
  socket.on('case_updated', (data) => io.to(`case:${data.caseId}`).emit('case_status_changed', data));
  socket.on('notify_user', (data) => {
    const target = connectedUsers.get(data.userId);
    if (target) io.to(target).emit('notification', data);
  });
  socket.on('disconnect', () => connectedUsers.delete(socket.userId));
});

app.set('io', io);
app.set('connectedUsers', connectedUsers);

// ── Auto backup ───────────────────────────────────────────────
const scheduleAutoBackup = () => {
  const now = new Date();
  const next2am = new Date();
  next2am.setHours(2, 0, 0, 0);
  if (now >= next2am) next2am.setDate(next2am.getDate() + 1);
  setTimeout(async () => {
    try {
      const { exec } = require('child_process');
      const fs = require('fs');
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const filename = `auto_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.sql`;
      const filepath = path.join(backupDir, filename);
      const cmd = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -F p -f "${filepath}"`;
      exec(cmd, async (err) => {
        const fs2 = require('fs');
        const fileSize = fs2.existsSync(filepath) ? fs2.statSync(filepath).size : 0;
        await query(
          `INSERT INTO backup_logs (backup_type, file_name, file_size, status, error_message) VALUES ('auto',$1,$2,$3,$4)`,
          [filename, fileSize, err ? 'failed' : 'success', err ? err.message : null]
        );
      });
    } catch (e) { console.error('Auto backup error:', e); }
    scheduleAutoBackup();
  }, next2am - now);
};

// ── Auto Migration ────────────────────────────────────────────
const runMigrations = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS closure_reports (
        id SERIAL PRIMARY KEY,
        closure_number VARCHAR(20) UNIQUE NOT NULL,
        case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id),
        summary TEXT,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'issued',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        receipt_number VARCHAR(20) UNIQUE NOT NULL,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_date TIMESTAMPTZ DEFAULT NOW(),
        payment_method VARCHAR(50) DEFAULT '銀行轉帳',
        reference_number VARCHAR(100),
        bank_account VARCHAR(100),
        notes TEXT,
        recorded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 5`);
    console.log('✅ Database migrations completed');
  } catch (e) {
    console.error('⚠️ Migration warning:', e.message);
  }
};

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await runMigrations();
  if (process.env.NODE_ENV !== 'test') scheduleAutoBackup();
});

module.exports = { app, server, io };
