// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import api from '../services/api';
const state = vi.hoisted(() => ({ user: { id: 'user-a' } }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let context;
function Consumer() { context = useWorkspace(); return <div>{context.activeProject?.name}</div>; }
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); context = undefined; state.user = { id: 'user-a' }; api.post.mockReset();
  api.get.mockImplementation(async path => ({ data: path === '/workspaces' ? [{ id: `workspace-${state.user.id}`, name: state.user.id }] : [{ id: `project-${state.user.id}`, workspaceId: `workspace-${state.user.id}`, name: state.user.id }] }));
});
afterEach(cleanup);
async function ready() { const page = render(<WorkspaceProvider><Consumer /></WorkspaceProvider>); await waitFor(() => expect(context.activeProject?.id).toBe('project-user-a')); return page; }
it('pending project creation from a previous account cannot populate the new account workspace', async () => {
  const page = await ready(); const response = deferred(); api.post.mockReturnValue(response.promise);
  let creation; await act(async () => { creation = context.createProject('Old account project').catch(error => error); });
  state.user = { id: 'user-b' }; page.rerender(<WorkspaceProvider><Consumer /></WorkspaceProvider>); await waitFor(() => expect(context.activeProject?.id).toBe('project-user-b'));
  await act(async () => { response.resolve({ data: { id: 'old-project', name: 'Old account project', workspaceId: 'workspace-user-a' } }); await creation; });
  expect(context.activeProject.id).toBe('project-user-b'); expect(context.projects.map(project => project.id)).toEqual(['project-user-b']);
});
it('pending workspace creation is also account-scoped and cannot change the next account selection', async () => {
  const page = await ready(); const response = deferred(); api.post.mockReturnValue(response.promise);
  let creation; await act(async () => { creation = context.createWorkspace('Old workspace').catch(error => error); });
  state.user = { id: 'user-b' }; page.rerender(<WorkspaceProvider><Consumer /></WorkspaceProvider>); await waitFor(() => expect(context.activeWorkspace?.id).toBe('workspace-user-b'));
  await act(async () => { response.resolve({ data: { id: 'old-workspace', name: 'Old workspace' } }); await creation; });
  expect(context.activeWorkspace.id).toBe('workspace-user-b'); expect(context.workspaces.map(workspace => workspace.id)).toEqual(['workspace-user-b']);
});
it('active project preferences are stored under the authenticated account, never a shared global key', async () => {
  await ready(); await act(async () => { context.setActiveProject(context.projects[0]); });
  expect(localStorage.getItem('devsphere-active-project:user-a')).toBe('project-user-a'); expect(localStorage.getItem('activeProject')).toBeNull();
});
