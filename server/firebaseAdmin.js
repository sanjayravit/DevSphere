const admin = require("firebase-admin");

if (!admin.apps.length) {
    try {
        const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
        const privateKey = rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');

        const serviceAccount = privateKey
            ? {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            }
            : require("./serviceAccountKey.json");

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialized successfully (Server)");
    } catch (error) {
        console.error("Firebase Admin initialization error (Server):", error.message);
    }
}

const getDb = () => {
    try {
        return admin.firestore();
    } catch (e) {
        console.error("Failed to get Firestore instance:", e.message);
        return null;
    }
};

module.exports = { admin, getDb, db: getDb() };
