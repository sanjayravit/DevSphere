// Keep the legacy Vercel function URL, but use exactly the same authentication,
// authorization, actions and persistence as /api/ai/agent on the Express host.
export { default } from '../index.js';
export const config = { api: { bodyParser: false } };
