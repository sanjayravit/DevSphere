import { describe, expect, it } from 'vitest';
import { errorMessage } from './errorMessage';

describe('renderable error messages', () => {
  it.each([
    [{ response: { data: { error: 'Sync unavailable.' } } }, 'Sync unavailable.'],
    [{ response: { data: { error: { code: 'UNAVAILABLE', message: 'Provider unavailable.' } } } }, 'Provider unavailable.'],
    [{ response: { data: { error: { code: 14 }, message: 'Try later.' } } }, 'Try later.'],
    [new Error('Network error'), 'Network error'],
    [{ code: 'UNAVAILABLE', message: 'Service unavailable.' }, 'Service unavailable.'],
    ['An error message', 'An error message'],
    [{ response: { data: { error: { message: { nested: 'not text' } }, details: { secret: 'do not display' } } }, message: 42 }, 'Fallback'],
    [null, 'Fallback'], [undefined, 'Fallback'], [[], 'Fallback'], [{}, 'Fallback'], [42, 'Fallback']
  ])('returns text for %j', (error, expected) => { expect(errorMessage(error, 'Fallback')).toBe(expected); });
  it('bounds error text without serializing arbitrary payloads', () => {
    expect(errorMessage({ message: 'x'.repeat(2000) }).length).toBe(1000);
    expect(errorMessage({ code: 'UNKNOWN', privateData: 'sensitive' })).not.toContain('sensitive');
  });
});
