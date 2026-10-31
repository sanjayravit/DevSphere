export function detectErrors(_commitData, logs) {
  if (typeof logs !== 'string' || !logs.trim()) return { error: 'No immediate errors detected.', file: null, line: null, codeSnippet: '' };
  const match = logs.match(/(?:Error|TypeError|ReferenceError):\s*([^\n\r]+)/i);
  const location = logs.match(/at\s+(?:.*?\s+)?\(?([^:)]+):(\d+):(\d+)\)?/i);
  return { error: match?.[1]?.trim() || 'No immediate errors detected.', file: location?.[1] || null, line: location ? Number(location[2]) : null, codeSnippet: '' };
}
export default { detectErrors };
