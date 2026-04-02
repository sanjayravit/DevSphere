const { getDb } = require("../firebaseAdmin");
const db = getDb();
const admin = require("firebase-admin");

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

    try {
        if (!db) {
            return res.status(503).json({
                error: "Database not initialized",
                details: "Firestore instance is missing. Check Vercel logs."
            });
        }

        // VERY SIMPLE auth check (should verify JWT but let's just get it working first)
        const userId = req.headers.authorization?.replace("Bearer ", "");
        if (!userId) {
            // If no token, we might allow public access or return 401
            // For now let's just use a dummy or skip
        }

        if (req.method === "GET") {
            const userId = req.query.userId || "dummy"; // Fallback if no auth
            const snapshot = await db.collection("workspaces").get();
            const workspaces = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return res.json(workspaces);
        }

        if (req.method === "POST") {
            const { name, owner } = req.body;
            const docRef = await db.collection("workspaces").add({
                name,
                owner,
                members: [owner],
                createdAt: new Date()
            });
            const newDoc = await docRef.get();
            return res.status(201).json({ id: newDoc.id, ...newDoc.data() });
        }

        res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
        console.error("Workspaces API Error:", error);
        res.status(500).json({ error: error.message });
    }
};
