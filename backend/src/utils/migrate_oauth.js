/**
 * migrate_oauth.js
 * 新增 LINE / Google OAuth 所需欄位
 */
const { query } = require('../../config/database');

async function migrateOAuth() {
  console.log('🔄 開始 OAuth migration...');
  try {
    await query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS line_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS google_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20)
    `);
    console.log('✅ users 表 OAuth 欄位新增完成');
  } catch (e) {
    console.error('Migration error:', e.message);
  }
  process.exit(0);
}

migrateOAuth();
