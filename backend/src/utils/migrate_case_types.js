// 執行方式：在 Railway Start Command 暫時改成此檔案，或透過 railway run 執行
// 此腳本會新增 case_types 資料表並插入預設類型

const { pool } = require('../../config/database');

const addCaseTypesTable = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

    // 插入預設類型
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

    for (const type of defaultTypes) {
      await client.query(
        `INSERT INTO case_types (name, description, sort_order) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
        [type.name, type.description, type.sort_order]
      );
    }

    await client.query('COMMIT');
    console.log('✅ case_types table created and seeded successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

addCaseTypesTable().catch(console.error);
