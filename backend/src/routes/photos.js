const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const stream = require('stream');
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

// 本地備份目錄（Railway ephemeral，僅暫時用）
const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn('Cannot create upload dir:', e.message);
}

// 使用 memoryStorage，不依賴本地磁碟
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

const isDriveEnabled = () => {
  if (!driveUtils) { console.warn('Drive: module not loaded'); return false; }
  if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) { console.warn('Drive: GOOGLE_DRIVE_ROOT_FOLDER_ID not set'); return false; }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) { console.warn('Drive: GOOGLE_SERVICE_ACCOUNT_JSON not set'); return false; }
  return true;
};

// 從 Buffer 上傳到 Google Drive（已包含 makeFilePublic）
const uploadBufferToDrivePhoto = async (buffer, fileName, phase, caseNumber) => {
  const { createCaseFolderStructure, getDriveClient } = driveUtils;
  const { subFolders } = await createCaseFolderStructure(caseNumber);
  const folderMap = { before: subFolders.before, during: subFolders.during, after: subFolders.after };
  const targetFolder = folderMap[phase] || subFolders.after;

  const ext = path.extname(fileName).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic'
  };
  const mimeType = mimeMap[ext] || 'image/jpeg';

  const drive = getDriveClient();
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [targetFolder] },
    media: { mimeType, body: bufferStream },
    fields: 'id, name, webViewLink, webContentLink',
  });

  // 設為公開可讀，這樣 <img src="..."> 才能直接顯示
  try {
    await drive.permissions.create({
      fileId: res.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (e) {
    console.warn('makeFilePublic failed:', e.message);
  }

  return res.data;
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

  const driveEnabled = isDriveEnabled();
  const uploaded = [];

  for (const file of req.files) {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    let displayUrl = null;
    let driveId = null;
    let driveLink = null;

    if (driveEnabled) {
      try {
        const driveFile = await uploadBufferToDrivePhoto(file.buffer, file.originalname, phase, caseNumber);
        driveId = driveFile.id;
        driveLink = driveFile.webViewLink;
        // 使用直接連結（公開後可直接顯示）
        displayUrl = `https://drive.google.com/uc?export=view&id=${driveFile.id}`;
        console.log(`✅ Drive upload OK: ${file.originalname} → ${driveLink}`);
      } catch (driveErr) {
        console.error(`❌ Drive upload failed: ${driveErr.message}`);
        const localPath = saveToLocal(file.buffer, req.params.caseId, uniqueName);
        displayUrl = localPath ? makeFullUrl(localPath) : null;
      }
    } else {
      const localPath = saveToLocal(file.buffer, req.params.caseId, uniqueName);
      displayUrl = localPath ? makeFullUrl(localPath) : null;
      console.log(`ℹ️ Drive not enabled, saved locally`);
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

  res.json({ photos: uploaded, drive_enabled: driveEnabled });
}));

// GET /api/photos/:caseId
router.get('/:caseId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM case_photos WHERE case_id=$1 ORDER BY phase, created_at`,
    [req.params.caseId]
  );
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

  if (photo.file_url && !photo.file_url.includes('drive.google.com')) {
    try {
      let localUrl = photo.file_url.startsWith('http') ? new URL(photo.file_url).pathname : photo.file_url;
      const filePath = path.join(process.cwd(), localUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { /* ignore */ }
  }

  await query('DELETE FROM case_photos WHERE id=$1', [req.params.id]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
