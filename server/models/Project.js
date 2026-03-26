const { db } = require("../config/firebase");

const projectsCol = db.collection("projects");

module.exports = {
    projectsCol,
    findById: async (id) => {
        const doc = await projectsCol.doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    findByWorkspace: async (workspaceId) => {
        const snapshot = await projectsCol.where("workspaceId", "==", workspaceId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    create: async (projectData) => {
        const now = new Date();
        const fullData = {
            ...projectData,
            createdAt: now,
            updatedAt: now
        };
        const res = await projectsCol.add(fullData);
        return { id: res.id, ...fullData };
    },
    save: async (id, data) => {
        const updatedAt = new Date();
        await projectsCol.doc(id).set({ ...data, updatedAt }, { merge: true });
        return { id, ...data, updatedAt };
    }
};
