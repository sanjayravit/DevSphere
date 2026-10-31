import OpenAI from 'openai';

const model = () => process.env.OPENAI_MODEL || 'gpt-4.1-mini';
let client;
const getClient = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
  client ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 45_000, maxRetries: 1 });
  return client;
};

export async function generateStructured(prompt, schemaName, schema, { signal } = {}) {
  const response = await getClient().responses.create({
    model: model(),
    input: prompt,
    text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } }
  }, signal ? { signal } : undefined);
  const text = response.output_text;
  if (!text) throw new Error('OpenAI returned no structured output.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('OpenAI returned malformed JSON.'); }
  return value;
}

export async function generateFix(errorMessage, codeSnippet, pastContext = '') {
  return generateStructured(`Suggest a cautious fix for this specific error. Return a complete replacement code snippet only when enough context is available; otherwise return an empty fixedCode.\nERROR: ${errorMessage}\nCODE:\n${codeSnippet || ''}\nCONTEXT:\n${pastContext}`, 'devsphere_legacy_fix', {
    type: 'object', additionalProperties: false, required: ['fixedCode', 'explanation'], properties: { fixedCode: { type: 'string' }, explanation: { type: 'string' } }
  });
}

export async function generateIntent(input, options) {
  return generateStructured(`Turn the following software-development request into a concise, safe implementation intent. Do not claim repository facts not provided.\n\nRequest:\n${input}`, 'devsphere_intent', {
    type: 'object', additionalProperties: false, required: ['summary', 'steps', 'acceptanceCriteria'], properties: {
      summary: { type: 'string' }, steps: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } }, acceptanceCriteria: { type: 'array', maxItems: 12, items: { type: 'string' } }
    }
  }, options);
}

export async function generatePlan(intent, options) {
  return generateStructured(`Create a minimal actionable plan for this intent. Prefer narrow, backward-compatible changes.\n${JSON.stringify(intent)}`, 'devsphere_plan', {
    type: 'object', additionalProperties: false, required: ['tasks', 'priority', 'risk', 'impact', 'confidence', 'issue', 'suggestedFix'], properties: {
      tasks: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } }, priority: { type: 'string', enum: ['low', 'normal', 'high'] }, risk: { type: 'string', enum: ['low', 'medium', 'high'] }, impact: { type: 'string', enum: ['file', 'module', 'system'] }, confidence: { type: 'number', minimum: 0, maximum: 100 }, issue: { type: 'string' }, suggestedFix: { type: 'string' }
    }
  }, options);
}

export async function generateFileChanges({ intent, plan, files }, options) {
  return generateStructured(`You are modifying an existing repository. Use the supplied tree and file contents. Return only complete changed file contents. Never produce secrets, credentials, environment files, generated binaries, lockfile changes, or files outside the relevant project. Make the smallest coherent patch. For every change explicitly classify create/update and include a short reason. Do not output a diff.\nINTENT: ${JSON.stringify(intent)}\nPLAN: ${JSON.stringify(plan)}\nREPOSITORY CONTEXT (bounded):\n${JSON.stringify(files)}`, 'devsphere_file_changes', {
    type: 'object', additionalProperties: false, required: ['changes'], properties: {
      changes: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['path', 'operation', 'content', 'reason'], properties: {
        path: { type: 'string' }, operation: { type: 'string', enum: ['create', 'update'] }, content: { type: 'string' }, reason: { type: 'string' }
      } } }
    }
  }, options);
}

export default { generateFix, generateIntent, generatePlan, generateFileChanges, generateStructured };
