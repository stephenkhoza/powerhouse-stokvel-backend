const pool = require('./database');
const bcrypt = require('bcryptjs');

async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');

    // Create members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        id_number VARCHAR(13) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        role VARCHAR(20) DEFAULT 'member',
        join_date DATE,
        bank_name VARCHAR(50),
        account_holder VARCHAR(100),
        account_number VARCHAR(20),
        branch_code VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Members table created');

    // Create contributions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contributions (
        id SERIAL PRIMARY KEY,
        member_id VARCHAR(20) NOT NULL,
        month VARCHAR(20) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        payment_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Contributions table created');

    // Create announcements table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        announcement_date DATE NOT NULL,
        priority VARCHAR(20) DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Announcements table created');

    // Check if demo data exists
    const result = await pool.query('SELECT COUNT(*) FROM members');
    const count = parseInt(result.rows[0].count);

    if (count === 0) {
      console.log('🔄 Inserting demo data...');
      await insertDemoData();
      console.log('✅ Demo data inserted successfully');
    } else {
      console.log('ℹ️  Database already has data, skipping demo data insertion');
    }

    console.log('✅ Database initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

async function insertDemoData() {
  const hashedPassword1 = await bcrypt.hash('admin123', 10);
  const hashedPassword2 = await bcrypt.hash('member123', 10);

  // Insert demo members
  const members = [
    {
      id: 'PHSC2601001',
      name: 'Thabo Mokoena',
      id_number: '8501155123089',
      phone: '083 123 4567',
      email: 'thabo@example.com',
      password: hashedPassword1,
      status: 'Active',
      role: 'admin',
      join_date: '2026-01-01',
      bank_name: 'FNB',
      account_holder: 'Thabo Mokoena',
      account_number: '62851234890',
      branch_code: '250655'
    },
    {
      id: 'PHSC2601002',
      name: 'Zanele Ndlovu',
      id_number: '9203128567089',
      phone: '082 234 5678',
      email: 'zanele@example.com',
      password: hashedPassword2,
      status: 'Active',
      role: 'member',
      join_date: '2026-01-01',
      bank_name: 'Standard Bank',
      account_holder: 'Zanele Ndlovu',
      account_number: '410789234',
      branch_code: '051001'
    },
    {
      id: 'PHSC2601003',
      name: 'Sipho Dlamini',
      id_number: '8807122345089',
      phone: '071 345 6789',
      email: 'sipho@example.com',
      password: hashedPassword2,
      status: 'Active',
      role: 'member',
      join_date: '2026-01-01',
      bank_name: 'Capitec',
      account_holder: 'Sipho Dlamini',
      account_number: '1498765567',
      branch_code: '470010'
    }
  ];

  for (const member of members) {
    await pool.query(
      `INSERT INTO members (id, name, id_number, phone, email, password, status, role, join_date, bank_name, account_holder, account_number, branch_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        member.id, member.name, member.id_number, member.phone, member.email,
        member.password, member.status, member.role, member.join_date,
        member.bank_name, member.account_holder, member.account_number, member.branch_code
      ]
    );
  }

  // Insert demo contributions
  const contributions = [
    ['PHSC2601001', 'January 2026', 500, 'Paid', '2026-01-05'],
    ['PHSC2601002', 'January 2026', 500, 'Paid', '2026-01-06'],
    ['PHSC2601003', 'January 2026', 500, 'Pending', null],
    ['PHSC2601001', 'December 2025', 500, 'Paid', '2025-12-05'],
    ['PHSC2601002', 'December 2025', 500, 'Paid', '2025-12-04'],
    ['PHSC2601003', 'December 2025', 500, 'Paid', '2025-12-03']
  ];

  for (const contrib of contributions) {
    await pool.query(
      'INSERT INTO contributions (member_id, month, amount, status, payment_date) VALUES ($1, $2, $3, $4, $5)',
      contrib
    );
  }

  // Insert demo announcements
  const announcements = [
    ['Monthly Meeting - January 2026', 'Our next meeting is scheduled for Saturday, 18 January 2026 at 10:00 AM at the community hall.', '2026-01-08', 'high'],
    ['January Contributions Due', 'Please ensure your R500 contribution is paid by 15 January 2026.', '2026-01-08', 'normal']
  ];

  for (const announcement of announcements) {
    await pool.query(
      'INSERT INTO announcements (title, message, announcement_date, priority) VALUES ($1, $2, $3, $4)',
      announcement
    );
  }
}

module.exports = { initializeDatabase };