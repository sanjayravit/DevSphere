const admin = require('firebase-admin');

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.warn("WARNING: Firebase environment variables are missing. Using mock if available.");
}

try {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
    console.log("Firebase Admin SDK Initialized Successfully");
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error.message);
}

const db = admin.firestore();

module.exports = { admin, db };
