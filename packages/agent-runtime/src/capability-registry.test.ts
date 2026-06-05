/**
 * Capability Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getCapabilityRegistry,
  resetCapabilityRegistry,
  checkCapability,
  listCapabilities,
  getDefaultUserPermissions,
  type Capability,
} from './capability-registry.js';

describe('CapabilityRegistry', () => {
  beforeEach(() => {
    resetCapabilityRegistry();
  });

  afterEach(() => {
    resetCapabilityRegistry();
  });

  describe('getCapabilityRegistry', () => {
    it('should return singleton instance', () => {
      const reg1 = getCapabilityRegistry();
      const reg2 = getCapabilityRegistry();
      expect(reg1).toBe(reg2);
    });

    it('should initialize with default capabilities', () => {
      const registry = getCapabilityRegistry();
      const capabilities = registry.list();
      expect(capabilities.length).toBeGreaterThan(0);
    });
  });

  describe('register and unregister', () => {
    it('should register new capability', () => {
      const registry = getCapabilityRegistry();
      const initialCount = registry.list().length;

      registry.register({
        id: 'test:custom-capability',
        name: 'Test Capability',
        description: 'A test capability',
        category: 'tool',
        permissions: ['test:permission'],
      });

      expect(registry.list().length).toBe(initialCount + 1);
      expect(registry.get('test:custom-capability')).toBeDefined();
    });

    it('should unregister capability', () => {
      const registry = getCapabilityRegistry();

      registry.register({
        id: 'test:temp-capability',
        name: 'Temp Capability',
        description: 'A temporary capability',
        category: 'tool',
        permissions: ['test:permission'],
      });

      expect(registry.get('test:temp-capability')).toBeDefined();

      const result = registry.unregister('test:temp-capability');
      expect(result).toBe(true);
      expect(registry.get('test:temp-capability')).toBeUndefined();
    });

    it('should return false when unregistering non-existent capability', () => {
      const registry = getCapabilityRegistry();
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('check capability', () => {
    it('should allow capability with matching permissions', () => {
      const result = checkCapability('tool:read-market-data', [
        'market-data:read',
      ]);
      expect(result.allowed).toBe(true);
    });

    it('should deny capability with missing permissions', () => {
      const result = checkCapability('tool:write-file', []);
      expect(result.allowed).toBe(false);
      expect(result.missingPermissions).toBeDefined();
      expect(result.missingPermissions!.length).toBeGreaterThan(0);
    });

    it('should deny non-existent capability', () => {
      const result = checkCapability('non-existent', ['test:permission']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should deny disabled capability', () => {
      const registry = getCapabilityRegistry();
      registry.setEnabled('tool:read-market-data', false);

      const result = checkCapability('tool:read-market-data', [
        'market-data:read',
      ]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });
  });

  describe('list capabilities', () => {
    it('should list all capabilities', () => {
      const capabilities = listCapabilities();
      expect(capabilities.length).toBeGreaterThan(0);
    });

    it('should list capabilities by category', () => {
      const toolCapabilities = listCapabilities('tool');
      expect(toolCapabilities.length).toBeGreaterThan(0);
      expect(toolCapabilities.every(c => c.category === 'tool')).toBe(true);

      const analysisCapabilities = listCapabilities('analysis');
      expect(analysisCapabilities.every(c => c.category === 'analysis')).toBe(
        true
      );
    });

    it('should list by category for all categories', () => {
      const categories = [
        'tool',
        'data-source',
        'analysis',
        'execution',
        'monitor',
      ] as const;

      for (const category of categories) {
        const capabilities = listCapabilities(category);
        // Category should exist, may be empty
        expect(capabilities.every(c => c.category === category)).toBe(true);
      }
    });
  });

  describe('setEnabled', () => {
    it('should enable capability', () => {
      const registry = getCapabilityRegistry();
      registry.setEnabled('tool:read-market-data', false);

      let result = checkCapability('tool:read-market-data', ['market-data:read']);
      expect(result.allowed).toBe(false);

      registry.setEnabled('tool:read-market-data', true);
      result = checkCapability('tool:read-market-data', ['market-data:read']);
      expect(result.allowed).toBe(true);
    });

    it('should return false for non-existent capability', () => {
      const registry = getCapabilityRegistry();
      const result = registry.setEnabled('non-existent', true);
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const registry = getCapabilityRegistry();
      const stats = registry.getStats();

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.enabled).toBeGreaterThan(0);
      expect(stats.byCategory).toBeDefined();
      expect(stats.byCategory.tool).toBeGreaterThan(0);
    });
  });

  describe('default user permissions', () => {
    it('should include read permissions', () => {
      const permissions = getDefaultUserPermissions();
      expect(permissions).toContain('market-data:read');
      expect(permissions).toContain('financials:read');
      expect(permissions).toContain('filings:read');
    });

    it('should not include write permissions', () => {
      const permissions = getDefaultUserPermissions();
      expect(permissions).not.toContain('filesystem:write');
      expect(permissions).not.toContain('bash:execute');
    });
  });

  describe('permission mapping', () => {
    it('should find capabilities for a permission', () => {
      const registry = getCapabilityRegistry();
      const capabilities = registry.getCapabilitiesForPermission(
        'market-data:read'
      );
      expect(capabilities.length).toBeGreaterThan(0);
    });
  });

  describe('integration with investment config', () => {
    it('should allow portfolio operations with elevated permissions', () => {
      const elevatedPermissions = [
        ...getDefaultUserPermissions(),
        'portfolio:write',
      ];

      const result = checkCapability('tool:manage-portfolio', elevatedPermissions);
      expect(result.allowed).toBe(true);
    });

    it('should deny portfolio operations without elevated permissions', () => {
      const result = checkCapability('tool:manage-portfolio', getDefaultUserPermissions());
      expect(result.allowed).toBe(false);
    });
  });
});