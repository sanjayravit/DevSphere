// Deterministic sandbox evidence ONLY. This does not certify a real runner.
import { createQAAgent } from '../../agents/qaAgent.js';
import { createRunDevSphere } from '../../engines/orchestrator.js';
export const mockSandboxRun = createRunDevSphere({ qaAgent: createQAAgent({ execute: async () => ({ kind: 'mock-sandbox', status: 'passed', state: 'passed', commands: [{ id: 'test', argv: ['npm', 'test', '--', '--run'], exitCode: 0, durationMs: 1 }] }) }) });
