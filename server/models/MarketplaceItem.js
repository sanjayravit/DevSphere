import { getCollection, getDatabase } from './database.js';
import { admin } from "../firebaseAdmin.js";
const getCol = () => getCollection('marketplace_items');

const model = {
    findAll: async () => {
        const col = getCol();
        const snapshot = await col.orderBy("downloads", "desc").limit(50).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    findById: async (id) => {
        const col = getCol();
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    count: async () => {
        const col = getCol();
        const snapshot = await col.count().get();
        return snapshot.data().count;
    },
    insertMany: async (items) => {
        const col = getCol();
        const batch = getDatabase().batch();
        items.forEach(item => {
            const docRef = col.doc();
            batch.set(docRef, { ...item, createdAt: new Date(), updatedAt: new Date() });
        });
        await batch.commit();
    },
    incrementDownloads: async (id) => {
        const col = getCol();
        await col.doc(id).update({
            downloads: admin.firestore.FieldValue.increment(1)
        });
    },
    save: async (id, data) => {
        const col = getCol();
        await col.doc(id).set(data, { merge: true });
        return { id, ...data };
    }
};

export default model;
