import { describe, test, expect } from 'bun:test';
import { resolveDependencies, getDependencyGraph, areDependenciesMet } from './dependency.js';
import type { SkillMetadata } from '@upup/skills';

function makeSkill(name: string, dependsOn?: string[]): SkillMetadata {
  return {
    name,
    description: `Skill ${name}`,
    path: `/skills/${name}/SKILL.md`,
    source: 'builtin',
    dependsOn,
  };
}

describe('Skill Dependency Resolution', () => {
  test('resolves skills with no dependencies', () => {
    const skills = new Map([
      ['a', makeSkill('a')],
      ['b', makeSkill('b')],
      ['c', makeSkill('c')],
    ]);
    const result = resolveDependencies(skills);
    expect(result.executionOrder).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);
  });

  test('resolves simple dependency chain', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['b'])],
      ['b', makeSkill('b', ['c'])],
      ['c', makeSkill('c')],
    ]);
    const result = resolveDependencies(skills, ['a']);
    expect(result.executionOrder).toEqual(['c', 'b', 'a']);
    expect(result.errors).toHaveLength(0);
  });

  test('resolves diamond dependency', () => {
    const skills = new Map([
      ['d', makeSkill('d', ['b', 'c'])],
      ['b', makeSkill('b', ['a'])],
      ['c', makeSkill('c', ['a'])],
      ['a', makeSkill('a')],
    ]);
    const result = resolveDependencies(skills, ['d']);
    // 'a' must come before 'b' and 'c'; 'b' and 'c' must come before 'd'
    const order = result.executionOrder;
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });

  test('detects missing dependencies', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['nonexistent'])],
    ]);
    const result = resolveDependencies(skills, ['a']);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe('missing');
    expect(result.errors[0].skill).toBe('nonexistent');
    expect(result.unresolved).toContain('nonexistent');
  });

  test('detects circular dependencies', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['b'])],
      ['b', makeSkill('b', ['a'])],
    ]);
    const result = resolveDependencies(skills, ['a']);
    expect(result.errors.some(e => e.type === 'circular')).toBe(true);
  });

  test('resolves all skills when no targets specified', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['b'])],
      ['b', makeSkill('b')],
    ]);
    const result = resolveDependencies(skills);
    expect(result.executionOrder).toHaveLength(2);
    expect(result.executionOrder.indexOf('b')).toBeLessThan(result.executionOrder.indexOf('a'));
  });

  test('handles multiple independent dependency chains', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['c'])],
      ['b', makeSkill('b', ['d'])],
      ['c', makeSkill('c')],
      ['d', makeSkill('d')],
    ]);
    const result = resolveDependencies(skills, ['a', 'b']);
    const order = result.executionOrder;
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('b'));
  });

  test('getDependencyGraph returns edges', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['b'])],
      ['b', makeSkill('b', ['c'])],
      ['c', makeSkill('c')],
    ]);
    const graph = getDependencyGraph(skills);
    expect(graph).toEqual([['a', 'b'], ['b', 'c']]);
  });

  test('areDependenciesMet returns true for no deps', () => {
    const skills = new Map([['a', makeSkill('a')]]);
    const result = areDependenciesMet('a', skills);
    expect(result.met).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('areDependenciesMet returns false for missing deps', () => {
    const skills = new Map([['a', makeSkill('a', ['b'])]]);
    const result = areDependenciesMet('a', skills);
    expect(result.met).toBe(false);
    expect(result.missing).toContain('b');
  });

  test('areDependenciesMet returns true when all deps exist', () => {
    const skills = new Map([
      ['a', makeSkill('a', ['b'])],
      ['b', makeSkill('b')],
    ]);
    const result = areDependenciesMet('a', skills);
    expect(result.met).toBe(true);
  });

  test('areDependenciesMet returns false for unknown skill', () => {
    const result = areDependenciesMet('unknown', new Map());
    expect(result.met).toBe(false);
    expect(result.missing).toContain('unknown');
  });
});
