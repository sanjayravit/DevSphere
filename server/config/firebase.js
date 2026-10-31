import admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^['"]|['"]$/g, '');

  try {
    if (projectId && clientEmail && privateKey && !privateKey.includes('...')) {
      admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
    } else if (projectId || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({
        projectId: projectId || 'devsphere-local',
        ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: admin.credential.applicationDefault() })
      });
    } else {
      console.warn('Firebase Admin credentials are not configured; Firestore features are unavailable.');
    }
  } catch {
    console.error('Firebase Admin initialization failed; check the configured credentials.');
  }
}

export const db = admin.apps.length ? admin.firestore() : null;
export { admin };
