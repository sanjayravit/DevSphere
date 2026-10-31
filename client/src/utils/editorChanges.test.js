import { describe, expect, it } from 'vitest';
import { captureSelection, applyReplacement } from './editorChanges';
describe('selection-aware editor replacement', () => {
  it('replaces only the captured text and preserves both surrounding sections', () => {
    const source = 'const before = 1;\nconst bad = 2;\nconst after = 3;'; const start = source.indexOf('const bad'); const end = source.indexOf('\nconst after');
    const selection = captureSelection({ getModel: () => ({ getOffsetAt: position => position.column === 1 ? start : end }), getSelection: () => ({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 20 }) }, source);
    expect(selection.text).toBe('const bad = 2;'); expect(applyReplacement(source, '```js\nconst fixed = 2;\n```', selection)).toBe('const before = 1;\nconst fixed = 2;\nconst after = 3;');
  });
  it('does not strip embedded code fences from source literals, and empty results never delete a file', () => {
    const source = 'const documentation = "```";'; expect(applyReplacement('', source)).toBe(source);
    expect(() => applyReplacement('keep this', '   ')).toThrow(/empty/); expect(() => applyReplacement('keep this', '```js\n\n```')).toThrow(/empty/);
  });
});
