import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV ||= 'production';
process.env.VERCEL ||= '1';
process.env.JWT_SECRET ||= 'test-only-jwt-secret';
const { default: app } = await import('../../api/index.js');
const server = http.createServer(app);
let origin;
before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise(resolve => server.close(resolve)));

const token = () => jwt.sign({ user: { id: 'http-test-user' } }, process.env.JWT_SECRET);

test('Vercel ESM adapter serves existing Express app and protects V2 endpoints', async () => {
  const health = await fetch(`${origin}/api/health`);
  assert.ok([200, 503].includes(health.status));
  const unauthenticated = await fetch(`${origin}/api/v2/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'A valid request with sufficient length', mode: 'manual' }) });
  assert.equal(unauthenticated.status, 401);
  const unapproved = await fetch(`${origin}/api/v2/runs/run-id/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalHash: 'a'.repeat(64) }) });
  assert.equal(unapproved.status, 401);
  const invalid = await fetch(`${origin}/api/v2/run`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'A valid request with sufficient length', mode: 'anything' }) });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /Mode/);
  const tooShort = await fetch(`${origin}/api/v2/run`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'short', mode: 'manual' }) });
  assert.equal(tooShort.status, 400);
});
