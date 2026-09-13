import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep, basename } from 'node:path';

export interface PlatformNotebookCell { cell_type: 'code' | 'markdown'; source: string[]; metadata?: Record<string, unknown>; outputs?: unknown[]; execution_count?: number | null; }
export interface PlatformNotebook { nbformat: number; nbformat_minor: number; metadata: Record<string, unknown>; cells: PlatformNotebookCell[]; }
export interface PlatformNotebookResult { message?: string; notebook?: PlatformNotebook; path?: string; }

const MAX_SOURCE_LENGTH = 1_000_000;

function emptyNotebook(kernel = 'python3'): PlatformNotebook {
  return { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { display_name: kernel, language: 'python', name: kernel }, language_info: { name: 'python' } }, cells: [] };
}

function cell(type: 'code' | 'markdown', source: string): PlatformNotebookCell {
  const lines = source.split('\n').map((line, index, all) => index < all.length - 1 ? `${line}\n` : line);
  return { cell_type: type, source: lines, metadata: {}, ...(type === 'code' ? { outputs: [], execution_count: null } : {}) };
}

function validNotebook(value: unknown): value is PlatformNotebook {
  if (!value || typeof value !== 'object') return false;
  const notebook = value as Partial<PlatformNotebook>;
  return typeof notebook.nbformat === 'number' && Array.isArray(notebook.cells) && typeof notebook.metadata === 'object' && notebook.metadata !== null;
}

function inside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

async function notebookPath(input: string, cwd: string, mustExist: boolean): Promise<string> {
  if (!input.trim() || extname(input).toLowerCase() !== '.ipynb') throw new Error('path must be a .ipynb notebook');
  const root = await realpath(cwd);
  const candidate = resolve(root, input);
  const parent = await realpath(dirname(candidate)).catch(() => resolve(dirname(candidate)));
  const normalized = await realpath(candidate).catch(() => join(parent, candidate.slice(parent.length).replace(/^[/\\]+/, '')));
  if (!inside(root, normalized)) throw new Error(`path escapes the workspace: ${input}`);
  if (mustExist) await access(normalized);
  return normalized;
}

async function readNotebook(input: string, cwd: string): Promise<{ path: string; notebook: PlatformNotebook }> {
  const path = await notebookPath(input, cwd, true);
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!validNotebook(value)) throw new Error('invalid Jupyter notebook JSON');
  return { path, notebook: value };
}

async function writeNotebook(path: string, notebook: PlatformNotebook): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(notebook, null, 1)}\n`, 'utf8'); await rename(temporary, path); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
}

export async function platformNotebookRead(input: { path: string }, cwd = process.cwd()): Promise<PlatformNotebookResult> {
  const { path, notebook } = await readNotebook(input.path, cwd);
  const summary = notebook.cells.map((current, index) => { const source = Array.isArray(current.source) ? current.source.join('') : ''; return `${index}: [${current.cell_type === 'code' ? 'code' : 'md'}] (${source.split('\n').length} lines) ${source.split('\n')[0]?.slice(0, 60) || '(empty)'}`; });
  return { path: input.path, message: [`Notebook: ${basename(path)}`, `Format: nbformat ${notebook.nbformat}.${notebook.nbformat_minor}`, `Cells: ${notebook.cells.length}`, ...summary].join('\n') };
}

export async function platformNotebookCreate(input: { path: string; kernel?: string }, cwd = process.cwd()): Promise<PlatformNotebookResult> {
  const path = await notebookPath(input.path, cwd, false);
  await writeNotebook(path, emptyNotebook(input.kernel));
  return { path: input.path, message: `Created empty notebook: ${input.path}` };
}

export async function platformNotebookEditCell(input: { path: string; cell_index: number; new_source: string; cell_type?: 'code' | 'markdown' }, cwd = process.cwd()): Promise<PlatformNotebookResult> {
  if (input.new_source.length > MAX_SOURCE_LENGTH) throw new Error('cell source exceeds the maximum length');
  const { path, notebook } = await readNotebook(input.path, cwd);
  if (input.cell_index >= notebook.cells.length) return { message: `Cell index ${input.cell_index} out of range (notebook has ${notebook.cells.length} cells).` };
  const current = notebook.cells[input.cell_index]!;
  const replacement = cell(input.cell_type ?? current.cell_type, input.new_source);
  notebook.cells[input.cell_index] = { ...current, ...replacement };
  await writeNotebook(path, notebook);
  return { message: `Edited cell ${input.cell_index} in ${basename(path)}` };
}

export async function platformNotebookInsertCell(input: { path: string; after_index: number; cell_type: 'code' | 'markdown'; source: string }, cwd = process.cwd()): Promise<PlatformNotebookResult> {
  if (input.source.length > MAX_SOURCE_LENGTH) throw new Error('cell source exceeds the maximum length');
  const { path, notebook } = await readNotebook(input.path, cwd);
  const insertAt = Math.min(Math.max(input.after_index + 1, 0), notebook.cells.length);
  notebook.cells.splice(insertAt, 0, cell(input.cell_type, input.source));
  await writeNotebook(path, notebook);
  return { message: `Inserted ${input.cell_type} cell at index ${insertAt} in ${basename(path)}` };
}

export async function platformNotebookDeleteCell(input: { path: string; cell_index: number }, cwd = process.cwd()): Promise<PlatformNotebookResult> {
  const { path, notebook } = await readNotebook(input.path, cwd);
  if (input.cell_index >= notebook.cells.length) return { message: `Cell index ${input.cell_index} out of range (notebook has ${notebook.cells.length} cells).` };
  notebook.cells.splice(input.cell_index, 1);
  await writeNotebook(path, notebook);
  return { message: `Deleted cell ${input.cell_index} from ${basename(path)}. ${notebook.cells.length} cells remaining.` };
}
