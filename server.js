const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
  secure: true
});

const pool = require('./database');
const { initializeDatabase } = require('./init-database');

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://powerhouse-stokvel-frontend.vercel.app',
  'https://powerhouse-stokvel-frontend-1ly5.vercel.app'
];

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
   path: '/socket.io', // must match frontend
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});


// Make io globally accessible
global.io = io;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.error(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS policy: ${origin} not allowed`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.set('trust proxy', 1);

// Initialize database
initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// ==================== SOCKET.IO HANDLERS ====================
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('join_chat', (userId) => {
    socket.userId = userId;
    connectedUsers.set(userId, socket.id);
    console.log(`👤 User ${userId} joined chat`);
    io.emit('users_online', connectedUsers.size);
  });

  socket.on('typing', ({ userId, name }) => {
    socket.broadcast.emit('user_typing', { userId, name });
  });

  socket.on('stop_typing', ({ userId }) => {
    socket.broadcast.emit('user_stop_typing', { userId });
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      io.emit('users_online', connectedUsers.size);
      console.log(`👋 User ${socket.userId} disconnected`);
    }
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// ==================== MIDDLEWARE ====================

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

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==================== AUTH ROUTES ====================

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
      { id: user.id, email: user.email, role: user.role, name: user.name, photo: user.photo },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    delete user.password;
    res.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== MEMBER ROUTES ====================

app.get('/api/members', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM members ORDER BY id');
    result.rows.forEach(row => delete row.password);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/members/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

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

app.post('/api/members', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { name, idNumber, phone, email, password, status, role, bankName, accountHolder, accountNumber, branchCode } = req.body;

    const gapResult = await client.query(`
      SELECT MIN(num) AS next_num
      FROM generate_series(1, 999) num
      WHERE num NOT IN (
        SELECT RIGHT(id, 3)::int
        FROM members
      )
    `);

    const nextNum = gapResult.rows[0].next_num;
    if (!nextNum) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'No available member numbers' });
    }
    const memberId = `PHSC2601${String(nextNum).padStart(3, '0')}`;

    const hashedPassword = await bcrypt.hash(password || 'member123', 10);
    const joinDate = new Date().toISOString().split('T')[0];

    await client.query(
      `INSERT INTO members 
       (id, name, id_number, phone, email, password, status, role, join_date,
        bank_name, account_holder, account_number, branch_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [memberId, name, idNumber, phone, email, hashedPassword, status || 'Active', role || 'member', joinDate,
       bankName, accountHolder, accountNumber, branchCode]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: memberId, message: 'Member created successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating member:', error);

    if (error.code === '23505') {
      if (error.constraint === 'members_email_key') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      if (error.constraint === 'members_pkey') {
        return res.status(409).json({ error: 'Member ID already exists' });
      }
    }

    res.status(500).json({ error: 'Failed to create member' });
  } finally {
    client.release();
  }
});

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

app.post('/api/contributions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { memberId, month, amount, status } = req.body;
    const paymentDate = status === 'Paid' ? new Date().toISOString() : null;

    const result = await pool.query(
      'INSERT INTO contributions (member_id, month, amount, status, payment_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [memberId, month, amount, status || 'Pending', paymentDate]
    );

    res.status(201).json({ id: result.rows[0].id, message: 'Contribution created successfully' });
  } catch (error) {
    console.error('Error creating contribution:', error);
    res.status(500).json({ error: 'Failed to create contribution' });
  }
});

app.put('/api/contributions/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const payment_date = status === 'Paid' ? new Date().toISOString() : null;

    const result = await pool.query(
      'UPDATE contributions SET status = $1, payment_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [status, payment_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Contribution not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating contribution:', error);
    res.status(500).json({ error: 'Failed to update contribution' });
  }
});

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
});

app.post('/api/contributions/:id/proof', authenticateToken, upload.single('proof'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file || !req.file.buffer) 
      return res.status(400).json({ error: 'No file uploaded' });

    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'auto';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'proofs',
          resource_type: resourceType,
          public_id: `contribution_${id}_${Date.now()}`,
          type: 'upload',
        },
        (error, uploaded) => {
          if (error) {
            console.error('Cloudinary error:', error);
            return reject(error);
          }
          resolve(uploaded);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    const proofData = {
      url: result.secure_url,
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    };

    const dbResult = await pool.query(
      `UPDATE contributions
       SET proof_of_payment = $1,
           status = 'Pending',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING proof_of_payment`,
      [proofData, id]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    res.json({ proof_of_payment: dbResult.rows[0].proof_of_payment, url: result.secure_url });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/api/profile/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'profile_photos',
          public_id: `user_${userId}`,
          overwrite: true,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    await pool.query(
      'UPDATE members SET photo = $1 WHERE id = $2',
      [uploadResult.secure_url, userId]
    );

    res.json({
      message: 'Profile photo updated',
      photo: uploadResult.secure_url,
    });

  } catch (err) {
    console.error('Profile upload failed:', err);
    res.status(500).json({ error: 'Failed to upload profile photo' });
  }
});

app.delete('/api/profile/photo', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query('SELECT photo FROM members WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.photo) {
      try {
        const urlParts = user.photo.split('/');
        const filename = urlParts[urlParts.length - 1].split('.')[0];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filename}`;

        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        console.log(`Deleted photo from Cloudinary: ${publicId}`);
      } catch (err) {
        console.error('Error deleting photo from Cloudinary:', err);
      }
    }

    await pool.query('UPDATE members SET photo = NULL WHERE id = $1', [userId]);

    res.json({ 
      message: 'Photo deleted successfully',
      photo: null 
    });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// ==================== ANNOUNCEMENT ROUTES ====================

app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY announcement_date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

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

app.get('/api/stats/:memberId', authenticateToken, async (req, res) => {
  try {
    const { memberId } = req.params;

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

app.post('/api/members/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const memberId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long",
    });
  }

  try {
    const result = await pool.query(
      "SELECT password FROM members WHERE id = $1",
      [memberId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    const storedHash = result.rows[0].password;

    const valid = await bcrypt.compare(currentPassword, storedHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE members SET password = $1 WHERE id = $2",
      [newHash, memberId]
    );

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ==================== CHAT ROUTES WITH WEBSOCKET ====================

app.get('/api/chat/messages', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(`
      SELECT 
        m.id,
        m.message,
        m.created_at,
        m.sender_id,
        mem.name AS sender_name,
        mem.photo AS sender_photo
      FROM messages m
      JOIN members mem ON mem.id = m.sender_id
      ORDER BY m.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(result.rows.reverse());
  } catch (error) {
    console.error('Fetch chat messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/chat/messages', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const result = await pool.query(
      `INSERT INTO messages (sender_id, message)
       VALUES ($1, $2)
       RETURNING id, sender_id, message, created_at`,
      [req.user.id, message]
    );

    const newMessage = {
      ...result.rows[0],
      sender_name: req.user.name,
      sender_photo: req.user.photo || null
    };

    // Use global.io to emit
    global.io.emit('new_message', newMessage);

    res.json(newMessage);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.delete('/api/chat/messages/:id', authenticateToken, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);

    const check = await pool.query(
      'SELECT sender_id FROM messages WHERE id = $1',
      [messageId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const senderId = check.rows[0].sender_id;

    if (senderId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);

    // Use global.io to emit
    global.io.emit('message_deleted', { id: messageId });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// ✅ IMPORTANT: Use server.listen, not app.listen
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: PostgreSQL`);
  console.log(`🔐 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
  console.log(`🔌 WebSocket enabled`);
});