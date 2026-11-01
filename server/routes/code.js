import express from 'express';
import axios from 'axios';
import auth from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
const router = express.Router();
const compilers = { 63: 'nodejs-20.17.0', 71: 'cpython-3.14.0', 62: 'openjdk-jdk-22+36', 54: 'gcc-13.2.0-cpp', 50: 'gcc-13.2.0-c' };
router.post('/run', auth, rateLimit({ limit: 15 }), async (req, res) => {
  const { code, language_id: languageId = 63 } = req.body || {};
  if (typeof code !== 'string' || !code.trim() || code.length > 50_000) return res.status(400).json({ error: 'Code must contain 1–50,000 characters.' });
  if (!Number.isInteger(languageId) || !Object.hasOwn(compilers, languageId)) return res.status(422).json({ error: 'Execution is not supported for this language. No other compiler was substituted.' });
  try {
    const response = await axios.post('https://wandbox.org/api/compile.json', { code, compiler: compilers[languageId], save: false }, { timeout: 20_000, maxContentLength: 300_000, maxBodyLength: 100_000, maxRedirects: 0 });
    if (!response.data || typeof response.data !== 'object' || !['status', 'program_message', 'program_error', 'compiler_error'].some(key => key in response.data)) throw new Error('Invalid execution provider response.');
    res.json({ stdout: response.data.program_message || '', stderr: response.data.program_error || '', compile_output: response.data.compiler_error || '' });
  } catch { res.status(502).json({ error: 'Code execution provider failed or timed out.' }); }
});
export default router;
