import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const MEMORY_DIR_NAME = 'memory';
const LONG_TERM_FILE = 'MEMORY.md';
const DAILY_FILE = /^\d{4}-\d{2}-\d{2}\.md$/;
const MAX_QUERY_LENGTH = 2_000;
const MAX_CONTENT_LENGTH = 200_000;
const MAX_RESULTS = 20;

export interface PlatformMemorySearchResult {
  readonly snippet: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly score: number;
  readonly source: 'keyword';
  readonly contentSource: 'memory';
  readonly updatedAt: number;
}

export interface PlatformMemoryReadResult {
  readonly path: string;
  readonly text: string;
}

export interface PlatformMemoryMutationResult {
  readonly success: boolean;
  readonly file?: string;
  readonly message?: string;
  readonly error?: string;
}

function memoryRoot(): string {
  // Honour the shared `UPUP_HOME` override alongside the dedicated
  // `UPUP_MEMORY_DIR` escape hatch (same shape as `mcp.ts` / `heartbeat.ts`).
  return process.env.UPUP_MEMORY_DIR?.trim() || join(process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup'), MEMORY_DIR_NAME);
}

function displayName(file: string): string {
  if (file === 'long_term') return LONG_TERM_FILE;
  if (file === 'daily') return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.md`;
  return file;
}

async function resolveMemoryPath(input: string, root = memoryRoot()): Promise<string> {
  const path = input.trim();
  if (!path) throw new Error('memory path must not be empty');
  const resolvedRoot = await realpath(resolve(root)).catch(() => resolve(root));
  const candidate = resolve(resolvedRoot, displayName(path));
  const relativePath = relative(resolvedRoot, candidate);
  if (relativePath === '..' || relativePath.startsWith(`..${requireSeparator()}`) || relativePath.includes(requireSeparator() + '..' + requireSeparator()) || candidate === resolvedRoot) {
    throw new Error(`memory path escapes the memory directory: ${input}`);
  }
  if (!candidate.endsWith('.md')) throw new Error(`memory path must be a markdown file: ${input}`);
  if (path.includes('\0')) throw new Error('memory path contains an invalid character');
  const parent = await realpath(dirname(candidate)).catch(() => resolve(dirname(candidate)));
  const existing = await realpath(candidate).catch(() => join(parent, candidate.slice(parent.length).replace(/^[/\\]+/, '')));
  const existingRelative = relative(resolvedRoot, existing);
  if (existingRelative === '..' || existingRelative.startsWith(`..${requireSeparator()}`) || existingRelative.includes(requireSeparator() + '..' + requireSeparator())) {
    throw new Error(`memory path escapes the memory directory: ${input}`);
  }
  return existing;
}

function requireSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

function publicPath(path: string, root = memoryRoot()): string {
  return relative(root, path).split(requireSeparator()).join('/');
}

async function ensureRoot(root = memoryRoot()): Promise<void> {
  await mkdir(root, { recursive: true });
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function listMemoryFiles(root = memoryRoot()): Promise<string[]> {
  await ensureRoot(root);
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && (entry.name === LONG_TERM_FILE || DAILY_FILE.test(entry.name)))
    .map((entry) => entry.name)
    .sort();
}

function normalizeQuery(query: string): string[] {
  if (!query.trim()) throw new Error('memory query must not be empty');
  if (query.length > MAX_QUERY_LENGTH) throw new Error(`memory query exceeds ${MAX_QUERY_LENGTH} characters`);
  return [...new Set(query.toLowerCase().split(/\s+/).map((part) => part.trim()).filter(Boolean))];
}

export async function platformMemorySearch(input: { query: string; use_rag?: boolean }, root = memoryRoot()): Promise<{ results: PlatformMemorySearchResult[]; ragAnswer: string | null }> {
  const terms = normalizeQuery(input.query);
  const results: PlatformMemorySearchResult[] = [];
  for (const file of await listMemoryFiles(root)) {
    const path = join(root, file);
    const content = await readFile(path, 'utf8').catch(() => '');
    if (!content) continue;
    const lines = content.split('\n');
    const lower = content.toLowerCase();
    const hits = terms.reduce((count, term) => count + (lower.match(new RegExp(escapeRegExp(term), 'g'))?.length ?? 0), 0);
    if (hits === 0) continue;
    const firstLine = Math.max(0, lines.findIndex((line) => terms.some((term) => line.toLowerCase().includes(term))));
    const startLine = firstLine + 1;
    const snippet = lines.slice(firstLine, Math.min(lines.length, firstLine + 4)).join('\n').trim().slice(0, 2_000);
    const fileStat = await stat(path).catch(() => ({ mtimeMs: 0 }));
    results.push({ snippet, path: publicPath(path, root), startLine, endLine: startLine + Math.max(0, snippet.split('\n').length - 1), score: hits / terms.length, source: 'keyword', contentSource: 'memory', updatedAt: fileStat.mtimeMs });
  }
  results.sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt || left.path.localeCompare(right.path));
  return { results: results.slice(0, MAX_RESULTS), ragAnswer: input.use_rag ? null : null };
}

export async function platformMemoryGet(input: { path: string; from?: number; lines?: number }, root = memoryRoot()): Promise<PlatformMemoryReadResult> {
  const path = await resolveMemoryPath(input.path, root);
  await ensureRoot(root);
  await access(path, constants.F_OK).catch(() => undefined);
  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text) return { path: displayName(input.path), text: '' };
  const content = text.split('\n');
  const start = Math.max(1, Math.floor(input.from ?? 1));
  const limit = input.lines === undefined ? content.length : Math.max(0, Math.floor(input.lines));
  return { path: displayName(input.path), text: content.slice(start - 1, start - 1 + limit).join('\n') };
}

export async function platformMemoryUpdate(input: { content?: string; action?: 'append' | 'edit' | 'delete'; file?: string; old_text?: string; new_text?: string }, root = memoryRoot()): Promise<PlatformMemoryMutationResult> {
  const action = input.action ?? 'append';
  const file = input.file ?? 'long_term';
  const path = await resolveMemoryPath(file, root);
  const name = displayName(file);
  if (action === 'append') {
    if (!input.content) return { success: false, file: name, error: '"content" is required for append.' };
    if (input.content.length > MAX_CONTENT_LENGTH) return { success: false, file: name, error: `content exceeds ${MAX_CONTENT_LENGTH} characters` };
    const previous = await readFile(path, 'utf8').catch(() => '');
    await atomicWrite(path, `${previous}${previous && !previous.endsWith('\n') ? '\n' : ''}${input.content}`);
    return { success: true, file: name, message: `Appended ${input.content.length} characters to ${name}` };
  }
  if (!input.old_text || (action === 'edit' && input.new_text === undefined)) return { success: false, file: name, error: action === 'edit' ? '"old_text" and "new_text" are required for edit.' : '"old_text" is required for delete.' };
  const previous = await readFile(path, 'utf8').catch(() => '');
  if (!previous.includes(input.old_text)) return { success: false, file: name, error: `Could not find the specified text in ${name}. Use memory_get to verify the exact content.` };
  const updated = action === 'edit' ? previous.replace(input.old_text, input.new_text!) : previous.replace(input.old_text, '').replace(/\n{3,}/g, '\n\n');
  await atomicWrite(path, updated);
  return { success: true, file: name, message: action === 'edit' ? `Updated entry in ${name}` : `Removed entry from ${name}` };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
