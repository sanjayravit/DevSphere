// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../services/api';
import { LoginSignupPage } from './LoginSignupPage';
import { githubOAuthStartUrl } from '../services/githubOAuth';
const state = vi.hoisted(() => ({ accept: vi.fn(), navigate: vi.fn() }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ acceptBackendToken: state.accept }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate, useSearchParams: () => [new URLSearchParams(window.location.search)] }));
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); window.history.replaceState(null, '', '/login'); state.accept.mockResolvedValue({}); }); afterEach(cleanup);
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
