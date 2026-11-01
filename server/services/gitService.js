import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Project from '../models/Project.js';
import { validateProjectFiles } from '../utils/repositorySafety.js';

const root = process.env.GIT_CACHE_DIR || (process.env.NODE_ENV === 'production' || process.env.VERCEL ? path.join(os.tmpdir(), 'devsphere-git-cache') : fileURLToPath(new URL('../git-cache/', import.meta.url)));
const locks = new Map();
async function serialized(projectId, work) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) throw new Error('Invalid project ID.');
  const previous = locks.get(projectId) || Promise.resolve();
  const task = previous.catch(() => {}).then(work);
  locks.set(projectId, task);
  try { return await task; } finally { if (locks.get(projectId) === task) locks.delete(projectId); }
}
async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe git cache directory.');
}
async function verifyMetadata(directory, depth = 0, budget = { count: 0 }) {
  if (depth > 16) throw new Error('Unsafe project git metadata depth.');
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (++budget.count > 20_000 || entry.isSymbolicLink()) throw new Error('Unsafe project git metadata; quarantine this cache.');
    if (entry.isDirectory()) await verifyMetadata(path.join(directory, entry.name), depth + 1, budget);
  }
}
async function localRepository(projectId) {
  await ensureDirectory(root);
  const directory = path.join(root, projectId);
  await ensureDirectory(directory);
  const templates = path.join(root, '.empty-templates');
  await ensureDirectory(templates);
  if ((await fs.readdir(templates)).length) throw new Error('Git isolation home must be empty.');
  const environment = Object.fromEntries(['PATH', 'LANG', 'TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(environment, { HOME: templates, XDG_CONFIG_HOME: templates, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
  const git = simpleGit({ baseDir: directory, allowEnvironment: ['GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT'] }).env(environment);
  const metadata = await fs.lstat(path.join(directory, '.git')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  // checkIsRepo() searches parent directories and previously treated THIS app's
  // checkout as the user's project repository. Never inherit a parent's .git.
  if (!metadata) {
    await git.init();
  } else if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unsafe project git metadata.');
  await verifyMetadata(path.join(directory, '.git'));
  for (const unsafe of ['commondir', 'objects/info/alternates', 'info/grafts']) {
    if (await fs.lstat(path.join(directory, '.git', unsafe)).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('Unsafe linked project Git metadata; quarantine this cache.');
  }
  const configuration = await fs.readFile(path.join(directory, '.git/config'), 'utf8');
  let section;
  const allowed = { core: new Set(['repositoryformatversion', 'filemode', 'bare', 'logallrefupdates', 'ignorecase', 'precomposeunicode']), user: new Set(['name', 'email']) };
  for (const line of configuration.split(/\r?\n/).map(value => value.trim())) {
    if (!line || /^[#;]/.test(line)) continue;
    const header = /^\[(core|user)\]$/i.exec(line);
    if (header) { section = header[1].toLowerCase(); continue; }
    const key = /^([a-z]+)\s*=/.exec(line);
    if (!key || !allowed[section]?.has(key[1].toLowerCase())) throw new Error('Unsafe legacy project Git configuration; quarantine this cache.');
  }
  const hooks = await fs.readdir(path.join(directory, '.git/hooks')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  if (hooks.some(name => !name.endsWith('.sample'))) throw new Error('Active project Git hooks are forbidden.');
  if (!metadata) { await git.addConfig('user.name', 'DevSphere'); await git.addConfig('user.email', 'developer@devsphere.local'); }
  if (path.resolve((await git.revparse(['--show-toplevel'])).trim()) !== path.resolve(directory)) throw new Error('Project git root does not match its isolated cache directory.');
  return { git, directory };
}
async function synchronize(directory, files) {
  const keep = new Set(files.map(file => file.name));
  async function clean(relative = '') {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (!relative && entry.name === '.git') continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in project git caches.');
      if (entry.isDirectory()) { await clean(name); if (![...keep].some(item => item.startsWith(`${name}/`))) await fs.rm(path.join(directory, name), { recursive: true }); }
      else if (!keep.has(name)) await fs.unlink(path.join(directory, name));
    }
  }
  await clean();
  for (const file of files) {
    const target = path.join(directory, file.name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, { flag: 'w' });
  }
}
export async function commitCode(projectId, message, authorName = 'Developer') {
  return serialized(projectId, async () => {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Project not found.');
    const files = validateProjectFiles(project.files);
    const { git, directory } = await localRepository(projectId);
    await synchronize(directory, files);
    await git.add('.');
    if ((await git.status()).isClean()) return { success: true, message: 'No changes to commit.', committed: false };
    const name = String(authorName).replace(/[<>\r\n\x00-\x1f]/g, '').slice(0, 80) || 'Developer';
    const email = `${createHash('sha256').update(projectId).digest('hex').slice(0, 16)}@users.devsphere.local`;
    const result = await git.commit(message || 'Commit from DevSphere', { '--author': `${name} <${email}>` });
    return { success: true, message: 'Changes committed successfully.', commitId: result.commit, committed: true };
  });
}
export async function getHistory(projectId) {
  return serialized(projectId, async () => {
    const { git } = await localRepository(projectId);
    if (!(await git.raw(['rev-list', '--max-count=1', '--all'])).trim()) return [];
    return (await git.log({ maxCount: 50 })).all;
  });
}
export default { commitCode, getHistory };
