const STORAGE_KEY = 'devsphere:github-oauth';
export function githubOAuthStartUrl(apiBase = '/api') {
  const nonce = window.crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ nonce, startedAt: Date.now() }));
  const url = new URL(`${apiBase.replace(/\/$/, '')}/auth/github`, window.location.origin);
  url.searchParams.set('client_state', nonce);
  return url.href;
}
export function consumeGithubOAuthFragment() {
  const fragment = new URLSearchParams(window.location.hash.slice(1)); const token = fragment.get('token');
  if (!token) return null;
  // Remove the token before validation/navigation; never leave it in history.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { /* invalid client state */ }
  sessionStorage.removeItem(STORAGE_KEY);
  const age = Date.now() - pending?.startedAt;
  if (!pending?.nonce || fragment.get('state') !== pending.nonce || !Number.isFinite(age) || age < 0 || age > 10 * 60_000) throw new Error('This browser did not start this OAuth sign-in, or it expired. Start GitHub sign-in again.');
  return token;
}
