import { randomUUID } from 'node:crypto';

const invalidTokenCodes = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
  'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'
]);
const providerCodes = new Set([
  'auth/insufficient-permission', 'auth/invalid-credential', 'auth/internal-error',
  'auth/project-not-found', 'auth/too-many-requests', 'app/invalid-credential',
  'permission-denied', 'unavailable', 'deadline-exceeded', 'not-found', 'unauthenticated'
]);

export function respondAuthSyncError(res, error, stage) {
  const rawCode = error?.code;
  const code = typeof rawCode === 'string' ? rawCode : Number.isInteger(rawCode) ? String(rawCode) : '';
  // Only verification failures attributable to the supplied identity are 401.
  // Admin/IAM, Firestore and network failures must not be labelled bad passwords.
  const invalidToken = stage === 'verify-token' && invalidTokenCodes.has(code);
  const requestId = randomUUID();
  const diagnosticCode = invalidTokenCodes.has(code) || providerCodes.has(code) || /^[0-9]{1,2}$/.test(code) ? code : 'UNKNOWN';
  // No token, email, profile, provider message/stack or credential goes to logs.
  console.warn('Authentication synchronization failed', { requestId, stage, providerCode: diagnosticCode });
  return res.status(invalidToken ? 401 : 503).json({
    error: invalidToken ? 'Invalid, expired or revoked Firebase token. Please sign in again.' : 'Authentication synchronization is temporarily unavailable. Please try again later or contact support.',
    code: invalidToken ? 'INVALID_FIREBASE_TOKEN' : 'AUTH_SYNC_UNAVAILABLE',
    requestId
  });
}
