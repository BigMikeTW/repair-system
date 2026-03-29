require('dotenv').config({ path: '../.env' });
const { pool } = require('../../config/database');

const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin','engineer','customer_service','owner')),
        specialties TEXT[],
        avatar_url VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Cases table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_number VARCHAR(20) UNIQUE NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        case_type VARCHAR(50) NOT NULL,
        urgency VARCHAR(10) NOT NULL CHECK (urgency IN ('emergency','normal','low')),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
          status IN ('pending','accepted','dispatched','in_progress','signing','completed','closed','cancelled')
        ),
        location_address TEXT NOT NULL,
        location_lat DECIMAL(10,8),
        location_lng DECIMAL(11,8),
        owner_id UUID REFERENCES users(id),
        owner_name VARCHAR(100),
        owner_phone VARCHAR(20),
        owner_company VARCHAR(200),
        assigned_engineer_id UUID REFERENCES users(id),
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMPTZ,
        scheduled_start TIMESTAMPTZ,
        scheduled_end TIMESTAMPTZ,
        actual_start TIMESTAMPTZ,
        actual_end TIMESTAMPTZ,
        checkin_time TIMESTAMPTZ,
        checkout_time TIMESTAMPTZ,
        checkin_lat DECIMAL(10,8),
        checkin_lng DECIMAL(11,8),
        checkout_lat DECIMAL(10,8),
        checkout_lng DECIMAL(11,8),
        owner_signature TEXT,
        signed_at TIMESTAMPTZ,
        signed_by VARCHAR(100),
        completion_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Case photos
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        uploader_id UUID REFERENCES users(id),
        phase VARCHAR(10) NOT NULL CHECK (phase IN ('before','during','after')),
        file_url VARCHAR(500) NOT NULL,
        file_name VARCHAR(255),
        file_size INTEGER,
        caption TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Case timeline / activity log
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_activities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        actor_id UUID REFERENCES users(id),
        actor_name VARCHAR(100),
        action VARCHAR(50) NOT NULL,
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Chat messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id),
        sender_name VARCHAR(100),
        sender_role VARCHAR(20),
        message TEXT NOT NULL,
        message_type VARCHAR(10) DEFAULT 'text' CHECK (message_type IN ('text','image','file','system')),
        file_url VARCHAR(500),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Quotations
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_number VARCHAR(20) UNIQUE NOT NULL,
        case_id UUID REFERENCES cases(id),
        created_by UUID REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','rejected')),
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        tax_rate DECIMAL(5,2) DEFAULT 5,
        tax_amount DECIMAL(12,2) DEFAULT 0,
        total DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        valid_until DATE,
        pdf_url VARCHAR(500),
        sent_at TIMESTAMPTZ,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Quotation line items
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotation_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
        item_name VARCHAR(200) NOT NULL,
        description TEXT,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
        unit VARCHAR(20),
        unit_price DECIMAL(12,2) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        sort_order INTEGER DEFAULT 0
      );
    `);

    // Invoices / Settlement documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(20) UNIQUE NOT NULL,
        case_id UUID REFERENCES cases(id),
        quotation_id UUID REFERENCES quotations(id),
        created_by UUID REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','paid','overdue','cancelled')),
        amount DECIMAL(12,2) NOT NULL,
        tax_amount DECIMAL(12,2) DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL,
        due_date DATE,
        paid_at TIMESTAMPTZ,
        payment_method VARCHAR(50),
        payment_reference VARCHAR(100),
        pdf_url VARCHAR(500),
        notes TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Payment records
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID REFERENCES invoices(id),
        amount DECIMAL(12,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method VARCHAR(50),
        reference_number VARCHAR(100),
        notes TEXT,
        recorded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Engineer check-in logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS checkin_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        engineer_id UUID REFERENCES users(id),
        type VARCHAR(10) NOT NULL CHECK (type IN ('checkin','checkout')),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        address TEXT,
        photo_url VARCHAR(500),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(30) DEFAULT 'info',
        case_id UUID REFERENCES cases(id),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Backup logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS backup_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('auto','manual')),
        file_name VARCHAR(255),
        file_size BIGINT,
        status VARCHAR(10) NOT NULL CHECK (status IN ('success','failed')),
        error_message TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cases_engineer ON cases(assigned_engineer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cases_number ON cases(case_number);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_case ON chat_messages(case_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_case ON case_activities(case_id);`);

    // Auto-update updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ language 'plpgsql';
    `);

    for (const table of ['users','cases','quotations','invoices']) {
      await client.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
    }

    await client.query('COMMIT');
    console.log('✅ All tables created successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

createTables().catch(console.error);
