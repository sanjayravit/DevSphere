import { getCollection, getDatabase } from './database.js';
import { createHash } from 'node:crypto';
const getCol = () => getCollection('users');

const model = {
  findById: async (id) => {
    if (!id) return null;
    const col = getCol();
    const doc = await col.doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },
  findByEmail: async (email) => {
    const col = getCol();
    const snapshot = await col.where("email", "==", email).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
  create: async (userData) => {
    const col = getCol();
    const email = String(userData.email).trim().toLowerCase();
    const index = getDatabase().collection('userEmails').doc(createHash('sha256').update(email).digest('hex'));
    const ref = col.doc();
    await getDatabase().runTransaction(async transaction => {
      const existing = await transaction.get(index);
      if (existing.exists) { const error = new Error('Email already registered.'); error.code = 'DUPLICATE_EMAIL'; throw error; }
      transaction.create(ref, { ...userData, email });
      transaction.create(index, { userId: ref.id });
    });
    return { id: ref.id, ...userData, email };
  },
  update: async (id, data) => {
    const col = getCol();
    await col.doc(id).update(data);
    return { id, ...data };
  }
};

export default model;
