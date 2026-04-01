const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// ── 檔案上傳設定 ──────────────────────────────────────────────
const getUploadDir = (userId) => {
  const dir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'hr', userId || 'general');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadDir(req.params.userId)),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','image/heic','application/pdf'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('只支援 JPG, PNG, PDF'));
  }
});

const canAccess = (req, userId) =>
  req.user.role === 'admin' || req.user.role === 'customer_service' || req.user.id === userId;

// ── 人員 HR 完整資料 ─────────────────────────────────────────

// GET /api/hr/:userId
router.get('/:userId', authenticate, asyncHandler(async (req, res) => {
  if (!canAccess(req, req.params.userId)) return res.status(403).json({ error: '權限不足' });

  const userResult = await query(`
    SELECT id, name, email, phone, role, specialties, is_active, last_login,
      id_number, id_card_url, birth_date, address,
      emergency_contact, emergency_phone, hire_date, department, created_at
    FROM users WHERE id = $1
  `, [req.params.userId]);

  if (!userResult.rows.length) return res.status(404).json({ error: '人員不存在' });

  const [licenses, insurance] = await Promise.all([
    query(`SELECT * FROM user_licenses WHERE user_id = $1 ORDER BY issue_date DESC NULLS LAST, created_at DESC`, [req.params.userId]),
    query(`SELECT * FROM user_insurance WHERE user_id = $1 ORDER BY created_at DESC`, [req.params.userId])
  ]);

  res.json({ ...userResult.rows[0], licenses: licenses.rows, insurance: insurance.rows });
}));

// PUT /api/hr/:userId/profile
router.put('/:userId/profile', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  let { id_number, birth_date, address, emergency_contact, emergency_phone, hire_date, department } = req.body;

  // ── 長度保護 ──────────────────────────────────────────────────
  id_number         = id_number         ? String(id_number).trim().slice(0, 20)  : null;
  address           = address           ? String(address).trim()                  : null;
  emergency_contact = emergency_contact ? String(emergency_contact).trim().slice(0, 100) : null;
  emergency_phone   = emergency_phone   ? String(emergency_phone).trim().slice(0, 20)    : null;
  department        = department        ? String(department).trim().slice(0, 100) : null;

  const result = await query(`
    UPDATE users SET
      id_number = $1, birth_date = $2, address = $3,
      emergency_contact = $4, emergency_phone = $5,
      hire_date = $6, department = $7
    WHERE id = $8
    RETURNING id, name, id_number, birth_date, address, emergency_contact, emergency_phone, hire_date, department
  `, [
    id_number, birth_date || null, address,
    emergency_contact, emergency_phone,
    hire_date || null, department,
    req.params.userId
  ]);

  if (!result.rows.length) return res.status(404).json({ error: '人員不存在' });
  res.json(result.rows[0]);
}));

// POST /api/hr/:userId/id-card
router.post('/:userId/id-card', authenticate, authorize('admin','customer_service'),
  upload.single('id_card'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '請選擇檔案' });
    const fileUrl = `/uploads/hr/${req.params.userId}/${req.file.filename}`;
    await query('UPDATE users SET id_card_url = $1 WHERE id = $2', [fileUrl, req.params.userId]);
    res.json({ file_url: fileUrl, message: '身分證影本已上傳' });
  })
);

// ── 證照管理 ──────────────────────────────────────────────────

// GET /api/hr/:userId/licenses
router.get('/:userId/licenses', authenticate, asyncHandler(async (req, res) => {
  if (!canAccess(req, req.params.userId)) return res.status(403).json({ error: '權限不足' });
  const result = await query(
    `SELECT * FROM user_licenses WHERE user_id = $1 ORDER BY issue_date DESC NULLS LAST`,
    [req.params.userId]
  );
  res.json(result.rows);
}));

// POST /api/hr/:userId/licenses
router.post('/:userId/licenses', authenticate, authorize('admin','customer_service'),
  upload.single('license_file'), asyncHandler(async (req, res) => {
    const { license_name, license_number, issued_by, issue_date, expiry_date, notes } = req.body;
    if (!license_name?.trim()) return res.status(400).json({ error: '證照名稱必填' });

    const fileUrl = req.file ? `/uploads/hr/${req.params.userId}/${req.file.filename}` : null;
    const fileName = req.file ? String(req.file.originalname).slice(0, 255) : null;

    const result = await query(`
      INSERT INTO user_licenses
        (user_id, license_name, license_number, issued_by, issue_date, expiry_date, file_url, file_name, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      req.params.userId,
      String(license_name).trim().slice(0, 200),
      license_number ? String(license_number).trim().slice(0, 100) : null,
      issued_by ? String(issued_by).trim().slice(0, 200) : null,
      issue_date || null, expiry_date || null,
      fileUrl, fileName, notes || null
    ]);
    res.status(201).json(result.rows[0]);
  })
);

// PUT /api/hr/:userId/licenses/:licenseId
router.put('/:userId/licenses/:licenseId', authenticate, authorize('admin','customer_service'),
  upload.single('license_file'), asyncHandler(async (req, res) => {
    const { license_name, license_number, issued_by, issue_date, expiry_date, notes } = req.body;
    if (!license_name?.trim()) return res.status(400).json({ error: '證照名稱必填' });

    const existing = await query('SELECT * FROM user_licenses WHERE id=$1 AND user_id=$2', [req.params.licenseId, req.params.userId]);
    if (!existing.rows.length) return res.status(404).json({ error: '證照不存在' });

    let fileUrl = existing.rows[0].file_url;
    let fileName = existing.rows[0].file_name;
    if (req.file) {
      fileUrl = `/uploads/hr/${req.params.userId}/${req.file.filename}`;
      fileName = String(req.file.originalname).slice(0, 255);
    }

    const result = await query(`
      UPDATE user_licenses SET
        license_name=$1, license_number=$2, issued_by=$3,
        issue_date=$4, expiry_date=$5, file_url=$6, file_name=$7, notes=$8, updated_at=NOW()
      WHERE id=$9 AND user_id=$10 RETURNING *
    `, [
      String(license_name).trim().slice(0, 200),
      license_number ? String(license_number).trim().slice(0, 100) : null,
      issued_by ? String(issued_by).trim().slice(0, 200) : null,
      issue_date || null, expiry_date || null, fileUrl, fileName,
      notes || null, req.params.licenseId, req.params.userId
    ]);
    res.json(result.rows[0]);
  })
);

// DELETE /api/hr/:userId/licenses/:licenseId
router.delete('/:userId/licenses/:licenseId', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const result = await query('SELECT file_url FROM user_licenses WHERE id=$1 AND user_id=$2', [req.params.licenseId, req.params.userId]);
  if (!result.rows.length) return res.status(404).json({ error: '證照不存在' });

  if (result.rows[0].file_url) {
    const filePath = path.join(process.cwd(), result.rows[0].file_url);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
  }
  await query('DELETE FROM user_licenses WHERE id=$1 AND user_id=$2', [req.params.licenseId, req.params.userId]);
  res.json({ message: '證照已刪除' });
}));

// ── 勞健保記錄 ────────────────────────────────────────────────

// GET /api/hr/:userId/insurance
router.get('/:userId/insurance', authenticate, asyncHandler(async (req, res) => {
  if (!canAccess(req, req.params.userId)) return res.status(403).json({ error: '權限不足' });
  const result = await query(
    `SELECT * FROM user_insurance WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.params.userId]
  );
  res.json(result.rows);
}));

// POST /api/hr/:userId/insurance
router.post('/:userId/insurance', authenticate, authorize('admin','customer_service'),
  upload.single('proof_file'), asyncHandler(async (req, res) => {
    const { insurance_type, status, enroll_date, terminate_date, insured_salary, insurer_name, notes } = req.body;
    if (!insurance_type) return res.status(400).json({ error: '保險類型必填' });

    const proofUrl = req.file ? `/uploads/hr/${req.params.userId}/${req.file.filename}` : null;
    const proofFileName = req.file ? req.file.originalname : null;

    const result = await query(`
      INSERT INTO user_insurance
        (user_id, insurance_type, status, enroll_date, terminate_date,
         insured_salary, insurer_name, proof_url, proof_file_name, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      req.params.userId, insurance_type, status || 'active',
      enroll_date || null, terminate_date || null,
      insured_salary ? parseInt(insured_salary) : null,
      insurer_name || null, proofUrl, proofFileName, notes || null
    ]);
    res.status(201).json(result.rows[0]);
  })
);

// PUT /api/hr/:userId/insurance/:insId
router.put('/:userId/insurance/:insId', authenticate, authorize('admin','customer_service'),
  upload.single('proof_file'), asyncHandler(async (req, res) => {
    const { insurance_type, status, enroll_date, terminate_date, insured_salary, insurer_name, notes } = req.body;

    const existing = await query('SELECT * FROM user_insurance WHERE id=$1 AND user_id=$2', [req.params.insId, req.params.userId]);
    if (!existing.rows.length) return res.status(404).json({ error: '記錄不存在' });

    let proofUrl = existing.rows[0].proof_url;
    let proofFileName = existing.rows[0].proof_file_name;
    if (req.file) {
      proofUrl = `/uploads/hr/${req.params.userId}/${req.file.filename}`;
      proofFileName = req.file.originalname;
    }

    const result = await query(`
      UPDATE user_insurance SET
        insurance_type=$1, status=$2, enroll_date=$3, terminate_date=$4,
        insured_salary=$5, insurer_name=$6, proof_url=$7, proof_file_name=$8,
        notes=$9, updated_at=NOW()
      WHERE id=$10 AND user_id=$11 RETURNING *
    `, [
      insurance_type, status,
      enroll_date || null, terminate_date || null,
      insured_salary ? parseInt(insured_salary) : null,
      insurer_name || null, proofUrl, proofFileName,
      notes || null, req.params.insId, req.params.userId
    ]);
    res.json(result.rows[0]);
  })
);

// DELETE /api/hr/:userId/insurance/:insId
router.delete('/:userId/insurance/:insId', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const result = await query('SELECT proof_url FROM user_insurance WHERE id=$1 AND user_id=$2', [req.params.insId, req.params.userId]);
  if (!result.rows.length) return res.status(404).json({ error: '記錄不存在' });

  if (result.rows[0].proof_url) {
    const filePath = path.join(process.cwd(), result.rows[0].proof_url);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
  }
  await query('DELETE FROM user_insurance WHERE id=$1 AND user_id=$2', [req.params.insId, req.params.userId]);
  res.json({ message: '保險記錄已刪除' });
}));

module.exports = router;
