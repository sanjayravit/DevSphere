import { getCollection, getDatabase } from './database.js';
const getCol = () => getCollection('workspaces');

const model = {
    findById: async (id) => {
        if (!id) return null;
        const col = getCol();
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    findByMember: async (userId) => {
        const col = getCol();
        const snapshot = await col.where("members", "array-contains", userId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    create: async (workspaceData) => {
        const col = getCol();
        const now = new Date();
        const fullData = { ...workspaceData, createdAt: now };
        const res = await col.add(fullData);
        return { id: res.id, ...fullData };
    }
};

export default model;
