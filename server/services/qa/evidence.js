import { COMMANDS } from './policy.js';
// Old static-only records are deliberately not grandfathered into approval or
// deployment. The server-generated evidence is part of the immutable envelope.
export function hasMandatoryQA(qa) {
  const e = qa?.execution;
  return qa?.status === 'passed' && e?.protocol === 'sandbox-v1' && e.kind === 'sandbox' && e.status === 'passed' && e.state === 'passed' && e.cleanup === 'confirmed' && /^[a-f0-9]{64}$/.test(e.inputHash || '') && Array.isArray(e.commands) && e.commands.length > 0 && Array.isArray(e.attempted) && e.commands.length === e.attempted.length && e.commands.some(c => ['build', 'test', 'json'].includes(c.id)) && e.commands.every((c, i) => Object.hasOwn(COMMANDS, c.id) && c.exitCode === 0 && Number.isFinite(c.durationMs) && c.durationMs >= 0 && c.id === e.attempted[i].id && JSON.stringify(c.argv) === JSON.stringify(COMMANDS[c.id]));
}
