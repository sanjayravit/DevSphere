import { verifySession } from '../config/session.js';

export default function authenticate(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('Authorization') || '');
  if (!match) return res.status(401).json({ msg: 'Authentication required.' });
  try {
    const session = verifySession(match[1]);
    req.user = { id: session.id };
    return next();
  } catch (error) {
    return res.status(error.code === 'CONFIGURATION_ERROR' ? 503 : 401).json({ msg: error.code === 'CONFIGURATION_ERROR' ? error.message : 'Token is not valid.' });
  }
}

export function requireRepositoryOperator(req, res, next) {
  const users = (process.env.V2_ALLOWED_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!users.length && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) return res.status(503).json({ error: 'V2_ALLOWED_USER_IDS must authorize operators of the configured repository.' });
  if (users.length && !users.includes(req.user.id)) return res.status(403).json({ error: 'You are not authorized to operate this repository.' });
  return next();
}
