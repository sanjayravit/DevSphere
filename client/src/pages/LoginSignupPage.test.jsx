// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../services/api';
import { LoginSignupPage } from './LoginSignupPage';
import { githubOAuthStartUrl } from '../services/githubOAuth';
const state = vi.hoisted(() => ({ accept: vi.fn(), navigate: vi.fn(), google: vi.fn(), login: vi.fn(), authError: '' }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ acceptBackendToken: state.accept, loginWithGoogle: state.google, login: state.login, authError: state.authError }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate, useSearchParams: () => [new URLSearchParams(window.location.search)] }));
beforeEach(() => { vi.clearAllMocks(); state.authError = ''; state.google.mockReset(); state.login.mockReset(); sessionStorage.clear(); window.history.replaceState(null, '', '/login'); state.accept.mockResolvedValue({}); }); afterEach(cleanup);
it('visiting an unrequested session fragment cannot sign this browser into an attacker\'s account', async () => {
  window.history.replaceState(null, '', '/login#token=attacker-owned-session&state=attacker-state'); render(<LoginSignupPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/did not start/); expect(state.accept).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled(); expect(window.location.hash).toBe('');
});
it('an initiated, matching frontend OAuth flow imports the token once through backend session validation', async () => {
  const stateNonce = new URL(githubOAuthStartUrl('/api')).searchParams.get('client_state'); window.history.replaceState(null, '', `/login#token=fixture-session&state=${stateNonce}`); render(<LoginSignupPage />);
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/dashboard', { replace: true })); expect(state.accept).toHaveBeenCalledExactlyOnceWith('fixture-session'); expect(window.location.hash).toBe('');
});
it('unconfigured backend OAuth remains a clear error on the login page, not a successful session or navigation', async () => {
  api.get.mockResolvedValue({ data: { githubOAuth: false } }); render(<LoginSignupPage />); fireEvent.click(screen.getByRole('button', { name: 'GitHub via server OAuth' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/); expect(state.accept).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled();
});

it('a structured auth API failure displays its message instead of crashing React', async () => {
  state.google.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Authentication service unavailable.' } } } });
  render(<LoginSignupPage />); fireEvent.click(screen.getByRole('button', { name: 'Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Authentication service unavailable.');
  expect(state.navigate).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Google' })).toBeEnabled();
});
it('an object-valued context error is also rendered safely on initial load', async () => {
  state.authError = { code: 'UNAVAILABLE', message: 'Session synchronization failed.' };
  render(<LoginSignupPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Session synchronization failed.');
});
it('malformed provider errors show a fallback, not raw objects or diagnostic details', async () => {
  state.google.mockRejectedValue({ response: { data: { error: { code: 7 }, details: { privateInfo: 'do not render' } } } });
  render(<LoginSignupPage />); fireEvent.click(screen.getByRole('button', { name: 'Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Authentication failed. Please try again.');
  expect(screen.getByRole('alert')).not.toHaveTextContent('do not render');
});
it('Firebase credential errors retain their friendly messages', async () => {
  state.google.mockRejectedValue({ code: 'auth/invalid-credential', message: 'Firebase error' });
  render(<LoginSignupPage />); fireEvent.click(screen.getByRole('button', { name: 'Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
});
