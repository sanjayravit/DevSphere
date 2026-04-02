const { getDb } = require("../firebaseAdmin");
const db = getDb();

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

    const { id } = req.query;

    try {
        if (!db) {
            return res.status(503).json({
                error: "Database not initialized",
                details: "Firestore instance is missing. Check Vercel logs."
            });
        }

        if (req.method === "GET") {
            const doc = await db.collection("projects").doc(id).get();
            if (!doc.exists) return res.status(404).json({ error: "Project not found" });
            return res.json({ id: doc.id, ...doc.data() });
        }

        if (req.method === "PUT") {
            await db.collection("projects").doc(id).update({
                ...req.body,
                updatedAt: new Date()
            });
            return res.json({ success: true });
        }

        res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
        console.error("Project (dynamic) API Error:", error);
        res.status(500).json({ error: error.message });
    }
};
