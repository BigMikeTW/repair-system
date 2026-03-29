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

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: '請求過於頻繁，請稍後再試' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: '登入嘗試過多，請 15 分鐘後再試' } });
app.use('/api', limiter);
app.use('/api/auth/login', authLimiter);

// Static files (uploads)
app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/users', require('./routes/users'));
app.use('/api/backup', require('./routes/backup'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    }
  });
}

// Error handler
app.use(require('./middleware/errorHandler').errorHandler);

// Socket.io - Real-time chat and notifications
const connectedUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  connectedUsers.set(socket.userId, socket.id);
  console.log(`User connected: ${socket.userId}`);

  // Join case room
  socket.on('join_case', (caseId) => {
    socket.join(`case:${caseId}`);
  });

  socket.on('leave_case', (caseId) => {
    socket.leave(`case:${caseId}`);
  });

  // Send chat message
  socket.on('send_message', async (data) => {
    const { caseId, message, senderName, senderRole } = data;
    try {
      const { query } = require('./config/../config/database');
      const result = await require('./config/../config/../config/database').query(`
        INSERT INTO chat_messages (case_id, sender_id, sender_name, sender_role, message)
        VALUES ($1,$2,$3,$4,$5) RETURNING *
      `, [caseId, socket.userId, senderName, senderRole, message]);

      const msg = result.rows[0];
      io.to(`case:${caseId}`).emit('new_message', msg);
    } catch (err) {
      socket.emit('error', { message: '訊息發送失敗' });
    }
  });

  // Case status update notification
  socket.on('case_updated', (data) => {
    io.to(`case:${data.caseId}`).emit('case_status_changed', data);
  });

  // Send notification to specific user
  socket.on('notify_user', (data) => {
    const targetSocketId = connectedUsers.get(data.userId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('notification', data);
    }
  });

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.userId);
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Make io available to routes
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// Scheduled tasks (auto backup daily at 2am)
const scheduleAutoBackup = () => {
  const now = new Date();
  const next2am = new Date();
  next2am.setHours(2, 0, 0, 0);
  if (now >= next2am) next2am.setDate(next2am.getDate() + 1);
  const delay = next2am - now;

  setTimeout(async () => {
    try {
      const { exec } = require('child_process');
      const path = require('path');
      const fs = require('fs');
      const { query } = require('./config/database');
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const filename = `auto_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.sql`;
      const filepath = path.join(backupDir, filename);
      const cmd = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -F p -f "${filepath}"`;
      exec(cmd, async (err) => {
        const fileSize = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
        await query(`INSERT INTO backup_logs (backup_type, file_name, file_size, status, error_message) VALUES ('auto',$1,$2,$3,$4)`,
          [filename, fileSize, err ? 'failed' : 'success', err ? err.message : null]);
      });
    } catch (e) { console.error('Auto backup error:', e); }
    scheduleAutoBackup();
  }, delay);
};

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 API: http://localhost:${PORT}/api`);
  if (process.env.NODE_ENV !== 'test') scheduleAutoBackup();
});

module.exports = { app, server, io };
