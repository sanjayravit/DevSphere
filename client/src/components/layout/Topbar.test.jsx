// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../../services/api';
import { Topbar } from './Topbar';
const state = vi.hoisted(() => ({ events: {}, navigate: vi.fn(), socket: { connected: true, connect: vi.fn(), on: vi.fn((name, callback) => { state.events[name] = callback; }), off: vi.fn() } }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/socket', () => ({ default: state.socket }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a', name: 'Developer' }, token: 'mock-session' }) }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ activeWorkspace: { name: 'Workspace' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
beforeEach(() => { vi.clearAllMocks(); state.events = {}; api.get.mockReset(); }); afterEach(cleanup);
const run = { id: 'real-run', status: 'pending_approval', issue: 'Review this actual proposal', updatedAt: '2026-10-31' };
it('owner-scoped live events refresh real run notifications and link to that exact run; listeners are cleaned up', async () => {
  api.get.mockResolvedValue({ data: { runs: [] } }); const page = render(<Topbar />); await waitFor(() => expect(api.get).toHaveBeenCalled());
  api.get.mockResolvedValue({ data: { runs: [run] } }); await act(async () => { state.events['devsphere:update']({ runId: run.id, step: 'decision', status: 'ask' }); });
  const notification = await screen.findByText(/Review this actual proposal/); fireEvent.click(notification); expect(state.navigate).toHaveBeenCalledWith('/v2?runId=real-run');
  page.unmount(); expect(state.socket.off).toHaveBeenCalledWith('devsphere:update', expect.any(Function));
});
it('an expired/unavailable history refresh remains visible even when older notifications exist', async () => {
  api.get.mockResolvedValue({ data: { runs: [run] } }); render(<Topbar />); await screen.findByText(/Review this actual proposal/);
  api.get.mockRejectedValue({ response: { status: 401 } }); fireEvent.click(screen.getByRole('button', { name: 'Run notifications' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/session expired/)); expect(screen.getByText(/Review this actual proposal/)).toBeInTheDocument();
});
