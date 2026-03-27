const { db } = require("../firebaseAdmin");

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
        if (!db) return res.status(503).json({ error: "Database not initialized" });

        if (req.method === "GET") {
            const { workspaceId } = req.query;
            let query = db.collection("projects");
            if (workspaceId) query = query.where("workspaceId", "==", workspaceId);
            const snapshot = await query.get();
            const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return res.json(projects);
        }

        if (req.method === "POST") {
            const { name, workspaceId, owner } = req.body;
            const docRef = await db.collection("projects").add({
                name,
                workspaceId,
                owner,
                files: [],
                chatHistory: [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
            const newDoc = await docRef.get();
            return res.status(201).json({ id: newDoc.id, ...newDoc.data() });
        }

        res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
        console.error("Projects API Error:", error);
        res.status(500).json({ error: error.message });
    }
};
