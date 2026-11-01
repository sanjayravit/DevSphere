import { db } from '../firebaseAdmin.js';
import { proposalHash, redact, ServiceError } from '../utils/security.js';

let activeDb = db;
export const configureFirestore = database => { activeDb = database; };
export function requireDb() {
  if (!activeDb) throw new ServiceError('Firestore is not configured; set Firebase Admin environment variables.', { status: 503, code: 'CONFIGURATION_ERROR' });
  return activeDb;
}
const now = () => new Date().toISOString();
const validId = id => { if (typeof id !== 'string' || !/^[^/\x00-\x1f]{1,128}$/.test(id)) throw new ServiceError('Invalid document ID.', { status: 400 }); return id; };
const runRef = id => requireDb().collection('devsphereRuns').doc(validId(id));
function boundedDocument(data) {
  if (Buffer.byteLength(JSON.stringify(data)) > 900_000) throw new ServiceError('Run audit record exceeds the safe Firestore document size.', { status: 413 });
  return data;
}
const eventList = (run, event) => [...(run.events || []).slice(-99), event];

export async function createRun(runId, data) {
  const firestore = requireDb();
  const ref = runRef(runId);
  const lock = firestore.collection('devsphereRunLocks').doc(validId(data.userId));
  const createdAt = now();
  const record = boundedDocument({ ...redact(data), createdAt, updatedAt: createdAt, events: [] });
  await firestore.runTransaction(async transaction => {
    const snap = await transaction.get(lock);
    const current = snap.exists ? snap.data() : {};
    if (current.runId && current.expiresAt > Date.now()) throw new ServiceError('Another run is active for this user. Wait for it to finish.', { status: 429, code: 'RUN_LIMIT' });
    const sameWindow = current.windowStart > Date.now() - 60_000;
    const count = sameWindow ? current.count || 0 : 0;
    if (count >= 5) throw new ServiceError('Run request limit reached; try again in a minute.', { status: 429, code: 'RUN_LIMIT' });
    transaction.create(ref, record);
    transaction.set(lock, { runId, expiresAt: Date.now() + 300_000, windowStart: sameWindow ? current.windowStart : Date.now(), count: count + 1 });
  });
}
export async function releaseRun(runId, userId) {
  const ref = requireDb().collection('devsphereRunLocks').doc(validId(userId));
  await requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (snap.exists && snap.data().runId === runId) transaction.update(ref, { runId: null, expiresAt: 0 });
  });
}

export async function updateRun(runId, userId, patch, { expectedStatus } = {}) {
  const ref = runRef(runId);
  if (['id', 'userId', 'createdAt', 'approvalHash'].some(key => key in patch) && !(patch.proposal && 'approvalHash' in patch && !('userId' in patch) && !('id' in patch) && !('createdAt' in patch))) throw new Error('Run identity and approval bindings cannot be changed.');
  const safePatch = { ...redact(patch), updatedAt: now() };
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const current = snap.data();
    if (expectedStatus && ![].concat(expectedStatus).includes(current.status)) return null;
    if (patch.proposal && current.proposal) throw new Error('A stored proposal is immutable; create a fresh run.');
    const updated = boundedDocument({ ...current, ...safePatch });
    transaction.update(ref, safePatch);
    return { ...updated, id: snap.id };
  });
}
export async function getRun(runId, userId) {
  const snap = await runRef(runId).get();
  return snap.exists && snap.data().userId === userId ? { ...snap.data(), id: snap.id } : null;
}
export async function listRuns(userId, limit = 30) {
  const count = Math.min(50, Math.max(1, Math.trunc(limit) || 30));
  const snapshot = await requireDb().collection('devsphereRuns').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(count).get();
  return snapshot.docs.map(doc => {
    const { proposal, events, plan, qa, usage, ...summary } = doc.data();
    return { ...summary, id: doc.id, issue: proposal?.issue, eventCount: events?.length || 0 };
  });
}

export async function claimRunApproval(runId, userId, approvalHash) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const current = snap.data();
    if (current.status !== 'pending_approval' || current.approval !== 'pending' || current.approvalHash !== approvalHash || !current.proposal || proposalHash(current.proposal) !== approvalHash || current.qa?.status !== 'passed' || current.decision?.decision !== 'ask') return null;
    const lock = requireDb().collection('devsphereRunLocks').doc(validId(userId));
    const lease = await transaction.get(lock);
    const active = lease.exists ? lease.data() : {};
    if (active.runId && active.runId !== runId && active.expiresAt > Date.now()) return null;
    const at = now();
    transaction.set(lock, { ...active, runId, expiresAt: Date.now() + 300_000 });
    const event = { runId, step: 'approval', status: 'approved', at, detail: { approvalHash } };
    const patch = { approval: 'approved', status: 'executing', approvalRecord: { userId, approvalHash, approvedAt: at }, updatedAt: at, events: eventList(current, event) };
    transaction.update(ref, patch);
    return { ...current, ...patch, id: snap.id };
  });
}
export async function rejectRunApproval(runId, userId, approvalHash) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const current = snap.data();
    if (current.status !== 'pending_approval' || current.approval !== 'pending' || approvalHash !== current.approvalHash || proposalHash(current.proposal) !== approvalHash) return null;
    const at = now();
    const patch = { approval: 'rejected', status: 'rejected', approvalRecord: { userId, approvalHash, rejectedAt: at }, updatedAt: at, events: eventList(current, { runId, step: 'approval', status: 'rejected', at }) };
    transaction.update(ref, patch);
    return { ...current, ...patch, id: snap.id };
  });
}
export async function claimRunDeployment(runId, userId) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const run = snap.data();
    if (!run.pullNumber || !['pull_request', 'deployment_skipped', 'deployment_failed', 'deployment_pending'].includes(run.status)) return null;
    if (run.status === 'deployment_pending' && !run.deployment?.deploymentId) return null;
    if (run.qa?.status !== 'passed' || !['auto', 'ask'].includes(run.decision?.decision) || run.decision.decision === 'ask' && run.approval !== 'approved') return null;
    transaction.update(ref, { status: 'deployment_verifying', updatedAt: now() });
    return { ...run, id: snap.id };
  });
}
export async function appendRunEvent(runId, userId, event) {
  const ref = runRef(runId);
  const safeEvent = redact({ ...event, runId, at: now() });
  if (Buffer.byteLength(JSON.stringify(safeEvent)) > 8_000) throw new Error('Run event exceeds its storage limit.');
  await requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) throw new Error('Run not found.');
    const patch = { events: eventList(snap.data(), safeEvent), updatedAt: now() };
    boundedDocument({ ...snap.data(), ...patch });
    transaction.update(ref, patch);
  });
  return safeEvent;
}

export async function recordProjectEvent(projectId, event, deliveryId) {
  const ref = requireDb().collection('projects').doc(validId(projectId)).collection('events').doc(validId(deliveryId));
  const data = redact({ ...event, timestamp: now() });
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (snap.exists) return null;
    transaction.create(ref, data);
    return { ...data, id: ref.id };
  });
}
export async function logData(data) { await requireDb().collection('devsphere').add({ ...redact(data), createdAt: now() }); }
export async function logEvent(projectId, data) {
  await requireDb().collection('projects').doc(validId(projectId)).collection('events').add({ ...redact(data), timestamp: now() });
  return true;
}
export async function saveToLearningSystem(projectId, data) {
  await requireDb().collection('projects').doc(validId(projectId)).collection('learning_system').add(redact({ ...data, timestamp: now() }));
  return true;
}
export async function getPastFixes(projectId) {
  const snapshot = await requireDb().collection('projects').doc(validId(projectId)).collection('learning_system').limit(5).get();
  return snapshot.docs.map(doc => { const item = doc.data(); return `Past Error: ${item.errorSignature} | Fix Explanation: ${item.explanation}`; });
}
export async function syncProjectConfiguration(projectId, configuration) {
  await requireDb().collection('projects').doc(validId(projectId)).set({ configuration: redact(configuration) }, { merge: true });
  return true;
}
export default { logData, logEvent, getPastFixes, syncProjectConfiguration, saveToLearningSystem, createRun, updateRun, getRun, listRuns, appendRunEvent, claimRunApproval, rejectRunApproval, configureFirestore };
