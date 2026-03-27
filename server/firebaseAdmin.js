const admin = require("firebase-admin");

const serviceAccount = process.env.NODE_ENV === "production"
    ? {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }
    : require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = { admin, db };
