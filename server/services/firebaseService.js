const { db } = require('../firebaseAdmin');

async function logEvent(projectId, eventData) {
    if (!db) {
        console.warn("Firebase not initialized. Cannot log event.");
        return null;
    }

    try {
        const timestamp = new Date().toISOString();
        const docRef = await db.collection('projects').doc(projectId).collection('events').add({
            ...eventData,
            timestamp
        });
        return docRef.id;
    } catch (error) {
        console.error("Error logging to Firebase:", error);
        return null;
    }
}

module.exports = { logEvent };
