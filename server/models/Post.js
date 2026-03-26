const { db } = require("../firebaseAdmin");

const getCol = () => db ? db.collection("posts") : null;

module.exports = {
    findAll: async () => {
        const col = getCol();
        if (!col) return [];
        const snapshot = await col.orderBy("createdAt", "desc").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    findById: async (id) => {
        const col = getCol();
        if (!col) return null;
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    create: async (postData) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        const now = new Date();
        const fullData = { ...postData, createdAt: now };
        const res = await col.add(fullData);
        return { id: res.id, ...fullData };
    },
    save: async (id, data) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        await col.doc(id).set(data, { merge: true });
        return { id, ...data };
    }
};
