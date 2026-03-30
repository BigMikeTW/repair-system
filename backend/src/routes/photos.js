const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

let syncCasePhotosToDrive = null;
try { syncCasePhotosToDrive = require('../utils/googleDrive').syncCasePhotosToDrive; } catch (e) {}

const BACKEND_URL = process.env.BACKEND_URL || 'https://repair-system-production-cf5b.up.railway.app';
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadDir, req.params.caseId || 'general');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','image/heic'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('只支援 JPEG, PNG, WebP, HEIC'));
  },
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 }
});

const makeFullUrl = (relPath) => {
  if (!relPath) return null;
  if (relPath.startsWith('http')) return relPath;
  return `${BACKEND_URL}${relPath}`;
};

// POST /api/photos/:caseId/upload
router.post('/:caseId/upload', authenticate, upload.array('photos', 10), asyncHandler(async (req, res) => {
  const { phase } = req.body;
  if (!['before','during','after'].includes(phase))
    return res.status(400).json({ error: '無效施工階段' });

  const caseResult = await query('SELECT case_number FROM cases WHERE id=$1', [req.params.caseId]);
  const caseNumber = caseResult.rows[0]?.case_number || req.params.caseId;

  const uploaded = [];
  for (const file of req.files) {
    const relPath = `/uploads/${req.params.caseId}/${file.filename}`;
    const fullUrl = makeFullUrl(relPath);
    const result = await query(`
      INSERT INTO case_photos (case_id, uploader_id, phase, file_url, file_name, file_size)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.params.caseId, req.user.id, phase, fullUrl, file.originalname, file.size]);
    uploaded.push(result.rows[0]);
  }

  await query(
    `INSERT INTO case_activities (case_id, actor_id, actor_name, action, description) VALUES ($1,$2,$3,'photo_uploaded',$4)`,
    [req.params.caseId, req.user.id, req.user.name,
     `上傳 ${uploaded.length} 張${phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}照片`]
  );

  // 非同步上傳到 Google Drive
  if (syncCasePhotosToDrive && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    setImmediate(async () => {
      try {
        const photosForDrive = uploaded.map(p => ({
          ...p,
          file_url: `/uploads/${req.params.caseId}/${path.basename(p.file_url.includes('http') ? new URL(p.file_url).pathname : p.file_url)}`
        }));
        const results = await syncCasePhotosToDrive(caseNumber, photosForDrive);
        for (const r of results) {
          if (r.driveId) {
            await query(
              `UPDATE case_photos SET drive_id=$1, drive_link=$2, drive_synced_at=NOW() WHERE id=$3`,
              [r.driveId, r.driveLink, r.photoId]
            );
          }
        }
        console.log(`✅ ${uploaded.length} photos synced to Drive for ${caseNumber}`);
      } catch (err) {
        console.error('Drive sync error:', err.message);
      }
    });
  }

  res.json({ photos: uploaded });
}));

// GET /api/photos/:caseId
router.get('/:caseId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`,
    [req.params.caseId]
  );
  const photos = result.rows.map(p => ({ ...p, file_url: makeFullUrl(p.file_url) }));
  res.json(photos);
}));

// DELETE /api/photos/:id
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM case_photos WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '照片不存在' });
  const photo = result.rows[0];
  let localPath = photo.file_url;
  if (localPath.startsWith('http')) {
    try { localPath = new URL(localPath).pathname; } catch {}
  }
  const filePath = path.join(process.cwd(), localPath);
  if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
  await query('DELETE FROM case_photos WHERE id=$1', [req.params.id]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
