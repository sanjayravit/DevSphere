import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import firebaseAdmin from '../firebaseAdmin.js';
import User from '../models/user.js';
import authRoutes from '../routes/auth.js';
import { fakeFirestore } from './helpers/firestore.js';

async function fixture(t, { error, stage = 'read-profile' } = {}) {
  const oldSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-only-auth-sync-session-secret-32-bytes';
  const oldDatabase = firebaseAdmin.db; firebaseAdmin.db = fakeFirestore();
  const descriptor = Object.getOwnPropertyDescriptor(firebaseAdmin.admin, 'apps');
  Object.defineProperty(firebaseAdmin.admin, 'apps', { value: [{}], configurable: true });
  t.after(() => { firebaseAdmin.db = oldDatabase; Object.defineProperty(firebaseAdmin.admin, 'apps', descriptor); if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  const diagnostics = []; t.mock.method(console, 'warn', (...args) => diagnostics.push(args));
  t.mock.method(firebaseAdmin.admin, 'auth', () => ({ verifyIdToken: async (_token, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (stage === 'verify-token') throw error;
    return { uid: 'test-user', email: 'test@example.com' };
  } }));
  t.mock.method(User, 'findById', async () => {
    if (stage === 'read-profile') throw error;
    return null;
  });
  if (stage === 'create-profile') t.mock.method(firebaseAdmin.db, 'collection', () => ({ doc: () => ({ create: async () => { throw error; } }) }));
  const app = express(); app.use(express.json()); app.use('/api/auth', authRoutes);
  app.use((_error, _req, res, _next) => res.status(500).json({ error: { code: 'HANDLER_THROW', message: 'Error handler threw.' } }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'test-token-never-log-this' }) });
  return { response, body: await response.json(), diagnostics };
}
for (const code of [7, 14, 4, 13, 'permission-denied', 'unavailable', undefined, { code: 'nested' }]) test(`Firestore failure (${JSON.stringify(code)}) returns safe 503 instead of throwing from its error handler`, async t => {
  const { response, body, diagnostics } = await fixture(t, { error: Object.assign(new Error('sensitive provider details must not be logged'), { code }) });
  assert.equal(response.status, 503); assert.equal(body.code, 'AUTH_SYNC_UNAVAILABLE'); assert.equal(typeof body.error, 'string'); assert.match(body.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(body.token, undefined); assert.equal(body.user, undefined);
  assert.equal(diagnostics[0][1].stage, 'read-profile'); assert.equal(diagnostics[0][1].requestId, body.requestId);
  assert.doesNotMatch(JSON.stringify([body, diagnostics]), /sensitive provider|test-token|test@example/);
});
test('numeric Firestore write failures are handled without masking the originating stage', async t => {
  const { response, diagnostics } = await fixture(t, { stage: 'create-profile', error: Object.assign(new Error('denied'), { code: 7 }) });
  assert.equal(response.status, 503); assert.equal(diagnostics[0][1].stage, 'create-profile'); assert.equal(diagnostics[0][1].providerCode, '7');
});
for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token']) test(`${code} remains unauthorized, not a successful or bypassed login`, async t => {
  const { response, body } = await fixture(t, { stage: 'verify-token', error: { code } });
  assert.equal(response.status, 401); assert.equal(body.code, 'INVALID_FIREBASE_TOKEN'); assert.equal(body.token, undefined);
});
for (const code of ['auth/insufficient-permission', 'auth/invalid-credential', 'auth/internal-error']) test(`${code} is a backend availability problem, not invalid user credentials`, async t => {
  const { response, body } = await fixture(t, { stage: 'verify-token', error: { code } });
  assert.equal(response.status, 503); assert.equal(body.code, 'AUTH_SYNC_UNAVAILABLE');
});
