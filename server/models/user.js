const { db } = require("../config/firebase");

const usersCol = db.collection("users");

module.exports = {
  usersCol,
  findById: async (id) => {
    const doc = await usersCol.doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },
  findByEmail: async (email) => {
    const snapshot = await usersCol.where("email", "==", email).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
  create: async (userData) => {
    const res = await usersCol.add(userData);
    return { id: res.id, ...userData };
  },
  update: async (id, data) => {
    await usersCol.doc(id).update(data);
    return { id, ...data };
  }
};
