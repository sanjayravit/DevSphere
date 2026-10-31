import { GoogleGenerativeAI } from '@google/generative-ai';
import { boundedInteger, ServiceError } from '../utils/security.js';
function validateResult(result) {
  const response = result?.response;
  if (response?.promptFeedback?.blockReason || !Array.isArray(response?.candidates) || !response.candidates.length || response.candidates.some(candidate => candidate.finishReason !== 'STOP')) throw new ServiceError('AI output was blocked or incomplete; no result was accepted.', { code: 'GEMINI_INCOMPLETE' });
  const text = response.text();
  if (typeof text !== 'string' || !text.trim() || text.length > 200_000) throw new ServiceError('AI returned empty or oversized output.', { code: 'GEMINI_INVALID_OUTPUT' });
  return result;
}
export function getGeminiModel({ json = false } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new ServiceError('GEMINI_API_KEY is not configured.', { status: 503 });
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 8_192, ...(json ? { responseMimeType: 'application/json' } : {}) } });
  // The legacy SDK's `timeout` option leaves a referenced setTimeout alive even
  // after success. Its supported per-request signal bounds the same real call
  // without holding Node processes/serverless invocations open unnecessarily.
  const options = () => ({ signal: AbortSignal.timeout(boundedInteger(process.env.GEMINI_TIMEOUT_MS, 30_000, 1_000, 60_000)) });
  return {
    generateContent: async content => validateResult(await model.generateContent(content, options())),
    startChat: parameters => {
      const chat = model.startChat(parameters);
      return { sendMessage: async content => validateResult(await chat.sendMessage(content, options())) };
    }
  };
}
