import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import User from '../models/user.js';
import auth from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSessionSecret, signSession } from '../config/session.js';
import firebaseAdmin from '../firebaseAdmin.js';
import { respondAuthSyncError } from '../utils/authSyncError.js';

const router = express.Router();
const checkDb = (_req, res, next) => {
  if (!firebaseAdmin.db) return res.status(503).json({ error: 'Database is not configured.' });
  try { getSessionSecret(); next(); } catch { return res.status(503).json({ error: 'Session signing is not configured.' }); }
};
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = password => typeof password === 'string' && Buffer.byteLength(password) >= 8 && Buffer.byteLength(password) <= 72;
export const publicUser = (user, includeEmail = true) => Object.fromEntries(Object.entries({ id: user.id, username: user.username || '', name: user.name || '', avatar: user.avatar || '', ...(includeEmail ? { email: user.email || '' } : {}) }));
router.post('/register', rateLimit({ limit: 10, windowMs: 15 * 60_000 }), async (req, res, next) => {
  const { email, password, username, name } = req.body || {};
  const label = username || name;
  if (!validEmail(email) || !validPassword(password) || typeof label !== 'string' || !label.trim() || label.length > 80) return res.status(400).json({ error: 'Provide a valid email, name and password (8–72 UTF-8 bytes).' });
  next();
}, checkDb, async (req, res) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    if (await User.findByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists.', code: 'DUPLICATE_EMAIL' });
    const user = await User.create({ username: (req.body.username || req.body.name).trim(), email, password: await bcrypt.hash(req.body.password, 12), authProvider: 'password' });
    res.json({ token: signSession(user.id) });
  } catch (error) { res.status(error.code === 'DUPLICATE_EMAIL' ? 409 : 503).json({ error: error.code === 'DUPLICATE_EMAIL' ? 'An account with this email already exists.' : 'Registration is temporarily unavailable.' }); }
});
router.post('/login', rateLimit({ limit: 20, windowMs: 60_000 }), async (req, res, next) => {
  if (!validEmail(req.body?.email) || typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password) > 72) return res.status(400).json({ error: 'A valid email and password are required.' });
  next();
}, checkDb, async (req, res) => {
  try {
    const user = await User.findByEmail(req.body.email.trim().toLowerCase());
    if (!user?.password?.startsWith('$2') || !await bcrypt.compare(req.body.password, user.password)) return res.status(401).json({ error: 'Incorrect email or password.', code: 'INVALID_CREDENTIALS' });
    res.json({ token: signSession(user.id) });
  } catch { res.status(503).json({ error: 'Authentication is temporarily unavailable.' }); }
});
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(publicUser(user));
  } catch { res.status(503).json({ error: 'User information is temporarily unavailable.' }); }
});

function frontendUrl() {
  const url = new URL(process.env.CLIENT_URL || 'https://devsphere-sj.vercel.app');
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) throw new Error('Invalid CLIENT_URL.');
  return url.origin;
}
const validClientState = value => typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
router.get('/providers', rateLimit({ limit: 60 }), (_req, res) => {
  let configured = false;
  try { getSessionSecret(); configured = Boolean(firebaseAdmin.db && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_REDIRECT_URI); } catch { /* unavailable */ }
  res.json({ githubOAuth: configured });
});
const clearState = res => res.setHeader('Set-Cookie', 'devsphere_oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth/github; Max-Age=0');
router.get('/github', rateLimit(), (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !process.env.GITHUB_REDIRECT_URI) return res.status(503).json({ error: 'GitHub OAuth is not configured.' });
  try {
    if (!validClientState(req.query.client_state)) return res.status(400).json({ error: 'Start GitHub sign-in from the application login page.' });
    const state = jwt.sign({ kind: 'github-oauth', clientState: req.query.client_state, nonce: randomBytes(32).toString('hex') }, getSessionSecret(), { algorithm: 'HS256', expiresIn: '10m' });
    res.setHeader('Set-Cookie', `devsphere_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/github; Max-Age=600${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`);
    const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: process.env.GITHUB_REDIRECT_URI, scope: 'user:email', state });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch { res.status(503).json({ error: 'OAuth session configuration is unavailable.' }); }
});
router.get('/github/callback', rateLimit(), checkDb, async (req, res) => {
  let frontend;
  try { frontend = frontendUrl(); } catch { return res.status(503).json({ error: 'CLIENT_URL is invalid.' }); }
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('devsphere_oauth_state='))?.slice('devsphere_oauth_state='.length);
  const { code, state } = req.query;
  clearState(res);
  try {
    if (typeof code !== 'string' || code.length > 1_000 || typeof state !== 'string' || !cookie || cookie.length !== state.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(state))) throw new Error('Invalid OAuth state.');
    const verifiedState = jwt.verify(state, getSessionSecret(), { algorithms: ['HS256'] });
    if (verifiedState.kind !== 'github-oauth' || !validClientState(verifiedState.clientState)) throw new Error('Invalid OAuth client state.');
    const config = { headers: { Accept: 'application/json' }, timeout: 15_000, maxContentLength: 500_000, maxRedirects: 0 };
    const tokenRes = await axios.post('https://github.com/login/oauth/access_token', { client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, redirect_uri: process.env.GITHUB_REDIRECT_URI, code }, config);
    const accessToken = tokenRes.data.access_token;
    if (typeof accessToken !== 'string') throw new Error('No OAuth access token.');
    config.headers.Authorization = `Bearer ${accessToken}`;
    const [userRes, emailsRes] = await Promise.all([axios.get('https://api.github.com/user', config), axios.get('https://api.github.com/user/emails', config)]);
    const email = emailsRes.data.find(item => item.verified && item.primary)?.email;
    if (!validEmail(email) || !Number.isInteger(userRes.data.id) || typeof userRes.data.login !== 'string') throw new Error('No verified GitHub identity.');
    let user = await User.findByEmail(email.toLowerCase());
    if (user && user.githubId !== String(userRes.data.id)) throw new Error('Existing accounts must be authenticated before linking another provider.');
    if (!user) user = await User.create({ username: userRes.data.login, name: userRes.data.name || userRes.data.login, email: email.toLowerCase(), avatar: userRes.data.avatar_url || '', githubId: String(userRes.data.id), authProvider: 'github' });
    else await User.update(user.id, { githubId: String(userRes.data.id), avatar: userRes.data.avatar_url || user.avatar || '' });
    // Fragments are not sent to servers or leaked as HTTP referrers. The client
    // immediately removes this value and validates it with /auth/me.
    res.redirect(`${frontend}/login#token=${encodeURIComponent(signSession(user.id))}&state=${encodeURIComponent(verifiedState.clientState)}`);
  } catch { res.redirect(`${frontend}/login?error=oauth_failed`); }
});

router.post('/user', rateLimit({ limit: 60 }), async (req, res) => {
  if (typeof req.body?.idToken !== 'string' || !req.body.idToken || req.body.idToken.length > 8_192) return res.status(400).json({ error: 'A valid idToken is required.' });
  if (!firebaseAdmin.admin.apps.length || !firebaseAdmin.db) return res.status(503).json({ error: 'Firebase Admin is not configured.' });
  try { getSessionSecret(); } catch { return res.status(503).json({ error: 'Session signing is not configured.' }); }
  let stage = 'verify-token';
  try {
    const decoded = await firebaseAdmin.admin.auth().verifyIdToken(req.body.idToken, true);
    if (typeof decoded.uid !== 'string' || !validEmail(decoded.email)) return res.status(400).json({ error: 'This sign-in method must provide an email address.' });
    const { uid, email, name, picture } = decoded;
    stage = 'read-profile';
    let user = await User.findById(uid);
    if (!user) {
      const profile = { username: String(name || req.body.name || email.split('@')[0]).slice(0, 80), email, name: String(name || req.body.name || '').slice(0, 100), avatar: picture || '', authProvider: 'firebase', createdAt: new Date(), updatedAt: new Date() };
      // create() prevents a concurrent sign-in from overwriting an existing profile.
      stage = 'create-profile';
      try { await firebaseAdmin.db.collection('users').doc(uid).create(profile); }
      catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
      stage = 'read-profile';
      user = await User.findById(uid);
    }
    if (!user) throw new Error('Synchronized profile is not available.');
    if (!user.name && (name || typeof req.body.name === 'string')) {
      const displayName = String(name || req.body.name).slice(0, 100);
      stage = 'update-profile';
      await User.update(uid, { name: displayName, username: displayName });
      user = { ...user, name: displayName, username: displayName };
    }
    stage = 'sign-session';
    res.json({ token: signSession(uid), user: publicUser(user) });
  } catch (error) {
    respondAuthSyncError(res, error, stage);
  }
});
export default router;
