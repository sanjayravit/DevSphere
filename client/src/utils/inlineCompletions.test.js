import { expect, it, vi } from 'vitest';
import { createInlineCompletions } from './inlineCompletions';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function setup() {
  let snapshot = { projectId: 'actual-project' }; let version = 1;
  const model = { getVersionId: () => version, getValueInRange: () => 'const actual = ', isDisposed: () => false };
  const request = vi.fn(); const provider = createInlineCompletions({ delayMs: 0, request, monaco: { Range: class Range {} }, getSnapshot: () => snapshot, isCurrent: value => value === snapshot, getModel: () => model });
  return { model, request, provider, edit: () => { version++; }, switchProject: () => { snapshot = { projectId: 'other-project' }; }, run: () => provider.provideInlineCompletions(model, { lineNumber: 1, column: 16 }, {}, {}) };
}
it('inline completion calls the real route contract with current source/project and returns only actual provider output', async () => {
  const app = setup(); app.request.mockResolvedValue({ data: { result: '```js\ntrue;\n```' } });
  expect((await app.run()).items[0].insertText).toBe('true;'); expect(app.request).toHaveBeenCalledWith({ action: 'continue', code: 'const actual = ', projectId: 'actual-project' }, expect.objectContaining({ signal: expect.any(AbortSignal) })); app.provider.dispose();
});
for (const scenario of ['edit', 'switchProject', 'dispose']) it(`an inline completion is discarded after ${scenario}, even when the transport ignores cancellation`, async () => {
  const app = setup(); const response = deferred(); app.request.mockReturnValue(response.promise); const pending = app.run();
  if (scenario === 'dispose') app.provider.dispose(); else app[scenario](); response.resolve({ data: { result: 'stale completion' } });
  expect(await pending).toEqual({ items: [] }); app.provider.dispose();
});
