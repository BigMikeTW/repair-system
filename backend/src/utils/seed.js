require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create admin user
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123456', 12);
    await client.query(`
      INSERT INTO users (name, email, password, role, phone) VALUES
      ('系統管理員', $1, $2, 'admin', '02-1234-5678')
      ON CONFLICT (email) DO NOTHING;
    `, [process.env.ADMIN_EMAIL || 'admin@repairsystem.com', adminHash]);

    // Engineers
    const engHash = await bcrypt.hash('Engineer@123', 12);
    await client.query(`
      INSERT INTO users (name, email, password, role, phone, specialties) VALUES
      ('張志豪', 'chang@repairsystem.com', $1, 'engineer', '0912-111-222', ARRAY['冷氣空調','機電設備']),
      ('李明峰', 'lee@repairsystem.com', $1, 'engineer', '0912-333-444', ARRAY['消防設備','水電維修']),
      ('王大華', 'wang.e@repairsystem.com', $1, 'engineer', '0912-555-666', ARRAY['電氣配線','弱電系統']),
      ('林雅婷', 'lin@repairsystem.com', $1, 'engineer', '0912-777-888', ARRAY['電梯昇降','機械設備'])
      ON CONFLICT (email) DO NOTHING;
    `, [engHash]);

    // Customer service
    const csHash = await bcrypt.hash('Service@123', 12);
    await client.query(`
      INSERT INTO users (name, email, password, role, phone) VALUES
      ('客服小芳', 'cs@repairsystem.com', $1, 'customer_service', '02-8765-4321')
      ON CONFLICT (email) DO NOTHING;
    `, [csHash]);

    // Owner
    const ownerHash = await bcrypt.hash('Owner@123', 12);
    await client.query(`
      INSERT INTO users (name, email, password, role, phone) VALUES
      ('王小明', 'owner@tsmc.com', $1, 'owner', '0912-999-000')
      ON CONFLICT (email) DO NOTHING;
    `, [ownerHash]);

    await client.query('COMMIT');
    console.log('✅ Seed data created successfully');
    console.log('📧 Admin login:', process.env.ADMIN_EMAIL || 'admin@repairsystem.com');
    console.log('🔑 Admin password:', process.env.ADMIN_PASSWORD || 'Admin@123456');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

seed().catch(console.error);
