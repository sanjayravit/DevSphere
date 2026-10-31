// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import { RepositoryViewerPage } from './RepositoryViewerPage';
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ owner: 'example', repoName: 'project' }), useNavigate: () => vi.fn() }));
vi.mock('@monaco-editor/react', () => ({ default: ({ value }) => <pre data-testid="source">{value}</pre> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const file = name => ({ type: 'file', name, path: name, size: 1, sha: 'same-blob-is-valid', download_url: 'https://never-follow.invalid/file' });
const response = text => ({ data: { type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64'), size: Buffer.byteLength(text) } });
it('late file responses never overwrite the newer selected source, and supplied download URLs are not fetched', async () => {
  const first = deferred(); const second = deferred(); axios.get.mockResolvedValueOnce({ data: [file('first.js'), file('second.js')] }).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<RepositoryViewerPage />); await screen.findByRole('button', { name: 'first.js' });
  fireEvent.click(screen.getByRole('button', { name: 'first.js' })); fireEvent.click(screen.getByRole('button', { name: 'second.js' }));
  await act(async () => { second.resolve(response('second source')); }); expect(screen.getByTestId('source')).toHaveTextContent('second source');
  await act(async () => { first.resolve(response('stale first source')); }); expect(screen.getByTestId('source')).toHaveTextContent('second source');
  expect(axios.get.mock.calls.every(([url]) => url.startsWith('https://api.github.com/repos/example/project/contents'))).toBe(true);
});
it('GitHub rate limit failures are errors, not a successful empty directory', async () => {
  axios.get.mockRejectedValue({ response: { status: 403 } }); render(<RepositoryViewerPage />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rate limit/)); expect(screen.queryByText('Empty Directory')).not.toBeInTheDocument();
});
