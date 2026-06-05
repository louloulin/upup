/**
 * Git Worktree Tools
 *
 * Exports worktree management tools
 */

export {
  getWorktreeList,
  getCurrentWorktree,
  createWorktreeTool,
  removeWorktreeTool,
  listWorktreeTool,
  worktreeTools,
} from './worktree-tools.js';

export const CREATE_WORKTREE_DESCRIPTION = `
Create a new git worktree for isolated development.

## When to Use
- Working on multiple features simultaneously
- Testing changes in isolation
- Parallel development workflows

## Usage
Provide a path and branch name.
Use createBranch=true to create a new branch.
`.trim();

export const REMOVE_WORKTREE_DESCRIPTION = `
Remove a git worktree.

## When to Use
- Cleaning up completed feature branches
- Removing temporary worktrees

## Notes
- Cannot remove the current worktree
- Use force=true for worktrees with uncommitted changes
`.trim();

export const LIST_WORKTREE_DESCRIPTION = `
List all git worktrees in the repository.

## When to Use
- Checking existing worktrees
- Finding worktree paths
- Identifying current worktree context

## Output Formats
- simple: Shows path and branch
- detailed: Shows path, branch, and HEAD
`.trim();
