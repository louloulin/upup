import { describe, expect, test } from 'bun:test';
import { PI_PLATFORM_PACKAGE_NAME, PI_PLATFORM_PACKAGE_VERSION, listPlatformWorktrees } from './src/index';

describe('pi-platform', () => {
  test('exports a pinned package identity', () => {
    expect(PI_PLATFORM_PACKAGE_NAME).toBe('@upup/pi-platform');
    expect(PI_PLATFORM_PACKAGE_VERSION).toBe('0.1.0');
  });

  test('lists worktrees without depending on the workspace source tree', async () => {
    const worktrees = await listPlatformWorktrees();
    expect(Array.isArray(worktrees)).toBe(true);
    for (const worktree of worktrees) {
      expect(worktree.path.length).toBeGreaterThan(0);
      expect(worktree.branch.length).toBeGreaterThan(0);
      expect(worktree.head.length).toBeGreaterThan(0);
    }
  });
});
