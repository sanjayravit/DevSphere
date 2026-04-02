const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");
const axios = require('axios');
const { admin, db } = require("../firebaseAdmin");

// Register
router.post("/register", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Database not initialized. Please check your Firebase environment variables.", code: "DB_INIT_ERROR" });
    }
    const { email, password, username, name } = req.body;

    // Check for existing user
    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists.", code: "DUPLICATE_EMAIL" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: username || name,
      email: email,
      password: hashed
    });

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed. Please try again.", details: err.message, code: "REGISTRATION_ERROR" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Database not initialized. Please check your Firebase environment variables.", code: "DB_INIT_ERROR" });
    }
    const user = await User.findByEmail(req.body.email);

    if (!user) return res.status(404).json({ error: "No account found with this email.", code: "USER_NOT_FOUND" });

    const valid = await bcrypt.compare(req.body.password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect password. Please try again.", code: "WRONG_PASSWORD" });

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Authentication failed. Please try again later.", details: err.message, code: "SERVER_ERROR" });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) delete user.password;
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/auth/github
// @desc    Initiate GitHub OAuth
// @access  Public
router.get('/github', (req, res) => {
  const client_id = process.env.GITHUB_CLIENT_ID;
  const redirect_uri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5000/api/auth/github/callback';
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=user:email`);
});

// @route   GET /api/auth/github/callback
// @desc    GitHub OAuth callback
// @access  Public
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    }, {
      headers: { Accept: 'application/json' }
    });

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) throw new Error("No access token provided from GitHub.");

    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const emailsRes = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const primaryEmailObj = emailsRes.data.find(e => e.primary) || emailsRes.data[0];
    if (!primaryEmailObj) throw new Error("No email found on GitHub account.");

    const primaryEmail = primaryEmailObj.email;
    const userData = userRes.data;

    // Check DB for matching email
    let user = await User.findByEmail(primaryEmail);
    if (!user) {
      user = await User.create({
        username: userData.login,
        name: userData.name || userData.login,
        email: primaryEmail,
        avatar: userData.avatar_url,
        password: 'github_oauth_dummy_' + Date.now() + Math.random(),
      });
    } else {
      // Update avatar if it changed
      await User.update(user.id, {
        avatar: userData.avatar_url,
        username: user.username || userData.login
      });
    }

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      const frontendUrl = req.headers.origin || "https://devsphere-sj.vercel.app";
      res.redirect(`${frontendUrl}/login?token=${token}`);
    });

  } catch (err) {
    console.error("OAuth Error:", err.message);
    const frontendUrl = req.headers.origin || "https://devsphere-sj.vercel.app";
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
});


// Firebase Auth Sync
router.post("/user", async (req, res) => {
  try {
    const { idToken } = req.body;
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    let user = await User.findById(uid);
    if (!user) {
      // Create user if not exists, use uid as document ID
      const col = db.collection("users");
      await col.doc(uid).set({
        username: name || email.split('@')[0],
        email: email,
        name: name || '',
        avatar: picture || '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      user = { id: uid, email, name };
    }

    const payload = { user: { id: uid } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' });
    res.json({ token, user });
  } catch (err) {
    console.error("Firebase Sync Error:", err.message);
    res.status(401).json({ error: "Invalid Firebase token" });
  }
});

module.exports = router;
