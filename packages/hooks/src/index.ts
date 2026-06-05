/**
 * @upup/hooks - Hooks SDK
 *
 * Rate limiting, caching, and API validation.
 *
 * KNOWN ISSUES (pre-existing in src/, not caused by refactoring):
 * - HookEvent exported from both agent-hooks.ts and tool-hooks.ts
 * - createGitProtectionHook exported from both permission-hooks.ts and worktree-hooks.ts
 * - To disambiguate, import directly from sub-path: '@upup/hooks/agent-hooks' etc.
 */
export * from './agent-hooks.js';
export * from './elicitation.js';
export * from './instructions-hooks.js';
export * from './permission-hooks.js';
export * from './rate-limiter.js';
export * from './stop-hooks.js';
export * from './tool-hooks.js';
export * from './user-hooks.js';
export * from './worktree-hooks.js';
export * from './use-skills-change.js';
