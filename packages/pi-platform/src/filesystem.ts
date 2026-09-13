import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_READ_BYTES = 50_000;
const MAX_SEARCH_RESULTS = 100;
const EXCLUDED_DIRS = new Set(['.git', '.svn', '.hg', '.jj', 'node_modules', 'dist', 'build', 'coverage']);

export interface PlatformFileResult {
  readonly path?: string;
  readonly content?: string;
  readonly message?: string;
  readonly truncated?: boolean;
  readonly totalLines?: number;
  readonly bytesWritten?: number;
  readonly replacements?: number;
  readonly filenames?: readonly string[];
  readonly matches?: readonly string[];
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly durationMs?: number;
  readonly timedOut?: boolean;
  readonly securityWarnings?: readonly string[];
}

function inside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

async function resolveSandboxPath(input: string, cwd = process.cwd(), mustExist = false): Promise<string> {
  if (!input.trim()) throw new Error('path must not be empty');
  const root = await realpath(cwd);
  const candidate = resolve(cwd, input);
  const parent = await realpath(dirname(candidate)).catch(() => resolve(dirname(candidate)));
  const normalized = (await realpath(candidate).catch(() => join(parent, candidate.slice(parent.length).replace(/^[/\\]+/, ''))));
  if (!inside(root, normalized)) throw new Error(`path escapes the workspace: ${input}`);
  if (mustExist) await access(normalized, constants.F_OK);
  return normalized;
}

function truncateText(text: string): { content: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= MAX_READ_BYTES) return { content: text, truncated: false };
  let content = text;
  while (Buffer.byteLength(content, 'utf8') > MAX_READ_BYTES) content = content.slice(0, Math.max(1, Math.floor(content.length * 0.9)));
  return { content: `${content}\n\n[truncated at ${MAX_READ_BYTES} bytes]`, truncated: true };
}

export async function platformReadFile(input: { path: string; offset?: number; limit?: number }, cwd = process.cwd()): Promise<PlatformFileResult> {
  const target = await resolveSandboxPath(input.path, cwd, true);
  const text = (await readFile(target)).toString('utf8');
  const lines = text.split('\n');
  const start = Math.max(0, (input.offset ?? 1) - 1);
  if (start >= lines.length) throw new Error(`offset ${input.offset} is beyond end of file (${lines.length} lines)`);
  const selected = lines.slice(start, input.limit === undefined ? undefined : start + Math.max(0, input.limit)).join('\n');
  const truncated = truncateText(selected);
  return { path: input.path, content: truncated.content, truncated: truncated.truncated, totalLines: lines.length };
}

export async function platformWriteFile(input: { path: string; content: string; confirm?: boolean }, cwd = process.cwd()): Promise<PlatformFileResult> {
  if (input.confirm !== true) throw new Error('write_file requires explicit confirmation=true');
  const target = await resolveSandboxPath(input.path, cwd);
  await mkdir(dirname(target), { recursive: true });
  const previous = await readFile(target, 'utf8').catch(() => undefined);
  if (previous === input.content) return { path: input.path, bytesWritten: 0, message: 'content unchanged' };
  const temporary = `${target}.upup-tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, input.content, 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(temporary, target);
  return { path: input.path, bytesWritten: Buffer.byteLength(input.content, 'utf8'), message: 'file written' };
}

export async function platformEditFile(input: { path: string; old_text: string; new_text: string; replace_all?: boolean; confirm?: boolean }, cwd = process.cwd()): Promise<PlatformFileResult> {
  if (input.confirm !== true) throw new Error('edit_file requires explicit confirmation=true');
  const target = await resolveSandboxPath(input.path, cwd, true);
  const original = await readFile(target, 'utf8');
  const occurrences = original.split(input.old_text).length - 1;
  if (occurrences === 0) throw new Error(`old_text was not found in ${input.path}`);
  if (occurrences > 1 && !input.replace_all) throw new Error(`old_text occurs ${occurrences} times; provide more context or replace_all=true`);
  const content = input.replace_all ? original.split(input.old_text).join(input.new_text) : original.replace(input.old_text, input.new_text);
  await writeFile(target, content, 'utf8');
  return { path: input.path, replacements: input.replace_all ? occurrences : 1, message: 'file edited' };
}

function globRegex(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '*') {
      if (pattern[index + 1] === '*') { source += '.*'; index += 1; } else source += '[^/]*';
    } else if (character === '?') source += '[^/]';
    else if (character === '{') {
      const end = pattern.indexOf('}', index);
      if (end > index) { source += `(${pattern.slice(index + 1, end).split(',').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`; index = end; }
      else source += '\\{';
    } else source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

async function walk(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) files.push(...await walk(root, join(current, entry.name)));
    else if (entry.isFile()) files.push(relative(root, join(current, entry.name)).split(sep).join('/'));
  }
  return files;
}

export async function platformGlob(input: { pattern: string; path?: string }, cwd = process.cwd()): Promise<PlatformFileResult> {
  const root = await resolveSandboxPath(input.path ?? '.', cwd, true);
  const files = (await walk(root)).filter((file) => globRegex(input.pattern).test(file)).slice(0, MAX_SEARCH_RESULTS);
  return { filenames: files, message: files.length ? `found ${files.length} file(s)` : 'no files found' };
}

export async function platformGrep(input: { pattern: string; path?: string; glob?: string; output_mode?: 'content' | 'files_with_matches' | 'count'; '-i'?: boolean; '-C'?: number; head_limit?: number }, cwd = process.cwd()): Promise<PlatformFileResult> {
  const root = await resolveSandboxPath(input.path ?? '.', cwd, true);
  const regex = new RegExp(input.pattern, input['-i'] ? 'i' : '');
  const filePattern = input.glob ? globRegex(input.glob) : undefined;
  const matches: string[] = [];
  const files: string[] = [];
  for (const file of await walk(root)) {
    if (filePattern && !filePattern.test(file)) continue;
    const text = await readFile(join(root, file), 'utf8').catch(() => '');
    const lines = text.split('\n');
    const found = lines.map((line, index) => ({ line, index })).filter(({ line }) => regex.test(line));
    if (found.length === 0) continue;
    files.push(file);
    if (input.output_mode === 'count') matches.push(`${file}:${found.length}`);
    else if (input.output_mode === 'content') {
      const contextLines = Math.min(Math.max(input['-C'] ?? 0, 0), 20);
      const selected = new Set<number>();
      for (const match of found) {
        for (let lineIndex = Math.max(0, match.index - contextLines); lineIndex <= Math.min(lines.length - 1, match.index + contextLines); lineIndex += 1) selected.add(lineIndex);
      }
      for (const lineIndex of [...selected].sort((left, right) => left - right)) matches.push(`${file}:${lineIndex + 1}:${lines[lineIndex]}`);
    }
    if (files.length >= MAX_SEARCH_RESULTS) break;
  }
  const limited = input.head_limit ? matches.slice(0, input.head_limit) : matches;
  return { filenames: files, matches: limited, content: limited.join('\n'), message: files.length ? `found ${files.length} file(s)` : 'no matches found' };
}

export async function platformSendUserFile(input: { path: string; destination?: string; confirm?: boolean }, cwd = process.cwd()): Promise<PlatformFileResult> {
  if (input.confirm !== true) throw new Error('send_user_file requires explicit confirmation=true');
  const source = await resolveSandboxPath(input.path, cwd, true);
  const destination = input.destination ? await resolveSandboxPath(input.destination, cwd) : join(process.env.HOME ?? cwd, 'Downloads', source.split(sep).pop()!);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return { path: input.path, message: `file copied to ${destination}` };
}

const DANGEROUS_SHELL = /(?:^|[;&|])\s*(?:rm|rmdir|dd|mkfs|shutdown|reboot|kill|chmod|chown)\b|:\s*\(\)\s*\{/i;

export interface PlatformShellInput {
  readonly command: string;
  readonly timeout?: number;
  readonly maxOutputLength?: number;
  readonly env?: Readonly<Record<string, string>>;
}

export async function platformBash(input: PlatformShellInput, cwd = process.cwd()): Promise<PlatformFileResult> {
  if (!input.command.trim()) throw new Error('command must not be empty');
  if (DANGEROUS_SHELL.test(input.command)) throw new Error('command rejected by Pi Platform safety policy');
  const started = Date.now();
  const maxOutputLength = Math.max(1_000, Math.min(input.maxOutputLength ?? 100_000, 1_000_000));
  const timeout = Math.min(Math.max(input.timeout ?? 30_000, 1_000), 120_000);
  const executable = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', input.command] : ['-lc', input.command];
  const environment = input.env ? { ...process.env, ...input.env } : undefined;
  try {
    const result = await execFileAsync(executable, args, { cwd, timeout, maxBuffer: maxOutputLength * 2, env: environment });
    return limitShellOutput({ stdout: result.stdout, stderr: result.stderr, exitCode: 0 }, maxOutputLength, started);
  } catch (error) {
    const value = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; status?: number; stdout?: string; stderr?: string };
    if (value.killed === true || value.signal === 'SIGTERM') {
      return { stdout: value.stdout ?? '', stderr: `Command timed out after ${timeout}ms`, exitCode: 124, timedOut: true, durationMs: Date.now() - started };
    }
    const exitCode = typeof value.status === 'number' ? value.status : typeof value.code === 'number' ? value.code : 1;
    return limitShellOutput({ stdout: value.stdout ?? '', stderr: value.stderr ?? (error instanceof Error ? error.message : String(error)), exitCode }, maxOutputLength, started);
  }
}

function limitShellOutput(value: { stdout: string; stderr: string; exitCode: number }, maxOutputLength: number, started: number): PlatformFileResult {
  let truncated = false;
  const limit = (text: string): string => {
    if (text.length <= maxOutputLength) return text;
    truncated = true;
    return `${text.slice(0, maxOutputLength)}\n... [Output truncated]`;
  };
  return { stdout: limit(value.stdout), stderr: limit(value.stderr), exitCode: value.exitCode, durationMs: Date.now() - started, truncated };
}
