/**
 * Git Worktree Management Tools
 *
 * Provides git worktree operations for isolated development:
 * - Create worktree
 * - List worktrees
 * - Remove worktree
 * - Enter/exit worktree context
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { execSync, exec } from 'child_process';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Get list of git worktrees
 */
export function getWorktreeList(): Array<{
  path: string;
  branch: string;
  head: string;
}> {
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    const worktrees: Array<{ path: string; branch: string; head: string }> = [];
    const entries = output.split('\n').filter(Boolean);

    let current: { path?: string; branch?: string; head?: string } = {};

    for (const line of entries) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push({
            path: current.path,
            branch: current.branch || '(detached)',
            head: current.head || 'unknown',
          });
        }
        current = { path: line.substring(9) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(8);
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      }
    }

    // Don't forget the last one
    if (current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch || '(detached)',
        head: current.head || 'unknown',
      });
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Get current worktree
 */
export function getCurrentWorktree(): string | null {
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        return line.substring(9);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Tool schemas
const createWorktreeSchema = z.object({
  path: z.string().describe('Path for the new worktree'),
  branch: z.string().describe('Branch name for the worktree'),
  createBranch: z.boolean().optional().default(false).describe('Create a new branch'),
});

const removeWorktreeSchema = z.object({
  path: z.string().describe('Path of the worktree to remove'),
  force: z.boolean().optional().default(false).describe('Force removal even with uncommitted changes'),
});

const listWorktreeSchema = z.object({
  format: z.enum(['simple', 'detailed']).optional().default('simple').describe('Output format'),
});

/**
 * Create worktree tool
 */
export function createWorktreeTool() {
  return new DynamicStructuredTool({
    name: 'create_worktree',
    description: 'Create a new git worktree for isolated development',
    schema: createWorktreeSchema,
    func: async ({ path, branch, createBranch }) => {
      try {
        const cwd = process.cwd();

        // Build command
        let cmd = `git worktree add`;
        if (createBranch) {
          cmd += ` -b ${branch}`;
        } else {
          // Check if branch exists
          try {
            execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd });
          } catch {
            throw new Error(`Branch '${branch}' does not exist. Use createBranch=true to create it.`);
          }
        }
        cmd += ` "${path}"`;
        if (!createBranch) {
          cmd += ` ${branch}`;
        }

        const { stdout } = await execAsync(cmd, { cwd });

        return formatToolResult({
          type: 'Worktree Created',
          path,
          branch,
          createBranch,
          message: `Created worktree at ${path} ${createBranch ? 'with new branch' : 'on branch'} ${branch}`,
          output: stdout,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create worktree: ${message}`);
      }
    },
  });
}

/**
 * Remove worktree tool
 */
export function removeWorktreeTool() {
  return new DynamicStructuredTool({
    name: 'remove_worktree',
    description: 'Remove a git worktree',
    schema: removeWorktreeSchema,
    func: async ({ path, force }) => {
      try {
        const cwd = process.cwd();
        const currentWorktree = getCurrentWorktree();

        if (currentWorktree && path.startsWith(currentWorktree)) {
          throw new Error('Cannot remove the current worktree. Exit first.');
        }

        let cmd = 'git worktree remove';
        if (force) {
          cmd += ' --force';
        }
        cmd += ` "${path}"`;

        await execAsync(cmd, { cwd });

        return formatToolResult({
          type: 'Worktree Removed',
          path,
          force,
          message: `Removed worktree at ${path}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to remove worktree: ${message}`);
      }
    },
  });
}

/**
 * List worktree tool
 */
export function listWorktreeTool() {
  return new DynamicStructuredTool({
    name: 'list_worktree',
    description: 'List all git worktrees',
    schema: listWorktreeSchema,
    func: async ({ format }) => {
      const worktrees = getWorktreeList();
      const currentWorktree = getCurrentWorktree();

      if (worktrees.length === 0) {
        return formatToolResult({
          type: 'Worktree List',
          count: 0,
          message: 'No worktrees found. Current directory is not in a worktree.',
        });
      }

      if (format === 'simple') {
        const list = worktrees
          .map(w => `  ${w.path} (${w.branch})${w.path === currentWorktree ? ' [current]' : ''}`)
          .join('\n');

        return formatToolResult({
          type: 'Worktree List',
          count: worktrees.length,
          worktrees: worktrees.map(w => ({
            path: w.path,
            branch: w.branch,
            isCurrent: w.path === currentWorktree,
          })),
          message: `Worktrees:\n${list}`,
        });
      } else {
        return formatToolResult({
          type: 'Worktree List (Detailed)',
          count: worktrees.length,
          worktrees: worktrees.map(w => ({
            path: w.path,
            branch: w.branch,
            head: w.head,
            isCurrent: w.path === currentWorktree,
          })),
          message: `Found ${worktrees.length} worktree(s)`,
        });
      }
    },
  });
}

export const worktreeTools = [
  createWorktreeTool(),
  removeWorktreeTool(),
  listWorktreeTool(),
];
