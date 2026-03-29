const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadDir, req.params.caseId || 'general');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('只支援 JPEG, PNG, WebP, HEIC 格式'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 }
});

// POST /api/photos/:caseId/upload
router.post('/:caseId/upload', authenticate, upload.array('photos', 10), asyncHandler(async (req, res) => {
  const { phase } = req.body;
  if (!['before','during','after'].includes(phase)) {
    return res.status(400).json({ error: '無效施工階段 (before/during/after)' });
  }

  const uploaded = [];
  for (const file of req.files) {
    const fileUrl = `/uploads/${req.params.caseId}/${file.filename}`;
    const result = await query(`
      INSERT INTO case_photos (case_id, uploader_id, phase, file_url, file_name, file_size)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.params.caseId, req.user.id, phase, fileUrl, file.originalname, file.size]);
    uploaded.push(result.rows[0]);
  }

  await query(`
    INSERT INTO case_activities (case_id, actor_id, actor_name, action, description)
    VALUES ($1,$2,$3,'photo_uploaded',$4)
  `, [req.params.caseId, req.user.id, req.user.name,
      `上傳 ${uploaded.length} 張${phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}照片`]);

  res.json({ photos: uploaded });
}));

// GET /api/photos/:caseId
router.get('/:caseId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`,
    [req.params.caseId]
  );
  res.json(result.rows);
}));

// DELETE /api/photos/:id
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM case_photos WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '照片不存在' });

  const photo = result.rows[0];
  const filePath = path.join(process.cwd(), photo.file_url);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await query('DELETE FROM case_photos WHERE id=$1', [req.params.id]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
