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

const generateClosureNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(`SELECT COUNT(*) FROM closure_reports WHERE EXTRACT(YEAR FROM created_at)=$1`, [year]);
  return `CR-${year}-${String(parseInt(result.rows[0].count) + 1).padStart(4,'0')}`;
};

const generateReceiptNumber = async () => {
  const year = new Date().getFullYear();
  const result = await query(`SELECT COUNT(*) FROM receipts WHERE EXTRACT(YEAR FROM created_at)=$1`, [year]);
  return `REC-${year}-${String(parseInt(result.rows[0].count) + 1).padStart(4,'0')}`;
};

const calcTotals = (items, taxRate) => {
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.unit_price) * parseFloat(item.quantity), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
};

// ── 科技風 PDF Helper ──────────────────────────────────────────────────────────
const TECH_COLORS = {
  primary: '#FF6B00',       // Signify orange
  dark:    '#1A1A2E',       // deep navy
  accent:  '#16213E',       // dark blue
  mid:     '#0F3460',       // mid blue
  light:   '#E8F4FD',       // pale blue
  text:    '#2C3E50',
  gray:    '#95A5A6',
  white:   '#FFFFFF',
  green:   '#27AE60',
};

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return [r, g, b];
};

const drawTechHeader = (doc, title, subtitle, number) => {
  // Dark header band
  doc.save();
  doc.rect(0, 0, 595, 100).fill(TECH_COLORS.dark);
  // Orange accent bar
  doc.rect(0, 95, 595, 5).fill(TECH_COLORS.primary);
  // Title
  doc.fillColor(TECH_COLORS.white).fontSize(22).font('Helvetica-Bold')
     .text(title, 40, 22, { width: 360 });
  // Subtitle
  doc.fillColor(TECH_COLORS.primary).fontSize(10).font('Helvetica')
     .text(subtitle, 40, 52);
  // Number box
  doc.roundedRect(430, 18, 130, 50, 4).fill(TECH_COLORS.primary);
  doc.fillColor(TECH_COLORS.white).fontSize(8).font('Helvetica-Bold')
     .text('DOCUMENT NO.', 440, 25);
  doc.fontSize(11).text(number, 440, 37, { width: 110 });
  // Date
  doc.fillColor(TECH_COLORS.gray).fontSize(8)
     .text(`列印日期：${new Date().toLocaleDateString('zh-TW')}`, 440, 54);
  doc.restore();
};

const drawSectionHeader = (doc, label, y) => {
  const yCur = y || doc.y;
  doc.save();
  doc.rect(40, yCur, 4, 16).fill(TECH_COLORS.primary);
  doc.rect(48, yCur + 6, 507, 1).fill(TECH_COLORS.primary).fillOpacity(0.3);
  doc.fillColor(TECH_COLORS.dark).fontSize(10).font('Helvetica-Bold')
     .text(label, 56, yCur + 1);
  doc.restore();
  doc.moveDown(0.1);
  doc.y = yCur + 22;
};

const drawInfoRow = (doc, label, value, x1, x2, y) => {
  const yCur = y || doc.y;
  doc.save();
  doc.fillColor(TECH_COLORS.gray).fontSize(8).font('Helvetica')
     .text(label, x1 || 40, yCur, { width: 80 });
  doc.fillColor(TECH_COLORS.text).fontSize(9).font('Helvetica-Bold')
     .text(value || '--', (x2 || 40) + 80, yCur, { width: 200 });
  doc.restore();
  doc.y = yCur + 14;
};

// ── 科技風報價單 PDF ──────────────────────────────────────────────────────────
const generateQuotationPdfBuffer = async (quotId) => {
  const q = await query(`
    SELECT qt.*, c.case_number, c.title, c.owner_name, c.owner_company, c.owner_phone, c.location_address
    FROM quotations qt LEFT JOIN cases c ON qt.case_id=c.id WHERE qt.id=$1
  `, [quotId]);
  if (!q.rows.length) throw new Error('報價單不存在');
  const quot = q.rows[0];
  const items = await query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY sort_order`, [quotId]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    drawTechHeader(doc, '報 價 單', 'QUOTATION', quot.quote_number);
    doc.y = 115;

    // Company info section
    drawSectionHeader(doc, '客戶資訊');
    let infoY = doc.y;
    drawInfoRow(doc, '業主 / 公司', quot.owner_company || quot.owner_name, 40, 40, infoY);
    drawInfoRow(doc, '聯絡人', quot.owner_name, 40, 40, infoY + 14);
    drawInfoRow(doc, '電話', quot.owner_phone, 40, 40, infoY + 28);
    drawInfoRow(doc, '施工地點', quot.location_address, 40, 40, infoY + 42);
    drawInfoRow(doc, '關聯案件', quot.case_number, 280, 280, infoY);
    drawInfoRow(doc, '有效期限', quot.valid_until ? new Date(quot.valid_until).toLocaleDateString('zh-TW') : '--', 280, 280, infoY + 14);
    drawInfoRow(doc, '建立日期', new Date(quot.created_at).toLocaleDateString('zh-TW'), 280, 280, infoY + 28);
    doc.y = infoY + 62;

    // Items table
    drawSectionHeader(doc, '報價明細');
    const tY = doc.y;
    // Table header
    doc.save();
    doc.rect(40, tY, 515, 22).fill(TECH_COLORS.dark);
    doc.fillColor(TECH_COLORS.white).fontSize(8).font('Helvetica-Bold');
    doc.text('項目名稱', 48, tY + 7, { width: 160 });
    doc.text('說明', 215, tY + 7, { width: 100 });
    doc.text('數量', 320, tY + 7, { width: 40 });
    doc.text('單位', 365, tY + 7, { width: 40 });
    doc.text('單價', 410, tY + 7, { width: 65 });
    doc.text('小計', 480, tY + 7, { width: 70 });
    doc.restore();
    doc.y = tY + 22;

    items.rows.forEach((item, i) => {
      const rowY = doc.y;
      if (i % 2 === 0) {
        doc.save().rect(40, rowY, 515, 20).fill('#F8FAFC').restore();
      }
      doc.save();
      doc.fillColor(TECH_COLORS.text).fontSize(8).font('Helvetica');
      doc.text(item.item_name || '', 48, rowY + 6, { width: 160 });
      doc.text(item.description || '', 215, rowY + 6, { width: 100 });
      doc.text(String(item.quantity), 320, rowY + 6, { width: 40 });
      doc.text(item.unit || '', 365, rowY + 6, { width: 40 });
      doc.text(`$${Number(item.unit_price).toLocaleString()}`, 410, rowY + 6, { width: 65 });
      doc.fillColor(TECH_COLORS.dark).font('Helvetica-Bold')
         .text(`$${Number(item.subtotal).toLocaleString()}`, 480, rowY + 6, { width: 70 });
      doc.restore();
      doc.y = rowY + 20;
    });

    // Totals
    doc.y += 8;
    doc.save();
    doc.rect(350, doc.y, 205, 2).fill(TECH_COLORS.primary);
    doc.restore();
    doc.y += 8;
    const totY = doc.y;
    doc.fillColor(TECH_COLORS.gray).fontSize(9).font('Helvetica').text('小計', 380, totY);
    doc.fillColor(TECH_COLORS.text).font('Helvetica-Bold').text(`$${Number(quot.subtotal).toLocaleString()}`, 470, totY, { align: 'right', width: 85 });
    doc.fillColor(TECH_COLORS.gray).font('Helvetica').text(`稅金 (${quot.tax_rate}%)`, 380, totY + 16);
    doc.fillColor(TECH_COLORS.text).font('Helvetica-Bold').text(`$${Number(quot.tax_amount).toLocaleString()}`, 470, totY + 16, { align: 'right', width: 85 });

    // Total box
    doc.save();
    doc.roundedRect(350, totY + 36, 205, 32, 4).fill(TECH_COLORS.primary);
    doc.fillColor(TECH_COLORS.white).fontSize(10).font('Helvetica').text('報價總金額', 360, totY + 44);
    doc.fontSize(14).font('Helvetica-Bold').text(`$${Number(quot.total).toLocaleString()}`, 360, totY + 44, { align: 'right', width: 185 });
    doc.restore();
    doc.y = totY + 76;

    if (quot.notes) {
      doc.y += 10;
      drawSectionHeader(doc, '備注事項');
      doc.save().rect(40, doc.y, 515, 1).fill(TECH_COLORS.light).restore();
      doc.save().rect(40, doc.y, 3, 40).fill(TECH_COLORS.primary).restore();
      doc.fillColor(TECH_COLORS.text).fontSize(9).font('Helvetica')
         .text(quot.notes, 48, doc.y + 4, { width: 507 });
      doc.restore();
    }

    // Footer
    doc.save();
    doc.rect(0, 800, 595, 42).fill(TECH_COLORS.dark);
    doc.fillColor(TECH_COLORS.gray).fontSize(8)
       .text('此報價單由 Signify 維修管理系統自動產生  ·  如有疑問請聯繫客服', 40, 812, { align: 'center', width: 515 });
    doc.restore();

    doc.end();
  });
};

// ── 科技風請款單 PDF ──────────────────────────────────────────────────────────
const generateInvoicePdfBuffer = async (invId) => {
  const inv = await query(`
    SELECT inv.*, c.case_number, c.title, c.owner_name, c.owner_company, c.owner_phone,
      c.location_address, c.signed_by, c.signed_at, u.name as engineer_name
    FROM invoices inv
    LEFT JOIN cases c ON inv.case_id=c.id
    LEFT JOIN users u ON c.assigned_engineer_id=u.id
    WHERE inv.id=$1
  `, [invId]);
  if (!inv.rows.length) throw new Error('請款單不存在');
  const invoice = inv.rows[0];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawTechHeader(doc, '請 款 單', 'INVOICE', invoice.invoice_number);
    doc.y = 115;

    drawSectionHeader(doc, '客戶資訊');
    let infoY = doc.y;
    drawInfoRow(doc, '業主 / 公司', invoice.owner_company || invoice.owner_name, 40, 40, infoY);
    drawInfoRow(doc, '聯絡人', invoice.owner_name, 40, 40, infoY + 14);
    drawInfoRow(doc, '電話', invoice.owner_phone, 40, 40, infoY + 28);
    drawInfoRow(doc, '施工地點', invoice.location_address, 40, 40, infoY + 42);
    drawInfoRow(doc, '案件編號', invoice.case_number, 280, 280, infoY);
    drawInfoRow(doc, '負責工程師', invoice.engineer_name, 280, 280, infoY + 14);
    drawInfoRow(doc, '付款期限', invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('zh-TW') : '--', 280, 280, infoY + 28);
    doc.y = infoY + 62;

    drawSectionHeader(doc, '請款明細');
    const tY = doc.y;
    doc.save();
    doc.rect(40, tY, 515, 22).fill(TECH_COLORS.dark);
    doc.fillColor(TECH_COLORS.white).fontSize(8).font('Helvetica-Bold');
    doc.text('項目', 48, tY + 7, { width: 300 });
    doc.text('金額', 460, tY + 7, { width: 90 });
    doc.restore();
    doc.y = tY + 22;

    const rows = [
      ['工程費用', `$${Number(invoice.amount).toLocaleString()}`],
      [`稅金 (${invoice.tax_rate || 5}%)`, `$${Number(invoice.tax_amount).toLocaleString()}`],
    ];
    rows.forEach(([label, val], i) => {
      const rowY = doc.y;
      if (i % 2 === 0) doc.save().rect(40, rowY, 515, 20).fill('#F8FAFC').restore();
      doc.fillColor(TECH_COLORS.text).fontSize(9).font('Helvetica').text(label, 48, rowY + 6, { width: 300 });
      doc.font('Helvetica-Bold').text(val, 460, rowY + 6, { width: 90 });
      doc.y = rowY + 20;
    });

    doc.y += 8;
    doc.save().rect(350, doc.y, 205, 2).fill(TECH_COLORS.primary).restore();
    doc.y += 12;
    doc.save();
    doc.roundedRect(350, doc.y, 205, 32, 4).fill(TECH_COLORS.primary);
    doc.fillColor(TECH_COLORS.white).fontSize(10).font('Helvetica').text('請款總金額', 360, doc.y + 10);
    doc.fontSize(14).font('Helvetica-Bold').text(`$${Number(invoice.total_amount).toLocaleString()}`, 360, doc.y + 10, { align: 'right', width: 185 });
    doc.restore();
    doc.y += 44;

    if (invoice.signed_by) {
      doc.y += 10;
      drawSectionHeader(doc, '業主簽收確認');
      let sY = doc.y;
      drawInfoRow(doc, '簽收人', invoice.signed_by, 40, 40, sY);
      drawInfoRow(doc, '簽收時間', invoice.signed_at ? new Date(invoice.signed_at).toLocaleString('zh-TW') : '--', 40, 40, sY + 14);
      doc.save().fillColor(TECH_COLORS.green).fontSize(9).font('Helvetica-Bold')
         .text('✓ 業主已確認工程完工並完成簽名', 40, sY + 30).restore();
      doc.y = sY + 46;
    }

    if (invoice.notes) {
      doc.y += 8;
      drawSectionHeader(doc, '備注事項');
      doc.fillColor(TECH_COLORS.text).fontSize(9).font('Helvetica')
         .text(invoice.notes, 48, doc.y + 4, { width: 507 });
    }

    doc.save();
    doc.rect(0, 800, 595, 42).fill(TECH_COLORS.dark);
    doc.fillColor(TECH_COLORS.gray).fontSize(8)
       .text('此請款單由 Signify 維修管理系統自動產生  ·  如有疑問請聯繫客服', 40, 812, { align: 'center', width: 515 });
    doc.restore();

    doc.end();
  });
};

// ── Signify 品牌色調 結案報告 PDF ──────────────────────────────────────────────
const generateClosureReportPdf = async (caseId, closureData = {}) => {
  const caseResult = await query(`
    SELECT c.*, u.name as engineer_name, u.phone as engineer_phone,
      u.email as engineer_email
    FROM cases c LEFT JOIN users u ON c.assigned_engineer_id=u.id
    WHERE c.id=$1
  `, [caseId]);
  if (!caseResult.rows.length) throw new Error('案件不存在');
  const c = caseResult.rows[0];

  const notesResult = await query(`
    SELECT cn.*, u.name as author_name FROM case_notes cn
    LEFT JOIN users u ON cn.author_id=u.id
    WHERE cn.case_id=$1 ORDER BY cn.created_at
  `, [caseId]);

  const activitiesResult = await query(`
    SELECT * FROM case_activities WHERE case_id=$1 ORDER BY created_at
  `, [caseId]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─ Signify-branded Header ─────────────────────────────────────
    // Background gradient simulation
    doc.save();
    doc.rect(0, 0, 595, 120).fill('#1A1A2E');
    doc.rect(0, 115, 595, 5).fill('#FF6B00');
    // Decorative circles
    doc.circle(520, 20, 60).fillOpacity(0.05).fill('#FF6B00');
    doc.circle(560, 80, 40).fillOpacity(0.05).fill('#FF6B00');
    doc.restore();

    // Logo area & title
    doc.save();
    doc.fillColor('#FF6B00').fontSize(9).font('Helvetica-Bold').text('SIGNIFY', 40, 20);
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('工程結案報告', 40, 35);
    doc.fillColor('#FF6B00').fontSize(10).font('Helvetica').text('ENGINEERING CLOSURE REPORT', 40, 62);

    // Case number badge
    doc.roundedRect(400, 16, 165, 55, 6).stroke('#FF6B00').strokeOpacity(0.8);
    doc.fillColor('#FF6B00').fontSize(7).font('Helvetica-Bold').text('CASE NUMBER', 412, 25);
    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold').text(c.case_number, 412, 38);
    doc.fillColor('#95A5A6').fontSize(8).font('Helvetica')
       .text(`結案：${c.signed_at ? new Date(c.signed_at).toLocaleDateString('zh-TW') : '--'}`, 412, 58);
    doc.restore();
    doc.y = 132;

    // ─ Executive Summary Box ─────────────────────────────────────
    doc.save();
    doc.roundedRect(30, doc.y, 535, 56, 6).fill('#F0F7FF');
    doc.rect(30, doc.y, 4, 56).fill('#FF6B00');
    const sumY = doc.y + 8;
    doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica-Bold').text('案件概要', 42, sumY);
    doc.fillColor('#2C3E50').fontSize(8).font('Helvetica')
       .text(`標題：${c.title}`, 42, sumY + 16)
       .text(`類型：${c.case_type || '--'}  ·  緊急程度：${c.urgency || '--'}  ·  狀態：已結案`, 42, sumY + 28)
       .text(`業主/公司：${c.owner_company || c.owner_name || '--'}  ·  地點：${c.location_address || '--'}`, 42, sumY + 40);
    doc.restore();
    doc.y += 68;

    // ─ Section: 工程人員資訊 ─────────────────────────────────────
    doc.y += 8;
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica-Bold').text('工程人員資訊', 40, doc.y + 1);
    doc.y += 20;

    const col1x = 40, col2x = 300;
    const engY = doc.y;
    const pairs = [
      ['負責工程師', c.engineer_name || '--'],
      ['工程師電話', c.engineer_phone || '--'],
      ['工程師信箱', c.engineer_email || '--'],
    ];
    pairs.forEach(([lbl, val], i) => {
      doc.fillColor('#95A5A6').fontSize(8).font('Helvetica').text(lbl, col1x, engY + i * 16);
      doc.fillColor('#2C3E50').fontSize(8).font('Helvetica-Bold').text(val, col1x + 85, engY + i * 16);
    });
    const pairs2 = [
      ['指派人', c.assigned_by ? `UID-${c.assigned_by}` : '--'],
      ['指派時間', c.assigned_at ? new Date(c.assigned_at).toLocaleString('zh-TW') : '--'],
    ];
    pairs2.forEach(([lbl, val], i) => {
      doc.fillColor('#95A5A6').fontSize(8).font('Helvetica').text(lbl, col2x, engY + i * 16);
      doc.fillColor('#2C3E50').fontSize(8).font('Helvetica-Bold').text(val, col2x + 85, engY + i * 16);
    });
    doc.y = engY + 50;

    // ─ Section: 施工時間記錄 ─────────────────────────────────────
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica-Bold').text('施工時間記錄', 40, doc.y + 1);
    doc.y += 20;

    const timeItems = [
      { label: '接單時間', value: c.created_at, icon: '○' },
      { label: '到場時間', value: c.checkin_time, icon: '▶' },
      { label: '離場時間', value: c.checkout_time, icon: '■' },
      { label: '簽收時間', value: c.signed_at, icon: '✓' },
    ];
    const timeY = doc.y;
    doc.save();
    timeItems.forEach((item, i) => {
      const tx = 40 + i * 130;
      const hasVal = !!item.value;
      doc.roundedRect(tx, timeY, 120, 48, 5)
         .fill(hasVal ? '#1A1A2E' : '#F8F9FA');
      doc.fillColor(hasVal ? '#FF6B00' : '#CCC').fontSize(14).text(item.icon, tx + 8, timeY + 8);
      doc.fillColor(hasVal ? '#95A5A6' : '#CCC').fontSize(7).text(item.label, tx + 30, timeY + 10);
      doc.fillColor(hasVal ? '#FFFFFF' : '#CCC').fontSize(8).font('Helvetica-Bold')
         .text(hasVal ? new Date(item.value).toLocaleString('zh-TW') : '未記錄', tx + 8, timeY + 28, { width: 104 });
    });
    doc.restore();
    doc.y = timeY + 60;

    // ─ Section: 施工說明 ─────────────────────────────────────────
    doc.y += 6;
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica-Bold').text('施工說明', 40, doc.y + 1);
    doc.y += 20;

    doc.save();
    doc.roundedRect(40, doc.y, 515, Math.max(36, Math.min(100, (c.description || '').length * 6)), 4)
       .fill('#F8F9FA');
    doc.fillColor('#2C3E50').fontSize(9).font('Helvetica')
       .text(c.description || '--', 50, doc.y + 8, { width: 495 });
    doc.restore();
    doc.y += Math.max(46, Math.min(110, (c.description || '').length * 6 + 10));

    // ─ Section: 現場作業記錄 ─────────────────────────────────────
    if (notesResult.rows.length > 0) {
      doc.y += 6;
      doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
      doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica-Bold').text('現場作業記錄', 40, doc.y + 1);
      doc.y += 20;

      notesResult.rows.forEach((note, i) => {
        const nY = doc.y;
        // Check page space
        if (nY > 720) { doc.addPage(); doc.y = 40; }
        doc.save();
        doc.roundedRect(40, nY, 515, 42, 4)
           .fill(i % 2 === 0 ? '#F8F9FA' : '#FFF8F0');
        doc.rect(40, nY, 3, 42).fill('#FF6B00');
        doc.fillColor('#FF6B00').fontSize(7).font('Helvetica-Bold')
           .text(`#${String(i+1).padStart(2,'0')}`, 50, nY + 6);
        doc.fillColor('#95A5A6').fontSize(7).font('Helvetica')
           .text(new Date(note.created_at).toLocaleString('zh-TW'), 75, nY + 6)
           .text(note.author_name || '--', 230, nY + 6);
        doc.fillColor('#2C3E50').fontSize(8.5)
           .text(note.content || '', 50, nY + 20, { width: 495 });
        doc.restore();
        doc.y = nY + 48;
      });
    }

    // ─ Section: 業主簽收確認 ─────────────────────────────────────
    if (doc.y > 680) { doc.addPage(); doc.y = 40; }
    doc.y += 8;
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica-Bold').text('業主簽收確認', 40, doc.y + 1);
    doc.y += 20;

    doc.save();
    doc.roundedRect(40, doc.y, 515, 56, 6).fill('#F0FFF4');
    doc.rect(40, doc.y, 4, 56).fill('#27AE60');
    const sigY = doc.y + 8;
    doc.fillColor('#27AE60').fontSize(9).font('Helvetica-Bold')
       .text('✓ 業主已簽名確認完工', 52, sigY);
    doc.fillColor('#95A5A6').fontSize(8).font('Helvetica')
       .text('簽收人', 52, sigY + 18)
       .text('簽收時間', 200, sigY + 18)
       .text('完工備注', 380, sigY + 18);
    doc.fillColor('#2C3E50').font('Helvetica-Bold')
       .text(c.signed_by || '--', 52, sigY + 30)
       .text(c.signed_at ? new Date(c.signed_at).toLocaleString('zh-TW') : '--', 200, sigY + 30)
       .text(c.completion_notes || '--', 380, sigY + 30, { width: 160 });
    doc.restore();
    doc.y += 68;

    // Embed signature if available
    if (c.owner_signature && c.owner_signature.startsWith('data:image')) {
      try {
        const base64Data = c.owner_signature.split(',')[1];
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.text('業主手寫簽名：', 40, doc.y);
        doc.image(imgBuffer, 40, doc.y + 4, { width: 180, height: 55 });
        doc.y += 70;
      } catch(e) {}
    }

    // ─ Footer ────────────────────────────────────────────────────
    // Ensure footer stays at bottom
    const footerY = 790;
    doc.save();
    doc.rect(0, footerY, 595, 52).fill('#1A1A2E');
    doc.rect(0, footerY, 595, 3).fill('#FF6B00');
    doc.fillColor('#FF6B00').fontSize(8).font('Helvetica-Bold').text('SIGNIFY', 40, footerY + 12);
    doc.fillColor('#95A5A6').fontSize(7.5).font('Helvetica')
       .text('維修工程管理系統  ·  本報告由系統自動產生，具備法律效力之簽收記錄', 85, footerY + 14);
    doc.fillColor('#4A4A6A').fontSize(7)
       .text(`列印時間：${new Date().toLocaleString('zh-TW')}  ·  案件編號：${c.case_number}`, 40, footerY + 30);
    doc.restore();

    doc.end();
  });
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
router.post('/quotations', authenticate, authorize('admin','customer_service','engineer'), asyncHandler(async (req, res) => {
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

// GET /api/finance/quotations/:id/pdf  (科技風)
router.get('/quotations/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  try {
    const buf = await generateQuotationPdfBuffer(req.params.id);
    const q = await query('SELECT quote_number FROM quotations WHERE id=$1', [req.params.id]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${q.rows[0]?.quote_number || 'quotation'}.pdf"`);
    res.end(buf);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
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

// GET /api/finance/invoices/:id/pdf  (科技風)
router.get('/invoices/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  try {
    const buf = await generateInvoicePdfBuffer(req.params.id);
    const inv = await query('SELECT invoice_number FROM invoices WHERE id=$1', [req.params.id]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${inv.rows[0]?.invoice_number || 'invoice'}.pdf"`);
    res.end(buf);
  } catch(e) {
    res.status(404).json({ error: e.message });
  }
}));

// ===== CLOSURE REPORTS (結案單) =====

// GET /api/finance/closures
router.get('/closures', authenticate, asyncHandler(async (req, res) => {
  const { case_id } = req.query;
  let where = '', params = [];
  if (case_id) { where = 'WHERE cr.case_id=$1'; params.push(case_id); }
  const result = await query(`
    SELECT cr.*, c.case_number, c.title, c.owner_name, c.owner_company, u.name as created_by_name
    FROM closure_reports cr
    LEFT JOIN cases c ON cr.case_id=c.id
    LEFT JOIN users u ON cr.created_by=u.id
    ${where} ORDER BY cr.created_at DESC
  `, params);
  res.json(result.rows);
}));

// POST /api/finance/closures
router.post('/closures', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { case_id, notes, summary } = req.body;
  if (!case_id) return res.status(400).json({ error: '請指定關聯案件' });

  const caseResult = await query('SELECT * FROM cases WHERE id=$1', [case_id]);
  if (!caseResult.rows.length) return res.status(404).json({ error: '案件不存在' });

  const closureNumber = await generateClosureNumber();
  const result = await query(`
    INSERT INTO closure_reports (closure_number, case_id, created_by, notes, summary)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [closureNumber, case_id, req.user.id, notes, summary]);

  // Update case status to closed
  await query(`UPDATE cases SET status='closed' WHERE id=$1`, [case_id]);

  res.status(201).json(result.rows[0]);
}));

// GET /api/finance/closures/by-case/:caseId/pdf  (必須在 /:id 之前)
router.get('/closures/by-case/:caseId/pdf', authenticate, asyncHandler(async (req, res) => {
  try {
    const buf = await generateClosureReportPdf(req.params.caseId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="closure-${req.params.caseId}.pdf"`);
    res.end(buf);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}));

// GET /api/finance/closures/:id/pdf  (Signify品牌色調 結案報告)
router.get('/closures/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const cr = await query('SELECT * FROM closure_reports WHERE id=$1', [req.params.id]);
  if (!cr.rows.length) return res.status(404).json({ error: '結案單不存在' });

  try {
    const buf = await generateClosureReportPdf(cr.rows[0].case_id, cr.rows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cr.rows[0].closure_number}.pdf"`);
    res.end(buf);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}));

// ===== RECEIPTS (收款單) =====

// GET /api/finance/receipts
router.get('/receipts', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT r.*, inv.invoice_number, inv.total_amount,
      c.case_number, c.owner_name, c.owner_company,
      u.name as recorded_by_name
    FROM receipts r
    LEFT JOIN invoices inv ON r.invoice_id=inv.id
    LEFT JOIN cases c ON inv.case_id=c.id
    LEFT JOIN users u ON r.recorded_by=u.id
    ORDER BY r.created_at DESC
  `);
  res.json(result.rows);
}));

// POST /api/finance/receipts
router.post('/receipts', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { invoice_id, amount, payment_date, payment_method, reference_number, notes, bank_account } = req.body;
  if (!invoice_id || !amount) return res.status(400).json({ error: '請填寫發票及金額' });

  const invResult = await query('SELECT * FROM invoices WHERE id=$1', [invoice_id]);
  if (!invResult.rows.length) return res.status(404).json({ error: '請款單不存在' });

  const receiptNumber = await generateReceiptNumber();

  const result = await query(`
    INSERT INTO receipts (receipt_number, invoice_id, amount, payment_date, payment_method,
      reference_number, notes, bank_account, recorded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [receiptNumber, invoice_id, amount, payment_date || new Date(), payment_method || '銀行轉帳',
      reference_number, notes, bank_account, req.user.id]);

  // Update invoice status to paid
  await query(`UPDATE invoices SET status='paid', paid_at=NOW() WHERE id=$1`, [invoice_id]);

  res.status(201).json(result.rows[0]);
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
