import { readdir, readFile } from 'node:fs/promises';
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (entry.isFile() && entry.name.endsWith('.json')) JSON.parse(await readFile(path, 'utf8'));
  }
}
await check('/workspace');
