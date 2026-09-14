/**
 * Nested Memory Paths Test
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import {
  NestedMemoryPaths,
  getNestedMemoryPaths,
  resetNestedMemoryPaths,
  registerDefaultMemoryPaths,
} from '@upup/memory';

const TEST_DIR = '/tmp/dexter-nested-paths-test';

describe('NestedMemoryPaths', () => {
  let manager: NestedMemoryPaths;

  beforeEach(() => {
    manager = new NestedMemoryPaths();
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    manager.clear();
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('registerPath', () => {
    it('should register a path', () => {
      const path = manager.registerPath({
        id: 'test',
        scope: 'project',
        path: join(TEST_DIR, 'test'),
      });

      expect(path.id).toBe('test');
      expect(path.scope).toBe('project');
      expect(path.active).toBe(true);
      expect(manager.getPath('test')).toBeDefined();
    });

    it('should set parent-child relationship', () => {
      manager.registerPath({
        id: 'parent',
        scope: 'project',
        path: join(TEST_DIR, 'parent'),
      });

      manager.registerPath({
        id: 'parent/child',
        scope: 'session',
        path: join(TEST_DIR, 'parent', 'child'),
        parentPath: 'parent',
        priority: 20,
      });

      const parent = manager.getPath('parent');
      const child = manager.getPath('parent/child');

      expect(parent?.childPaths).toContain('parent/child');
      expect(child?.parentPath).toBe('parent');
    });

    it('should overwrite existing path with same id', () => {
      manager.registerPath({
        id: 'test',
        scope: 'project',
        path: join(TEST_DIR, 'test'),
        priority: 10,
      });

      manager.registerPath({
        id: 'test',
        scope: 'user',
        path: join(TEST_DIR, 'updated'),
        priority: 20,
      });

      const path = manager.getPath('test');
      expect(path?.scope).toBe('user');
      expect(path?.priority).toBe(20);
    });
  });

  describe('unregisterPath', () => {
    it('should unregister a path', () => {
      manager.registerPath({
        id: 'test',
        scope: 'project',
        path: join(TEST_DIR, 'test'),
      });

      expect(manager.unregisterPath('test')).toBe(true);
      expect(manager.getPath('test')).toBeUndefined();
    });

    it('should unregister children recursively', () => {
      manager.registerPath({
        id: 'parent',
        scope: 'project',
        path: join(TEST_DIR, 'parent'),
      });

      manager.registerPath({
        id: 'parent/child',
        scope: 'session',
        path: join(TEST_DIR, 'parent', 'child'),
        parentPath: 'parent',
      });

      manager.unregisterPath('parent');

      expect(manager.getPath('parent')).toBeUndefined();
      expect(manager.getPath('parent/child')).toBeUndefined();
    });

    it('should return false for non-existent path', () => {
      expect(manager.unregisterPath('non-existent')).toBe(false);
    });
  });

  describe('resolvePath', () => {
    it('should resolve existing path', () => {
      manager.registerPath({
        id: 'test',
        scope: 'project',
        path: join(TEST_DIR, 'test'),
      });

      const resolved = manager.resolvePath('test');
      expect(resolved).toContain('test');
    });

    it('should create path if create option is true', () => {
      const newPath = join(TEST_DIR, 'new-nested', 'path');
      manager.registerPath({
        id: 'nested',
        scope: 'project',
        path: newPath,
      });

      manager.resolvePath('nested', { create: true });
      expect(existsSync(newPath)).toBe(true);
    });

    it('should return null for non-existent path without fallback', () => {
      const resolved = manager.resolvePath('non-existent', { fallbackToParent: false });
      expect(resolved).toBeNull();
    });
  });

  describe('findMatchingPaths', () => {
    it('should find paths matching pattern', () => {
      manager.registerPath({ id: 'team/a', scope: 'team', path: '/a' });
      manager.registerPath({ id: 'team/b', scope: 'team', path: '/b' });
      manager.registerPath({ id: 'project/a', scope: 'project', path: '/a' });

      const matches = manager.findMatchingPaths('team/*');
      expect(matches).toHaveLength(2);
    });
  });

  describe('getPathHierarchy', () => {
    it('should return full hierarchy from root to leaf', () => {
      manager.registerPath({ id: 'root', scope: 'global', path: '/root' });
      manager.registerPath({ id: 'root/parent', scope: 'user', path: '/root/parent', parentPath: 'root' });
      manager.registerPath({ id: 'root/parent/child', scope: 'project', path: '/root/parent/child', parentPath: 'root/parent' });

      const hierarchy = manager.getPathHierarchy('root/parent/child');

      expect(hierarchy).toHaveLength(3);
      expect(hierarchy[0].id).toBe('root');
      expect(hierarchy[1].id).toBe('root/parent');
      expect(hierarchy[2].id).toBe('root/parent/child');
    });
  });

  describe('getChildPaths', () => {
    it('should return direct children', () => {
      manager.registerPath({ id: 'parent', scope: 'project', path: '/parent' });
      manager.registerPath({ id: 'parent/child1', scope: 'session', path: '/parent/child1', parentPath: 'parent' });
      manager.registerPath({ id: 'parent/child2', scope: 'session', path: '/parent/child2', parentPath: 'parent' });

      const children = manager.getChildPaths('parent');
      expect(children).toHaveLength(2);
    });
  });

  describe('containsPath', () => {
    it('should return true if outer contains inner', () => {
      manager.registerPath({ id: 'outer', scope: 'project', path: '/outer' });
      manager.registerPath({ id: 'outer/inner', scope: 'session', path: '/outer/inner', parentPath: 'outer' });

      expect(manager.containsPath('outer', 'outer/inner')).toBe(true);
    });

    it('should return false if outer does not contain inner', () => {
      manager.registerPath({ id: 'a', scope: 'project', path: '/a' });
      manager.registerPath({ id: 'b', scope: 'project', path: '/b' });

      expect(manager.containsPath('a', 'b')).toBe(false);
    });
  });

  describe('listPaths', () => {
    it('should list all paths', () => {
      manager.registerPath({ id: 'a', scope: 'project', path: '/a', priority: 1 });
      manager.registerPath({ id: 'b', scope: 'user', path: '/b', priority: 2 });

      const paths = manager.listPaths();
      expect(paths).toHaveLength(2);
    });

    it('should filter by scope', () => {
      manager.registerPath({ id: 'a', scope: 'project', path: '/a' });
      manager.registerPath({ id: 'b', scope: 'user', path: '/b' });

      const userPaths = manager.listPaths({ scope: 'user' });
      expect(userPaths).toHaveLength(1);
      expect(userPaths[0].id).toBe('b');
    });

    it('should filter active only', () => {
      manager.registerPath({ id: 'a', scope: 'project', path: '/a' });
      manager.registerPath({ id: 'b', scope: 'user', path: '/b' });
      manager.setPathActive('b', false);

      const activePaths = manager.listPaths({ activeOnly: true });
      expect(activePaths).toHaveLength(1);
      expect(activePaths[0].id).toBe('a');
    });
  });
});

describe('Singleton', () => {
  afterEach(() => {
    resetNestedMemoryPaths();
  });

  it('should return same instance', () => {
    const instance1 = getNestedMemoryPaths();
    const instance2 = getNestedMemoryPaths();
    expect(instance1).toBe(instance2);
  });

  it('should reset between tests', () => {
    getNestedMemoryPaths().registerPath({ id: 'test', scope: 'project', path: '/test' });
    resetNestedMemoryPaths();
    const fresh = getNestedMemoryPaths();
    expect(fresh.getPath('test')).toBeUndefined();
  });
});

describe('registerDefaultMemoryPaths', () => {
  afterEach(() => {
    resetNestedMemoryPaths();
  });

  it('should register default paths', () => {
    registerDefaultMemoryPaths({ userDir: TEST_DIR, projectDir: TEST_DIR });

    const paths = getNestedMemoryPaths();
    expect(paths.getPath('global')).toBeDefined();
    expect(paths.getPath('user')).toBeDefined();
    expect(paths.getPath('project')).toBeDefined();
  });

  it('should set up hierarchy', () => {
    registerDefaultMemoryPaths({ userDir: TEST_DIR, projectDir: TEST_DIR });

    const paths = getNestedMemoryPaths();
    const user = paths.getPath('user');
    const project = paths.getPath('project');

    expect(user?.parentPath).toBe('global');
    expect(project?.parentPath).toBe('user');
  });
});