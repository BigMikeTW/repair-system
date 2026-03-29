const router = require('express').Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const backupDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// GET /api/backup/list
router.get('/list', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 30`);
  res.json(result.rows);
}));

// POST /api/backup/create
router.post('/create', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const filename = `backup_${new Date().toISOString().replace(/[:.]/g,'-')}.sql`;
  const filepath = path.join(backupDir, filename);

  const cmd = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -F p -f "${filepath}"`;

  exec(cmd, async (err, stdout, stderr) => {
    const fileSize = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
    const status = err ? 'failed' : 'success';

    await query(`
      INSERT INTO backup_logs (backup_type, file_name, file_size, status, error_message, created_by)
      VALUES ('manual',$1,$2,$3,$4,$5)
    `, [filename, fileSize, status, err ? err.message : null, req.user.id]);

    if (err) return res.status(500).json({ error: '備份失敗', detail: err.message });
    res.json({ message: '備份成功', filename, size: fileSize });
  });
}));

// GET /api/backup/download/:filename
router.get('/download/:filename', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const filepath = path.join(backupDir, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: '備份檔案不存在' });
  res.download(filepath);
}));

// GET /api/backup/export/cases
router.get('/export/cases', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { date_from, date_to, status } = req.query;
  let conditions = [], params = [], i = 1;
  if (date_from) { conditions.push(`c.created_at >= $${i++}`); params.push(date_from); }
  if (date_to) { conditions.push(`c.created_at <= $${i++}`); params.push(date_to + 'T23:59:59'); }
  if (status) { conditions.push(`c.status = $${i++}`); params.push(status); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(`
    SELECT c.case_number, c.title, c.case_type, c.urgency, c.status,
      c.owner_company, c.owner_name, c.owner_phone, c.location_address,
      u1.name as engineer_name,
      c.created_at, c.actual_start, c.actual_end,
      c.checkin_time, c.checkout_time,
      c.completion_notes
    FROM cases c
    LEFT JOIN users u1 ON c.assigned_engineer_id=u1.id
    ${where}
    ORDER BY c.created_at DESC
  `, params);

  // Build CSV
  const headers = ['案件編號','標題','類型','緊急度','狀態','業主公司','聯絡人','電話','地址','工程師','建立時間','開工時間','完工時間','備注'];
  const rows = result.rows.map(r => [
    r.case_number, r.title, r.case_type, r.urgency, r.status,
    r.owner_company || '', r.owner_name || '', r.owner_phone || '', r.location_address || '',
    r.engineer_name || '',
    r.created_at ? new Date(r.created_at).toLocaleString('zh-TW') : '',
    r.actual_start ? new Date(r.actual_start).toLocaleString('zh-TW') : '',
    r.actual_end ? new Date(r.actual_end).toLocaleString('zh-TW') : '',
    r.completion_notes || ''
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cases_export_${Date.now()}.csv"`);
  res.send(csv);
}));

// GET /api/backup/export/finance
router.get('/export/finance', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT inv.invoice_number, c.case_number, c.owner_company, inv.amount, inv.tax_amount, inv.total_amount,
      inv.status, inv.due_date, inv.paid_at, inv.payment_method
    FROM invoices inv
    LEFT JOIN cases c ON inv.case_id=c.id
    ORDER BY inv.created_at DESC
  `);

  const headers = ['請款單號','案件編號','業主公司','金額','稅金','總計','狀態','付款期限','付款時間','付款方式'];
  const rows = result.rows.map(r => [
    r.invoice_number, r.case_number || '', r.owner_company || '',
    r.amount, r.tax_amount, r.total_amount, r.status,
    r.due_date ? new Date(r.due_date).toLocaleDateString('zh-TW') : '',
    r.paid_at ? new Date(r.paid_at).toLocaleString('zh-TW') : '',
    r.payment_method || ''
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="finance_export_${Date.now()}.csv"`);
  res.send(csv);
}));

module.exports = router;
