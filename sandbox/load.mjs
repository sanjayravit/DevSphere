import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
let text = ''; for await (const chunk of process.stdin) { text += chunk; if (text.length > 2_100_000) throw new Error('Input limit'); }
for (const file of JSON.parse(text)) {
  const path = resolve('/workspace', file.path);
  if (!path.startsWith('/workspace/') || file.path.includes('\\')) throw new Error('Unsafe path');
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content, { flag: 'wx' });
}
