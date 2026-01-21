const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const streamifier = require('streamifier'); // ✅ add here
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

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';




const allowedOrigins = [
  'http://localhost:5173', // your local dev frontend
  'https://powerhouse-stokvel-frontend.vercel.app', // replace with your live frontend URL 
  'https://powerhouse-stokvel-frontend-1ly5.vercel.app'
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
// app.post('/api/members', authenticateToken, isAdmin, async (req, res) => {
//   try {
//     const { name, idNumber, phone, email, password, status, role, bankName, accountHolder, accountNumber, branchCode } = req.body;

//     // Generate member ID
//     const countResult = await pool.query('SELECT COUNT(*) FROM members');
//     const memberCount = parseInt(countResult.rows[0].count) + 1;
//     const memberId = `PHSC2601${String(memberCount).padStart(3, '0')}`;
    
//     const hashedPassword = await bcrypt.hash(password || 'member123', 10);
//     const joinDate = new Date().toISOString().split('T')[0];

//     await pool.query(
//       `INSERT INTO members (id, name, id_number, phone, email, password, status, role, join_date, bank_name, account_holder, account_number, branch_code)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
//       [memberId, name, idNumber, phone, email, hashedPassword, status || 'Active', role || 'member', joinDate, bankName, accountHolder, accountNumber, branchCode]
//     );

//     res.status(201).json({ id: memberId, message: 'Member created successfully' });
//   } catch (error) {
//     console.error('Error creating member:', error);
//     if (error.code === '23505') { // Unique violation
//       res.status(400).json({ error: 'Email already exists' });
//     } else {
//       res.status(500).json({ error: 'Failed to create member' });
//     }
//   }
// });


// Add new member (admin only)
app.post('/api/members', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect(); // use a client for transaction
  try {
    await client.query('BEGIN');

    const { name, idNumber, phone, email, password, status, role, bankName, accountHolder, accountNumber, branchCode } = req.body;

    // 1️⃣ Generate PHSC-style ID with gap-filling
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

    // 2️⃣ Hash the password
    const hashedPassword = await bcrypt.hash(password || 'member123', 10);

    // 3️⃣ Set join date
    const joinDate = new Date().toISOString().split('T')[0];

    // 4️⃣ Insert the member
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

    if (error.code === '23505') { // unique violation
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
    const { memberId, month, amount, status } = req.body;

    // If status is Paid, save current timestamp; else null
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

// Update contribution status (admin only)
app.put('/api/contributions/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Use full timestamp for payment_date if Paid
    const payment_date = status === 'Paid' ? new Date().toISOString() : null;

    const result = await pool.query(
      'UPDATE contributions SET status = $1, payment_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [status, payment_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Contribution not found' });
    }

    res.json(result.rows[0]); // return the updated contribution including payment_date
  } catch (error) {
    console.error('Error updating contribution:', error);
    res.status(500).json({ error: 'Failed to update contribution' });
  }
});


//






// //


// const uploadDir = path.join(__dirname, 'uploads/proofs');
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: uploadDir,
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `contribution_${req.params.id}_${Date.now()}${ext}`);
//   }
// });

// const upload = multer({
//   storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
//     cb(null, allowed.includes(file.mimetype));
//   }
// });


// /**
//  * Upload proof of payment
//  */
// app.post(
//   '/api/contributions/:id/proof',
//   authenticateToken,
//   upload.single('proof'),
//   async (req, res) => {
//     try {
//       const { id } = req.params;

//       if (!req.file) {
//         return res.status(400).json({ error: 'No file uploaded' });
//       }

//       const proofData = {
//         url: `/uploads/proofs/${req.file.filename}`,
//         name: req.file.originalname,
//         type: req.file.mimetype,
//         size: req.file.size,
//         uploaded_at: new Date().toISOString()
//       };

//       const result = await pool.query(
//         `UPDATE contributions
//          SET proof_of_payment = $1,
//     status = 'Pending',
//     updated_at = CURRENT_TIMESTAMP

//          WHERE id = $2
//          RETURNING proof_of_payment`,
//         [proofData, id]
//       );

//       res.json({ proof_of_payment: result.rows[0].proof_of_payment });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Upload failed' });
//     }
//   }
// );

// app.use('/uploads', express.static('uploads'));


const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
});


/**
 * Upload proof of payment
 */
// app.post('/api/contributions/:id/proof', authenticateToken, upload.single('proof'), async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No file uploaded' });


//     const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'auto';

//     const result = await new Promise((resolve, reject) => {
//       const stream = cloudinary.uploader.upload_stream(
//         {
//           folder: 'proofs',
//           resource_type: resourceType,
//           public_id: `contribution_${id}_${Date.now()}`,
//           type: 'upload',   // public URL
//           // flags: 'attachment' <-- remove this if you want PDFs to open in browser
//         },
//         (error, uploaded) => {
//           if (error) {
//             console.error('Cloudinary error:', error);
//             return reject(error);
//           }
//           resolve(uploaded);
//         }
//       );
//       streamifier.createReadStream(req.file.buffer).pipe(stream);
//     });


//     const proofData = {
//       url: result.secure_url,
//       name: req.file.originalname,
//       type: req.file.mimetype,
//       size: req.file.size,
//       uploaded_at: new Date().toISOString(),
//     };

//     const dbResult = await pool.query(
//       `UPDATE contributions
//        SET proof_of_payment = $1,
//            status = 'Pending',
//            updated_at = CURRENT_TIMESTAMP
//        WHERE id = $2
//        RETURNING proof_of_payment`,
//       [proofData, id]
//     );

//     if (dbResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Contribution not found' });
//     }

//     res.json({ proof_of_payment: dbResult.rows[0].proof_of_payment });
//   } catch (err) {
//     console.error('Upload failed:', err);
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });



app.post('/api/contributions/:id/proof', authenticateToken, upload.single('proof'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file || !req.file.buffer) 
      return res.status(400).json({ error: 'No file uploaded' });

    // Determine resource type
    const resourceType = req.file.mimetype === 'pdf' ? 'raw' : 'auto';

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'proofs',
          resource_type: resourceType,
          public_id: `contribution_${id}_${Date.now()}`,
          type: 'upload', // public URL
          // key change: remove flags to let PDFs open in browser
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

    // Save proof data in DB
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

    // Return the URL to frontend
    res.json({ proof_of_payment: dbResult.rows[0].proof_of_payment, url: result.secure_url });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
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