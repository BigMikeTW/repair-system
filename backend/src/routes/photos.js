const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { isDropboxEnabled, uploadPhoto, createCaseFolderStructure, uploadBuffer } = require('../utils/dropbox');

const BACKEND_URL = process.env.BACKEND_URL || 'https://repair-system-production-cf5b.up.railway.app';

const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn('Cannot create upload dir:', e.message);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支援 JPEG, PNG, WebP, HEIC'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

const makeFullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

const saveToLocal = (buffer, caseId, filename) => {
  try {
    const dir = path.join(uploadDir, caseId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `/uploads/${caseId}/${filename}`;
  } catch (e) {
    console.error('Local save failed:', e.message);
    return null;
  }
};

// POST /api/photos/:caseId/upload
router.post('/:caseId/upload', authenticate, upload.array('photos', 10), asyncHandler(async (req, res) => {
  const { phase } = req.body;
  if (!['before', 'during', 'after'].includes(phase))
    return res.status(400).json({ error: '無效施工階段' });
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: '請選擇照片' });

  const caseResult = await query('SELECT case_number FROM cases WHERE id=$1', [req.params.caseId]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });
  const caseNumber = caseResult.rows[0].case_number;

  const dropboxEnabled = isDropboxEnabled();
  const uploaded = [];

  // 若 Dropbox 啟用，先建好資料夾結構（只建一次），再逐一上傳
  let subFolders = null;
  if (dropboxEnabled) {
    try {
      const structure = await createCaseFolderStructure(caseNumber);
      subFolders = structure.subFolders;
    } catch (err) {
      console.error('❌ Dropbox folder creation failed:', err.message);
    }
  }

  for (const file of req.files) {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    let displayUrl = null;
    let driveId = null;
    let driveLink = null;

    if (dropboxEnabled && subFolders) {
      try {
        // 直接上傳到已知的資料夾，不再重複建立
        const folderMap = { before: subFolders.before, during: subFolders.during, after: subFolders.after };
        const targetFolder = folderMap[phase] || subFolders.after;
        const dbxFile = await uploadBuffer(file.buffer, `${targetFolder}/${file.originalname}`);

        driveId = dbxFile.path;
        driveLink = dbxFile.shareUrl;
        displayUrl = dbxFile.shareUrl;
        console.log(`✅ Dropbox upload OK: ${file.originalname}`);
      } catch (dbxErr) {
        console.error(`❌ Dropbox upload failed: ${dbxErr.message}`);
        const localPath = saveToLocal(file.buffer, req.params.caseId, uniqueName);
        displayUrl = localPath ? makeFullUrl(localPath) : null;
      }
    } else {
      const localPath = saveToLocal(file.buffer, req.params.caseId, uniqueName);
      displayUrl = localPath ? makeFullUrl(localPath) : null;
    }

    if (!displayUrl) { console.error(`Failed to save: ${file.originalname}`); continue; }

    const result = await query(`
      INSERT INTO case_photos (case_id, uploader_id, phase, file_url, file_name, file_size, drive_id, drive_link, drive_synced_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      req.params.caseId, req.user.id, phase, displayUrl,
      file.originalname, file.size, driveId, driveLink,
      driveId ? new Date() : null
    ]);

    uploaded.push(result.rows[0]);
  }

  if (uploaded.length > 0) {
    await query(
      `INSERT INTO case_activities (case_id, actor_id, actor_name, action, description) VALUES ($1,$2,$3,'photo_uploaded',$4)`,
      [req.params.caseId, req.user.id, req.user.name,
       `上傳 ${uploaded.length} 張${phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}照片`]
    );
  }

  res.json({ photos: uploaded, dropbox_enabled: dropboxEnabled });
}));

// GET /api/photos/:caseId
router.get('/:caseId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`,
    [req.params.caseId]
  );
  const photos = result.rows.map(p => ({
    ...p,
    file_url: p.file_url || makeFullUrl(p.file_url)
  }));
  res.json(photos);
}));

// DELETE /api/photos/:id
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM case_photos WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '照片不存在' });
  const photo = result.rows[0];

  if (photo.file_url && photo.file_url.startsWith('/uploads')) {
    try {
      const filePath = path.join(process.cwd(), photo.file_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { /* ignore */ }
  }

  await query('DELETE FROM case_photos WHERE id=$1', [req.params.id]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
