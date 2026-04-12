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

        // If it's a fixed event, also route it to the learning system
        if (eventData.type === 'FIX_GENERATED' && eventData.errorData) {
            await saveToLearningSystem(projectId, eventData);
        }

        return docRef.id;
    } catch (error) {
        console.error("Error logging to Firebase:", error);
        return null;
    }
}

async function saveToLearningSystem(projectId, fixEventData) {
    if (!db) return null;
    try {
        await db.collection('projects').doc(projectId).collection('learning_system').add({
            errorSignature: fixEventData.errorData.error, // Simplified signature
            explanation: fixEventData.explanation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error saving to learning system:", error);
    }
}

async function getPastFixes(projectId, errorSignature) {
    if (!db) return [];
    try {
        // Query recent similar errors (in a real system, you'd use embeddings for semantic search)
        const snapshot = await db.collection('projects').doc(projectId).collection('learning_system')
            .limit(5)
            .get();

        const insights = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            insights.push(`Past Error: ${data.errorSignature} | Fix Explanation: ${data.explanation}`);
        });

        return insights;
    } catch (error) {
        console.error("Error fetching past fixes:", error);
        return [];
    }
}

async function syncProjectConfiguration(projectId, configData) {
    if (!db) return false;
    try {
        await db.collection('projects').doc(projectId).set({ configuration: configData }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error syncing project configuration:", error);
        return false;
    }
}

module.exports = { logEvent, getPastFixes, syncProjectConfiguration };
