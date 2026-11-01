// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import { V2WorkspacePage } from './V2WorkspacePage';
const state = vi.hoisted(() => ({ sockets: [], session: { user: { id: 'user-a' }, token: 'mock-browser-session' } }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ search: window.location.search }) }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => state.session }));
vi.mock('../services/socket', () => ({ socketOrigin: () => 'https://socket.example.test' }));
vi.mock('socket.io-client', () => ({ io: vi.fn((_origin, options) => { const socket = { options, events: {}, on: vi.fn((name, handler) => { socket.events[name] = handler; }), disconnect: vi.fn() }; state.sockets.push(socket); return socket; }) }));
const hash = 'b'.repeat(64);
const proposal = () => ({ issue: 'A specific helper defect', suggestedFix: 'A complete defensive helper change', confidence: 95, risk: 'medium', impact: 'module', repository: 'example/project', defaultBranch: 'trunk', baseSha: 'a'.repeat(40), decision: { decision: 'ask', reason: 'This exact change requires approval.' }, changes: [{ path: 'src/helper.js', operation: 'update', content: 'export const value = 2;', reason: 'A bounded helper change' }], qa: { status: 'passed', summary: 'Static checks only; target tests were not executed.', checks: [], executedTests: [] } });
const pendingRun = () => ({ id: 'run-a', runId: 'run-a', input: 'Improve the existing helper', mode: 'approval', status: 'pending_approval', approval: 'pending', approvalHash: hash, proposal: proposal(), events: [], createdAt: '2026-10-31T00:00:00Z' });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
let run;
let history;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); window.history.replaceState(null, '', '/v2'); state.sockets.length = 0; state.session = { user: { id: 'user-a' }, token: 'mock-browser-session' };
  run = pendingRun(); history = [];
  api.get.mockImplementation(async path => ({ data: path.startsWith('/v2/runs/') ? { run } : { runs: history } })); api.post.mockReset();
});
afterEach(cleanup);
async function selectPending() { history = [run]; render(<V2WorkspacePage />); fireEvent.click(await screen.findByRole('button', { name: /Improve the existing helper/ })); await screen.findByRole('button', { name: /Approve exact proposal/ }); }
async function submit(mode = 'manual') { fireEvent.change(screen.getByLabelText(/what should devsphere investigate/i), { target: { value: 'Improve the existing helper safely' } }); fireEvent.change(screen.getByLabelText(/execution mode/i), { target: { value: mode } }); fireEvent.click(screen.getByRole('button', { name: 'Run DevSphere' })); }

describe('connected V2 workspace UI contracts (HTTP/socket transports explicitly mocked)', () => {
  it('Manual mode shows the actual suggestion and no approval/execution action or fabricated PR', async () => {
    run = { ...run, mode: 'manual', status: 'suggested', approval: 'not-required', approvalHash: null }; run.proposal.decision.decision = 'suggest';
    api.post.mockResolvedValue({ data: run }); render(<V2WorkspacePage />); await submit();
    expect(await screen.findByText('A specific helper defect')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Approve exact/ })).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: '#1' })).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1); expect(api.post.mock.calls[0][0]).toBe('/v2/run'); expect(api.post.mock.calls[0][1].mode).toBe('manual');
  });
  it('Approval displays issue/fix/confidence/risk/impact/hash and sends exactly that hash only after an explicit click', async () => {
    await selectPending();
    expect(screen.getByText('A specific helper defect')).toBeInTheDocument(); expect(screen.getByText('A complete defensive helper change')).toBeInTheDocument(); expect(screen.getByText('95%')).toBeInTheDocument(); expect(screen.getByText('medium')).toBeInTheDocument(); expect(screen.getByText('module')).toBeInTheDocument(); expect(screen.getByText(hash)).toBeInTheDocument(); expect(api.post).not.toHaveBeenCalled();
    api.post.mockImplementation(async () => { run = { ...run, status: 'pull_request', approval: 'approved', pullNumber: 7, pullRequest: 'https://github.com/example/project/pull/7' }; return { data: run }; });
    fireEvent.click(screen.getByRole('button', { name: /Approve exact proposal/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/v2/runs/run-a/approve', { approvalHash: hash }));
    expect(await screen.findByRole('link', { name: '#7' })).toHaveAttribute('href', 'https://github.com/example/project/pull/7'); expect(screen.queryByRole('button', { name: /Approve exact/ })).not.toBeInTheDocument();
  });
  it('a stale approval is an error; it reloads authoritative history instead of displaying a successful execution', async () => {
    await selectPending(); api.post.mockImplementation(async () => { run = { ...run, status: 'rejected', approval: 'rejected' }; throw { response: { data: { error: 'Approval hash does not match the exact current proposal.' } } }; });
    fireEvent.click(screen.getByRole('button', { name: /Approve exact proposal/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/hash does not match/); expect(screen.queryByRole('button', { name: /Approve exact/ })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Verify merge/ })).not.toBeInTheDocument();
  });
  it('failed QA remains visibly failed and cannot expose approval or deployment actions', async () => {
    run.status = 'blocked'; run.approval = 'not-required'; run.proposal.qa.status = 'failed'; run.proposal.qa.summary = 'The generated source has a syntax error.'; history = [run]; render(<V2WorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Improve the existing helper/ }));
    expect(await screen.findByText('The generated source has a syntax error.')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Approve exact/ })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Verify merge/ })).not.toBeInTheDocument();
  });
  it('authenticated socket progress is correlated to the submitted request/run; foreign run events are ignored and listeners disconnect', async () => {
    const response = deferred(); api.post.mockReturnValue(response.promise); const page = render(<V2WorkspacePage />); await submit('approval');
    const socket = state.sockets[0]; expect(socket.options.auth.token).toBe('mock-browser-session');
    const requestId = api.post.mock.calls[0][1].requestId;
    await act(async () => { socket.events.connect(); socket.events['devsphere:update']({ runId: 'run-a', requestId, step: 'intent', status: 'running', at: '2026-10-31', detail: { message: 'Live owner progress' } }); socket.events['devsphere:update']({ runId: 'foreign-run', requestId: 'someone-else', step: 'intent', status: 'running', detail: { message: 'Private foreign progress' } }); });
    expect(await screen.findByText('Live owner progress')).toBeInTheDocument(); expect(screen.queryByText('Private foreign progress')).not.toBeInTheDocument();
    await act(async () => { response.resolve({ data: run }); }); await screen.findByText('A specific helper defect'); page.unmount(); expect(socket.disconnect).toHaveBeenCalled();
  });
  it('a background run response cannot overwrite a different run the user selected while waiting', async () => {
    const response = deferred(); api.post.mockReturnValue(response.promise); const older = { ...pendingRun(), id: 'older-run', input: 'Inspect the earlier run', proposal: { ...proposal(), issue: 'Earlier selected proposal' } }; history = [older];
    api.get.mockImplementation(async path => ({ data: path === '/v2/runs/older-run' ? { run: older } : path === '/v2/runs/run-a' ? { run } : { runs: history } }));
    render(<V2WorkspacePage />); await screen.findByRole('button', { name: /Inspect the earlier run/ }); await submit('approval'); fireEvent.click(screen.getByRole('button', { name: /Inspect the earlier run/ })); await screen.findByText('Earlier selected proposal');
    await act(async () => { response.resolve({ data: run }); }); expect(screen.getByText('Earlier selected proposal')).toBeInTheDocument(); expect(screen.queryByText('A specific helper defect')).not.toBeInTheDocument();
  });
  it('account changes remove old run data and a stale history request cannot repopulate it', async () => {
    const oldRequest = deferred(); api.get.mockReturnValue(oldRequest.promise); const page = render(<V2WorkspacePage />);
    state.session = { user: { id: 'user-b' }, token: 'mock-session-b' }; api.get.mockResolvedValue({ data: { runs: [] } }); page.rerender(<V2WorkspacePage />);
    await act(async () => { oldRequest.resolve({ data: { runs: [pendingRun()] } }); });
    expect(screen.queryByRole('button', { name: /Improve the existing helper/ })).not.toBeInTheDocument(); expect(state.sockets[0].disconnect).toHaveBeenCalled();
  });
});
it('an older in-flight detail response for the same run cannot downgrade the newly delivered proposal', async () => {
  const older = deferred(); const newer = deferred(); history = [run]; let details = 0;
  api.get.mockImplementation(path => path.startsWith('/v2/runs/') ? (++details === 1 ? older.promise : newer.promise) : Promise.resolve({ data: { runs: history } }));
  render(<V2WorkspacePage />); fireEvent.click(await screen.findByRole('button', { name: /Improve the existing helper/ }));
  await act(async () => { state.sockets[0].events.connect(); });
  const updated = { ...pendingRun(), status: 'pull_request', approval: 'approved', proposal: { ...proposal(), issue: 'Latest authoritative proposal' } };
  await act(async () => { newer.resolve({ data: { run: updated } }); }); expect(screen.getByText('Latest authoritative proposal')).toBeInTheDocument();
  await act(async () => { older.resolve({ data: { run: pendingRun() } }); }); expect(screen.getByText('Latest authoritative proposal')).toBeInTheDocument();
});

it('notification deep links select a different run without unmounting the existing V2 page', async () => {
  const page = render(<V2WorkspacePage />); await waitFor(() => expect(api.get).toHaveBeenCalled());
  window.history.replaceState(null, '', '/v2?runId=run-a'); page.rerender(<V2WorkspacePage />);
  expect(await screen.findByText('A specific helper defect')).toBeInTheDocument(); expect(api.get).toHaveBeenCalledWith('/v2/runs/run-a');
});
