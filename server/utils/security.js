import { createHash } from 'node:crypto';

// Only match literal credentials, not environment-variable references or ordinary prose.
const CREDENTIAL = /-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|\bBearer\s+[A-Za-z0-9._-]{20,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'`](?!\[REDACTED|\$\{)[^"'`\n]{8,}["'`]/i;
const sensitiveEnvironment = ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'JWT_SECRET', 'GEMINI_API_KEY', 'VERCEL_API_TOKEN', 'FIREBASE_PRIVATE_KEY', 'GITHUB_CLIENT_SECRET', 'GITHUB_WEBHOOK_SECRET', 'VERCEL_WEBHOOK_SECRET', 'REDIS_URL'];
export const containsCredential = value => CREDENTIAL.test(String(value)) || sensitiveEnvironment.some(name => process.env[name]?.length >= 8 && String(value).includes(process.env[name]));

export function redact(value) {
  if (typeof value === 'string') {
    let safe = value
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]')
      .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer [REDACTED]')
      .replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*["'`])(?!\$\{)[^"'`\n]{8,}(["'`])/gi, '$1[REDACTED]$2');
    // Provider error messages can echo credentials that do not have a recognizable prefix.
    for (const name of sensitiveEnvironment) {
      const secret = process.env[name];
      if (secret?.length >= 8) safe = safe.split(secret).join('[REDACTED]');
    }
    return safe;
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => item !== undefined && !/^(?:accessToken|idToken|refreshToken|apiKey|password|secret|credential|privateKey)$/i.test(key))
    .map(([key, item]) => [key, redact(item)]));
  return value;
}

const canonicalize = value => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])) : value;
export const proposalHash = value => createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
export const safeMessage = error => String(redact(error?.message || 'Request failed.')).slice(0, 1_000);

export class ServiceError extends Error {
  constructor(message, { status = 502, code = 'PROVIDER_ERROR', retryAfter, ambiguous = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.ambiguous = ambiguous;
  }
}

export function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}
