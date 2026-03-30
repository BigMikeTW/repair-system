/**
 * migrate_new_features.js
 * 新增功能所需的資料庫遷移：closure_reports 結案單、receipts 收款單
 * 執行：node backend/src/utils/migrate_new_features.js
 */
const { query } = require('../../config/database');

async function migrate() {
  console.log('🔄 開始執行新功能資料庫遷移...');

  // ── closure_reports (結案單) ──────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS closure_reports (
      id SERIAL PRIMARY KEY,
      closure_number VARCHAR(20) UNIQUE NOT NULL,
      case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id),
      summary TEXT,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'issued',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✅ closure_reports table ready');

  // ── receipts (收款單) ─────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      receipt_number VARCHAR(20) UNIQUE NOT NULL,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL,
      payment_date TIMESTAMPTZ DEFAULT NOW(),
      payment_method VARCHAR(50) DEFAULT '銀行轉帳',
      reference_number VARCHAR(100),
      bank_account VARCHAR(100),
      notes TEXT,
      recorded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✅ receipts table ready');

  // Add tax_rate column to invoices if not exists
  await query(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 5
  `);
  console.log('✅ invoices.tax_rate column ready');

  console.log('✅ 所有遷移完成！');
  process.exit(0);
}

migrate().catch(e => { console.error('❌ 遷移失敗:', e); process.exit(1); });
