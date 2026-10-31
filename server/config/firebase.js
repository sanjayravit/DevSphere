import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^['"]|['"]$/g, '');
  try {
    if ((clientEmail || privateKey) && !(projectId && clientEmail && privateKey && !privateKey.includes('...'))) throw new Error('Incomplete service-account configuration.');
    if (projectId && clientEmail && privateKey) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    else if (projectId || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: projectId || 'devsphere-local', ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
    else console.warn('Firebase Admin credentials are not configured; Firestore features are unavailable.');
  } catch { console.error('Firebase Admin initialization failed; check the configured credentials.'); }
}
// Retain the existing model interface while using the supported modular SDK.
export const admin = { get apps() { return getApps(); }, auth: getAuth, firestore: Object.assign(getFirestore, { FieldValue }) };
export const db = getApps().length ? getFirestore() : null;
