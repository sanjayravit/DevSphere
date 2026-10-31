import { ServiceError } from '../utils/security.js';
import { getCollection, getDatabase } from './database.js';
const getCol = () => getCollection('posts');
function boundedPost(data) { if (Buffer.byteLength(JSON.stringify(data)) > 900_000) throw new ServiceError('Post exceeds its safe storage limit.', { status: 413 }); }

const model = {
    findAll: async () => {
        const col = getCol();
        const snapshot = await col.orderBy("createdAt", "desc").limit(50).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    findById: async (id) => {
        const col = getCol();
        const doc = await col.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    create: async (postData) => {
        const col = getCol();
        const now = new Date();
        const fullData = { ...postData, createdAt: now };
        const res = await col.add(fullData);
        return { id: res.id, ...fullData };
    },
    toggleLike: async (id, userId) => {
        const ref = getCol().doc(id);
        return getDatabase().runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) throw new ServiceError('Post not found.', { status: 404 });
            const current = snapshot.data().likes || [];
            const likes = current.includes(userId) ? current.filter(value => value !== userId) : [...current, userId];
            if (likes.length > 10_000) throw new ServiceError('Post like limit reached.', { status: 413 });
            boundedPost({ ...snapshot.data(), likes });
            transaction.update(ref, { likes }); return likes;
        });
    },
    addComment: async (id, comment) => {
        const ref = getCol().doc(id);
        return getDatabase().runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) throw new ServiceError('Post not found.', { status: 404 });
            const comments = [...(snapshot.data().comments || []), comment];
            if (comments.length > 200) throw new ServiceError('Post comment limit reached.', { status: 413 });
            boundedPost({ ...snapshot.data(), comments });
            transaction.update(ref, { comments });
        });
    },
    save: async (id, data) => {
        const col = getCol();
        await col.doc(id).set(data, { merge: true });
        return { id, ...data };
    }
};

export default model;
