import { expect, it } from 'vitest';
import { decodeGithubFile, validGithubOwner, publicWebUrl } from './publicGithub';
it('public GitHub file previews preserve UTF-8 text and reject corrupt, oversized and binary data', () => {
  const text = 'const greeting = "Hello, കേരളം";'; const content = Buffer.from(text); const file = { type: 'file', encoding: 'base64', size: content.length, content: content.toString('base64') };
  expect(decodeGithubFile(file)).toBe(text); expect(() => decodeGithubFile({ ...file, content: '***' })).toThrow(); expect(() => decodeGithubFile({ ...file, size: 300_000 })).toThrow();
  expect(() => decodeGithubFile({ ...file, size: 2, content: 'AAE=' })).toThrow(/Binary/); expect(validGithubOwner('../wrong')).toBe(false); expect(publicWebUrl('https://example.com')).toBe('https://example.com/'); expect(publicWebUrl('httpjavascript:alert(1)')).toBe('');
});
