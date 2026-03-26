const { db } = require("../config/firebase");

const getCol = () => db ? db.collection("projects") : null;

module.exports = {
    findById: async (id) => {
        const col = getCol();
        if (!col) return null;
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    findByWorkspace: async (workspaceId) => {
        const col = getCol();
        if (!col) return [];
        const snapshot = await col.where("workspaceId", "==", workspaceId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    create: async (projectData) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        const now = new Date();
        const fullData = {
            ...projectData,
            createdAt: now,
            updatedAt: now
        };
        const res = await col.add(fullData);
        return { id: res.id, ...fullData };
    },
    save: async (id, data) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        const updatedAt = new Date();
        await col.doc(id).set({ ...data, updatedAt }, { merge: true });
        return { id, ...data, updatedAt };
    }
};
