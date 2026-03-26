const { db } = require("../config/firebase");

const workspacesCol = db.collection("workspaces");

module.exports = {
    workspacesCol,
    findById: async (id) => {
        const doc = await workspacesCol.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    findByMember: async (userId) => {
        const snapshot = await workspacesCol.where("members", "array-contains", userId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    create: async (workspaceData) => {
        const now = new Date();
        const fullData = { ...workspaceData, createdAt: now };
        const res = await workspacesCol.add(fullData);
        return { id: res.id, ...fullData };
    }
};
