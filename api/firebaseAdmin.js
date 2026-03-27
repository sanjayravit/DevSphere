const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, '')
      : undefined;

    if (!privateKey) {
      console.error("FIREBASE_PRIVATE_KEY is missing!");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Firebase Admin initialization error:", error.message);
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

module.exports = {
  admin,
  get db() { return getDb(); }
};
