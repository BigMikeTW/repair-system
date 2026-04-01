-- Migration: Add new columns for requirements
-- Run this on Railway PostgreSQL

-- Add is_cancelled to closure_reports
ALTER TABLE closure_reports ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE closure_reports ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE closure_reports ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE closure_reports ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE closure_reports ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;

-- Add quotation_status sync to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quotation_status TEXT;

-- Add bank_account to receipts
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- Add special_note to closure_reports (for future use)
ALTER TABLE closure_reports ADD COLUMN IF NOT EXISTS special_note TEXT;

-- Add updated_at to quotations
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMIT;
