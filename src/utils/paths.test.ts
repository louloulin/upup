/**
 * Global/Project Config Layer Tests
 * Tests for ~/.upup/ and .upup/ configuration hierarchy
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { globalUpupPath, hasGlobalConfig, upupPath } from './paths';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

// Test helpers
const TEST_DIR = join(homedir(), '.upup-test-global');
const TEST_PROJECT_DIR = '.upup-test-project';

function cleanup() {
  try {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    if (existsSync(TEST_PROJECT_DIR)) rmSync(TEST_PROJECT_DIR, { recursive: true });
  } catch { /* ignore */ }
}

describe('globalUpupPath', () => {
  it('should return path under home directory', () => {
    const path = globalUpupPath();
    expect(path).toContain(homedir());
    expect(path).toContain('.upup');
  });

  it('should append segments correctly', () => {
    const path = globalUpupPath('memory', 'test.md');
    expect(path).toContain('.upup');
    expect(path).toContain('memory');
    expect(path).toContain('test.md');
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
  it('should return path relative to current directory', () => {
    const path = upupPath('memory');
    expect(path).toBe(join('.upup', 'memory'));
  });

  it('should handle multiple segments', () => {
    const path = upupPath('memory', 'daily', '2024.md');
    expect(path).toBe(join('.upup', 'memory', 'daily', '2024.md'));
  });
});