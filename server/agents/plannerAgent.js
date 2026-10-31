import { generatePlan } from '../services/aiService.js';

export async function plannerAgent(intent, options) {
  if (!intent?.summary || !Array.isArray(intent.steps) || !intent.steps.length) throw new TypeError('A validated intent is required.');
  const plan = await generatePlan(intent, options);
  if (!Array.isArray(plan.tasks) || !plan.tasks.length || !['low', 'medium', 'high'].includes(plan.risk) || !['file', 'module', 'system'].includes(plan.impact) || !Number.isFinite(plan.confidence)) throw new Error('Planner returned an invalid plan.');
  return { ...plan, tasks: plan.tasks.slice(0, 12) };
}
