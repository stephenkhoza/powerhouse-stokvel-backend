const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('./database');
const { initializeDatabase } = require('./init-database');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';


const allowedOrigins = [
  'http://localhost:5173', // your local dev frontend
  'https://powerhouse-stokvel-frontend-1ly5.vercel.app' // replace with your live frontend URL 
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `CORS policy: This origin (${origin}) is not allowed.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true // allow cookies/auth headers
};

app.use(cors(corsOptions));


app.use(bodyParser.json());

// Initialize database on startup
initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// ==================== MIDDLEWARE ====================

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Admin middleware
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM members WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    delete user.password;
    res.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== MEMBER ROUTES ====================

// Get all members (admin only)
app.get('/api/members', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM members ORDER BY id');
    // Remove passwords from response
    result.rows.forEach(row => delete row.password);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single member
app.get('/api/members/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Members can only view their own data, admins can view all
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    delete result.rows[0].password;
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add new member (admin only)
app.post('/api/members', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, idNumber, phone, email, password, status, role, bankName, accountHolder, accountNumber, branchCode } = req.body;

    // Generate member ID
    const countResult = await pool.query('SELECT COUNT(*) FROM members');
    const memberCount = parseInt(countResult.rows[0].count) + 1;
    const memberId = `PHSC2601${String(memberCount).padStart(3, '0')}`;
    
    const hashedPassword = await bcrypt.hash(password || 'member123', 10);
    const joinDate = new Date().toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO members (id, name, id_number, phone, email, password, status, role, join_date, bank_name, account_holder, account_number, branch_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [memberId, name, idNumber, phone, email, hashedPassword, status || 'Active', role || 'member', joinDate, bankName, accountHolder, accountNumber, branchCode]
    );

    res.status(201).json({ id: memberId, message: 'Member created successfully' });
  } catch (error) {
    console.error('Error creating member:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create member' });
    }
  }
});

// Update member (admin only)
app.put('/api/members/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, idNumber, phone, email, status, bankName, accountHolder, accountNumber, branchCode } = req.body;

    await pool.query(
      `UPDATE members SET name = $1, id_number = $2, phone = $3, email = $4, status = $5, 
       bank_name = $6, account_holder = $7, account_number = $8, branch_code = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [name, idNumber, phone, email, status, bankName, accountHolder, accountNumber, branchCode, id]
    );

    res.json({ message: 'Member updated successfully' });
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// Delete member (admin only)
app.delete('/api/members/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM members WHERE id = $1', [id]);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// ==================== CONTRIBUTION ROUTES ====================

// Get all contributions (admin) or own contributions (member)
app.get('/api/contributions', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM contributions';
    let params = [];

    if (req.user.role !== 'admin') {
      query += ' WHERE member_id = $1';
      params.push(req.user.id);
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add contribution (admin only)
app.post('/api/contributions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { memberId, month, amount, status, date } = req.body;

    const result = await pool.query(
      'INSERT INTO contributions (member_id, month, amount, status, payment_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [memberId, month, amount, status || 'Pending', date]
    );

    res.status(201).json({ id: result.rows[0].id, message: 'Contribution created successfully' });
  } catch (error) {
    console.error('Error creating contribution:', error);
    res.status(500).json({ error: 'Failed to create contribution' });
  }
});

// Update contribution status (admin only)
app.put('/api/contributions/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const date = status === 'Paid' ? new Date().toISOString().split('T')[0] : null;

    await pool.query(
      'UPDATE contributions SET status = $1, payment_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [status, date, id]
    );

    res.json({ message: 'Contribution updated successfully' });
  } catch (error) {
    console.error('Error updating contribution:', error);
    res.status(500).json({ error: 'Failed to update contribution' });
  }
});

// ==================== ANNOUNCEMENT ROUTES ====================

// Get all announcements
app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY announcement_date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add announcement (admin only)
app.post('/api/announcements', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { title, message, priority } = req.body;
    const date = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      'INSERT INTO announcements (title, message, announcement_date, priority) VALUES ($1, $2, $3, $4) RETURNING id',
      [title, message, date, priority || 'normal']
    );

    res.status(201).json({ id: result.rows[0].id, message: 'Announcement created successfully' });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Delete announcement (admin only)
app.delete('/api/announcements/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// ==================== STATS ROUTES ====================

// Get member stats
app.get('/api/stats/:memberId', authenticateToken, async (req, res) => {
  try {
    const { memberId } = req.params;

    // Members can only view their own stats, admins can view all
    if (req.user.role !== 'admin' && req.user.id !== memberId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query('SELECT * FROM contributions WHERE member_id = $1', [memberId]);
    
    const paidContributions = result.rows.filter(c => c.status === 'Paid');
    const totalSaved = paidContributions.reduce((sum, c) => sum + c.amount, 0);
    const monthsContributed = paidContributions.length;

    res.json({
      totalSaved,
      monthsContributed,
      estimatedPayout: totalSaved
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: PostgreSQL`);
  console.log(`🔐 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
});