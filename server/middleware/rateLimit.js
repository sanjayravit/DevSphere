// Bounded per-process protection for public authentication/legacy provider routes.
// V2 additionally uses Firestore transactions for cross-instance run quotas.
export function rateLimit({ limit = 30, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  let nextSweep = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now > nextSweep) { for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key); nextSweep = now + windowMs; }
    const key = req.user?.id || req.ip;
    if (!buckets.has(key)) {
      if (buckets.size >= 10_000) return res.status(429).json({ error: 'Request capacity exceeded. Try later.' });
      buckets.set(key, { count: 0, until: now + windowMs });
    }
    const bucket = buckets.get(key);
    if (++bucket.count > limit) { res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1_000)))); return res.status(429).json({ error: 'Too many requests. Try later.' }); }
    next();
  };
}
