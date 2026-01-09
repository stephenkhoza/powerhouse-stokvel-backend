const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: true } // ✅ production: validate certs
    : { rejectUnauthorized: false } // ⚠️ dev: ignore self-signed certs
});

pool.connect()
  .then(client => {
    console.log(`✅ Connected to PostgreSQL (${isProduction ? 'production' : 'development'})`);
    client.release();
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.stack);
  });

module.exports = pool;
