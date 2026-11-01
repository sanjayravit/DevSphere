import { readdir, readFile } from 'node:fs/promises';
const privateNames = ['JWT_SECRET', 'OPENAI_API_KEY', 'GITHUB_TOKEN', 'FIREBASE_PRIVATE_KEY', 'GEMINI_API_KEY', 'VERCEL_API_TOKEN', 'QA_RUNNER_TOKEN', 'GITHUB_CLIENT_SECRET', 'REDIS_URL'];
const knownSecrets = privateNames.flatMap(name => [process.env[name], process.env[`VITE_${name}`], process.env[`REACT_APP_${name}`]]).filter(s => s?.length >= 8);
let files = 0; const violations = [];
async function inspect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) await inspect(path);
    else if (/\.(js|css|html|map|json)$/.test(path)) {
      const text = await readFile(path, 'utf8'); files++;
      if (knownSecrets.some(s => text.includes(s)) || /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/.test(text)) violations.push(path);
    }
  }
}
await inspect('client/build');
if (violations.length) { console.error('Possible private credential in browser artifact:', violations.join(', ')); process.exitCode = 1; }
else console.log(`Checked ${files} browser artifacts: no known configured server credentials or supported private-key/token patterns found. This is not an exhaustive secret audit.`);
