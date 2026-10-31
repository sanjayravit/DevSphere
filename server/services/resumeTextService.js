import { Worker } from 'node:worker_threads';
import { ServiceError, boundedInteger } from '../utils/security.js';

let activeWorkers = 0;

// Parsing attacker-controlled PDFs never blocks Express's event loop. This is a
// bounded worker, not a complete native-memory sandbox; deploy with OS limits.
export async function extractResumePdf(buffer, { timeoutMs = 10_000 } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ServiceError('The PDF is empty or invalid.', { status: 400 });
  if (buffer.length > 2 * 1024 * 1024) throw new ServiceError('The PDF exceeds the 2 MB upload limit.', { status: 413 });
  if (activeWorkers >= 2) throw new ServiceError('PDF extraction is busy. Retry after the current uploads finish.', { status: 429, retryAfter: 10 });
  activeWorkers += 1;
  let timer; let worker;
  try {
  const data = Uint8Array.from(buffer);
  worker = new Worker(new URL('../workers/resumePdf.js', import.meta.url), {
    workerData: { data }, transferList: [data.buffer],
    resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    env: { NODE_ENV: 'production' }
  });
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new ServiceError('PDF extraction exceeded its time limit.', { status: 413 })), boundedInteger(timeoutMs, 10_000, 1, 10_000));
      worker.once('message', message => {
        if (message?.error) return reject(new ServiceError(message.error === 'LIMIT' ? 'PDFs must have at most 20 pages and 60,000 extracted characters.' : 'Unable to read this PDF. Upload a valid, unencrypted PDF or TXT file.', { status: message.error === 'LIMIT' ? 413 : 400 }));
        if (typeof message?.text !== 'string' || message.text.length > 60_000) return reject(new ServiceError('Invalid or oversized PDF text.', { status: 413 }));
        resolve(message.text);
      });
      worker.once('error', () => reject(new ServiceError('PDF extraction failed or exceeded its resource limits.', { status: 413 })));
      worker.once('exit', () => reject(new ServiceError('PDF extraction ended without a result.', { status: 400 })));
    });
  } finally {
    clearTimeout(timer);
    try { if (worker) await worker.terminate(); } finally { activeWorkers -= 1; }
  }
}
