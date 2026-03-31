'use strict';
const router = require('express').Router();
const { query } = require('../../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// POST /api/system/init-clear
router.post('/init-clear', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { modules } = req.body;
  if (!modules || !modules.length) return res.status(400).json({ error: '請選擇清除範圍' });

  const cleared = [];

  if (modules.includes('all')) {
    // 全部清除（保留 users、case_types、system settings）
    const tables = [
      'case_activities','case_notes','checkin_logs','photos',
      'quotation_items','quotations','invoices','receipts',
      'closure_reports','payment_records','notifications',
      'chat_messages','conversations','cases',
    ];
    for (const t of tables) {
      try { await query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`); cleared.push(t); }
      catch (e) { console.warn(`Skip ${t}:`, e.message); }
    }
  } else {
    if (modules.includes('cases')) {
      const tables = ['case_activities','case_notes','checkin_logs','photos','cases'];
      for (const t of tables) {
        try { await query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`); cleared.push(t); }
        catch (e) { console.warn(`Skip ${t}:`, e.message); }
      }
    }
    if (modules.includes('finance')) {
      const tables = ['quotation_items','quotations','invoices','receipts','closure_reports','payment_records'];
      for (const t of tables) {
        try { await query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`); cleared.push(t); }
        catch (e) { console.warn(`Skip ${t}:`, e.message); }
      }
    }
    if (modules.includes('users_data')) {
      const tables = ['notifications','chat_messages'];
      for (const t of tables) {
        try { await query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`); cleared.push(t); }
        catch (e) { console.warn(`Skip ${t}:`, e.message); }
      }
    }
  }

  console.log(`[INIT CLEAR] by admin - cleared: ${cleared.join(', ')}`);
  res.json({ success: true, cleared });
}));

module.exports = router;
