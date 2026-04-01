/**
 * pdfGenerator.js — 皇祥工程設計 EnterpriseOS 風格 PDF 產生器
 * 使用 PDFKit，中文字型從 Railway 字型路徑載入
 */
'use strict';

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

// ── 字型設定（Alpine Linux + font-wqy-zenhei）────────────────
const FONT_PATHS = [
  // Alpine apk font-wqy-zenhei 安裝路徑
  '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttf',
  // 備用路徑
  '/usr/share/fonts/wqy/wqy-zenhei.ttc',
  '/tmp/WQY.ttf',
];

let FONT_REGULAR = null;
for (const fp of FONT_PATHS) {
  if (fs.existsSync(fp)) {
    FONT_REGULAR = fp;
    console.log('[PDF] Using font:', fp);
    break;
  }
}
if (!FONT_REGULAR) {
  console.warn('[PDF] No CJK font found, PDF will use Helvetica (no Chinese)');
}

// 確保中文字型可用
async function ensureChineseFont() {
  if (FONT_REGULAR) return FONT_REGULAR;

  const tryPaths = [
    '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttf',
    '/usr/share/fonts/wqy/wqy-zenhei.ttc',
    '/tmp/WQY.ttf',
  ];

  for (const fp of tryPaths) {
    if (fs.existsSync(fp)) {
      FONT_REGULAR = fp;
      console.log('[PDF] Found font at runtime:', fp);
      return fp;
    }
  }

  console.warn('[PDF] No CJK font found');
  return null;
}

// ── 色盤 ─────────────────────────────────────────────────────
const C = {
  white:  '#FFFFFF',
  acc:    '#D4651A',
  acc_l:  '#FDF0E8',
  dark:   '#3D2B1F',
  mid:    '#6B4C3B',
  sub:    '#A08070',
  border: '#E8DDD5',
  hdr:    '#F7F2ED',
  row:    '#FAF7F5',
  label:  '#F0DDD0',
  note:   '#FDF0E8',
  conf:   '#F1F8F1',
  conf2:  '#DCF0DC',
  green:  '#2E7D32',
};

const W = 595.28, H = 841.89;
const LM = 31, RM = 28, CW = W - LM - RM;

function fmt(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  } catch { return String(v); }
}
function money(v) { return '$' + Number(v||0).toLocaleString(); }

// ── Doc 建立 ─────────────────────────────────────────────────
function newDoc(fontPath) {
  const opts = { margin:0, size:'A4', autoFirstPage:true };
  const doc = new PDFDocument(opts);
  if (fontPath) {
    doc.registerFont('CJK', fontPath);
    doc.registerFont('CJK-Bold', fontPath);
  }
  return doc;
}

function setFont(doc, bold, size, color) {
  if (FONT_REGULAR) {
    doc.font('CJK').fontSize(size).fillColor(color || C.dark);
  } else {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color || C.dark);
  }
}

// ── 頁面裝飾 ─────────────────────────────────────────────────
function drawPage(doc, { titleZh, titleEn, docNumber, dateStr, extraRight, company }) {
  // 白底
  doc.rect(0,0,W,H).fill(C.white);
  // 左條
  doc.rect(0,0,8.5,H).fill(C.acc);
  // 頁首底
  doc.rect(8.5,0,W-8.5,108).fill(C.hdr);
  doc.rect(8.5,107.5,W-8.5,2.5).fill(C.acc);

  // Logo
  doc.roundedRect(28,15,22,22,4).fill(C.acc);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
     .text('S',28,20,{width:22,align:'center',lineBreak:false});

  // 公司
  setFont(doc, true, 11, C.dark);
  doc.text(company||'皇祥工程設計', 57, 19, {lineBreak:false});
  setFont(doc, false, 8, C.sub);
  doc.text('工程報修管理系統', 57, 33, {lineBreak:false});

  // 文件標籤
  doc.font('Courier').fontSize(7).fillColor(C.sub)
     .text(`—— ${titleEn}`, LM, 58, {lineBreak:false});

  // 大標題
  setFont(doc, true, 22, C.dark);
  doc.text(titleZh, LM, 71, {lineBreak:false});

  // 右側資訊（Courier-Bold 10pt）
  const rx = W - RM;
  doc.font('Courier-Bold').fontSize(10).fillColor(C.mid)
     .text(`NO.   ${docNumber}`, 0, 20, {width:rx,align:'right',lineBreak:false});
  doc.fillColor(C.acc)
     .text(`DATE  ${dateStr}`, 0, 35, {width:rx,align:'right',lineBreak:false});
  if (extraRight) {
    doc.fillColor(C.mid)
       .text(extraRight, 0, 50, {width:rx,align:'right',lineBreak:false});
  }

  // 頁尾
  doc.rect(8.5,H-40,W-8.5,40).fill(C.hdr);
  doc.rect(8.5,H-40,W-8.5,0.8).fill(C.border);
  setFont(doc, false, 7.5, C.sub);
  doc.text('皇祥工程設計  工程報修管理系統  ·  VER 1.0  ·  2026', LM, H-27, {lineBreak:false});
  doc.font('Courier').fontSize(7.5).fillColor(C.sub)
     .text('PAGE  01', 0, H-27, {width:W-RM,align:'right',lineBreak:false});

  doc.y = 122;
}

// ── Section 標籤 ─────────────────────────────────────────────
function sectionLabel(doc, text) {
  doc.font('Courier').fontSize(7).fillColor(C.sub)
     .text(`—— ${text}`, LM, doc.y, {lineBreak:false});
  doc.y += 13;
}

// ── 客戶資訊 ─────────────────────────────────────────────────
function clientBlock(doc, rows) {
  // rows: [{label, value, label2, value2}]
  const c1=62, c2=187, c3=62, c4=190, rh=20;
  let y = doc.y;
  rows.forEach((row, i) => {
    // label1
    doc.rect(LM,y,c1,rh).fill(C.label);
    setFont(doc,false,8,C.sub);
    doc.text(row.label, LM+6,y+6,{width:c1-8,lineBreak:false});
    // value1
    doc.rect(LM+c1,y,c2,rh).fill(i%2===0?C.white:C.row);
    const big = row.label==='業主 / 公司';
    setFont(doc,big,big?10:9.5,C.dark);
    doc.text(row.value||'—',LM+c1+8,y+(big?5:6),{width:c2-12,lineBreak:false});
    // label2
    if (row.label2) {
      doc.rect(LM+c1+c2,y,c3,rh).fill(C.label);
      setFont(doc,false,8,C.sub);
      doc.text(row.label2,LM+c1+c2+6,y+6,{width:c3-8,lineBreak:false});
      // value2
      doc.rect(LM+c1+c2+c3,y,c4,rh).fill(i%2===0?C.white:C.row);
      const isCase = row.label2==='案件編號';
      setFont(doc,isCase,9.5,isCase?C.acc:C.dark);
      doc.text(row.value2||'—',LM+c1+c2+c3+8,y+6,{width:c4-12,lineBreak:false});
    }
    doc.rect(LM,y+rh-0.4,CW,0.4).fill(C.border);
    y += rh;
  });
  doc.rect(LM,doc.y,CW,y-doc.y).stroke(C.border);
  doc.y = y + 7;
}

// ── 時間記錄 ─────────────────────────────────────────────────
function timeRecord(doc, dates) {
  const colW = CW/4, h=38;
  const y = doc.y;
  const labels=['接  單  日  期','派  工  日  期','施  工  日  期','完  工  日  期'];
  const vals=[fmt(dates.created_at),fmt(dates.assigned_at),fmt(dates.checkin_time),fmt(dates.signed_at)];

  doc.rect(LM,y,CW,h).fill(C.note).stroke(C.border);
  labels.forEach((lbl,i) => {
    const x = LM + i*colW;
    if (i>0) doc.rect(x,y,0.5,h).fill(C.border);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.sub)
       .text(lbl, x, y+7, {width:colW,align:'center',lineBreak:false});
    const hasVal = vals[i]!=='—';
    setFont(doc,true,10,hasVal?C.acc:C.sub);
    doc.text(vals[i], x, y+20, {width:colW,align:'center',lineBreak:false});
  });
  doc.y = y + h + 7;
}

// ── 備注 ─────────────────────────────────────────────────────
function notesBlock(doc, text) {
  const y = doc.y;
  const h = Math.max(32, 18 + doc.heightOfString(text,{width:CW-26}));
  doc.rect(LM,y,4,h).fill(C.acc);
  doc.rect(LM+4,y,CW-4,h).fill(C.note);
  doc.rect(LM,y,CW,h).stroke(C.border);
  setFont(doc,false,9,C.mid);
  doc.text(text, LM+14, y+9, {width:CW-26});
  doc.y += 5;
}

// ── Sign-off ─────────────────────────────────────────────────
function signoff(doc, data) {
  const c1=62,c2=187,c3=62,c4=190,rh=22;
  let y = doc.y;
  const rows=[
    {l1:'簽  收  人',v1:data.signed_by||'—',l2:'確 認 事 項',v2:'✓ 工程完工確認  ✓ 品質驗收合格  ✓ 現場清潔完成',green:true},
    {l1:'完 工 備 注',v1:data.completion_notes||'—',l2:'',v2:''},
  ];
  rows.forEach((row,i)=>{
    doc.rect(LM,y,c1,rh).fill(C.conf2);
    setFont(doc,false,8.5,C.sub);
    doc.text(row.l1,LM+6,y+7,{width:c1-8,lineBreak:false});
    doc.rect(LM+c1,y,c2,rh).fill(C.conf);
    const big=row.l1==='簽  收  人';
    setFont(doc,big,big?11:9.5,C.dark);
    doc.text(row.v1,LM+c1+8,y+(big?4:6),{width:c2-12,lineBreak:false});
    if(row.l2){
      doc.rect(LM+c1+c2,y,c3,rh).fill(C.conf2);
      setFont(doc,false,8.5,C.sub);
      doc.text(row.l2,LM+c1+c2+6,y+7,{width:c3-8,lineBreak:false});
      doc.rect(LM+c1+c2+c3,y,c4,rh).fill(C.conf);
      setFont(doc,false,9,row.green?C.green:C.dark);
      doc.text(row.v2,LM+c1+c2+c3+8,y+6,{width:c4-12,lineBreak:false});
    }
    doc.rect(LM,y+rh-0.4,CW,0.4).fill(C.border);
    y+=rh;
  });
  doc.rect(LM,doc.y,CW,y-doc.y).stroke(C.border);
  doc.y = y + 4;
}

// ── 簽名框（Flowable-style，緊貼 doc.y）────────────────────────
function sigBox(doc, { label, confirmText, dateStr, width, height }) {
  const w = width || 255, h = height || 56;
  if (confirmText) {
    setFont(doc,false,8,C.sub);
    doc.text(confirmText, LM, doc.y, {width:w, lineBreak:false});
    doc.y += 11;
  }
  const y = doc.y;
  doc.roundedRect(LM,y,w,h,4).fillAndStroke(C.row, C.border);
  setFont(doc,false,7,C.sub);
  doc.text(label||'業 主 簽 名 欄', LM+6, y+6, {lineBreak:false});
  if (dateStr && dateStr !== '—') {
    doc.font('Courier-Bold').fontSize(8).fillColor(C.acc)
       .text(dateStr, LM, y+h-12, {width:w-6,align:'right',lineBreak:false});
  }
  doc.y = y + h + 5;
}

module.exports = {
  ensureChineseFont, newDoc, drawPage,
  sectionLabel, clientBlock, timeRecord,
  notesBlock, signoff, sigBox,
  fmt, money, C, W, H, LM, RM, CW,
};
