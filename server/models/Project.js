import { getCollection, getDatabase } from './database.js';
import { ServiceError } from '../utils/security.js';
const getCol = () => getCollection('projects');
const model = {
  async findById(id) {
    const col = getCol();
    const doc = await col.doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },
  async findByWorkspace(workspaceId) {
    const col = getCol();
    const snapshot = await col.where('workspaceId', '==', workspaceId).get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  },
  async create(data) {
    const col = getCol();
    const timestamp = new Date();
    const record = { ...data, version: 0, createdAt: timestamp, updatedAt: timestamp };
    const ref = await col.add(record);
    return { ...record, id: ref.id };
  },
  async save(id, data, { expectedVersion } = {}) {
    const col = getCol();
    if (['id', 'workspaceId', 'createdAt'].some(key => key in data)) throw new Error('Project identity cannot be changed.');
    const ref = col.doc(id);
    return getDatabase().runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new ServiceError('Project not found.', { status: 404 });
      const current = snap.data();
      if (expectedVersion !== undefined && expectedVersion !== (current.version || 0)) throw new ServiceError('Project changed concurrently. Reload before saving.', { status: 409, code: 'PROJECT_CONFLICT' });
      const patch = { ...data, updatedAt: new Date(), ...(data.files ? { version: (current.version || 0) + 1 } : {}) };
      if (Buffer.byteLength(JSON.stringify({ ...current, ...patch })) > 900_000) throw new ServiceError('Project exceeds its storage limit.', { status: 413 });
      transaction.update(ref, patch);
      return { ...current, ...patch, id };
    });
  },
  async appendChat(id, messages) {
    const col = getCol();
    const ref = col.doc(id);
    return getDatabase().runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('Project not found.');
      const chatHistory = [...(snap.data().chatHistory || []), ...messages].map(item => ({ ...item, content: String(item.content).slice(0, 10_000) })).slice(-30);
      while (chatHistory.length > 1 && Buffer.byteLength(JSON.stringify(chatHistory)) > 200_000) chatHistory.shift();
      if (Buffer.byteLength(JSON.stringify({ ...snap.data(), chatHistory })) > 900_000) throw new ServiceError('Project exceeds its safe chat storage limit.', { status: 413 });
      transaction.update(ref, { chatHistory, updatedAt: new Date() });
      return chatHistory;
    });
  }
};
export default model;
