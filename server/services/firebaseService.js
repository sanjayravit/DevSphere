import { db } from '../firebaseAdmin.js';

let activeDb = db;
export const configureFirestore = (database) => { activeDb = database; };

const redact = (value) => {
  if (typeof value === 'string') return value
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(sk-[A-Za-z0-9_-]{20,})/g, '[REDACTED_API_KEY]')
    .replace(/(AKIA[0-9A-Z]{16})/g, '[REDACTED_AWS_KEY]')
    .replace(/(Bearer\s+[A-Za-z0-9._-]{20,})/gi, '[REDACTED_BEARER_TOKEN]')
    .replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*["'`])[^"'`]+(["'`])/gi, '$1[REDACTED]$2')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|secret|credential|privatekey|password/i.test(key)).map(([key, item]) => [key, redact(item)]));
  return value;
};

function requireDb() {
  if (!activeDb) throw new Error('Firestore is not configured; set Firebase Admin environment variables.');
  return activeDb;
}

export async function createRun(runId, data) {
  const now = new Date().toISOString();
  await requireDb().collection('devsphereRuns').doc(runId).create({ ...redact(data), createdAt: now, updatedAt: now, events: [] });
}

export async function updateRun(runId, userId, patch) {
  const ref = requireDb().collection('devsphereRuns').doc(runId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().userId !== userId) return null;
  await ref.set({ ...redact(patch), updatedAt: new Date().toISOString() }, { merge: true });
  return { id: runId, ...snap.data(), ...redact(patch) };
}

export async function getRun(runId, userId) {
  const snap = await requireDb().collection('devsphereRuns').doc(runId).get();
  if (!snap.exists || snap.data().userId !== userId) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listRuns(userId, limit = 30) {
  const snapshot = await requireDb().collection('devsphereRuns').where('userId', '==', userId).limit(100).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit);
}

export async function claimRunApproval(runId, userId, approvalHash) {
  const firestore = requireDb();
  const ref = firestore.collection('devsphereRuns').doc(runId);
  return firestore.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const current = snap.data();
    if (current.status !== 'pending_approval' || current.approvalHash !== approvalHash || current.approval !== 'pending') return null;
    transaction.update(ref, { approval: 'approved', status: 'executing', updatedAt: new Date().toISOString() });
    return { id: snap.id, ...current, approval: 'approved', status: 'executing' };
  });
}

export async function appendRunEvent(runId, userId, event) {
  const ref = requireDb().collection('devsphereRuns').doc(runId);
  const safeEvent = redact({ ...event, at: new Date().toISOString() });
  await requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) throw new Error('Run not found.');
    transaction.update(ref, { events: [...(snap.data().events || []).slice(-99), safeEvent], updatedAt: new Date().toISOString() });
  });
  return safeEvent;
}

export async function logData(data) {
  await requireDb().collection('devsphere').add({ ...redact(data), createdAt: new Date().toISOString() });
}

export async function logEvent(projectId, eventData) {
  if (!db) return false;
  try {
    await db.collection('projects').doc(projectId).collection('events').add({ ...redact(eventData), timestamp: new Date() });
    return true;
  } catch (error) {
    console.error('Could not persist project event:', error.message);
    return false;
  }
}

export async function saveToLearningSystem(projectId, fixEventData) {
  if (!db) return false;
  await db.collection('projects').doc(projectId).collection('learning_system').add(redact({ ...fixEventData, timestamp: new Date().toISOString() }));
  return true;
}

export async function getPastFixes(projectId) {
  if (!db) return [];
  const snapshot = await db.collection('projects').doc(projectId).collection('learning_system').limit(5).get();
  return snapshot.docs.map(doc => { const d = doc.data(); return `Past Error: ${d.errorSignature} | Fix Explanation: ${d.explanation}`; });
}

export async function syncProjectConfiguration(projectId, configData) {
  if (!db) return false;
  await db.collection('projects').doc(projectId).set({ configuration: redact(configData) }, { merge: true });
  return true;
}

export default { logData, logEvent, getPastFixes, syncProjectConfiguration, createRun, updateRun, getRun, listRuns, appendRunEvent, claimRunApproval, configureFirestore };
