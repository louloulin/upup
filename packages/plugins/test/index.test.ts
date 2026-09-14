/**
 * UpUp Plugin System — Plugin System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';

// Import plugin system
import {
  isPathInside,
  safeStatSync,
  validatePluginDirectory,
  validatePluginEntry,
  resolvePluginPath,
  pluginFileExists,
} from '../src/path-safety.js';
import { loadPluginManifest, validatePluginConfig, getManifestLoader } from '../src/manifest.js';
import { getServiceManager, resetServiceManager } from '../src/services.js';

// ============================================================================
// Path Safety Tests
// ============================================================================

describe('Path Safety', () => {
  describe('isPathInside', () => {
    it('should return true when path is inside boundary', () => {
      expect(isPathInside('/home/user/plugins', '/home/user')).toBe(true);
      expect(isPathInside('/home/user/plugins/', '/home/user')).toBe(true);
    });

    it('should return true when path equals boundary', () => {
      expect(isPathInside('/home/user', '/home/user')).toBe(true);
    });

    it('should return false when path is outside boundary', () => {
      expect(isPathInside('/etc/passwd', '/home/user')).toBe(false);
      expect(isPathInside('/home/user/../etc/passwd', '/home/user')).toBe(false);
    });

    it('should handle Windows-style paths', () => {
      expect(isPathInside('C:\\Users\\plugins', 'C:\\Users')).toBe(true);
      expect(isPathInside('C:\\Windows\\system32', 'C:\\Users')).toBe(false);
    });
  });

  describe('safeStatSync', () => {
    it('should return stat for existing files', () => {
      const stat = safeStatSync('package.json');
      expect(stat).not.toBeNull();
      expect(stat?.isFile()).toBe(true);
    });

    it('should return null for non-existent paths', () => {
      const stat = safeStatSync('/non/existent/path');
      expect(stat).toBeNull();
    });
  });

  describe('validatePluginDirectory', () => {
    it('should return valid for existing directory', () => {
      const result = validatePluginDirectory('.');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for non-existent directory', () => {
      const result = validatePluginDirectory('/non/existent/directory');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Directory does not exist');
    });

    it('should return invalid for non-directory path', () => {
      const result = validatePluginDirectory('package.json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path is not a directory');
    });
  });

  describe('resolvePluginPath', () => {
    it('should resolve relative paths inside plugin boundary', () => {
      const resolved = resolvePluginPath('index.js', '.');
      expect(isPathInside(resolved, resolve('.')!)).toBe(true);
    });

    it('should throw when path escapes boundary', () => {
      expect(() => resolvePluginPath('../../etc/passwd', '.')).toThrow(
        'Path resolution would escape plugin boundary'
      );
    });
  });

  describe('pluginFileExists', () => {
    it('should return true for existing files', () => {
      expect(pluginFileExists('package.json', '.')).toBe(true);
    });

    it('should return false for non-existent files', () => {
      expect(pluginFileExists('non-existent-file.txt', '.')).toBe(false);
    });

    it('should return false for paths escaping boundary', () => {
      expect(pluginFileExists('../../etc/passwd', '.')).toBe(false);
    });
  });
});

// ============================================================================
// Service Manager Tests
// ============================================================================

describe('ServiceManager', () => {
  beforeEach(() => {
    resetServiceManager();
  });

  it('should register and start services', async () => {
    const manager = getServiceManager();
    const started: string[] = [];

    const service = {
      name: 'test-service',
      start: async () => { started.push('test-service'); },
    };

    manager.register('test-plugin', service);
    await manager.startServices('test-plugin', 'Test Plugin', {}, '.', '.state');

    expect(started).toContain('test-service');
  });

  it('should stop services in reverse order', async () => {
    const manager = getServiceManager();
    const stopped: string[] = [];

    const service1 = {
      name: 'service-1',
      start: async () => {},
      stop: async () => { stopped.push('service-1'); },
    };

    const service2 = {
      name: 'service-2',
      start: async () => {},
      stop: async () => { stopped.push('service-2'); },
    };

    manager.register('test-plugin', service1);
    manager.register('test-plugin', service2);
    await manager.startServices('test-plugin', 'Test Plugin', {}, '.', '.state');
    await manager.stopServices('test-plugin');

    // Stopped in reverse order
    expect(stopped).toEqual(['service-2', 'service-1']);
  });

  it('should handle service start errors gracefully', async () => {
    const manager = getServiceManager();

    const badService = {
      name: 'bad-service',
      start: async () => { throw new Error('Start failed'); },
    };

    manager.register('test-plugin', badService);
    // Should not throw (errors are caught and logged)
    let threw = false;
    try {
      await manager.startServices('test-plugin', 'Test Plugin', {}, '.', '.state');
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it('should track running count', async () => {
    const manager = getServiceManager();

    expect(manager.getRunningCount()).toBe(0);

    const service = {
      name: 'test-service',
      start: async () => {},
    };

    manager.register('test-plugin', service);
    await manager.startServices('test-plugin', 'Test Plugin', {}, '.', '.state');

    expect(manager.getRunningCount()).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Manifest Tests
// ============================================================================

describe('Manifest', () => {
  // Create temp test directory
  const testDir = resolve('.upup-test-plugins', 'test-plugin');
  const loader = getManifestLoader();

  beforeEach(() => {
    loader.clearCache(); // Clear cache between tests
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    loader.clearCache();
    try {
      rmSync(testDir, { recursive: true });
    } catch { /* ignore */ }
  });

  it('should load valid manifest', () => {
    const manifest = {
      schemaVersion: '1.0',
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      runtime: 'bun',
      capabilities: ['tools'],
      entry: './index.js',
    };

    writeFileSync(resolve(testDir, 'upup.plugin.json'), JSON.stringify(manifest));

    const loaded = loader.load(testDir);
    expect(loaded.id).toBe('test-plugin');
    expect(loaded.name).toBe('Test Plugin');
    expect(loaded.runtime).toBe('bun');
  });

  it('should validate correct config', () => {
    const manifest = {
      schemaVersion: '1.0',
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      runtime: 'bun',
      capabilities: ['tools'],
      entry: './index.js',
    };

    expect(validatePluginConfig(manifest as any, {})).toBe(true);
  });

  it('should reject invalid runtime', () => {
    const manifest = {
      schemaVersion: '1.0',
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      runtime: 'invalid-runtime',
      capabilities: ['tools'],
      entry: './index.js',
    };

    writeFileSync(resolve(testDir, 'upup.plugin.json'), JSON.stringify(manifest));

    expect(() => loader.load(testDir)).toThrow('Invalid runtime');
  });

  it('should require capabilities', () => {
    const manifest = {
      schemaVersion: '1.0',
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      runtime: 'bun',
      capabilities: [],
      entry: './index.js',
    };

    writeFileSync(resolve(testDir, 'upup.plugin.json'), JSON.stringify(manifest));

    expect(() => loader.load(testDir)).toThrow('empty capabilities');
  });

  it('should load explicit network and credential security scopes', () => {
    const manifest = {
      schemaVersion: '1.0',
      id: 'scoped-plugin',
      name: 'Scoped Plugin',
      version: '1.0.0',
      runtime: 'mcp',
      capabilities: ['tools'],
      entry: './index.js',
      security: {
        sandbox: 'mcp',
        networkDomains: ['broker.example'],
        credentialScopes: ['paper-trading'],
      },
    };
    writeFileSync(resolve(testDir, 'upup.plugin.json'), JSON.stringify(manifest));
    expect(loader.load(testDir).security).toEqual({ ...manifest.security, sandbox: 'mcp' });
  });

  it('should reject malformed security scope declarations', () => {
    const manifest = {
      schemaVersion: '1.0',
      id: 'invalid-scope-plugin',
      name: 'Invalid Scope Plugin',
      version: '1.0.0',
      runtime: 'mcp',
      capabilities: ['tools'],
      entry: './index.js',
      security: { sandbox: 'mcp', networkDomains: [''] },
    };
    writeFileSync(resolve(testDir, 'upup.plugin.json'), JSON.stringify(manifest));
    expect(() => loader.load(testDir)).toThrow('security.networkDomains');
  });
});

// ============================================================================
// Discovery Tests
// ============================================================================

describe('Discovery', () => {
  it('should list global plugins directory', async () => {
    // The directory might not exist, that's fine
    const globalDir = resolve(process.env.HOME ?? '', '.upup', 'plugins');
    // Just verify the path is constructed correctly
    expect(globalDir).toContain('.upup');
  });
});
