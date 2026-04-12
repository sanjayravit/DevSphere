const firebaseAdmin = require("../firebaseAdmin");

const getCol = () => firebaseAdmin.db ? firebaseAdmin.db.collection("workspaces") : null;

module.exports = {
    findById: async (id) => {
        if (!id) return null;
        const col = getCol();
        if (!col) return null;
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    findByMember: async (userId) => {
        const col = getCol();
        if (!col) return [];
        const snapshot = await col.where("members", "array-contains", userId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    create: async (workspaceData) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        const now = new Date();
        const fullData = { ...workspaceData, createdAt: now };
        const res = await col.add(fullData);
        return { id: res.id, ...fullData };
    }
};
