/**
 * Global/Project Config Layer Tests
 * Tests for ~/.upup/ and .upup/ configuration hierarchy
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { getUpupHomeRoot, globalUpupPath, hasGlobalConfig, upupPath } from '@upup/utils';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

// Test helpers
const TEST_DIR = join(tmpdir(), 'upup-test-global');
const TEST_PROJECT_DIR = '.upup-test-project';

function cleanup() {
  try {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    if (existsSync(TEST_PROJECT_DIR)) rmSync(TEST_PROJECT_DIR, { recursive: true });
  } catch { /* ignore */ }
}

describe('globalUpupPath', () => {
  it('should return path under the global UpUp home root', () => {
    const path = globalUpupPath();
    expect(path).toBe(getUpupHomeRoot());
    expect(path).toContain('.upup');
  });

  it('should append segments correctly', () => {
    const path = globalUpupPath('memory', 'test.md');
    expect(path).toContain('.upup');
    expect(path).toContain('memory');
    expect(path).toContain('test.md');
  });
});

describe('UPUP_HOME override', () => {
  it('should relocate the global home root and fall back to ~/.upup', () => {
    const previous = process.env.UPUP_HOME;
    const override = join(tmpdir(), 'upup-home-override-probe');
    process.env.UPUP_HOME = override;
    try {
      expect(getUpupHomeRoot()).toBe(resolve(override));
      expect(globalUpupPath('settings.json')).toBe(join(resolve(override), 'settings.json'));
    } finally {
      if (previous === undefined) delete process.env.UPUP_HOME;
      else process.env.UPUP_HOME = previous;
    }
    const expected = previous === undefined ? join(homedir(), '.upup') : resolve(previous);
    expect(getUpupHomeRoot()).toBe(expected);
  });
});

describe('hasGlobalConfig', () => {
  beforeEach(() => cleanup());

  it('should return boolean (true if exists, false if not)', () => {
    cleanup();
    // hasGlobalConfig() should return either true or false without throwing
    const result = hasGlobalConfig();
    expect(typeof result).toBe('boolean');
  });

  it('should return true when global config directory exists', () => {
    // Create the global config directory
    mkdirSync(globalUpupPath(''), { recursive: true });
    expect(hasGlobalConfig()).toBe(true);
    cleanup();
  });
});

describe('Config Loading Priority', () => {
  beforeEach(() => cleanup());

  it('should support both global and project config paths', () => {
    // Global path
    const globalPath = globalUpupPath('SOUL.md');
    expect(globalPath).toContain('.upup');

    // Project path
    const projectPath = upupPath('SOUL.md');
    expect(projectPath).toContain('.upup');
  });

  it('should handle non-existent paths gracefully', () => {
    // These should not throw
    expect(() => globalUpupPath('non-existent', 'file.md')).not.toThrow();
    expect(() => upupPath('non-existent', 'file.md')).not.toThrow();
  });
});

describe('upupPath', () => {
  it('should return absolute path within global upup directory', () => {
    const path = upupPath('memory');
    // upupPath returns absolute path like ~/.upup/memory
    expect(path).toContain('.upup');
    expect(path).toContain('memory');
    expect(path).not.toBe(join('.upup', 'memory')); // Not a relative path
  });

  it('should handle multiple segments', () => {
    const path = upupPath('memory', 'daily', '2024.md');
    // upupPath returns absolute path
    expect(path).toContain('.upup');
    expect(path).toContain('memory');
    expect(path).toContain('daily');
    expect(path).toContain('2024.md');
  });
});
