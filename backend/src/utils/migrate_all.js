const { pool } = require('../../config/database');

const migrateAll = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── case_types 資料表 ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 99,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const defaultTypes = [
      { name: '冷氣空調', description: '冷氣、空調系統維修保養', sort_order: 1 },
      { name: '水電維修', description: '給排水、電氣線路維修', sort_order: 2 },
      { name: '消防設備', description: '消防系統、灑水頭、滅火器', sort_order: 3 },
      { name: '電梯昇降', description: '電梯、升降機維修保養', sort_order: 4 },
      { name: '電氣配線', description: '電氣配電、線路安裝', sort_order: 5 },
      { name: '弱電系統', description: '網路、電話、監視系統', sort_order: 6 },
      { name: '門禁系統', description: '門禁、刷卡、對講機', sort_order: 7 },
      { name: '土木裝修', description: '牆面、地板、天花板修繕', sort_order: 8 },
      { name: '其他', description: '其他類型維修', sort_order: 99 },
    ];
    for (const t of defaultTypes) {
      await client.query(
        `INSERT INTO case_types (name, description, sort_order) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
        [t.name, t.description, t.sort_order]
      );
    }
    console.log('✅ case_types table ready');

    // ── users HR 欄位 ─────────────────────────────────────────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS id_number VARCHAR(20),
        ADD COLUMN IF NOT EXISTS id_card_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS birth_date DATE,
        ADD COLUMN IF NOT EXISTS address TEXT,
        ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100),
        ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20),
        ADD COLUMN IF NOT EXISTS hire_date DATE,
        ADD COLUMN IF NOT EXISTS department VARCHAR(100);
    `);
    console.log('✅ users HR columns added');

    // ── user_licenses 資料表 ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_licenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        license_name VARCHAR(200) NOT NULL,
        license_number VARCHAR(100),
        issued_by VARCHAR(200),
        issue_date DATE,
        expiry_date DATE,
        file_url VARCHAR(500),
        file_name VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ user_licenses table ready');

    // ── user_insurance 資料表 ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_insurance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        insurance_type VARCHAR(20) NOT NULL CHECK (insurance_type IN ('labor','health','both')),
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated')),
        enroll_date DATE,
        terminate_date DATE,
        insured_salary INTEGER,
        insurer_name VARCHAR(200),
        proof_url VARCHAR(500),
        proof_file_name VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ user_insurance table ready');

    // ── 索引 ──────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_licenses_user ON user_licenses(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_insurance_user ON user_insurance(user_id);`);

    await client.query('COMMIT');
    console.log('✅ All migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrateAll().catch(console.error);
