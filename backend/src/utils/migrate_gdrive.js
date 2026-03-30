const { pool } = require('../../config/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── case_notes 案件記錄 ───────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        author_id UUID REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ case_notes table ready');

    // ── case_note_photos 案件記錄照片 ────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_note_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID REFERENCES case_notes(id) ON DELETE CASCADE,
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        uploader_id UUID REFERENCES users(id),
        file_url VARCHAR(500) NOT NULL,
        file_name VARCHAR(255),
        drive_id VARCHAR(255),
        drive_link VARCHAR(500),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ case_note_photos table ready');

    // ── 現有 case_photos 新增 drive 欄位 ────────────────────
    await client.query(`
      ALTER TABLE case_photos
        ADD COLUMN IF NOT EXISTS drive_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS drive_link VARCHAR(500),
        ADD COLUMN IF NOT EXISTS drive_synced_at TIMESTAMPTZ;
    `);
    console.log('✅ case_photos drive columns added');

    // ── cases 新增 drive 資料夾欄位 ─────────────────────────
    await client.query(`
      ALTER TABLE cases
        ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS drive_folder_link VARCHAR(500),
        ADD COLUMN IF NOT EXISTS drive_pdf_link VARCHAR(500),
        ADD COLUMN IF NOT EXISTS signature_drive_link VARCHAR(500);
    `);
    console.log('✅ cases drive columns added');

    // ── 索引 ────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_case_note_photos_note ON case_note_photos(note_id);`);

    await client.query('COMMIT');
    console.log('✅ All Google Drive migrations completed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate().catch(console.error);
