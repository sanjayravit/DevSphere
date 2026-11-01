// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import api from '../services/api';
import * as firebase from 'firebase/auth';
const state = vi.hoisted(() => ({ auth: { currentUser: null }, observer: null }));
vi.mock('../firebase', () => ({ auth: state.auth, googleProvider: {}, githubProvider: {}, firebaseConfigurationError: '' }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn((_auth, observer) => { state.observer = observer; queueMicrotask(() => observer(state.auth.currentUser)); return () => { state.observer = null; }; }),
  signInWithPopup: vi.fn(), signInWithEmailAndPassword: vi.fn(), createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(async () => { state.auth.currentUser = null; state.observer?.(null); }),
  updateProfile: vi.fn(async () => {}), fetchSignInMethodsForEmail: vi.fn(), linkWithCredential: vi.fn(), GithubAuthProvider: { credentialFromError: vi.fn() }
}));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const firebaseUser = uid => ({ uid, email: `${uid}@example.com`, getIdToken: vi.fn(async () => `mock-firebase-token-${uid}`) });
let session;
function Consumer() { session = useAuth(); return <div>{session.user?.id || 'anonymous'}</div>; }
async function ready() { render(<AuthProvider><Consumer /></AuthProvider>); await waitFor(() => expect(session?.loading).toBe(false)); }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); session = undefined; state.auth.currentUser = null; api.get.mockReset(); api.post.mockReset(); });
afterEach(cleanup);

describe('authenticated session lifecycle', () => {
  it('a Firebase observer callback during explicit sign-in does not invalidate the successful backend synchronization', async () => {
    await ready();
    const user = firebaseUser('user-a'); const backend = deferred(); api.post.mockReturnValue(backend.promise);
    firebase.signInWithEmailAndPassword.mockImplementation(async () => { state.auth.currentUser = user; return { user }; });
    let action;
    await act(async () => { action = session.login('user-a@example.com', 'not-a-production-password').then(value => ({ value }), error => ({ error })); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await act(async () => { state.observer(user); });
    let outcome;
    await act(async () => { backend.resolve({ data: { user: { id: 'user-a' }, token: 'mock-backend-session-a' } }); outcome = await action; });
    expect(outcome.error).toBeUndefined(); expect(session.user.id).toBe('user-a'); expect(localStorage.getItem('token')).toBe('mock-backend-session-a');
  });
  it('registration synchronizes the chosen name once, after profile update, even when Firebase emits immediately', async () => {
    await ready(); const user = firebaseUser('new-user');
    firebase.createUserWithEmailAndPassword.mockImplementation(async () => { state.auth.currentUser = user; state.observer(user); return { user }; });
    api.post.mockResolvedValue({ data: { user: { id: 'new-user', name: 'Chosen Name' }, token: 'mock-new-session' } });
    await act(async () => { await session.register('Chosen Name', 'new-user@example.com', 'not-a-production-password'); });
    expect(api.post).toHaveBeenCalledTimes(1); expect(api.post.mock.calls[0][1]).toEqual({ idToken: 'mock-firebase-token-new-user', name: 'Chosen Name' });
    expect(firebase.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Chosen Name' }); expect(session.user.name).toBe('Chosen Name');
  });
  it('logout invalidates in-flight sign-in work and never restores a stale account or token', async () => {
    await ready(); const user = firebaseUser('user-a'); const backend = deferred(); api.post.mockReturnValue(backend.promise);
    firebase.signInWithEmailAndPassword.mockImplementation(async () => { state.auth.currentUser = user; return { user }; });
    let action; await act(async () => { action = session.login('user-a@example.com', 'test-password').catch(error => error); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await act(async () => { await session.logout(); backend.resolve({ data: { user: { id: 'user-a' }, token: 'stale-token' } }); await action; });
    expect(session.user).toBeNull(); expect(localStorage.getItem('token')).toBeNull();
  });
  it('stored backend tokens are validated, rather than accepted by decoding untrusted JWT claims', async () => {
    localStorage.setItem('token', 'expired-test-session'); api.get.mockRejectedValue({ response: { data: { error: 'Session expired.' } } });
    await ready(); expect(api.get).toHaveBeenCalledWith('/auth/me', { headers: { Authorization: 'Bearer expired-test-session' } });
    expect(session.user).toBeNull(); expect(localStorage.getItem('token')).toBeNull(); expect(session.authError).toBe('Session expired.');
  });
  it('an explicit OAuth backend session is verified and supersedes an older Firebase identity', async () => {
    await ready(); state.auth.currentUser = firebaseUser('old-account'); api.get.mockResolvedValue({ data: { id: 'oauth-account' } });
    await act(async () => { await session.acceptBackendToken('mock-oauth-token'); });
    expect(firebase.signOut).toHaveBeenCalled(); expect(state.auth.currentUser).toBeNull(); expect(session.user.id).toBe('oauth-account');
  });
  it('a malformed backend result cannot create a successful browser session', async () => {
    await ready(); const user = firebaseUser('user-a');
    firebase.signInWithEmailAndPassword.mockImplementation(async () => { state.auth.currentUser = user; return { user }; }); api.post.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    await act(async () => { await expect(session.login('a@example.com', 'test-password')).rejects.toThrow(/invalid session/); });
    expect(session.user).toBeNull(); expect(localStorage.getItem('token')).toBeNull();
  });
});

it('a backend OAuth session remains authoritative when Firebase later emits null or a different user', async () => {
  await ready(); api.get.mockResolvedValue({ data: { id: 'oauth-owner' } });
  await act(async () => { await session.acceptBackendToken('mock-oauth-session'); });
  const other = firebaseUser('firebase-other'); state.auth.currentUser = other;
  await act(async () => { await state.observer(other); await state.observer(null); });
  expect(session.user.id).toBe('oauth-owner'); expect(api.post).not.toHaveBeenCalled(); expect(session.token).toBe('mock-oauth-session');
});
it('a failed Firebase sign-out cannot resurrect the locally logged-out session on token refresh', async () => {
  await ready(); api.get.mockResolvedValue({ data: { id: 'owner' } }); await act(async () => { await session.acceptBackendToken('mock-session'); });
  firebase.signOut.mockRejectedValueOnce(new Error('network unavailable'));
  await act(async () => { await expect(session.logout()).rejects.toThrow('network unavailable'); });
  state.auth.currentUser = firebaseUser('old-user'); await act(async () => { await state.observer(state.auth.currentUser); });
  expect(session.user).toBeNull(); expect(session.token).toBeNull(); expect(localStorage.getItem('token')).toBeNull(); expect(api.post).not.toHaveBeenCalled();
});
it('a failed sign-out while switching to OAuth cannot silently restore the previous Firebase account', async () => {
  await ready(); const user = firebaseUser('previous-user'); state.auth.currentUser = user;
  api.post.mockResolvedValue({ data: { token: 'mock-firebase-session', user: { id: user.uid } } }); await act(async () => { await state.observer(user); });
  firebase.signOut.mockRejectedValueOnce(new Error('network unavailable'));
  await act(async () => { await expect(session.acceptBackendToken('mock-new-oauth')).rejects.toThrow('network unavailable'); await state.observer(user); });
  expect(session.user).toBeNull(); expect(localStorage.getItem('token')).toBeNull(); expect(api.post).toHaveBeenCalledTimes(1);
});
it('a session changed in another browser tab is validated before the new account renders, and cross-tab logout clears it', async () => {
  await ready(); api.get.mockResolvedValue({ data: { id: 'second-tab-owner' } });
  await act(async () => { localStorage.setItem('token', 'mock-second-tab-token'); window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: 'mock-second-tab-token' })); });
  expect(session.user?.id).toBe('second-tab-owner'); expect(session.token).toBe('mock-second-tab-token');
  await act(async () => { localStorage.removeItem('token'); window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: null })); });
  expect(session.user).toBeNull(); expect(session.token).toBeNull();
});
it('cross-tab validation never removes the other tab\'s valid token while the network request is pending', async () => {
  await ready(); const response = deferred(); api.get.mockReturnValue(response.promise);
  await act(async () => { localStorage.setItem('token', 'mock-other-tab'); window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: 'mock-other-tab' })); });
  expect(localStorage.getItem('token')).toBe('mock-other-tab');
  await act(async () => { response.resolve({ data: { id: 'other-owner' } }); }); expect(session.user.id).toBe('other-owner');
});

it('structured backend sync errors remain strings and cannot establish a session', async () => {
  await ready(); const user = firebaseUser('user-a');
  firebase.signInWithEmailAndPassword.mockImplementation(async () => { state.auth.currentUser = user; return { user }; });
  api.post.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL', message: 'Sync is unavailable.' } } } });
  await act(async () => { await expect(session.login('a@example.com', 'test-password')).rejects.toBeDefined(); });
  expect(session.authError).toBe('Sync is unavailable.'); expect(session.user).toBeNull(); expect(session.token).toBeNull(); expect(localStorage.getItem('token')).toBeNull();
});
it('initial Firebase synchronization failure preserves a renderable context error', async () => {
  state.auth.currentUser = firebaseUser('user-a');
  api.post.mockRejectedValue({ response: { data: { error: { code: 'UNAVAILABLE', message: 'Try again later.' } } } });
  await ready(); expect(session.authError).toBe('Try again later.'); expect(session.user).toBeNull();
});
