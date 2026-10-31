export function originAllowed(origin) {
  if (!origin) return true;
  const configured = (process.env.CLIENT_ORIGINS || process.env.CLIENT_URL || '').split(',').map(item => item.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  // Local development and Arena's isolated live-preview proxy. Production Vercel
  // origins must be explicitly configured, not every tenant on vercel.app.
  return process.env.NODE_ENV !== 'production' && (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || /^https:\/\/[a-z0-9-]+\.e2b\.app$/.test(origin));
}
export const corsOptions = { origin(origin, callback) { callback(null, originAllowed(origin)); }, credentials: true };
