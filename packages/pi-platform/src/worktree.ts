import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PlatformWorktree {
  readonly path: string;
  readonly branch: string;
  readonly head: string;
}

function gitArgs(args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', [...args], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 });
}

function parseWorktrees(output: string): PlatformWorktree[] {
  const worktrees: PlatformWorktree[] = [];
  let current: { path?: string; branch?: string; head?: string } = {};
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push({ path: current.path, branch: current.branch ?? '(detached)', head: current.head ?? 'unknown' });
      current = { path: line.slice('worktree '.length) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  if (current.path) worktrees.push({ path: current.path, branch: current.branch ?? '(detached)', head: current.head ?? 'unknown' });
  return worktrees;
}

function assertArgument(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('-') || trimmed.includes('\0')) throw new Error(`${label} must be a non-empty value that does not start with '-'`);
  return trimmed;
}

export async function listPlatformWorktrees(): Promise<PlatformWorktree[]> {
  try {
    const { stdout } = await gitArgs(['worktree', 'list', '--porcelain']);
    return parseWorktrees(stdout);
  } catch {
    return [];
  }
}

export async function currentPlatformWorktree(): Promise<string | null> {
  const worktrees = await listPlatformWorktrees();
  const cwd = process.cwd();
  return worktrees.find((worktree) => worktree.path === cwd)?.path ?? worktrees[0]?.path ?? null;
}

export async function createPlatformWorktree(input: { path: string; branch: string; createBranch?: boolean }): Promise<{ path: string; branch: string; createBranch: boolean; output: string }> {
  const path = assertArgument(input.path, 'path');
  const branch = assertArgument(input.branch, 'branch');
  const createBranch = input.createBranch ?? false;
  if (createBranch) {
    await gitArgs(['check-ref-format', '--branch', branch]);
  } else {
    await gitArgs(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  }
  const args = createBranch ? ['worktree', 'add', '-b', branch, '--', path] : ['worktree', 'add', '--', path, branch];
  try {
    const { stdout } = await gitArgs(args);
    return { path, branch, createBranch, output: stdout.trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create worktree: ${message}`);
  }
}

export async function removePlatformWorktree(input: { path: string; force?: boolean }): Promise<{ path: string; force: boolean }> {
  const path = assertArgument(input.path, 'path');
  const current = await currentPlatformWorktree();
  if (current && (path === current || path.startsWith(`${current}/`))) throw new Error('Cannot remove the current worktree. Exit first.');
  const force = input.force ?? false;
  try {
    await gitArgs(['worktree', 'remove', ...(force ? ['--force'] : []), '--', path]);
    return { path, force };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to remove worktree: ${message}`);
  }
}
