// Capture offsets, not a live Monaco selection that can move while AI is working.
export function captureSelection(editor, source) {
  const model = editor?.getModel(); const selection = editor?.getSelection();
  if (!model || !selection || selection.isEmpty?.()) return null;
  const start = model.getOffsetAt({ lineNumber: selection.startLineNumber, column: selection.startColumn });
  const end = model.getOffsetAt({ lineNumber: selection.endLineNumber, column: selection.endColumn });
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= source.length ? { start, end, text: source.slice(start, end) } : null;
}
export function applyReplacement(source, response, selection = null) {
  if (typeof response !== 'string' || !response.trim()) throw new Error('AI returned an empty replacement; no code was changed.');
  const replacement = response.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  if (!replacement.trim()) throw new Error('AI returned an empty replacement; no code was changed.');
  return selection ? source.slice(0, selection.start) + replacement + source.slice(selection.end) : replacement;
}
