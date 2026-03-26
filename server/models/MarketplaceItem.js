const { db } = require("../config/firebase");

const marketplaceCol = db.collection("marketplace_items");

module.exports = {
    marketplaceCol,
    findAll: async () => {
        const snapshot = await marketplaceCol.orderBy("downloads", "desc").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    findById: async (id) => {
        const doc = await marketplaceCol.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    count: async () => {
        const snapshot = await marketplaceCol.count().get();
        return snapshot.data().count;
    },
    insertMany: async (items) => {
        const batch = db.batch();
        items.forEach(item => {
            const docRef = marketplaceCol.doc();
            batch.set(docRef, { ...item, createdAt: new Date(), updatedAt: new Date() });
        });
        await batch.commit();
    },
    incrementDownloads: async (id) => {
        const admin = require('firebase-admin');
        await marketplaceCol.doc(id).update({
            downloads: admin.firestore.FieldValue.increment(1)
        });
    },
    save: async (id, data) => {
        await marketplaceCol.doc(id).set(data, { merge: true });
        return { id, ...data };
    }
};
