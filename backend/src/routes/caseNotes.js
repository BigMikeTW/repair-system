const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadNotePhotoToDrive } = require('../utils/googleDrive');

// ── 檔案上傳設定 ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'notes', req.params.caseId || 'general');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','image/heic'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('只支援圖片格式'));
  }
});

// ── 取得案件記錄 ──────────────────────────────────────────────
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

// ── 新增案件記錄（含照片）─────────────────────────────────────
// POST /api/case-notes/:caseId
router.post('/:caseId', authenticate, authorize('engineer','admin','customer_service'),
  upload.array('photos', 10), asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '記錄內容不能為空' });

    // 確認案件存在且未結案
    const caseResult = await query('SELECT * FROM cases WHERE id=$1', [req.params.caseId]);
    if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

    const c = caseResult.rows[0];
    // 工程師在結案後不可修改
    if (req.user.role === 'engineer' && ['completed','closed','cancelled'].includes(c.status)) {
      return res.status(403).json({ error: '案件已結案，工程師無法新增記錄' });
    }

    // 建立記錄
    const noteResult = await query(`
      INSERT INTO case_notes (case_id, author_id, content)
      VALUES ($1, $2, $3) RETURNING *
    `, [req.params.caseId, req.user.id, content.trim()]);

    const note = noteResult.rows[0];

    // 處理照片上傳
    const uploadedPhotos = [];
    for (const file of (req.files || [])) {
      const localUrl = `/uploads/notes/${req.params.caseId}/${file.filename}`;
      const localPath = path.join(process.cwd(), localUrl);

      let driveLink = null;

      // 上傳到 Google Drive（如果已設定）
      if (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
          const driveFile = await uploadNotePhotoToDrive(
            c.case_number,
            localPath,
            `記錄_${note.id}_${file.originalname}`
          );
          driveLink = driveFile.webViewLink;
        } catch (err) {
          console.error('Drive upload failed for note photo:', err.message);
        }
      }

      const photoResult = await query(`
        INSERT INTO case_note_photos (note_id, case_id, uploader_id, file_url, file_name, drive_link)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `, [note.id, req.params.caseId, req.user.id, localUrl, file.originalname, driveLink]);

      uploadedPhotos.push(photoResult.rows[0]);
    }

    res.status(201).json({ ...note, photos: uploadedPhotos });
  })
);

// ── 修改案件記錄 ──────────────────────────────────────────────
// PUT /api/case-notes/:caseId/:noteId
router.put('/:caseId/:noteId', authenticate, asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '記錄內容不能為空' });

  // 確認案件未結案
  const caseResult = await query('SELECT status FROM cases WHERE id=$1', [req.params.caseId]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

  if (req.user.role === 'engineer' && ['completed','closed','cancelled'].includes(caseResult.rows[0].status)) {
    return res.status(403).json({ error: '案件已結案，工程師無法修改記錄' });
  }

  const result = await query(`
    UPDATE case_notes SET content=$1, updated_at=NOW()
    WHERE id=$2 AND case_id=$3 AND author_id=$4
    RETURNING *
  `, [content.trim(), req.params.noteId, req.params.caseId, req.user.id]);

  if (!result.rows.length) return res.status(404).json({ error: '記錄不存在或無權修改' });
  res.json(result.rows[0]);
}));

// ── 刪除案件記錄 ──────────────────────────────────────────────
// DELETE /api/case-notes/:caseId/:noteId
router.delete('/:caseId/:noteId', authenticate, asyncHandler(async (req, res) => {
  const caseResult = await query('SELECT status FROM cases WHERE id=$1', [req.params.caseId]);
  if (req.user.role === 'engineer' && ['completed','closed','cancelled'].includes(caseResult.rows[0]?.status)) {
    return res.status(403).json({ error: '案件已結案，工程師無法刪除記錄' });
  }

  // 刪除相關照片檔案
  const photos = await query('SELECT file_url FROM case_note_photos WHERE note_id=$1', [req.params.noteId]);
  for (const p of photos.rows) {
    const fp = path.join(process.cwd(), p.file_url);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
  }

  await query('DELETE FROM case_note_photos WHERE note_id=$1', [req.params.noteId]);
  await query('DELETE FROM case_notes WHERE id=$1 AND author_id=$2', [req.params.noteId, req.user.id]);

  res.json({ message: '記錄已刪除' });
}));

// ── 刪除記錄中的照片 ─────────────────────────────────────────
// DELETE /api/case-notes/:caseId/photo/:photoId
router.delete('/:caseId/photo/:photoId', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM case_note_photos WHERE id=$1', [req.params.photoId]);
  if (!result.rows.length) return res.status(404).json({ error: '照片不存在' });

  const fp = path.join(process.cwd(), result.rows[0].file_url);
  if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }

  await query('DELETE FROM case_note_photos WHERE id=$1', [req.params.photoId]);
  res.json({ message: '照片已刪除' });
}));

module.exports = router;
