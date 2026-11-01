// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../services/api';
import { CodeEditorPage } from './CodeEditorPage';
const state = vi.hoisted(() => ({ projectId: 'project-a', socket: { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn(), connect: vi.fn() } }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../services/socket', () => ({ default: state.socket }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ projectId: state.projectId }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a', name: 'Developer' }, token: 'mock-session' }) }));
vi.mock('../context/WorkspaceContext', () => ({ useWorkspace: () => ({ setActiveProject: vi.fn() }) }));
vi.mock('@monaco-editor/react', () => ({ default: ({ value, onChange }) => <textarea aria-label="Code buffer" value={value || ''} onChange={event => onChange?.(event.target.value)} /> }));
const project = id => ({ id, workspaceId: 'workspace-a', name: id, version: 4, files: [{ name: 'first.js', content: `export const first = '${id}';`, language: 'javascript' }, { name: 'second.js', content: 'export const second = 2;', language: 'javascript' }], chatHistory: [] });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => {
  state.projectId = 'project-a'; vi.clearAllMocks(); api.post.mockReset();
  api.get.mockImplementation(async path => ({ data: path.endsWith('/history') ? [] : project(state.projectId) })); api.put.mockImplementation(async (_path, body) => ({ data: { ...project(state.projectId), ...body, version: body.version + 1 } }));
});
afterEach(cleanup);
async function ready() { const page = render(<CodeEditorPage />); await waitFor(() => expect(screen.getByLabelText('Code buffer')).toHaveValue(project('project-a').files[0].content)); return page; }
async function optimize(response) { api.post.mockReturnValue(response.promise); fireEvent.click(screen.getByRole('button', { name: 'Copilot' })); fireEvent.click(screen.getByRole('button', { name: /Optimize/ })); await waitFor(() => expect(api.post).toHaveBeenCalled()); }
it('versioned save contains current edits, and switching file tabs is not broadcast as a collaborator edit', async () => {
  await ready(); state.socket.emit.mockClear(); fireEvent.click(screen.getAllByRole('button', { name: 'second.js' })[0]); expect(state.socket.emit).not.toHaveBeenCalledWith('code-change', expect.anything());
  fireEvent.change(screen.getByLabelText('Code buffer'), { target: { value: 'export const edited = true;' } }); fireEvent.click(screen.getByRole('button', { name: /Save to Cloud/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/projects/project-a/files', expect.objectContaining({ version: 4, files: expect.arrayContaining([expect.objectContaining({ name: 'second.js', content: 'export const edited = true;' })]) })));
});
it('a slow AI response cannot overwrite local edits made after the AI request', async () => {
  await ready(); const response = deferred(); await optimize(response);
  fireEvent.change(screen.getByLabelText('Code buffer'), { target: { value: 'export const newerLocalEdit = true;' } });
  await act(async () => { response.resolve({ data: { result: 'export const oldAIResult = true;' } }); });
  expect(screen.getByLabelText('Code buffer')).toHaveValue('export const newerLocalEdit = true;'); expect(screen.getByRole('alert')).toHaveTextContent(/changed.*AI|AI.*changed/i);
});
it('AI replacement targets the original file, not the tab selected while waiting', async () => {
  await ready(); const response = deferred(); await optimize(response); fireEvent.click(screen.getAllByRole('button', { name: 'second.js' })[0]);
  await act(async () => { response.resolve({ data: { result: 'export const optimized = true;' } }); });
  expect(screen.getByLabelText('Code buffer')).toHaveValue('export const second = 2;'); fireEvent.click(screen.getByRole('button', { name: /Save to Cloud/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/projects/project-a/files', expect.objectContaining({ files: [expect.objectContaining({ name: 'first.js', content: 'export const optimized = true;' }), expect.objectContaining({ name: 'second.js', content: 'export const second = 2;' })] })));
});
it('a response from the prior project cannot change the newly selected project editor', async () => {
  const page = await ready(); const response = deferred(); await optimize(response); state.projectId = 'project-b'; page.rerender(<CodeEditorPage />);
  await waitFor(() => expect(screen.getByLabelText('Code buffer')).toHaveValue(project('project-b').files[0].content));
  await act(async () => { response.resolve({ data: { result: 'export const wrongProject = true;' } }); });
  expect(screen.getByLabelText('Code buffer')).toHaveValue(project('project-b').files[0].content);
});
it('changing editor language persists its metadata and never rewrites actual source/comment-like string contents', async () => {
  await ready(); const source = '// Welcome to DevSphere in actual source\nconst message = `\n// unchanged string contents\n`;';
  fireEvent.change(screen.getByLabelText('Code buffer'), { target: { value: source } }); fireEvent.change(screen.getByLabelText('Editor language'), { target: { value: 'python' } });
  expect(screen.getByLabelText('Code buffer')).toHaveValue(source); fireEvent.click(screen.getByRole('button', { name: /Save to Cloud/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/projects/project-a/files', expect.objectContaining({ files: expect.arrayContaining([expect.objectContaining({ language: 'python', content: source })]) })));
});
