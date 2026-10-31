import { applyReplacement } from './editorChanges';

// Monaco cancellation and scope/content checks are required even if a transport
// ignores AbortSignal. No completion survives a new account, project or buffer.
export function createInlineCompletions({ request, monaco, getSnapshot, isCurrent, getModel, delayMs = 400 }) {
  let active; let disposed = false;
  return {
    dispose() { disposed = true; active?.abort(); },
    freeInlineCompletions() {},
    async provideInlineCompletions(model, position, _context, cancellation) {
      active?.abort(); const controller = new AbortController(); active = controller;
      const snapshot = getSnapshot(); const version = model.getVersionId();
      const subscription = cancellation?.onCancellationRequested?.(() => controller.abort());
      const obsolete = () => disposed || controller.signal.aborted || cancellation?.isCancellationRequested || !isCurrent(snapshot) || !snapshot.projectId || model.isDisposed() || getModel() !== model || model.getVersionId() !== version;
      try {
        if (delayMs > 0) await new Promise(resolve => {
          const timer = setTimeout(resolve, delayMs);
          controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
        if (obsolete()) return { items: [] };
        const code = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        if (!code.trim() || code.length > 100_000) return { items: [] };
        const response = await request({ action: 'continue', code, projectId: snapshot.projectId }, { signal: controller.signal });
        if (obsolete()) return { items: [] };
        return { items: [{ insertText: applyReplacement('', response.data.result), range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
      } catch { return { items: [] }; }
      finally { subscription?.dispose(); if (active === controller) active = null; }
    }
  };
}
