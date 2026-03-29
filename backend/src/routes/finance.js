const router = require('express').Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const generateQuoteNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(`SELECT COUNT(*) FROM quotations WHERE created_at >= date_trunc('year', NOW())`);
  return `QT-${year}-${String(parseInt(result.rows[0].count) + 1).padStart(4,'0')}`;
};

const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(`SELECT COUNT(*) FROM invoices WHERE created_at >= date_trunc('year', NOW())`);
  return `INV-${year}-${String(parseInt(result.rows[0].count) + 1).padStart(4,'0')}`;
};

const calcTotals = (items, taxRate) => {
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.unit_price) * parseFloat(item.quantity), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
};

// ===== QUOTATIONS =====

// GET /api/finance/quotations
router.get('/quotations', authenticate, asyncHandler(async (req, res) => {
  const { case_id, status } = req.query;
  let conditions = [], params = [], i = 1;
  if (case_id) { conditions.push(`q.case_id=$${i++}`); params.push(case_id); }
  if (status) { conditions.push(`q.status=$${i++}`); params.push(status); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(`
    SELECT q.*, c.case_number, c.title, c.owner_company, u.name as created_by_name
    FROM quotations q
    LEFT JOIN cases c ON q.case_id=c.id
    LEFT JOIN users u ON q.created_by=u.id
    ${where} ORDER BY q.created_at DESC
  `, params);
  res.json(result.rows);
}));

// GET /api/finance/quotations/:id
router.get('/quotations/:id', authenticate, asyncHandler(async (req, res) => {
  const q = await query(`
    SELECT q.*, c.case_number, c.title, c.owner_name, c.owner_company, c.owner_phone, c.location_address
    FROM quotations q LEFT JOIN cases c ON q.case_id=c.id
    WHERE q.id=$1
  `, [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: '報價單不存在' });

  const items = await query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY sort_order`, [req.params.id]);
  res.json({ ...q.rows[0], items: items.rows });
}));

// POST /api/finance/quotations
router.post('/quotations', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { case_id, items, tax_rate = 5, notes, valid_until } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: '請填寫報價項目' });

  const quoteNumber = await generateQuoteNumber();
  const { subtotal, taxAmount, total } = calcTotals(items, tax_rate);

  const result = await query(`
    INSERT INTO quotations (quote_number, case_id, created_by, subtotal, tax_rate, tax_amount, total, notes, valid_until)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [quoteNumber, case_id, req.user.id, subtotal, tax_rate, taxAmount, total, notes, valid_until || null]);

  const quotation = result.rows[0];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const st = (parseFloat(item.unit_price) * parseFloat(item.quantity)).toFixed(2);
    await query(`
      INSERT INTO quotation_items (quotation_id, item_name, description, quantity, unit, unit_price, subtotal, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [quotation.id, item.item_name, item.description || '', item.quantity, item.unit || '', item.unit_price, st, idx]);
  }

  res.status(201).json({ ...quotation, items });
}));

// PUT /api/finance/quotations/:id/status
router.put('/quotations/:id/status', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const result = await query(`UPDATE quotations SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]);
  res.json(result.rows[0]);
}));

// GET /api/finance/quotations/:id/pdf
router.get('/quotations/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const q = await query(`
    SELECT q.*, c.case_number, c.title, c.owner_name, c.owner_company, c.owner_phone, c.location_address
    FROM quotations q LEFT JOIN cases c ON q.case_id=c.id WHERE q.id=$1
  `, [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: '報價單不存在' });
  const quot = q.rows[0];

  const items = await query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY sort_order`, [req.params.id]);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${quot.quote_number}.pdf"`);
  doc.pipe(res);

  // Register font path (will use built-in Helvetica if no CJK font available)
  doc.fontSize(20).text('報  價  單', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`報價單號：${quot.quote_number}    日期：${new Date(quot.created_at).toLocaleDateString('zh-TW')}`, { align: 'right' });
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.5);

  doc.fontSize(10);
  doc.text(`業主/公司：${quot.owner_company || quot.owner_name || '--'}`);
  doc.text(`聯絡人：${quot.owner_name || '--'}    電話：${quot.owner_phone || '--'}`);
  doc.text(`案件編號：${quot.case_number || '--'}    施工地點：${quot.location_address || '--'}`);
  if (quot.valid_until) doc.text(`報價有效期限：${new Date(quot.valid_until).toLocaleDateString('zh-TW')}`);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.5);

  // Table header
  const cols = [50, 220, 320, 370, 430, 495];
  doc.font('Helvetica-Bold').fontSize(9);
  ['項目名稱','說明','數量','單位','單價','小計'].forEach((h, i) => doc.text(h, cols[i], doc.y, { width: cols[i+1] - cols[i] - 5 }));
  doc.moveDown(0.3); doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.2);

  doc.font('Helvetica').fontSize(9);
  items.rows.forEach(item => {
    const y = doc.y;
    doc.text(item.item_name, cols[0], y, { width: 165 });
    doc.text(item.description || '', cols[1], y, { width: 95 });
    doc.text(String(item.quantity), cols[2], y, { width: 45 });
    doc.text(item.unit || '', cols[3], y, { width: 55 });
    doc.text(`$${Number(item.unit_price).toLocaleString()}`, cols[4], y, { width: 60 });
    doc.text(`$${Number(item.subtotal).toLocaleString()}`, cols[5], y, { width: 50 });
    doc.moveDown(0.6);
  });

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.5);
  doc.font('Helvetica-Bold');
  doc.text(`小計：$${Number(quot.subtotal).toLocaleString()}`, { align: 'right' });
  doc.text(`稅金 (${quot.tax_rate}%)：$${Number(quot.tax_amount).toLocaleString()}`, { align: 'right' });
  doc.fontSize(12).text(`合計：$${Number(quot.total).toLocaleString()}`, { align: 'right' });

  if (quot.notes) {
    doc.moveDown(1); doc.fontSize(9).font('Helvetica').text('備注：' + quot.notes);
  }

  doc.end();
}));

// ===== INVOICES =====

// GET /api/finance/invoices
router.get('/invoices', authenticate, asyncHandler(async (req, res) => {
  const { case_id, status } = req.query;
  let conditions = [], params = [], i = 1;
  if (case_id) { conditions.push(`inv.case_id=$${i++}`); params.push(case_id); }
  if (status) { conditions.push(`inv.status=$${i++}`); params.push(status); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(`
    SELECT inv.*, c.case_number, c.title, c.owner_name, c.owner_company, u.name as created_by_name
    FROM invoices inv
    LEFT JOIN cases c ON inv.case_id=c.id
    LEFT JOIN users u ON inv.created_by=u.id
    ${where} ORDER BY inv.created_at DESC
  `, params);
  res.json(result.rows);
}));

// POST /api/finance/invoices
router.post('/invoices', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { case_id, quotation_id, amount, tax_amount, notes, due_date } = req.body;
  const invoiceNumber = await generateInvoiceNumber();
  const total = (parseFloat(amount) + parseFloat(tax_amount || 0)).toFixed(2);

  const result = await query(`
    INSERT INTO invoices (invoice_number, case_id, quotation_id, created_by, amount, tax_amount, total_amount, notes, due_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [invoiceNumber, case_id, quotation_id || null, req.user.id, amount, tax_amount || 0, total, notes, due_date || null]);

  res.status(201).json(result.rows[0]);
}));

// PUT /api/finance/invoices/:id/payment - record payment
router.put('/invoices/:id/payment', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { amount, payment_date, payment_method, reference_number, notes } = req.body;

  await query(`
    INSERT INTO payment_records (invoice_id, amount, payment_date, payment_method, reference_number, notes, recorded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [req.params.id, amount, payment_date, payment_method, reference_number, notes, req.user.id]);

  const result = await query(`
    UPDATE invoices SET status='paid', paid_at=NOW(), payment_method=$1, payment_reference=$2
    WHERE id=$3 RETURNING *
  `, [payment_method, reference_number, req.params.id]);

  res.json(result.rows[0]);
}));

// GET /api/finance/stats
router.get('/stats', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW())), 0) as monthly_billed,
      COALESCE(SUM(total_amount) FILTER (WHERE status='paid' AND date_trunc('month', paid_at) = date_trunc('month', NOW())), 0) as monthly_collected,
      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('pending','sent')), 0) as outstanding,
      COALESCE(SUM(total_amount) FILTER (WHERE status='overdue'), 0) as overdue,
      COUNT(*) FILTER (WHERE status='overdue') as overdue_count
    FROM invoices
  `);
  res.json(result.rows[0]);
}));

// GET /api/finance/invoices/:id/pdf
router.get('/invoices/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const inv = await query(`
    SELECT inv.*, c.case_number, c.title, c.owner_name, c.owner_company, c.owner_phone,
      c.location_address, c.signed_by, c.signed_at, u.name as engineer_name
    FROM invoices inv
    LEFT JOIN cases c ON inv.case_id=c.id
    LEFT JOIN users u ON c.assigned_engineer_id=u.id
    WHERE inv.id=$1
  `, [req.params.id]);
  if (!inv.rows.length) return res.status(404).json({ error: '請款單不存在' });
  const invoice = inv.rows[0];

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text('結  案  暨  請  款  單', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`請款單號：${invoice.invoice_number}`, { align: 'right' });
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.5);

  doc.fontSize(10);
  doc.text(`業主/公司：${invoice.owner_company || invoice.owner_name || '--'}`);
  doc.text(`聯絡人：${invoice.owner_name || '--'}    電話：${invoice.owner_phone || '--'}`);
  doc.text(`案件編號：${invoice.case_number}    施工地點：${invoice.location_address || '--'}`);
  doc.text(`負責工程師：${invoice.engineer_name || '--'}`);
  if (invoice.due_date) doc.text(`付款期限：${new Date(invoice.due_date).toLocaleDateString('zh-TW')}`);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('請款明細', doc.x, doc.y);
  doc.font('Helvetica').moveDown(0.3);
  doc.text(`工程費用：$${Number(invoice.amount).toLocaleString()}`);
  doc.text(`稅金：$${Number(invoice.tax_amount).toLocaleString()}`);
  doc.font('Helvetica-Bold').fontSize(13);
  doc.text(`請款總金額：$${Number(invoice.total_amount).toLocaleString()}`, { align: 'right' });
  doc.moveDown(1);

  if (invoice.signed_by) {
    doc.font('Helvetica').fontSize(10);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); doc.moveDown(0.5);
    doc.text(`業主簽收人：${invoice.signed_by}`);
    doc.text(`簽收時間：${new Date(invoice.signed_at).toLocaleString('zh-TW')}`);
    doc.text('（業主已確認工程完工並簽名）');
  }

  if (invoice.notes) { doc.moveDown(0.5); doc.fontSize(9).text('備注：' + invoice.notes); }
  doc.end();
}));

// Payment records
router.get('/payments', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT pr.*, inv.invoice_number, inv.total_amount, c.case_number, c.owner_company
    FROM payment_records pr
    LEFT JOIN invoices inv ON pr.invoice_id=inv.id
    LEFT JOIN cases c ON inv.case_id=c.id
    ORDER BY pr.created_at DESC
  `);
  res.json(result.rows);
}));

// Mark invoice overdue (can be called by a cron job)
router.post('/invoices/check-overdue', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const result = await query(`
    UPDATE invoices SET status='overdue'
    WHERE status IN ('pending','sent') AND due_date < CURRENT_DATE
    RETURNING id, invoice_number
  `);
  res.json({ updated: result.rowCount, invoices: result.rows });
}));

module.exports = router;
