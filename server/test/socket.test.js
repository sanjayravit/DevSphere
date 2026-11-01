import { mockSandboxRun } from './helpers/qa.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createV2Router } from '../routes/v2.js';
import { io as connect } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { createSocketServer } from '../sockets/runtime.js';
import { createRunDevSphere } from '../engines/orchestrator.js';
import { configureFirestore, getRun } from '../services/firebaseService.js';
import { signSession } from '../config/session.js';
import { fakeFirestore } from './helpers/firestore.js';
import { mockProviders } from './helpers/providers.js';
const waitEvent = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, 3_000);
  const listener = value => { clearTimeout(timer); resolve(value); };
  socket.once(event, listener);
});
async function runtime(t) {
  mockProviders(t);
  const database = fakeFirestore(); configureFirestore(database);
  const api = express(); api.use(express.json()); api.use('/v2', createV2Router({ runDevSphere: mockSandboxRun }));
  const server = http.createServer(api);
  const io = createSocketServer(server, { getProjectForUser: async (id, userId) => {
    if (id !== 'shared-project' || !['user-a', 'user-b'].includes(userId)) throw new Error('No access');
    return { id };
  }, getUser: async id => ({ id, name: id }) });
  api.set('io', io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await new Promise(resolve => io.close(resolve)); configureFirestore(null); });
  const client = (user, token) => {
    const socket = connect(`http://127.0.0.1:${server.address().port}`, { auth: user ? { token: token || signSession(user) } : {}, transports: ['websocket'], reconnection: false, autoConnect: false });
    clients.push(socket); return socket;
  };
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v2${path}`, { method: 'POST', headers: { Authorization: `Bearer ${signSession('user-a')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { io, database, client, post };
}

test('WORKFLOW 5 / authenticated Socket.IO: missing, expired, malformed and reserved-room access fail closed', async t => {
  const app = await runtime(t);
  for (const socket of [app.client(null), app.client('user-a', 'bad-token'), app.client('user-a', jwt.sign({ user: { id: 'user-a' } }, process.env.JWT_SECRET, { expiresIn: -1 }))]) {
    const rejected = waitEvent(socket, 'connect_error'); socket.connect();
    assert.match((await rejected).message, /authentication/i); assert.equal(socket.connected, false);
  }
  const socket = app.client('user-a'); const ready = waitEvent(socket, 'connect'); socket.connect(); await ready;
  const acknowledgement = await socket.emitWithAck('join-room', { roomId: 'devsphere:user:user-b' });
  assert.equal(acknowledgement.ok, false);
  socket.emit('leave-room', null); // malformed payload must not crash the process.
});
test('WORKFLOW 5 / real local sockets deliver persisted agent progress, approvals, results and failures only to the owning user', async t => {
  const app = await runtime(t);
  const owner = app.client('user-a'); const other = app.client('user-b');
  const ready = [waitEvent(owner, 'connect'), waitEvent(other, 'connect')]; owner.connect(); other.connect(); await Promise.all(ready);
  const ownEvents = []; const otherEvents = [];
  owner.on('devsphere:update', event => ownEvents.push(event)); other.on('devsphere:update', event => otherEvents.push(event));
  const started = await app.post('/run', { input: 'Improve the helper safely', mode: 'approval' });
  assert.equal(started.status, 200); const result = started.body;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(ownEvents.some(event => event.step === 'intent' && event.status === 'running'));
  assert.ok(ownEvents.some(event => event.step === 'decision' && event.detail.approvalRequired === true));
  assert.ok(ownEvents.every(event => event.runId === result.runId)); assert.equal(otherEvents.length, 0);
  const stored = await getRun(result.runId, 'user-a'); assert.equal(stored.events.length, ownEvents.length);
  const delivered = waitEvent(owner, 'devsphere:update');
  const approved = await app.post(`/runs/${result.runId}/approve`, { approvalHash: result.approvalHash });
  assert.equal(approved.status, 200); await delivered;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(ownEvents.some(event => event.step === 'approval' && event.status === 'approved'));
  assert.ok(ownEvents.some(event => event.step === 'github-pr' && event.status === 'completed'));
  assert.equal(otherEvents.length, 0);
  const failure = createRunDevSphere({ processIntent: async () => { throw new Error('mock provider timeout'); } });
  await assert.rejects(failure({ input: 'Investigate an actual failure', mode: 'manual', userId: 'user-a', emit: event => app.io.to('devsphere:user:user-a').emit('devsphere:update', event) }), /mock provider timeout/);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(ownEvents.some(event => event.step === 'orchestrator' && event.status === 'failed')); assert.equal(otherEvents.length, 0);
});
test('existing editor collaboration uses membership-checked rooms, sanitized identities, presence and scoped updates', async t => {
  const app = await runtime(t);
  const owner = app.client('user-a'); const collaborator = app.client('user-b'); const outsider = app.client('outsider');
  const ready = [owner, collaborator, outsider].map(socket => { const wait = waitEvent(socket, 'connect'); socket.connect(); return wait; }); await Promise.all(ready);
  assert.equal((await owner.emitWithAck('join-room', { roomId: 'shared-project', user: { id: 'someone-else' } })).ok, true);
  assert.equal((await collaborator.emitWithAck('join-room', { roomId: 'shared-project' })).ok, true);
  assert.equal((await outsider.emitWithAck('join-room', { roomId: 'shared-project' })).ok, false);
  const changes = waitEvent(collaborator, 'code-update');
  owner.emit('code-change', { roomId: 'shared-project', code: { code: 'const valid = true;', fileIndex: 0 } });
  assert.equal((await changes).code, 'const valid = true;');
  const message = waitEvent(collaborator, 'chat-update');
  owner.emit('chat-message', { roomId: 'shared-project', message: { text: 'Hello', user: { id: 'forged' } } });
  assert.equal((await message).user.id, 'user-a');
  const denied = waitEvent(outsider, 'collaboration:error'); outsider.emit('code-change', { roomId: 'shared-project', code: 'attack' }); await denied;
  const departure = waitEvent(collaborator, 'user-left'); owner.emit('leave-room', { roomId: 'shared-project' }); assert.equal(await departure, owner.id);
});
test('long-lived socket connections disconnect when their authenticated JWT expires', async t => {
  const app = await runtime(t);
  const socket = app.client('user-a', jwt.sign({ user: { id: 'user-a' } }, process.env.JWT_SECRET, { expiresIn: 1 }));
  const connected = waitEvent(socket, 'connect'); socket.connect(); await connected;
  await waitEvent(socket, 'disconnect'); assert.equal(socket.connected, false);
});
