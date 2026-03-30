const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

let driveUtils = null;
try { driveUtils = require('../utils/googleDrive'); } catch (e) {}

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
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 15 * 1024 * 1024 }
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
  const localPaths = []; // 保留本地路徑供 Drive 上傳使用

  for (const file of req.files) {
    const relPath = `/uploads/${req.params.caseId}/${file.filename}`;
    const fullUrl = makeFullUrl(relPath);
    const localPath = path.join(process.cwd(), uploadDir, req.params.caseId, file.filename);

    const result = await query(`
      INSERT INTO case_photos (case_id, uploader_id, phase, file_url, file_name, file_size)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.params.caseId, req.user.id, phase, fullUrl, file.originalname, file.size]);

    uploaded.push(result.rows[0]);
    localPaths.push({ id: result.rows[0].id, localPath, fileName: file.originalname });
  }

  await query(
    `INSERT INTO case_activities (case_id, actor_id, actor_name, action, description) VALUES ($1,$2,$3,'photo_uploaded',$4)`,
    [req.params.caseId, req.user.id, req.user.name,
     `上傳 ${uploaded.length} 張${phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}照片`]
  );

  // 先回應前端（不等 Drive）
  res.json({ photos: uploaded });

  // 非同步上傳到 Google Drive
  if (driveUtils && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    setImmediate(async () => {
      try {
        const { createCaseFolderStructure, uploadFileToDrive } = driveUtils;
        const { subFolders } = await createCaseFolderStructure(caseNumber);
        const folderMap = { before: subFolders.before, during: subFolders.during, after: subFolders.after };
        const targetFolder = folderMap[phase] || subFolders.after;

        for (const item of localPaths) {
          try {
            if (!fs.existsSync(item.localPath)) {
              console.warn(`File not found for Drive upload: ${item.localPath}`);
              continue;
            }
            const ext = path.extname(item.localPath).toLowerCase();
            const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };
            const mimeType = mimeMap[ext] || 'image/jpeg';
            const driveFile = await uploadFileToDrive(item.localPath, item.fileName, targetFolder, mimeType);
            await query(
              `UPDATE case_photos SET drive_id=$1, drive_link=$2, drive_synced_at=NOW() WHERE id=$3`,
              [driveFile.id, driveFile.webViewLink, item.id]
            );
            console.log(`✅ Uploaded to Drive: ${item.fileName}`);
          } catch (fileErr) {
            console.error(`Drive upload failed for ${item.fileName}:`, fileErr.message);
          }
        }
        console.log(`✅ Drive sync complete for ${caseNumber}`);
      } catch (err) {
        console.error('Drive sync error:', err.message);
      }
    });
  }
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
  if (localPath && localPath.startsWith('http')) {
    try { localPath = new URL(localPath).pathname; } catch { localPath = null; }
  }
  if (localPath) {
    const filePath = path.join(process.cwd(), localPath);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
  }
  await query('DELETE FROM case_photos WHERE id=$1', [req.params.id]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
