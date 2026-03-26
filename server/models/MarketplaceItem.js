const { db } = require("../config/firebase");

const getCol = () => db ? db.collection("marketplace_items") : null;

module.exports = {
    findAll: async () => {
        const col = getCol();
        if (!col) return [];
        const snapshot = await col.orderBy("downloads", "desc").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    findById: async (id) => {
        const col = getCol();
        if (!col) return null;
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    count: async () => {
        const col = getCol();
        if (!col) return 0;
        const snapshot = await col.count().get();
        return snapshot.data().count;
    },
    insertMany: async (items) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        const batch = db.batch();
        items.forEach(item => {
            const docRef = col.doc();
            batch.set(docRef, { ...item, createdAt: new Date(), updatedAt: new Date() });
        });
        await batch.commit();
    },
    incrementDownloads: async (id) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        const admin = require('firebase-admin');
        await col.doc(id).update({
            downloads: admin.firestore.FieldValue.increment(1)
        });
    },
    save: async (id, data) => {
        const col = getCol();
        if (!col) throw new Error("Database not initialized");
        await col.doc(id).set(data, { merge: true });
        return { id, ...data };
    }
};
