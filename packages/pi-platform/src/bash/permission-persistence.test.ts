/**
 * Tests for Permission Persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  setPermissionMode,
  clearPermissionRules,
  getPermissionStore,
  initPermissionPersistence,
  removePermissionMode,
} from './permission-mode';

let tmpDir: string;
let permFile: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'perm-test-'));
  permFile = path.join(tmpDir, 'permissions.json');
  clearPermissionRules();
  // Clear persist path for isolation
  getPermissionStore().setPersistPath('');
});

afterEach(async () => {
  clearPermissionRules();
  getPermissionStore().setPersistPath('');
  await fsp.rm(tmpDir, { recursive: true }).catch(() => {});
});

describe('PermissionStore persistence', () => {
  it('should not persist when no path set', async () => {
    setPermissionMode('npm_install_test', 'allow');
    // File should not exist since persistPath is empty
    const exists = await fsp.access(permFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('should persist rules to file', async () => {
    initPermissionPersistence(permFile);
    setPermissionMode('npm_install_test', 'allow');
    setPermissionMode('rm_rf_test', 'deny');

    const raw = await fsp.readFile(permFile, 'utf-8');
    const data = JSON.parse(raw);
    expect(data['npm_install_test']).toBe('allow');
    expect(data['rm_rf_test']).toBe('deny');
  });

  it('should load rules from file', async () => {
    // Write initial data
    await fsp.mkdir(path.dirname(permFile), { recursive: true });
    await fsp.writeFile(permFile, JSON.stringify({
      'git_push_test': 'allow',
      'docker_run_test': 'deny',
    }), 'utf-8');

    initPermissionPersistence(permFile);
    expect(getPermissionStore().getMode('git_push_test')).toBe('allow');
    expect(getPermissionStore().getMode('docker_run_test')).toBe('deny');
  });

  it('should handle missing file gracefully', () => {
    initPermissionPersistence(path.join(tmpDir, 'nonexistent.json'));
    // Should not throw - store should have no user rules for unknown commands
    expect(getPermissionStore().getMode('custom_command_xyz')).toBeUndefined();
  });

  it('should handle corrupted file gracefully', async () => {
    await fsp.writeFile(permFile, 'not json{{{', 'utf-8');
    initPermissionPersistence(permFile);
    // Should not throw - store should have no user rules
    expect(getPermissionStore().getMode('custom_command_xyz')).toBeUndefined();
  });

  it('should update file on removeMode', async () => {
    initPermissionPersistence(permFile);
    setPermissionMode('npm_install_test', 'allow');
    removePermissionMode('npm_install_test');

    const raw = await fsp.readFile(permFile, 'utf-8');
    const data = JSON.parse(raw);
    expect(data['npm_install_test']).toBeUndefined();
  });

  it('should update file on clear', async () => {
    initPermissionPersistence(permFile);
    setPermissionMode('npm_install_test', 'allow');
    clearPermissionRules();

    const raw = await fsp.readFile(permFile, 'utf-8');
    const data = JSON.parse(raw);
    expect(Object.keys(data).length).toBe(0);
  });

  it('should overwrite existing rule', async () => {
    initPermissionPersistence(permFile);
    setPermissionMode('npm_install_test', 'allow');
    setPermissionMode('npm_install_test', 'deny');

    expect(getPermissionStore().getMode('npm_install_test')).toBe('deny');

    const raw = await fsp.readFile(permFile, 'utf-8');
    const data = JSON.parse(raw);
    expect(data['npm_install_test']).toBe('deny');
  });
});
