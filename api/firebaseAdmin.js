const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Handle private key correctly using .replace(/\\n/g, "\n")
        privateKey: process.env.FIREBASE_PRIVATE_KEY 
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") 
          : undefined,
      }),
    });
  } catch (error) {
    console.error("Firebase Admin initialization error:", error.message);
  }
}

const db = admin.firestore();

module.exports = { admin, db };
