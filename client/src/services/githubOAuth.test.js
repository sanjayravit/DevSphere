// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { githubOAuthStartUrl, consumeGithubOAuthFragment } from './githubOAuth';
beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/login'); });
it('an attacker-supplied valid-looking session fragment cannot force this browser to sign into an unrequested account', () => {
  window.history.replaceState(null, '', '/login#token=attacker-session&state=attacker-state');
  expect(consumeGithubOAuthFragment).toThrow(/did not start/); expect(window.location.hash).toBe('');
});
it('a matching same-browser client nonce is mandatory, single-use and removed with the token fragment', () => {
  const start = new URL(githubOAuthStartUrl('/api')); expect(start.pathname).toBe('/api/auth/github'); const state = start.searchParams.get('client_state'); expect(state.length).toBeGreaterThanOrEqual(32);
  window.history.replaceState(null, '', `/login#token=fixture-session&state=${encodeURIComponent(state)}`); expect(consumeGithubOAuthFragment()).toBe('fixture-session'); expect(window.location.hash).toBe('');
  window.history.replaceState(null, '', `/login#token=fixture-session&state=${encodeURIComponent(state)}`); expect(consumeGithubOAuthFragment).toThrow(/did not start/);
});
it('a different browser flow and an expired flow cannot import the token', () => {
  githubOAuthStartUrl('/api'); window.history.replaceState(null, '', '/login#token=fixture&state=wrong-state'); expect(consumeGithubOAuthFragment).toThrow();
  const state = new URL(githubOAuthStartUrl('/api')).searchParams.get('client_state'); sessionStorage.setItem('devsphere:github-oauth', JSON.stringify({ nonce: state, startedAt: Date.now() - 11 * 60_000 }));
  window.history.replaceState(null, '', `/login#token=fixture&state=${state}`); expect(consumeGithubOAuthFragment).toThrow(/expired/);
});
