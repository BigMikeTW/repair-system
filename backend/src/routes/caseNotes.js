const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { isDropboxEnabled, uploadNotePhoto } = require('../utils/dropbox');

const BACKEND_URL = process.env.BACKEND_URL || 'https://repair-system-production-cf5b.up.railway.app';

// 使用 memoryStorage，不依賴本地磁碟
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('只支援圖片格式'));
  }
});

const makeFullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

// 本地備份
const uploadDir = path.join(process.cwd(), 'uploads');
const saveToLocal = (buffer, subDir, filename) => {
  try {
    const dir = path.join(uploadDir, 'notes', subDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `/uploads/notes/${subDir}/${filename}`;
  } catch (e) {
    console.error('Local save failed:', e.message);
    return null;
  }
};

// GET /api/case-notes/:caseId
router.get('/:caseId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT cn.*, u.name as author_name,
      json_agg(
        json_build_object(
          'id', cnp.id,
          'file_url', cnp.file_url,
          'file_name', cnp.file_name,
          'drive_link', cnp.drive_link,
          'created_at', cnp.created_at
        ) ORDER BY cnp.created_at
      ) FILTER (WHERE cnp.id IS NOT NULL) as photos
    FROM case_notes cn
    LEFT JOIN users u ON cn.author_id = u.id
    LEFT JOIN case_note_photos cnp ON cnp.note_id = cn.id
    WHERE cn.case_id = $1
    GROUP BY cn.id, u.name
    ORDER BY cn.created_at DESC
  `, [req.params.caseId]);
  res.json(result.rows);
}));

// POST /api/case-notes/:caseId
router.post('/:caseId', authenticate, authorize('engineer', 'admin', 'customer_service'),
  upload.array('photos', 10), asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '記錄內容不能為空' });

    const caseResult = await query('SELECT * FROM cases WHERE id=$1', [req.params.caseId]);
    if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

    const c = caseResult.rows[0];
    if (req.user.role === 'engineer' && ['completed', 'closed', 'cancelled'].includes(c.status)) {
      return res.status(403).json({ error: '案件已結案，工程師無法新增記錄' });
    }

    const noteResult = await query(`
      INSERT INTO case_notes (case_id, author_id, content) VALUES ($1, $2, $3) RETURNING *
    `, [req.params.caseId, req.user.id, content.trim()]);

    const note = noteResult.rows[0];
    const dropboxEnabled = isDropboxEnabled();
    const uploadedPhotos = [];

    for (const file of (req.files || [])) {
      const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
      let fileUrl = null;
      let driveLink = null;

      if (dropboxEnabled) {
        try {
          const dbxFile = await uploadNotePhoto(c.case_number, file.buffer, file.originalname);
          fileUrl = dbxFile.shareUrl;
          driveLink = dbxFile.shareUrl;
          console.log(`✅ Note photo uploaded to Dropbox: ${file.originalname}`);
        } catch (err) {
          console.error('Dropbox upload failed for note photo:', err.message);
          const localPath = saveToLocal(file.buffer, req.params.caseId, uniqueName);
          fileUrl = localPath ? makeFullUrl(localPath) : null;
        }
      } else {
        const localPath = saveToLocal(file.buffer, req.params.caseId, uniqueName);
        fileUrl = localPath ? makeFullUrl(localPath) : null;
      }

      if (!fileUrl) continue;

      const photoResult = await query(`
        INSERT INTO case_note_photos (note_id, case_id, uploader_id, file_url, file_name, drive_link)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `, [note.id, req.params.caseId, req.user.id, fileUrl, file.originalname, driveLink]);

      uploadedPhotos.push(photoResult.rows[0]);
    }

    res.status(201).json({ ...note, photos: uploadedPhotos });
  })
);

// PUT /api/case-notes/:caseId/:noteId
router.put('/:caseId/:noteId', authenticate, asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '記錄內容不能為空' });

  const caseResult = await query('SELECT status FROM cases WHERE id=$1', [req.params.caseId]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

  if (req.user.role === 'engineer' && ['completed', 'closed', 'cancelled'].includes(caseResult.rows[0].status)) {
    return res.status(403).json({ error: '案件已結案，工程師無法修改記錄' });
  }

  const result = await query(`
    UPDATE case_notes SET content=$1, updated_at=NOW()
    WHERE id=$2 AND case_id=$3 AND author_id=$4 RETURNING *
  `, [content.trim(), req.params.noteId, req.params.caseId, req.user.id]);

  if (!result.rows.length) return res.status(404).json({ error: '記錄不存在或無權修改' });
  res.json(result.rows[0]);
}));

// DELETE /api/case-notes/:caseId/:noteId
router.delete('/:caseId/:noteId', authenticate, asyncHandler(async (req, res) => {
  const caseResult = await query('SELECT status FROM cases WHERE id=$1', [req.params.caseId]);
  if (req.user.role === 'engineer' && ['completed', 'closed', 'cancelled'].includes(caseResult.rows[0]?.status)) {
    return res.status(403).json({ error: '案件已結案，工程師無法刪除記錄' });
  }

  // 刪除本地照片（若有）
  const photos = await query('SELECT file_url FROM case_note_photos WHERE note_id=$1', [req.params.noteId]);
  for (const p of photos.rows) {
    if (p.file_url && p.file_url.startsWith('/uploads')) {
      const fp = path.join(process.cwd(), p.file_url);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
    }
  }

  await query('DELETE FROM case_note_photos WHERE note_id=$1', [req.params.noteId]);
  await query('DELETE FROM case_notes WHERE id=$1 AND author_id=$2', [req.params.noteId, req.user.id]);
  res.json({ message: '記錄已刪除' });
}));

// DELETE /api/case-notes/:caseId/photo/:photoId
router.delete('/:caseId/photo/:photoId', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM case_note_photos WHERE id=$1', [req.params.photoId]);
  if (!result.rows.length) return res.status(404).json({ error: '照片不存在' });

  if (result.rows[0].file_url && result.rows[0].file_url.startsWith('/uploads')) {
    const fp = path.join(process.cwd(), result.rows[0].file_url);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
  }

  await query('DELETE FROM case_note_photos WHERE id=$1', [req.params.photoId]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
