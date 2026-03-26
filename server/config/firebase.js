const admin = require('firebase-admin');

let db;

try {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY.includes('...')) {
        console.warn("CRITICAL: Firebase environment variables are missing or contain placeholders. Database operations WILL fail.");
    } else {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n'),
            })
        });
        console.log("Firebase Admin SDK Initialized Successfully");
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error.message);
}

// Export db safely. If not initialized, it will be undefined or throw on access.
db = admin.apps.length > 0 ? admin.firestore() : null;

module.exports = { admin, db };
