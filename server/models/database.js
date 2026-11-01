import firebaseAdmin from '../firebaseAdmin.js';
import { ServiceError } from '../utils/security.js';
// Shared legacy-model guard: missing persistence is unavailable, never a
// successful empty catalogue/history/workspace response.
export function getDatabase() {
  if (!firebaseAdmin.db) throw new ServiceError('Firestore is not configured.', { status: 503, code: 'CONFIGURATION_ERROR' });
  return firebaseAdmin.db;
}
export const getCollection = name => getDatabase().collection(name);
