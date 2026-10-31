import { generateIntent } from '../services/aiService.js';

export async function processIntent(input, options) {
  if (typeof input !== 'string' || input.trim().length < 8 || input.length > 12_000) throw new TypeError('Intent must be between 8 and 12,000 characters.');
  const intent = await generateIntent(input.trim(), options);
  if (!intent || typeof intent.summary !== 'string' || !Array.isArray(intent.steps) || intent.steps.length === 0 || !Array.isArray(intent.acceptanceCriteria)) throw new Error('Intent engine returned an invalid result.');
  return { ...intent, originalRequest: input.trim() };
}
