import { lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import { resolveToCwd } from './utils/path-utils.js';
import { getSandboxManager } from './sandbox-manager.js';

/**
 * Get the list of allowed roots from the sandbox manager.
 */
function getAllowedRoots(cwd: string): string[] {
  const manager = getSandboxManager();

  // In strict mode, only allow cwd
  if (manager.getMode() === 'strict') {
    return [resolvePath(cwd)];
  }

  // In disabled mode, no restrictions (dangerous!)
  if (!manager.isEnabled()) {
    return []; // No restrictions
  }

  // In relaxed mode (default), allow cwd + additional dirs
  const roots: string[] = [resolvePath(cwd)];
  for (const dir of manager.getAdditionalDirs()) {
    if (dir) {
      roots.push(resolvePath(dir));
    }
  }
  return roots;
}

/**
 * Check if a path is within allowed roots (cwd or additional roots).
 */
function isPathAllowed(absolutePath: string, cwd: string): boolean {
  const manager = getSandboxManager();

  // In disabled mode, no restrictions
  if (!manager.isEnabled()) {
    return true;
  }

  // Get allowed roots based on current mode
  const allowedRoots = getAllowedRoots(cwd);

  // Check against all allowed roots
  for (const root of allowedRoots) {
    const relFromRoot = relative(root, absolutePath);

    if (!relFromRoot.startsWith('..') && !isAbsolute(relFromRoot)) {
      return true; // Within allowed root
    }
  }

  return false;
}

export function resolveSandboxPath(params: { filePath: string; cwd: string; root?: string }): {
  resolved: string;
  relative: string;
} {
  const resolved = resolveToCwd(params.filePath, params.cwd);

  // If custom root specified, use it directly
  if (params.root) {
    const rootResolved = resolvePath(params.root);
    const rel = relative(rootResolved, resolved);

    if (!rel || rel === '') {
      return { resolved, relative: '' };
    }

    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path escapes sandbox root: ${params.filePath}`);
    }

    return { resolved, relative: rel };
  }

  // Check if path is within allowed roots
  if (!isPathAllowed(resolved, params.cwd)) {
    throw new Error(`Path escapes sandbox root: ${params.filePath}`);
  }

  const rootResolved = resolvePath(params.cwd);
  const rel = relative(rootResolved, resolved);

  if (!rel || rel === '') {
    return { resolved, relative: '' };
  }

  return { resolved, relative: rel };
}

export async function assertSandboxPath(params: {
  filePath: string;
  cwd: string;
  root?: string;
}): Promise<{ resolved: string; relative: string }> {
  const root = params.root ?? params.cwd;
  const resolved = resolveSandboxPath({ filePath: params.filePath, cwd: params.cwd, root });
  await assertNoSymlink(resolved.relative, resolvePath(root));
  return resolved;
}

async function assertNoSymlink(relativePath: string, root: string): Promise<void> {
  if (!relativePath) {
    return;
  }

  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink not allowed in sandbox path: ${current}`);
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }
}
