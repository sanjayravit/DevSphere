const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");
const axios = require('axios');

// Register
router.post("/register", async (req, res) => {
  try {
    const hashed = await bcrypt.hash(req.body.password, 10);

    const user = new User({
      username: req.body.username || req.body.name,
      email: req.body.email,
      password: hashed
    });

    await user.save();
    const payload = { user: { id: user._id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists.", code: "DUPLICATE_EMAIL" });
    }
    res.status(500).json({ error: "Registration failed. Please try again.", code: "REGISTRATION_ERROR" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) return res.status(404).json({ error: "No account found with this email.", code: "USER_NOT_FOUND" });

    const valid = await bcrypt.compare(req.body.password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect password. Please try again.", code: "WRONG_PASSWORD" });

    const payload = { user: { id: user._id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Authentication failed. Please try again later.", code: "SERVER_ERROR" });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
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
    let user = await User.findOne({ email: primaryEmail });
    if (!user) {
      user = new User({
        name: userData.name || userData.login,
        email: primaryEmail,
        password: 'github_oauth_dummy_' + Date.now() + Math.random(),
      });
      await user.save();
    }

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET || "fallback_dev_secret", { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      // Native redirect back to FrontEnd with the new valid platform token securely attached to the URL fragment
      res.redirect(`http://localhost:3000/login?token=${token}`);
    });

  } catch (err) {
    console.error("OAuth Error:", err.message);
    res.redirect('http://localhost:3000/login?error=oauth_failed');
  }
});

module.exports = router;