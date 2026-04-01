const router = require('express').Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const pdf = require('../utils/pdfGenerator');

// ── 新編碼格式：前綴3碼 + 年4碼 + 月2碼 + 日2碼 + 當日序號3碼 ──
const genNumber = async (prefix, table, dateCol = 'created_at') => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const result = await query(
    `SELECT COUNT(*) FROM ${table} WHERE DATE(${dateCol}) = CURRENT_DATE`
  );
  const seq = String(parseInt(result.rows[0].count) + 1).padStart(3, '0');
  return `${prefix}${y}${m}${d}${seq}`;
};

const generateQuoteNumber    = () => genNumber('QUO', 'quotations');
const generateInvoiceNumber  = () => genNumber('INV', 'invoices');
const generateClosureNumber  = () => genNumber('CLO', 'closure_reports');
const generateReceiptNumber  = () => genNumber('REC', 'receipts');

const calcTotals = (items, taxRate) => {
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.unit_price) * parseFloat(item.quantity), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
};

// ── 科技風 PDF Helper ──────────────────────────────────────────────────────────
const TECH_COLORS = {
  primary: '#FF6B00',       // 皇祥工程設計 orange
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
  doc.fillColor(TECH_COLORS.white).fontSize(22).font('CJK')
     .text(title, 40, 22, { width: 360 });
  // Subtitle
  doc.fillColor(TECH_COLORS.primary).fontSize(10).font('CJK')
     .text(subtitle, 40, 52);
  // Number box
  doc.roundedRect(430, 18, 130, 50, 4).fill(TECH_COLORS.primary);
  doc.fillColor(TECH_COLORS.white).fontSize(8).font('CJK')
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
  doc.fillColor(TECH_COLORS.dark).fontSize(10).font('CJK')
     .text(label, 56, yCur + 1);
  doc.restore();
  doc.moveDown(0.1);
  doc.y = yCur + 22;
};

const drawInfoRow = (doc, label, value, x1, x2, y) => {
  const yCur = y || doc.y;
  doc.save();
  doc.fillColor(TECH_COLORS.gray).fontSize(8).font('CJK')
     .text(label, x1 || 40, yCur, { width: 80 });
  doc.fillColor(TECH_COLORS.text).fontSize(9).font('CJK')
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
    doc.fillColor(TECH_COLORS.white).fontSize(8).font('CJK');
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
      doc.fillColor(TECH_COLORS.text).fontSize(8).font('CJK');
      doc.text(item.item_name || '', 48, rowY + 6, { width: 160 });
      doc.text(item.description || '', 215, rowY + 6, { width: 100 });
      doc.text(String(item.quantity), 320, rowY + 6, { width: 40 });
      doc.text(item.unit || '', 365, rowY + 6, { width: 40 });
      doc.text(`$${Number(item.unit_price).toLocaleString()}`, 410, rowY + 6, { width: 65 });
      doc.fillColor(TECH_COLORS.dark).font('CJK')
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
    doc.fillColor(TECH_COLORS.gray).fontSize(9).font('CJK').text('小計', 380, totY);
    doc.fillColor(TECH_COLORS.text).font('CJK').text(`$${Number(quot.subtotal).toLocaleString()}`, 470, totY, { align: 'right', width: 85 });
    doc.fillColor(TECH_COLORS.gray).font('CJK').text(`稅金 (${quot.tax_rate}%)`, 380, totY + 16);
    doc.fillColor(TECH_COLORS.text).font('CJK').text(`$${Number(quot.tax_amount).toLocaleString()}`, 470, totY + 16, { align: 'right', width: 85 });

    // Total box
    doc.save();
    doc.roundedRect(350, totY + 36, 205, 32, 4).fill(TECH_COLORS.primary);
    doc.fillColor(TECH_COLORS.white).fontSize(10).font('CJK').text('報價總金額', 360, totY + 44);
    doc.fontSize(14).font('CJK').text(`$${Number(quot.total).toLocaleString()}`, 360, totY + 44, { align: 'right', width: 185 });
    doc.restore();
    doc.y = totY + 76;

    if (quot.notes) {
      doc.y += 10;
      drawSectionHeader(doc, '備注事項');
      doc.save().rect(40, doc.y, 515, 1).fill(TECH_COLORS.light).restore();
      doc.save().rect(40, doc.y, 3, 40).fill(TECH_COLORS.primary).restore();
      doc.fillColor(TECH_COLORS.text).fontSize(9).font('CJK')
         .text(quot.notes, 48, doc.y + 4, { width: 507 });
      doc.restore();
    }

    // Footer
    doc.save();
    doc.rect(0, 800, 595, 42).fill(TECH_COLORS.dark);
    doc.fillColor(TECH_COLORS.gray).fontSize(8)
       .text('此報價單由 皇祥工程設計 維修管理系統自動產生  ·  如有疑問請聯繫客服', 40, 812, { align: 'center', width: 515 });
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
    doc.fillColor(TECH_COLORS.white).fontSize(8).font('CJK');
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
      doc.fillColor(TECH_COLORS.text).fontSize(9).font('CJK').text(label, 48, rowY + 6, { width: 300 });
      doc.font('CJK').text(val, 460, rowY + 6, { width: 90 });
      doc.y = rowY + 20;
    });

    doc.y += 8;
    doc.save().rect(350, doc.y, 205, 2).fill(TECH_COLORS.primary).restore();
    doc.y += 12;
    doc.save();
    doc.roundedRect(350, doc.y, 205, 32, 4).fill(TECH_COLORS.primary);
    doc.fillColor(TECH_COLORS.white).fontSize(10).font('CJK').text('請款總金額', 360, doc.y + 10);
    doc.fontSize(14).font('CJK').text(`$${Number(invoice.total_amount).toLocaleString()}`, 360, doc.y + 10, { align: 'right', width: 185 });
    doc.restore();
    doc.y += 44;

    if (invoice.signed_by) {
      doc.y += 10;
      drawSectionHeader(doc, '業主簽收確認');
      let sY = doc.y;
      drawInfoRow(doc, '簽收人', invoice.signed_by, 40, 40, sY);
      drawInfoRow(doc, '簽收時間', invoice.signed_at ? new Date(invoice.signed_at).toLocaleString('zh-TW') : '--', 40, 40, sY + 14);
      doc.save().fillColor(TECH_COLORS.green).fontSize(9).font('CJK')
         .text('✓ 業主已確認工程完工並完成簽名', 40, sY + 30).restore();
      doc.y = sY + 46;
    }

    if (invoice.notes) {
      doc.y += 8;
      drawSectionHeader(doc, '備注事項');
      doc.fillColor(TECH_COLORS.text).fontSize(9).font('CJK')
         .text(invoice.notes, 48, doc.y + 4, { width: 507 });
    }

    doc.save();
    doc.rect(0, 800, 595, 42).fill(TECH_COLORS.dark);
    doc.fillColor(TECH_COLORS.gray).fontSize(8)
       .text('此請款單由 皇祥工程設計 維修管理系統自動產生  ·  如有疑問請聯繫客服', 40, 812, { align: 'center', width: 515 });
    doc.restore();

    doc.end();
  });
};

// ── 皇祥工程設計 品牌色調 結案報告 PDF ──────────────────────────────────────────────
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

    // ─ 皇祥工程設計-branded Header ─────────────────────────────────────
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
    doc.fillColor('#FF6B00').fontSize(9).font('CJK').text('皇祥工程設計', 40, 20);
    doc.fillColor('#FFFFFF').fontSize(20).font('CJK').text('工程結案報告', 40, 35);
    doc.fillColor('#FF6B00').fontSize(10).font('CJK').text('ENGINEERING CLOSURE REPORT', 40, 62);

    // Case number badge
    doc.roundedRect(400, 16, 165, 55, 6).stroke('#FF6B00').strokeOpacity(0.8);
    doc.fillColor('#FF6B00').fontSize(7).font('CJK').text('CASE NUMBER', 412, 25);
    doc.fillColor('#FFFFFF').fontSize(14).font('CJK').text(c.case_number, 412, 38);
    doc.fillColor('#95A5A6').fontSize(8).font('CJK')
       .text(`結案：${c.signed_at ? new Date(c.signed_at).toLocaleDateString('zh-TW') : '--'}`, 412, 58);
    doc.restore();
    doc.y = 132;

    // ─ Executive Summary Box ─────────────────────────────────────
    doc.save();
    doc.roundedRect(30, doc.y, 535, 56, 6).fill('#F0F7FF');
    doc.rect(30, doc.y, 4, 56).fill('#FF6B00');
    const sumY = doc.y + 8;
    doc.fillColor('#1A1A2E').fontSize(10).font('CJK').text('案件概要', 42, sumY);
    doc.fillColor('#2C3E50').fontSize(8).font('CJK')
       .text(`標題：${c.title}`, 42, sumY + 16)
       .text(`類型：${c.case_type || '--'}  ·  緊急程度：${c.urgency || '--'}  ·  狀態：已結案`, 42, sumY + 28)
       .text(`業主/公司：${c.owner_company || c.owner_name || '--'}  ·  地點：${c.location_address || '--'}`, 42, sumY + 40);
    doc.restore();
    doc.y += 68;

    // ─ Section: 工程人員資訊 ─────────────────────────────────────
    doc.y += 8;
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('CJK').text('工程人員資訊', 40, doc.y + 1);
    doc.y += 20;

    const col1x = 40, col2x = 300;
    const engY = doc.y;
    const pairs = [
      ['負責工程師', c.engineer_name || '--'],
      ['工程師電話', c.engineer_phone || '--'],
      ['工程師信箱', c.engineer_email || '--'],
    ];
    pairs.forEach(([lbl, val], i) => {
      doc.fillColor('#95A5A6').fontSize(8).font('CJK').text(lbl, col1x, engY + i * 16);
      doc.fillColor('#2C3E50').fontSize(8).font('CJK').text(val, col1x + 85, engY + i * 16);
    });
    const pairs2 = [
      ['指派人', c.assigned_by ? `UID-${c.assigned_by}` : '--'],
      ['指派時間', c.assigned_at ? new Date(c.assigned_at).toLocaleString('zh-TW') : '--'],
    ];
    pairs2.forEach(([lbl, val], i) => {
      doc.fillColor('#95A5A6').fontSize(8).font('CJK').text(lbl, col2x, engY + i * 16);
      doc.fillColor('#2C3E50').fontSize(8).font('CJK').text(val, col2x + 85, engY + i * 16);
    });
    doc.y = engY + 50;

    // ─ Section: 施工時間記錄 ─────────────────────────────────────
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('CJK').text('施工時間記錄', 40, doc.y + 1);
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
      doc.fillColor(hasVal ? '#FFFFFF' : '#CCC').fontSize(8).font('CJK')
         .text(hasVal ? new Date(item.value).toLocaleString('zh-TW') : '未記錄', tx + 8, timeY + 28, { width: 104 });
    });
    doc.restore();
    doc.y = timeY + 60;

    // ─ Section: 施工說明 ─────────────────────────────────────────
    doc.y += 6;
    doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
    doc.fillColor('#1A1A2E').fontSize(10).font('CJK').text('施工說明', 40, doc.y + 1);
    doc.y += 20;

    doc.save();
    doc.roundedRect(40, doc.y, 515, Math.max(36, Math.min(100, (c.description || '').length * 6)), 4)
       .fill('#F8F9FA');
    doc.fillColor('#2C3E50').fontSize(9).font('CJK')
       .text(c.description || '--', 50, doc.y + 8, { width: 495 });
    doc.restore();
    doc.y += Math.max(46, Math.min(110, (c.description || '').length * 6 + 10));

    // ─ Section: 現場作業記錄 ─────────────────────────────────────
    if (notesResult.rows.length > 0) {
      doc.y += 6;
      doc.save().rect(30, doc.y, 4, 14).fill('#FF6B00').restore();
      doc.fillColor('#1A1A2E').fontSize(10).font('CJK').text('現場作業記錄', 40, doc.y + 1);
      doc.y += 20;

      notesResult.rows.forEach((note, i) => {
        const nY = doc.y;
        // Check page space
        if (nY > 720) { doc.addPage(); doc.y = 40; }
        doc.save();
        doc.roundedRect(40, nY, 515, 42, 4)
           .fill(i % 2 === 0 ? '#F8F9FA' : '#FFF8F0');
        doc.rect(40, nY, 3, 42).fill('#FF6B00');
        doc.fillColor('#FF6B00').fontSize(7).font('CJK')
           .text(`#${String(i+1).padStart(2,'0')}`, 50, nY + 6);
        doc.fillColor('#95A5A6').fontSize(7).font('CJK')
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
    doc.fillColor('#1A1A2E').fontSize(10).font('CJK').text('業主簽收確認', 40, doc.y + 1);
    doc.y += 20;

    doc.save();
    doc.roundedRect(40, doc.y, 515, 56, 6).fill('#F0FFF4');
    doc.rect(40, doc.y, 4, 56).fill('#27AE60');
    const sigY = doc.y + 8;
    doc.fillColor('#27AE60').fontSize(9).font('CJK')
       .text('✓ 業主已簽名確認完工', 52, sigY);
    doc.fillColor('#95A5A6').fontSize(8).font('CJK')
       .text('簽收人', 52, sigY + 18)
       .text('簽收時間', 200, sigY + 18)
       .text('完工備注', 380, sigY + 18);
    doc.fillColor('#2C3E50').font('CJK')
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
    doc.fillColor('#FF6B00').fontSize(8).font('CJK').text('皇祥工程設計', 40, footerY + 12);
    doc.fillColor('#95A5A6').fontSize(7.5).font('CJK')
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
    // ── 欄位長度保護 ──────────────────────────────────────────────
    const itemName = String(item.item_name || '').trim().slice(0, 200);
    const itemDesc = String(item.description || '').trim().slice(0, 500);
    const itemUnit = String(item.unit || '').trim().slice(0, 20);
    await query(`
      INSERT INTO quotation_items (quotation_id, item_name, description, quantity, unit, unit_price, subtotal, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [quotation.id, itemName, itemDesc, item.quantity, itemUnit, item.unit_price, st, idx]);
  }

  res.status(201).json({ ...quotation, items });
}));

// PUT /api/finance/quotations/:id/status
router.put('/quotations/:id/status', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const result = await query(`UPDATE quotations SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]);
  // 同步更新關聯請款單的報價狀態
  await query(`UPDATE invoices SET quotation_status=$1 WHERE quotation_id=$2`, [status, req.params.id]);
  res.json(result.rows[0]);
}));

// PUT /api/finance/quotations/:id
router.put('/quotations/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { valid_until, notes, items } = req.body;
  const result = await query(
    `UPDATE quotations SET valid_until=$1, notes=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
    [valid_until||null, notes||null, req.params.id]
  );
  if (items) {
    await query(`DELETE FROM quotation_items WHERE quotation_id=$1`, [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const st = (parseFloat(item.unit_price)*parseFloat(item.quantity)).toFixed(2);
      const itemName = String(item.item_name || '').trim().slice(0, 200);
      const itemDesc = String(item.description || '').trim().slice(0, 500);
      const itemUnit = String(item.unit || '').trim().slice(0, 20);
      await query(
        `INSERT INTO quotation_items (quotation_id,item_name,description,quantity,unit,unit_price,subtotal,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.params.id, itemName, itemDesc, item.quantity, itemUnit, item.unit_price, st, i]
      );
    }
    const items_r = await query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY sort_order`, [req.params.id]);
    const sub = items_r.rows.reduce((s,i)=>s+parseFloat(i.subtotal),0);
    const taxRate = parseFloat(result.rows[0].tax_rate)||5;
    const tax = sub*(taxRate/100);
    await query(`UPDATE quotations SET subtotal=$1,tax_amount=$2,total=$3 WHERE id=$4`, [sub.toFixed(2),(tax).toFixed(2),(sub+tax).toFixed(2),req.params.id]);
  }
  res.json(result.rows[0]);
}));

// DELETE /api/finance/quotations/:id
router.delete('/quotations/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM quotation_items WHERE quotation_id=$1`, [req.params.id]);
  await query(`DELETE FROM quotations WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
}));

// GET /api/finance/quotations/:id/pdf
router.get('/quotations/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const bw = req.query.bw === '1';
  const company = req.query.company || '皇祥工程設計';
  const qr = await query(`
    SELECT qt.*, c.case_number, c.owner_name, c.owner_company, c.owner_phone,
      c.location_address, c.title
    FROM quotations qt LEFT JOIN cases c ON qt.case_id=c.id WHERE qt.id=$1
  `, [req.params.id]);
  if (!qr.rows.length) return res.status(404).json({ error: '報價單不存在' });
  const q = qr.rows[0];
  const items = await query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY sort_order`, [req.params.id]);

  await pdf.ensureChineseFont();
  const fontPath = await pdf.ensureChineseFont();
  const doc = pdf.newDoc(fontPath);
  const chunks = [];
  doc.on('data', c => chunks.push(c));

  pdf.drawPage(doc, {
    titleZh: '報  價  單', titleEn: 'QUOTATION',
    docNumber: q.quote_number, dateStr: pdf.fmt(q.created_at),
    extraRight: q.valid_until ? `VALID  ${pdf.fmt(q.valid_until)}` : null,
    company,
  });

  pdf.sectionLabel(doc, 'CLIENT INFORMATION');
  pdf.clientBlock(doc, [
    { label:'業主 / 公司', value: q.owner_company||q.owner_name, label2:'案件編號', value2: q.case_number||'—' },
    { label:'聯  絡  人',  value: q.owner_name,                  label2:'電      話', value2: q.owner_phone||'—' },
    { label:'施工地址',    value: q.location_address||'—',       label2:'有效期限', value2: pdf.fmt(q.valid_until) },
  ]);

  doc.y += 4;
  pdf.sectionLabel(doc, 'QUOTATION DETAILS');

  // 表頭
  const cw=[142,124,42,39,74,62];
  const ths=['項  目  名  稱','說  明','數量','單位','單  價','小  計'];
  let ty=doc.y;
  cw.forEach((w,i)=>{
    doc.rect(pdf.LM+cw.slice(0,i).reduce((a,b)=>a+b,0),ty,w,18).fill(pdf.C.dark);
    doc.font('CJK').fontSize(8.5).fillColor(pdf.C.sub)
       .text(ths[i],pdf.LM+cw.slice(0,i).reduce((a,b)=>a+b,0)+5,ty+5,{width:w-8,lineBreak:false,align:i>=2?'center':'left'});
  });
  doc.rect(pdf.LM,ty,pdf.CW,18).stroke(pdf.C.border);
  doc.y=ty+18;

  items.rows.forEach((item,idx)=>{
    const row=[item.item_name,item.description,item.quantity,item.unit,
               pdf.money(item.unit_price),pdf.money(parseFloat(item.unit_price)*parseFloat(item.quantity))];
    // 動態計算列高（根據最長欄位）
    doc.font('CJK').fontSize(10);
    const h0 = doc.heightOfString(row[0]||'', {width:cw[0]-8});
    doc.font('CJK').fontSize(9);
    const h1 = doc.heightOfString(row[1]||'', {width:cw[1]-8});
    const rh = Math.max(20, h0+10, h1+10);
    let ry=doc.y;
    doc.rect(pdf.LM,ry,pdf.CW,rh).fill(idx%2===0?pdf.C.row:pdf.C.white);
    cw.forEach((w,i)=>{
      const x=pdf.LM+cw.slice(0,i).reduce((a,b)=>a+b,0);
      doc.font('CJK').fontSize(i===0?10:9)
         .fillColor(pdf.C.dark)
         .text(row[i]||'',x+5,ry+5,{width:w-8,lineBreak:i<2,align:i>=2?'center':'left'});
    });
    doc.rect(pdf.LM,ry+rh-0.3,pdf.CW,0.3).fill(pdf.C.border);
    doc.y=ry+rh;
  });
  doc.rect(pdf.LM,ty,pdf.CW,doc.y-ty).stroke(pdf.C.border);
  doc.y+=5;

  // 合計區
  const taxRate=parseFloat(q.tax_rate||5);
  const sub=parseFloat(q.subtotal||0), tax=parseFloat(q.tax_amount||0), tot=parseFloat(q.total||0);
  const RX = pdf.W - pdf.RM; // 右邊界 x

  doc.y += 4;
  // 小計列
  const row1Y = doc.y;
  doc.rect(pdf.LM, row1Y, pdf.CW, 20).fill(pdf.C.row);
  doc.font('CJK').fontSize(8.5).fillColor(pdf.C.sub)
     .text('小計 SUBTOTAL', pdf.LM+8, row1Y+6, {lineBreak:false});
  doc.font('CJK').fontSize(9.5).fillColor(pdf.C.mid)
     .text(pdf.money(sub), pdf.LM+8, row1Y+5, {width:pdf.CW-16, align:'right', lineBreak:false});
  doc.rect(pdf.LM, row1Y+19.6, pdf.CW, 0.4).fill(pdf.C.border);

  // 稅金列
  const row2Y = row1Y + 20;
  doc.rect(pdf.LM, row2Y, pdf.CW, 20).fill(pdf.C.white);
  doc.font('CJK').fontSize(8.5).fillColor(pdf.C.sub)
     .text(`稅金 TAX (${taxRate}%)`, pdf.LM+8, row2Y+6, {lineBreak:false});
  doc.font('CJK').fontSize(9.5).fillColor(pdf.C.mid)
     .text(pdf.money(tax), pdf.LM+8, row2Y+5, {width:pdf.CW-16, align:'right', lineBreak:false});
  doc.rect(pdf.LM, row2Y+19.6, pdf.CW, 0.4).fill(pdf.C.border);

  // 總計框
  const totY = row2Y + 20 + 3;
  doc.rect(pdf.LM, totY, pdf.CW, 30).fillAndStroke(pdf.C.label, pdf.C.acc);
  doc.rect(pdf.LM, totY, pdf.CW-1, 2).fill(pdf.C.acc);
  doc.font('CJK').fontSize(11).fillColor(pdf.C.dark)
     .text('報價總金額 TOTAL', pdf.LM+12, totY+9, {lineBreak:false});
  doc.font('CJK').fontSize(16).fillColor(pdf.C.acc)
     .text(pdf.money(tot), pdf.LM+8, totY+7, {width:pdf.CW-16, align:'right', lineBreak:false});
  doc.y = totY + 36;

  if (q.notes) { pdf.notesBlock(doc, q.notes); }

  // 客戶簽名框
  doc.y+=3;
  pdf.sigBox(doc, {
    label: '客 戶 確 認 簽 名',
    confirmText: '本人／本公司確認已閱讀上述報價內容，同意上述報價金額及條件。',
    dateStr: '', width:255, height:55,
  });

  doc.end();
  await new Promise(r => doc.on('end', r));
  const buf = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${q.quote_number}.pdf"`);
  res.end(buf);
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

// PUT /api/finance/invoices/:id
router.put('/invoices/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { amount, tax_amount, notes, due_date, quotation_id } = req.body;
  const total = (parseFloat(amount||0)+parseFloat(tax_amount||0)).toFixed(2);
  const result = await query(
    `UPDATE invoices SET amount=$1,tax_amount=$2,total_amount=$3,notes=$4,due_date=$5,quotation_id=$6 WHERE id=$7 RETURNING *`,
    [amount, tax_amount||0, total, notes||null, due_date||null, quotation_id||null, req.params.id]
  );
  res.json(result.rows[0]);
}));

// DELETE /api/finance/invoices/:id
router.delete('/invoices/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM invoices WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
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
  const company = req.query.company || '皇祥工程設計';
  const ir = await query(`
    SELECT inv.*, c.case_number, c.owner_name, c.owner_company, c.owner_phone,
      c.location_address, c.signed_by, c.signed_at, c.completion_notes,
      c.checkin_time, c.assigned_at, c.created_at as case_created_at,
      u.name as engineer_name
    FROM invoices inv
    LEFT JOIN cases c ON inv.case_id=c.id
    LEFT JOIN users u ON c.assigned_engineer_id=u.id
    WHERE inv.id=$1
  `, [req.params.id]);
  if (!ir.rows.length) return res.status(404).json({ error: '請款單不存在' });
  const inv = ir.rows[0];

  await pdf.ensureChineseFont();
  const fontPath = await pdf.ensureChineseFont();
  const doc = pdf.newDoc(fontPath);
  const chunks = [];
  doc.on('data', c => chunks.push(c));

  pdf.drawPage(doc, {
    titleZh:'請  款  單', titleEn:'INVOICE',
    docNumber: inv.invoice_number, dateStr: pdf.fmt(inv.created_at),
    extraRight: inv.due_date ? `DUE  ${pdf.fmt(inv.due_date)}` : null,
    company,
  });

  pdf.sectionLabel(doc, 'CLIENT INFORMATION');
  pdf.clientBlock(doc, [
    {label:'業主 / 公司',value:inv.owner_company||inv.owner_name,label2:'案件編號',value2:inv.case_number||'—'},
    {label:'聯  絡  人', value:inv.owner_name,                   label2:'電      話', value2:inv.owner_phone||'—'},
    {label:'施工地址',   value:inv.location_address||'—',        label2:'負責工程師',value2:inv.engineer_name||'—'},
  ]);

  doc.y+=5;
  pdf.sectionLabel(doc, 'BILLING SUMMARY');

  // 明細
  const brows=[['項目','金額'],['工程費用',pdf.money(inv.amount)],[`稅金 (${inv.tax_rate||5}%)`,pdf.money(inv.tax_amount)]];
  let btY=doc.y;
  brows.forEach((row,i)=>{
    const rh=i===0?18:20; const bg=i===0?pdf.C.dark:(i%2===0?pdf.C.row:pdf.C.white);
    doc.rect(pdf.LM,btY,pdf.CW,rh).fill(bg);
    doc.font('CJK').fontSize(i===0?8.5:10)
       .fillColor(i===0?pdf.C.sub:pdf.C.dark)
       .text(row[0],pdf.LM+8,btY+(i===0?5:5),{lineBreak:false});
    doc.font('CJK').fontSize(i===0?8.5:10)
       .fillColor(i===0?pdf.C.sub:pdf.C.dark)
       .text(row[1],0,btY+(i===0?5:5),{width:pdf.W-pdf.RM-10,align:'right',lineBreak:false});
    if(i>0) doc.rect(pdf.LM,btY+rh-0.3,pdf.CW,0.3).fill(pdf.C.border);
    btY+=rh;
  });
  doc.rect(pdf.LM,doc.y,pdf.CW,btY-doc.y).stroke(pdf.C.border);
  doc.y=btY+5;

  // 總金額框
  const tY=doc.y;
  doc.rect(pdf.LM,tY,pdf.CW,30).fillAndStroke(pdf.C.label,pdf.C.acc);
  doc.rect(pdf.LM,tY,5,30).fill(pdf.C.acc);
  doc.font('CJK').fontSize(12).fillColor(pdf.C.dark)
     .text('請  款  總  金  額',pdf.LM+14,tY+9,{lineBreak:false});
  doc.font('CJK').fontSize(18).fillColor(pdf.C.acc)
     .text(pdf.money(inv.total_amount),0,tY+6,{width:pdf.W-pdf.RM-10,align:'right',lineBreak:false});
  doc.y=tY+38;

  pdf.sectionLabel(doc,'TIME RECORDS');
  pdf.timeRecord(doc,{
    created_at: inv.case_created_at, assigned_at: inv.assigned_at,
    checkin_time: inv.checkin_time, signed_at: inv.signed_at,
  });

  pdf.sectionLabel(doc,'CLIENT SIGN-OFF');
  pdf.signoff(doc,{signed_by:inv.signed_by, completion_notes:inv.completion_notes});

  doc.y+=3;
  pdf.sigBox(doc,{label:'業 主 簽 名 欄',dateStr:pdf.fmt(inv.signed_at),width:255,height:56});

  if(inv.notes) { pdf.notesBlock(doc, '付款方式：銀行轉帳。請於付款期限前完成匯款，如有疑問請聯繫客服。'); }
  else { pdf.notesBlock(doc, '付款方式：銀行轉帳。請於付款期限前完成匯款，如有疑問請聯繫客服。'); }

  doc.end();
  await new Promise(r => doc.on('end', r));
  const buf = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.invoice_number}.pdf"`);
  res.end(buf);
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

// PUT /api/finance/closures/:id
router.put('/closures/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const cr = await query('SELECT * FROM closure_reports WHERE id=$1', [req.params.id]);
  if (cr.rows[0]?.is_cancelled) return res.status(403).json({ error: '結案單已取消，無法修改' });
  const { notes, summary } = req.body;
  const result = await query(`UPDATE closure_reports SET notes=$1,summary=$2 WHERE id=$3 RETURNING *`, [notes, summary, req.params.id]);
  res.json(result.rows[0]);
}));

// PUT /api/finance/closures/:id/cancel
router.put('/closures/:id/cancel', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { cancel_reason } = req.body;
  if (!cancel_reason?.trim()) return res.status(400).json({ error: '取消原因為必填' });
  const userRes = await query('SELECT id, name FROM users WHERE id=$1', [req.user.id]);
  const userName = userRes.rows[0]?.name || '—';
  const result = await query(`
    UPDATE closure_reports
    SET is_cancelled=true, cancel_reason=$1, cancelled_at=NOW(), cancelled_by_name=$2
    WHERE id=$3 RETURNING *
  `, [cancel_reason, userName, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: '結案單不存在' });
  // 同步更新案件狀態回「已完成」
  await query(`UPDATE cases SET status='completed' WHERE id=$1`, [result.rows[0].case_id]);
  res.json(result.rows[0]);
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

// GET /api/finance/closures/:id/pdf
router.get('/closures/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const company = req.query.company || '皇祥工程設計';
  const crr = await query(`
    SELECT cr.*, c.case_number, c.title, c.owner_name, c.owner_company, c.owner_phone,
      c.location_address, c.signed_by, c.signed_at, c.completion_notes,
      c.checkin_time, c.assigned_at, c.created_at as case_created_at,
      u.name as engineer_name
    FROM closure_reports cr
    LEFT JOIN cases c ON cr.case_id=c.id
    LEFT JOIN users u ON c.assigned_engineer_id=u.id
    WHERE cr.id=$1
  `, [req.params.id]);
  if (!crr.rows.length) return res.status(404).json({ error: '結案單不存在' });
  const cr = crr.rows[0];

  const notesRes = await query(`
    SELECT cn.*, u.name as author_name FROM case_notes cn
    LEFT JOIN users u ON cn.author_id=u.id
    WHERE cn.case_id=$1 ORDER BY cn.created_at
  `, [cr.case_id]);

  await pdf.ensureChineseFont();
  const fontPath = await pdf.ensureChineseFont();
  const doc = pdf.newDoc(fontPath);
  const chunks = [];
  doc.on('data', c => chunks.push(c));

  pdf.drawPage(doc, {
    titleZh:'結  案  報  告', titleEn:'CLOSURE REPORT',
    docNumber: cr.closure_number, dateStr: pdf.fmt(cr.created_at),
    extraRight: null, company,
  });

  pdf.sectionLabel(doc,'CLIENT INFORMATION');
  pdf.clientBlock(doc,[
    {label:'業主 / 公司',value:cr.owner_company||cr.owner_name,label2:'案件編號',value2:cr.case_number||'—'},
    {label:'聯  絡  人', value:cr.owner_name,                  label2:'電      話',value2:cr.owner_phone||'—'},
    {label:'施工地址',   value:cr.location_address||'—',       label2:'負責工程師',value2:cr.engineer_name||'—'},
  ]);

  doc.y+=5;
  pdf.sectionLabel(doc,'TIME RECORDS');
  pdf.timeRecord(doc,{
    created_at:cr.case_created_at, assigned_at:cr.assigned_at,
    checkin_time:cr.checkin_time, signed_at:cr.signed_at,
  });

  if (notesRes.rows.length) {
    doc.y+=3;
    pdf.sectionLabel(doc,'FIELD WORK RECORDS');
    notesRes.rows.forEach((note,i)=>{
      if (doc.y > 700) { doc.addPage(); doc.y=30; }
      // 動態計算列高
      doc.font('CJK').fontSize(10);
      const contentH = doc.heightOfString(note.content||'', {width:pdf.CW-28});
      const rh = Math.max(48, contentH + 30);
      const y=doc.y;
      doc.rect(pdf.LM,y,10,rh).fill(pdf.C.acc);
      doc.rect(pdf.LM+10,y,pdf.CW-10,rh).fill(i%2===0?pdf.C.row:pdf.C.white);
      doc.font('CJK').fontSize(10).fillColor(pdf.C.white)
         .text(String(i+1),pdf.LM,y+17,{width:10,align:'center',lineBreak:false});
      doc.font('CJK').fontSize(8).fillColor(pdf.C.sub)
         .text(`${pdf.fmt(note.created_at)}  ·  ${note.author_name||'—'}`,pdf.LM+18,y+6,{lineBreak:false});
      doc.font('CJK').fontSize(10).fillColor(pdf.C.dark)
         .text(note.content||'',pdf.LM+18,y+20,{width:pdf.CW-28,lineBreak:true});
      doc.rect(pdf.LM,y+rh-0.3,pdf.CW,0.3).fill(pdf.C.border);
      doc.y=y+rh;
    });
    doc.y+=5;
  }

  pdf.sectionLabel(doc,'CLIENT SIGN-OFF');
  pdf.signoff(doc,{signed_by:cr.signed_by||'—',completion_notes:cr.completion_notes||cr.notes||'—'});

  doc.y+=3;
  pdf.sigBox(doc,{label:'業 主 簽 名 欄',dateStr:pdf.fmt(cr.signed_at),width:255,height:60});

  doc.end();
  await new Promise(r => doc.on('end', r));
  const buf = Buffer.concat(chunks);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="${cr.closure_number}.pdf"`);
  res.end(buf);
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


// PUT /api/finance/receipts/:id
router.put('/receipts/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  const { amount, payment_method, reference_number, bank_account, notes, payment_date } = req.body;
  const result = await query(
    `UPDATE receipts SET amount=$1,payment_method=$2,reference_number=$3,bank_account=$4,notes=$5,payment_date=$6 WHERE id=$7 RETURNING *`,
    [amount, payment_method||'銀行轉帳', reference_number||null, bank_account||null, notes||null, payment_date||null, req.params.id]
  );
  res.json(result.rows[0]);
}));

// DELETE /api/finance/receipts/:id
router.delete('/receipts/:id', authenticate, authorize('admin','customer_service'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM receipts WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
}));

// GET /api/finance/receipts/:id/pdf
router.get('/receipts/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const rec = await query(`
    SELECT r.*, inv.invoice_number, inv.total_amount, inv.amount, inv.tax_amount,
      c.case_number, c.owner_name, c.owner_company, c.owner_phone, c.location_address
    FROM receipts r
    LEFT JOIN invoices inv ON r.invoice_id = inv.id
    LEFT JOIN cases c ON inv.case_id = c.id
    WHERE r.id = $1
  `, [req.params.id]);
  if (!rec.rows.length) return res.status(404).json({ error: '收款單不存在' });
  const receipt = rec.rows[0];

  const company = req.query.company || '皇祥工程設計';
  await pdf.ensureChineseFont();
  const fontPath = await pdf.ensureChineseFont();
  const doc = pdf.newDoc(fontPath);
  const chunks = [];
  doc.on('data', c => chunks.push(c));

  pdf.drawPage(doc, {
    titleZh: '收  款  單', titleEn: 'RECEIPT',
    docNumber: receipt.receipt_number,
    dateStr: pdf.fmt(receipt.payment_date || receipt.created_at),
    company,
  });

  pdf.sectionLabel(doc, 'CLIENT INFORMATION');
  pdf.clientBlock(doc, [
    { label:'業主 / 公司', value: receipt.owner_company||receipt.owner_name, label2:'案件編號',   value2: receipt.case_number||'—' },
    { label:'聯  絡  人',  value: receipt.owner_name,                        label2:'關聯請款單', value2: receipt.invoice_number||'—' },
    { label:'電      話',  value: receipt.owner_phone||'—',                  label2:'收款日期',   value2: pdf.fmt(receipt.payment_date) },
  ]);

  doc.y += 6;
  pdf.sectionLabel(doc, 'PAYMENT INFORMATION');
  pdf.clientBlock(doc, [
    { label:'付款方式', value: receipt.payment_method||'—', label2:'交易編號', value2: receipt.reference_number||'—' },
    { label:'入帳帳號', value: receipt.bank_account||'—',  label2:'',         value2: '' },
  ]);

  doc.y += 8;
  // 實收金額大框
  const amtY = doc.y;
  doc.rect(pdf.LM, amtY, pdf.CW, 36).fillAndStroke(pdf.C.label, pdf.C.acc);
  doc.rect(pdf.LM, amtY, 5, 36).fill(pdf.C.acc);
  doc.font('CJK').fontSize(12).fillColor(pdf.C.dark)
     .text('實  收  金  額', pdf.LM+14, amtY+11, {lineBreak:false});
  doc.font('CJK').fontSize(20).fillColor(pdf.C.acc)
     .text(pdf.money(receipt.amount), 0, amtY+8, {width:pdf.W-pdf.RM-10, align:'right', lineBreak:false});
  doc.y = amtY + 44;

  if (receipt.notes) {
    doc.y += 4;
    pdf.notesBlock(doc, receipt.notes);
  }

  doc.end();
  await new Promise(r => doc.on('end', r));
  const buf = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${receipt.receipt_number}.pdf"`);
  res.end(buf);
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
