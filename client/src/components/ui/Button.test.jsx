// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { Button } from './Button';
afterEach(cleanup);
it('loading disables actions even when the explicit disabled expression is false', () => {
  const click = vi.fn(); render(<Button isLoading disabled={false} onClick={click}>Submit</Button>);
  expect(screen.getByRole('button')).toBeDisabled(); fireEvent.click(screen.getByRole('button')); expect(click).not.toHaveBeenCalled();
});
