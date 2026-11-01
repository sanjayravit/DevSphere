import { hasMandatoryQA } from './qa/evidence.js';
import { db } from '../firebaseAdmin.js';
import { boundedInteger, proposalHash, redact, ServiceError } from '../utils/security.js';

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
const visibleCI = ci => ci?.passed && (!ci.checkedAt || Date.parse(ci.checkedAt) < Date.now() - 300_000) ? { ...ci, state: 'stale', passed: false, reason: 'Recorded CI observation expired. Refresh the exact PR head.' } : ci;
const eventList = (run, event) => [...(run.events || []).slice(-99), event];

export async function createRun(runId, data) {
  const firestore = requireDb();
  const ref = runRef(runId);
  const lock = firestore.collection('devsphereRunLocks').doc(validId(data.userId));
  const requestRef = data.requestId ? firestore.collection('devsphereRunRequests').doc(proposalHash({ userId: data.userId, requestId: data.requestId })) : null;
  const createdAt = now();
  const record = boundedDocument({ ...redact(data), createdAt, updatedAt: createdAt, events: [] });
  await firestore.runTransaction(async transaction => {
    const previous = requestRef ? await transaction.get(requestRef) : null;
    if (previous?.exists) throw Object.assign(new ServiceError('This request was already recorded; open the existing run instead of retrying.', { status: 409, code: 'DUPLICATE_REQUEST' }), { runId: previous.data().runId });
    const snap = await transaction.get(lock);
    const current = snap.exists ? snap.data() : {};
    if (current.runId && current.expiresAt > Date.now()) throw new ServiceError('Another run is active for this user. Wait for it to finish.', { status: 429, code: 'RUN_LIMIT' });
    const sameWindow = current.windowStart > Date.now() - 60_000;
    const count = sameWindow ? current.count || 0 : 0;
    if (count >= boundedInteger(process.env.V2_RUNS_PER_MINUTE, 5, 1, 10)) throw new ServiceError('Run request limit reached; try again in a minute.', { status: 429, code: 'RUN_LIMIT' });
    transaction.create(ref, record);
    if (requestRef) transaction.create(requestRef, { userId: data.userId, runId, createdAt });
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
  if (!snap.exists || snap.data().userId !== userId) return null;
  const run = { ...snap.data(), id: snap.id };
  if (run.ci) run.ci = visibleCI(run.ci);
  return run;
}
export async function listRuns(userId, limit = 30) {
  const count = Math.min(50, Math.max(1, Math.trunc(limit) || 30));
  const snapshot = await requireDb().collection('devsphereRuns').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(count).get();
  return snapshot.docs.map(doc => {
    const { proposal, events, plan, qa, usage, providerMetrics, ci, ...summary } = doc.data();
    return { ...summary, ...(ci ? { ci: { state: visibleCI(ci).state, passed: visibleCI(ci).passed, headSha: ci.headSha || null, checkedAt: ci.checkedAt || null } } : {}), id: doc.id, issue: proposal?.issue, eventCount: events?.length || 0 };
  });
}

export async function claimRunApproval(runId, userId, approvalHash) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const current = snap.data();
    if (current.status !== 'pending_approval' || current.approval !== 'pending' || current.approvalHash !== approvalHash || !current.proposal || proposalHash(current.proposal) !== approvalHash || !hasMandatoryQA(current.qa) || !hasMandatoryQA(current.proposal?.qa) || current.decision?.decision !== 'ask') return null;
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
    if (!hasMandatoryQA(run.qa) || !hasMandatoryQA(run.proposal?.qa) || !['auto', 'ask'].includes(run.decision?.decision) || run.decision.decision === 'ask' && run.approval !== 'approved') return null;
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

// Cross-instance refresh lease: claims reserve API budget and immediately
// invalidate old success. A crashed refresh can never leave success displayed.
export async function claimCheckRefresh(runId, userId) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const run = snap.data();
    if (!run.pullNumber || !run.commitSha || run.checkRefreshAfter > Date.now()) return null;
    const generation = (run.checkGeneration || 0) + 1;
    const patch = { checkGeneration: generation, checkRefreshAfter: Date.now() + 60_000, ci: { ...(run.ci || {}), state: 'stale', passed: false, reason: 'Refresh in progress or interrupted.' }, updatedAt: now() };
    transaction.update(ref, patch);
    return { ...run, ...patch, id: snap.id };
  });
}
export async function recordCheckRefresh(runId, userId, generation, ci) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId || snap.data().checkGeneration !== generation) return null;
    const run = snap.data();
    if (ci.repository !== run.proposal?.repository || ci.pullNumber !== run.pullNumber || ci.expectedHeadSha !== run.commitSha) throw new Error('CI result binding mismatch.');
    const event = redact({ runId, step: 'github-checks', status: ci.state, at: now(), detail: { repository: ci.repository, pullNumber: ci.pullNumber, headSha: ci.headSha, expectedHeadSha: ci.expectedHeadSha } });
    const { checkedAt, ...state } = ci;
    const fingerprint = proposalHash(state);
    const changed = run.lastCheckFingerprint !== fingerprint;
    const patch = { ci: redact(ci), lastCheckFingerprint: fingerprint, updatedAt: now(), ...(changed ? { events: eventList(run, event) } : {}) };
    boundedDocument({ ...run, ...patch }); transaction.update(ref, patch);
    return { ci: patch.ci, event: changed ? event : null };
  });
}

export async function consumeProviderQuota(userId, provider, limit) {
  if (!['openai', 'github', 'vercel'].includes(provider) || !Number.isInteger(limit) || limit < 1 || limit > 300) throw new Error('Invalid provider quota.');
  const ref = requireDb().collection('devsphereProviderQuotas').doc(proposalHash({ userId: validId(userId), provider }));
  await requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const record = snap.exists ? snap.data() : {};
    const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
    const count = record.windowStart === windowStart ? record.count || 0 : 0;
    if (count >= limit) throw new ServiceError('Per-user provider request quota reached. Wait before refreshing; do not retry ambiguous writes.', { status: 429, code: 'PROVIDER_QUOTA', retryAfter: 60 });
    transaction.set(ref, { userId, provider, windowStart, count: count + 1 });
  });
}

export async function requestRunCancellation(runId, userId) {
  const ref = runRef(runId);
  return requireDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data().userId !== userId) return null;
    const run = snap.data();
    if (!['running', 'executing'].includes(run.status)) return null;
    if (run.cancelRequested) return { ...run, id: snap.id };
    const event = { runId, step: 'cancellation', status: 'requested', at: now(), detail: { message: 'Cancellation requested. Already accepted provider writes cannot be undone.' } };
    const patch = { cancelRequested: true, cancelRequestedAt: now(), events: eventList(run, event), updatedAt: now() };
    transaction.update(ref, patch); return { ...run, ...patch, id: snap.id };
  });
}
