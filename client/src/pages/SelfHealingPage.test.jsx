// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { io } from 'socket.io-client';
import api from '../services/api';
import { SelfHealingPage } from './SelfHealingPage';
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../services/socket', () => ({ socketOrigin: () => 'https://socket.example.test' }));
vi.mock('../context/WorkspaceContext', () => ({ useWorkspace: () => ({ workspaces: [{ id: 'workspace-a', name: 'Workspace A' }], activeWorkspace: { id: 'workspace-a', name: 'Workspace A' }, projects: [], changeWorkspace: vi.fn() }) }));
vi.mock('socket.io-client', () => ({ io: vi.fn(() => ({ on: vi.fn(), disconnect: vi.fn() })) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('history completing after the page unmounts cannot create an orphaned authenticated monitoring connection', async () => {
  let resolve; api.get.mockReturnValue(new Promise(yes => { resolve = yes; })); const page = render(<SelfHealingPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Enable Monitoring on "Workspace A"/ })); page.unmount();
  await act(async () => { resolve({ data: { events: [] } }); }); expect(io).not.toHaveBeenCalled();
});
