import express from 'express';
import Post from '../models/Post.js';
import User from '../models/user.js';
import auth from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
const router = express.Router();
const authorView = user => user && ({ id: user.id, username: user.username, name: user.name, avatar: user.avatar });
const failure = (res, error) => res.status(error.status || 503).json({ error: error.status && error.status < 500 ? error.message : 'Post service is unavailable.' });
router.param('id', (_req, res, next, id) => /^[A-Za-z0-9_-]{1,128}$/.test(id) ? next() : res.status(400).json({ error: 'Invalid post ID.' }));
const writeLimit = rateLimit({ limit: 60 });
router.post('/', auth, writeLimit, async (req, res) => {
  const { text = '', code = '', language = 'javascript' } = req.body || {};
  if (typeof text !== 'string' || text.length > 10_000 || typeof code !== 'string' || code.length > 100_000 || !text.trim() && !code.trim() || typeof language !== 'string' || !/^[A-Za-z0-9+#_-]{1,40}$/.test(language)) return res.status(400).json({ error: 'A bounded text or code post with a valid language is required.' });
  try {
    const post = await Post.create({ author: req.user.id, text, code, language, likes: [], comments: [] });
    res.json({ ...post, author: authorView(await User.findById(req.user.id)) || post.author });
  } catch (error) { failure(res, error); }
});
router.get('/', rateLimit({ limit: 120 }), async (_req, res) => {
  try {
    const people = new Map();
    const person = id => { if (!people.has(id)) people.set(id, User.findById(id).then(authorView)); return people.get(id); };
    const posts = await Post.findAll();
    res.json(await Promise.all(posts.map(async post => ({ ...post, author: await person(post.author) || post.author, comments: await Promise.all((post.comments || []).slice(-30).map(async comment => ({ ...comment, user: await person(comment.user) || comment.user }))) }))));
  } catch (error) { failure(res, error); }
});
router.patch('/:id/like', auth, writeLimit, async (req, res) => {
  try { res.json({ likes: await Post.toggleLike(req.params.id, req.user.id) }); }
  catch (error) { failure(res, error); }
});
router.post('/:id/comment', auth, writeLimit, async (req, res) => {
  if (typeof req.body?.text !== 'string' || !req.body.text.trim() || req.body.text.length > 2_000) return res.status(400).json({ error: 'A comment must contain 1–2,000 characters.' });
  try {
    const comment = { user: req.user.id, text: req.body.text.trim(), createdAt: new Date().toISOString() };
    await Post.addComment(req.params.id, comment);
    res.json({ ...comment, user: authorView(await User.findById(req.user.id)) || req.user.id });
  } catch (error) { failure(res, error); }
});
export default router;
