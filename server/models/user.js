const { db } = require("../firebaseAdmin");

const getCol = () => db ? db.collection("users") : null;

module.exports = {
  findById: async (id) => {
    const col = getCol();
    if (!col) return null;
    const doc = await col.doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },
  findByEmail: async (email) => {
    const col = getCol();
    if (!col) return null;
    const snapshot = await col.where("email", "==", email).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
  create: async (userData) => {
    const col = getCol();
    if (!col) throw new Error("Database not initialized");
    const res = await col.add(userData);
    return { id: res.id, ...userData };
  },
  update: async (id, data) => {
    const col = getCol();
    if (!col) throw new Error("Database not initialized");
    await col.doc(id).update(data);
    return { id, ...data };
  }
};

