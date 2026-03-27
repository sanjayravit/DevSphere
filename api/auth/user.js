const { admin, db } = require("../firebaseAdmin");
const jwt = require("jsonwebtoken");

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { idToken, name } = req.body;
        if (!idToken) {
            return res.status(400).json({ error: "Missing idToken" });
        }

        if (!db) {
            return res.status(503).json({
                error: "Database not initialized",
                details: "Firestore instance is missing. Check server logs."
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, picture } = decodedToken;

        const userRef = db.collection("users").doc(uid);
        const doc = await userRef.get();

        let userData;
        if (!doc.exists) {
            userData = {
                username: name || email.split('@')[0],
                email,
                avatar: picture || '',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await userRef.set(userData);
        } else {
            userData = doc.data();
        }

        // Generate JWT token for compatibility with existing frontend flow
        const token = jwt.sign(
            { user: { id: uid } },
            process.env.JWT_SECRET || "fallback_dev_secret",
            { expiresIn: '5h' }
        );

        res.status(200).json({
            success: true,
            token,
            user: { id: uid, ...userData }
        });
    } catch (error) {
        console.error("Auth Sync Error:", error.message);
        res.status(401).json({
            error: "Invalid token",
            details: error.message,
            projectId: process.env.FIREBASE_PROJECT_ID
        });
    }
};
