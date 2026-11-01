// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import api from './services/api';
import { V2WorkspacePage } from './pages/V2WorkspacePage';

vi.mock('./services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe('DevSphere V2 workspace', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockResolvedValue({ data: { runs: [] } });
  });

  it('renders the integrated V2 workspace and execution mode selector', async () => {
    render(<MemoryRouter initialEntries={['/v2']}><V2WorkspacePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /devsphere v2/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/what should devsphere investigate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/execution mode/i)).toHaveValue('assisted');
    expect(await screen.findByText(/saved runs will appear here/i)).toBeInTheDocument();
  });
});
