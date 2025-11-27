// server.js (clean, fixed)

// --- imports ---
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

// --- app setup ---
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// serve uploads folder (after app created)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- MySQL pool ---
let pool;
(async () => {
  try {
    pool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log("MySQL Connected Successfully!");
  } catch (err) {
    console.error("❌ MySQL Connection Error:", err);
  }
})();

// small helper to ensure pool ready
function ensurePool() {
  if (!pool) throw new Error("DB pool not initialized");
}

// --- helper DB functions ---
async function getUserByEmail(email) {
  ensurePool();
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows.length ? rows[0] : null;
}

async function createUser(user) {
  ensurePool();
  const { name, mobile, city, email } = user;
  await pool.query(
    "INSERT INTO users (name, mobile, city, email, registered_at) VALUES (?, ?, ?, ?, NOW())",
    [name, mobile, city, email]
  );
  return getUserByEmail(email);
}

// --- nodemailer transporter (uses env vars) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// --- multer storage (must be declared before upload usage) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // ensure folder exists (uploads/profile)
    const uploadDir = path.join(__dirname, 'uploads', 'profile');
    try {
      if (!require('fs').existsSync(uploadDir)) {
        require('fs').mkdirSync(uploadDir, { recursive: true });
      }
    } catch (e) {
      console.warn('Could not create upload dir', e);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "_" + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: storage });

// --- OTP store (in-memory) ---
const otpStore = {}; // { email: { otp, expiresAt } }

// ---------------------- ROUTES ---------------------- //

// Send OTP (signup/login) - just sends the OTP, does NOT create user
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const otp = Math.floor(100000 + Math.random() * 900000);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  otpStore[email] = { otp, expiresAt };

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP Code - EcoRewards',
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP ${otp} sent to ${email}`);
    res.json({ success: true, message: 'OTP sent' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP - does not auto-create user
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

  const record = otpStore[email];
  if (!record) return res.status(400).json({ success: false, message: 'No OTP sent to this email' });

  if (Date.now() > record.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ success: false, message: 'OTP expired' });
  }

  if (parseInt(otp) !== record.otp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }

  // valid OTP
  delete otpStore[email];
  return res.json({ success: true, message: 'OTP verified' });
});

// Register (create user) - only called after OTP verified on client
app.post('/register', async (req, res) => {
  const { name, mobile, city, email } = req.body;
  if (!name || !mobile || !city || !email) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const existing = await getUserByEmail(email);
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    const user = await createUser({ name, mobile, city, email });
    return res.json({ success: true, message: 'Registration successful', user });
  } catch (err) {
    console.error('Register Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Login (send OTP only if user exists) - keeps previous behavior
app.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ success: false, message: 'Email not registered' });

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore[email] = { otp, expiresAt };

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Login OTP - EcoRewards',
      text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
    };

    await transporter.sendMail(mailOptions);
    console.log(`Login OTP ${otp} sent to ${email}`);
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Check email existence
app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  try {
    const user = await getUserByEmail(email);
    return res.json({ exists: !!user });
  } catch (err) {
    console.error('Check email error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Schedule pickup
app.post('/schedule-pickup', async (req, res) => {
  const { name, phone, address, date, time, items, email } = req.body;
  if (!name || !phone || !address || !date || !time || !items || !email) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ success: false, message: 'User not found' });

    const user_id = user.id;
    await pool.query(
      `INSERT INTO pickups (user_id, address, preferred_date, preferred_time, items, fee, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [user_id, address, date, time, items, 49]
    );

    // Send confirmation email (non-blocking)
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Pickup Scheduled - EcoRewards',
      text: `Hello ${name},\n\nYour e-waste pickup is scheduled on ${date} at ${time}.\n\nItems: ${items}\nFee: ₹49\n\nThank you,\nTeam EcoRewards`
    };
    transporter.sendMail(mailOptions, (err) => {
      if (err) console.warn('Pickup confirmation email failed:', err);
    });

    return res.json({ success: true, message: `Pickup scheduled! Confirmation sent to ${email}.` });
  } catch (err) {
    console.error('Pickup Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user (returns fields including stats)
app.get('/get-user', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // normalize stats defaults
    return res.json({
      success: true,
      user: {
        ...user,
        pickups_completed: user.pickups_completed || 0,
        ewaste_recycled: user.ewaste_recycled || 0,
        co2_saved: user.co2_saved || 0,
        points: user.points || 0
      }
    });
  } catch (err) {
    console.error('Get User Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update profile
app.post('/update-profile', async (req, res) => {
  const { email, name, mobile, city, profile_pic } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  try {
    await pool.query(
      `UPDATE users SET name = ?, mobile = ?, city = ?, profile_pic = ? WHERE email = ?`,
      [name, mobile, city, profile_pic || null, email]
    );

    const updated = await getUserByEmail(email);
    return res.json({ success: true, message: 'Profile updated', user: updated });
  } catch (err) {
    console.error('Update Profile Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload profile picture (Multer)
app.post('/upload-profile', upload.single('profile_pic'), async (req, res) => {
  const email = req.body.email;
  if (!email || !req.file) return res.status(400).json({ success: false, message: 'Email & file required' });

  // file path relative to server root (used by frontend)
  const filePath = path.join('uploads', 'profile', req.file.filename).replace(/\\/g, '/');

  try {
    await pool.query('UPDATE users SET profile_pic = ? WHERE email = ?', [filePath, email]);
    return res.json({ success: true, filePath });
  } catch (err) {
    console.error('Upload profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get pickups for a user
app.get('/get-pickups', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.json([]);

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.json([]);

    const [rows] = await pool.query('SELECT * FROM pickups WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
    return res.json(rows);
  } catch (err) {
    console.error('Get Pickups Error:', err);
    return res.status(500).json([]);
  }
});

// Cancel pickup
app.post('/cancel-pickup', async (req, res) => {
  const { pickupId, email } = req.body;
  if (!pickupId || !email) return res.status(400).json({ success: false, message: 'pickupId & email required' });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [rows] = await pool.query('SELECT * FROM pickups WHERE id = ? AND user_id = ?', [pickupId, user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Pickup not found' });

    await pool.query('UPDATE pickups SET status = ? WHERE id = ?', ['cancelled', pickupId]);

    // send cancellation mail asynchronously
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Pickup Cancelled - EcoRewards',
      text: `Your pickup (ID: ${pickupId}) has been cancelled. If this was a mistake, please schedule again.`
    }, (err) => { if (err) console.warn('Cancel email failed', err); });

    return res.json({ success: true, message: 'Pickup cancelled' });
  } catch (err) {
    console.error('Cancel pickup error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete account (and related pickups)
app.post('/delete-account', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'email required' });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // delete pickups first (safer), then user
    await pool.query('DELETE FROM pickups WHERE user_id = ?', [user.id]);
    await pool.query('DELETE FROM users WHERE id = ?', [user.id]);

    // send deletion email (non-blocking)
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Account Deleted - EcoRewards',
      text: `Your account (${email}) has been permanently deleted.`
    }, (err) => { if (err) console.warn('Delete email failed', err); });

    return res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.get('/rewards', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, title, description, cost, quantity, image, active FROM rewards WHERE active = 1 ORDER BY cost ASC');
    return res.json(rows);
  } catch (err) {
    console.error('Get rewards error:', err);
    return res.status(500).json({ success:false, message: 'Server error' });
  }
});

// GET /rewards-history?email=...  -> user's redemption history
app.get('/rewards-history', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json([]);
  try {
    const user = await getUserByEmail(email);
    if (!user) return res.json([]);
    const [rows] = await pool.query(
      `SELECT r.id, rr.id as redemption_id, r.title, r.description, rr.cost, rr.status, rr.created_at
       FROM reward_redemptions rr
       JOIN rewards r ON rr.reward_id = r.id
       WHERE rr.user_id = ?
       ORDER BY rr.created_at DESC`, [user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Rewards history error:', err);
    return res.status(500).json([]);
  }
});

// POST /redeem  -> user redeems a reward
// Body: { email, rewardId }
app.post('/redeem', async (req, res) => {
  const { email, rewardId } = req.body;
  if (!email || !rewardId) return res.status(400).json({ success:false, message:'Email & rewardId required' });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ success:false, message:'User not found' });

    // fetch reward
    const [[reward]] = await pool.query('SELECT * FROM rewards WHERE id = ? AND active = 1', [rewardId]);
    if (!reward) return res.status(404).json({ success:false, message:'Reward not found' });

    // check quantity
    if (reward.quantity !== null && reward.quantity <= 0) {
      return res.status(400).json({ success:false, message:'Reward out of stock' });
    }

    // check points
    const userPoints = Number(user.points || 0);
    if (userPoints < reward.cost) {
      return res.status(400).json({ success:false, message:'Insufficient points' });
    }

    // transaction: deduct points, insert redemption, decrement quantity (if limited)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // deduct points
      await conn.query('UPDATE users SET points = points - ? WHERE id = ?', [reward.cost, user.id]);

      // insert redemption
      const [ins] = await conn.query('INSERT INTO reward_redemptions (user_id, reward_id, cost, status) VALUES (?, ?, ?, ?)', [user.id, reward.id, reward.cost, 'pending']);

      // decrement quantity if applicable
      if (reward.quantity !== null) {
        await conn.query('UPDATE rewards SET quantity = quantity - 1 WHERE id = ?', [reward.id]);
      }

      await conn.commit();

      // optional: send confirmation email asynchronously
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Reward Redeemed - EcoRewards',
        text: `You have redeemed "${reward.title}". Our team will process it shortly.`
      }, (err) => { if (err) console.warn('Redeem mail failed', err); });

      // return updated points + redemption id
      const updatedUser = await getUserByEmail(email);
      return res.json({ success:true, message:'Redeemed', redemptionId: ins.insertId, points: updatedUser.points });
    } catch (txErr) {
      await conn.rollback();
      console.error('Redeem TX error:', txErr);
      return res.status(500).json({ success:false, message:'Server error' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Redeem error:', err);
    return res.status(500).json({ success:false, message:'Server error' });
  }
});

app.post('/admin/add-reward', async (req, res) => {
  const { title, description, cost, quantity, image } = req.body;
  try {
    await pool.query('INSERT INTO rewards (title, description, cost, quantity, image) VALUES (?, ?, ?, ?, ?)', [title, description, cost, quantity, image]);
    return res.json({ success:true });
  } catch (err) { console.error(err); return res.status(500).json({ success:false }); }
});

app.post("/complete-pickup", async (req, res) => {
  const { pickupId, email } = req.body;

  if (!pickupId || !email) {
    return res.status(400).json({ success: false, message: "pickupId & email required" });
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // check if pickup belongs to user
    const [rows] = await pool.query(
      "SELECT * FROM pickups WHERE id = ? AND user_id = ?",
      [pickupId, user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Pickup not found for user" });
    }

    // mark pickup completed + add points
    const POINTS_TO_ADD = 150;

    await pool.query(
      "UPDATE pickups SET status = 'completed' WHERE id = ?",
      [pickupId]
    );

    await pool.query(
      "UPDATE users SET points = points + ? WHERE id = ?",
      [POINTS_TO_ADD, user.id]
    );

    return res.json({
      success: true,
      message: `Pickup completed! +${POINTS_TO_ADD} EcoPoints added.`,
    });

  } catch (err) {
    console.error("Complete pickup error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
// start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
