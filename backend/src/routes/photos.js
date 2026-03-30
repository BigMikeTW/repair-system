const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

let driveUtils = null;
try {
  driveUtils = require('../utils/googleDrive');
  console.log('✅ Google Drive module loaded');
} catch (e) {
  console.warn('⚠️ Google Drive module not available:', e.message);
}

const BACKEND_URL = process.env.BACKEND_URL || 'https://repair-system-production-cf5b.up.railway.app';
const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
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
    const allowed = ['image/jpeg','image/png','image/webp','image/heic','image/jpg'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('只支援 JPEG, PNG, WebP, HEIC'));
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

const makeFullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

// ── 上傳照片到 Drive 並回傳 Drive URL ────────────────────────
const uploadPhotoToDrive = async (localPath, fileName, phase, caseNumber) => {
  if (!driveUtils) throw new Error('Drive module not loaded');
  if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID not set');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const { createCaseFolderStructure, uploadFileToDrive } = driveUtils;
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const folderMap = { before: subFolders.before, during: subFolders.during, after: subFolders.after };
  const targetFolder = folderMap[phase] || subFolders.after;

  const ext = path.extname(localPath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic'
  };
  const mimeType = mimeMap[ext] || 'image/jpeg';

  return uploadFileToDrive(localPath, fileName, targetFolder, mimeType);
};

// POST /api/photos/:caseId/upload
router.post('/:caseId/upload', authenticate, upload.array('photos', 10), asyncHandler(async (req, res) => {
  const { phase } = req.body;
  if (!['before','during','after'].includes(phase))
    return res.status(400).json({ error: '無效施工階段' });

  const caseResult = await query('SELECT case_number FROM cases WHERE id=$1', [req.params.caseId]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });
  const caseNumber = caseResult.rows[0].case_number;

  const driveEnabled = !!(driveUtils &&
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const uploaded = [];

  for (const file of req.files) {
    const localPath = file.path; // multer 存的完整路徑
    const relPath = `/uploads/${req.params.caseId}/${file.filename}`;
    let displayUrl = makeFullUrl(relPath);
    let driveId = null;
    let driveLink = null;

    // 如果 Drive 已設定，同步上傳並使用 Drive URL 顯示
    if (driveEnabled) {
      try {
        const driveFile = await uploadPhotoToDrive(localPath, file.originalname, phase, caseNumber);
        driveId = driveFile.id;
        driveLink = driveFile.webViewLink;
        // 使用 Drive 直接預覽連結（可在瀏覽器顯示圖片）
        displayUrl = `https://drive.google.com/uc?export=view&id=${driveFile.id}`;
        console.log(`✅ Uploaded to Drive: ${file.originalname} → ${driveLink}`);
      } catch (driveErr) {
        console.error(`❌ Drive upload failed for ${file.originalname}:`, driveErr.message);
        // Drive 失敗時退回用 Railway URL
      }
    }

    const result = await query(`
      INSERT INTO case_photos (case_id, uploader_id, phase, file_url, file_name, file_size, drive_id, drive_link, drive_synced_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.params.caseId, req.user.id, phase, displayUrl,
        file.originalname, file.size, driveId, driveLink,
        driveId ? new Date() : null]);

    uploaded.push(result.rows[0]);
  }

  await query(
    `INSERT INTO case_activities (case_id, actor_id, actor_name, action, description) VALUES ($1,$2,$3,'photo_uploaded',$4)`,
    [req.params.caseId, req.user.id, req.user.name,
     `上傳 ${uploaded.length} 張${phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}照片`]
  );

  res.json({ photos: uploaded, drive_enabled: driveEnabled });
}));

// GET /api/photos/:caseId
router.get('/:caseId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`,
    [req.params.caseId]
  );
  // 優先用 Drive URL（永久有效），否則用 Railway URL
  const photos = result.rows.map(p => ({
    ...p,
    file_url: p.drive_id
      ? `https://drive.google.com/uc?export=view&id=${p.drive_id}`
      : makeFullUrl(p.file_url)
  }));
  res.json(photos);
}));

// DELETE /api/photos/:id
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM case_photos WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '照片不存在' });
  const photo = result.rows[0];
  // 刪除本地檔案
  let localPath = photo.file_url;
  if (localPath && localPath.startsWith('http') && !localPath.includes('drive.google.com')) {
    try { localPath = new URL(localPath).pathname; } catch { localPath = null; }
  } else if (localPath && localPath.includes('drive.google.com')) {
    localPath = null; // Drive 檔案不刪本地
  }
  if (localPath) {
    const filePath = path.join(process.cwd(), localPath);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
  }
  await query('DELETE FROM case_photos WHERE id=$1', [req.params.id]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
