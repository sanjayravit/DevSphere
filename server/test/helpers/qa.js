// Deterministic sandbox evidence ONLY. This does not certify a real runner.
import { createQAAgent } from '../../agents/qaAgent.js';
import { createRunDevSphere } from '../../engines/orchestrator.js';
export const passedQA = {
  status: 'passed', checks: [], execution: { protocol: 'sandbox-v1', kind: 'sandbox', evidenceSource: 'mock', status: 'passed', state: 'passed', cleanup: 'confirmed', inputHash: 'a'.repeat(64), attempted: [{ id: 'test' }], commands: [{ id: 'test', argv: ['npm', 'test', '--', '--run'], exitCode: 0, durationMs: 1 }] }
};
export const mockSandboxRun = createRunDevSphere({ qaAgent: createQAAgent({ execute: async () => passedQA.execution }) });
