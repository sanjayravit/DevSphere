const { db } = require("../config/firebase");

const postsCol = db.collection("posts");

module.exports = {
    postsCol,
    findAll: async () => {
        const snapshot = await postsCol.orderBy("createdAt", "desc").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    findById: async (id) => {
        const doc = await postsCol.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    create: async (postData) => {
        const now = new Date();
        const fullData = { ...postData, createdAt: now };
        const res = await postsCol.add(fullData);
        return { id: res.id, ...fullData };
    },
    save: async (id, data) => {
        await postsCol.doc(id).set(data, { merge: true });
        return { id, ...data };
    }
};
