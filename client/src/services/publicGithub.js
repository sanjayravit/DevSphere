import axios from 'axios';
export const validGithubOwner = value => typeof value === 'string' && /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/.test(value);
export const validGithubRepo = value => typeof value === 'string' && /^[A-Za-z\d_.-]{1,100}$/.test(value) && !['.', '..'].includes(value);
export const encodeGithubPath = path => path.split('/').map(encodeURIComponent).join('/');
export async function getPublicGithub(path, signal) {
  return (await axios.get(`https://api.github.com${path}`, { signal, timeout: 15_000, headers: { Accept: 'application/vnd.github+json' } })).data;
}
export function githubError(error) {
  return error.response?.status === 404 ? 'The public GitHub user, repository or path was not found.'
    : [403, 429].includes(error.response?.status) ? 'GitHub denied access or its API rate limit was reached. Retry later.'
      : 'GitHub could not be reached or returned invalid data. Retry the request.';
}
export function decodeGithubFile(file) {
  if (file?.type !== 'file' || file.encoding !== 'base64' || !Number.isInteger(file.size) || file.size < 0 || file.size > 250_000 || typeof file.content !== 'string' || file.content.length > 400_000) throw new Error('Only UTF-8 text files up to 250 KB can be previewed.');
  const base64 = file.content.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('GitHub returned invalid file data.');
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  if (bytes.length !== file.size || bytes.includes(0)) throw new Error('Binary or incomplete files cannot be previewed.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('This file is not valid UTF-8 text.'); }
}
export function publicWebUrl(value) {
  try { const url = new URL(value?.startsWith('http') ? value : `https://${value}`); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
