import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ServiceError } from '../utils/security.js';

let developmentSecret;
export function getSessionSecret() {
  if (process.env.JWT_SECRET) {
    if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && Buffer.byteLength(process.env.JWT_SECRET) < 32) throw new ServiceError('JWT_SECRET must contain at least 32 random bytes in production.', { status: 503, code: 'CONFIGURATION_ERROR' });
    return process.env.JWT_SECRET;
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new ServiceError('Session signing is not configured (JWT_SECRET).', { status: 503, code: 'CONFIGURATION_ERROR' });
  // Never ship a publicly known fallback key. Local sessions expire on process restart.
  developmentSecret ||= randomBytes(48).toString('base64url');
  return developmentSecret;
}
export function signSession(id) {
  return jwt.sign({ user: { id: String(id) } }, getSessionSecret(), { algorithm: 'HS256', expiresIn: '5h' });
}
export function verifySession(token) {
  if (typeof token !== 'string' || token.length > 8_192) throw new Error('Invalid authentication token.');
  const decoded = jwt.verify(token, getSessionSecret(), { algorithms: ['HS256'] });
  if (!Number.isInteger(decoded.exp)) throw new Error('Session expiration is required.');
  const user = decoded.user || decoded;
  if (typeof user?.id !== 'string' || !/^[^/\x00-\x1f]{1,128}$/.test(user.id)) throw new Error('Invalid authentication identity.');
  return { id: user.id, expiresAt: decoded.exp };
}
