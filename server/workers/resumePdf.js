import { parentPort, workerData } from 'node:worker_threads';
import { PDFParse } from 'pdf-parse';

const parser = new PDFParse({ data: workerData.data, isEvalSupported: false, useSystemFonts: false });
try {
  const info = await parser.getInfo();
  if (!Number.isInteger(info.total) || info.total < 1 || info.total > 20) parentPort.postMessage({ error: 'LIMIT' });
  else {
    const result = await parser.getText({ first: 20 });
    parentPort.postMessage(typeof result.text === 'string' && result.text.length <= 60_000 ? { text: result.text } : { error: 'LIMIT' });
  }
} catch { parentPort.postMessage({ error: 'INVALID' }); }
finally { await parser.destroy(); }
