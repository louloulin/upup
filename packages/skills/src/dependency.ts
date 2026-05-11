/**
 * Skill Dependency Resolution
 *
 * Resolves skill dependencies using topological sort (Kahn's algorithm).
 * Detects circular dependencies and missing dependencies.
 *
 * Reference: Claude Code's skill dependency graph (conceptual)
 */

import type { SkillMetadata } from './types.js';

export interface DependencyError {
  type: 'circular' | 'missing';
  skill: string;
  detail: string;
}

export interface ResolutionResult {
  /** Skills in execution order (dependencies first) */
  executionOrder: string[];
  /** Any errors encountered during resolution */
  errors: DependencyError[];
  /** Skills that could not be resolved */
  unresolved: string[];
}

/**
 * Resolve execution order for a set of skills based on their dependencies.
 * Uses Kahn's algorithm for topological sorting.
 *
 * @param skills - Map of skill name → metadata
 * @param targets - Skills to resolve (if empty, resolves all)
 * @returns Resolution result with execution order and any errors
 */
export function resolveDependencies(
  skills: Map<string, SkillMetadata>,
  targets?: string[],
): ResolutionResult {
  const errors: DependencyError[] = [];
  const unresolved: string[] = [];

  // Collect all relevant skills
  const needed = new Set<string>();
  const queue: string[] = targets ?? [...skills.keys()];

  // BFS to collect all transitive dependencies
  for (const name of queue) {
    collectDeps(name, skills, needed, errors, unresolved, new Set());
  }

  // Build adjacency list and in-degree map
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>(); // dep → [skills that depend on it]

  for (const name of needed) {
    if (!inDegree.has(name)) inDegree.set(name, 0);
    if (!adjList.has(name)) adjList.set(name, []);

    const skill = skills.get(name);
    const deps = skill?.dependsOn ?? [];

    for (const dep of deps) {
      if (!needed.has(dep)) continue; // Skip missing deps (already reported)
      if (!adjList.has(dep)) adjList.set(dep, []);
      adjList.get(dep)!.push(name);
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const order: string[] = [];
  const kahnQueue: string[] = [];

  for (const [name, degree] of inDegree) {
    if (degree === 0) kahnQueue.push(name);
  }

  while (kahnQueue.length > 0) {
    const name = kahnQueue.shift()!;
    order.push(name);

    for (const dependent of adjList.get(name) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        kahnQueue.push(dependent);
      }
    }
  }

  // Detect circular dependencies (skills remaining in in-degree > 0)
  for (const [name, degree] of inDegree) {
    if (degree > 0) {
      errors.push({
        type: 'circular',
        skill: name,
        detail: `Circular dependency detected involving '${name}'`,
      });
      // Still include in order (at the end) to not block execution
      if (!order.includes(name)) {
        order.push(name);
      }
    }
  }

  return { executionOrder: order, errors, unresolved };
}

/**
 * Recursively collect all dependencies for a skill.
 */
function collectDeps(
  name: string,
  skills: Map<string, SkillMetadata>,
  needed: Set<string>,
  errors: DependencyError[],
  unresolved: string[],
  visiting: Set<string>,
): void {
  if (needed.has(name)) return;

  // Circular detection during collection
  if (visiting.has(name)) {
    errors.push({
      type: 'circular',
      skill: name,
      detail: `Circular dependency chain detected at '${name}'`,
    });
    return;
  }

  const skill = skills.get(name);
  if (!skill) {
    errors.push({
      type: 'missing',
      skill: name,
      detail: `Skill '${name}' not found`,
    });
    unresolved.push(name);
    return;
  }

  visiting.add(name);

  // Process dependencies first
  if (skill.dependsOn) {
    for (const dep of skill.dependsOn) {
      collectDeps(dep, skills, needed, errors, unresolved, visiting);
    }
  }

  visiting.delete(name);
  needed.add(name);
}

/**
 * Get the dependency graph for visualization or debugging.
 * Returns edges as [from, to] pairs where 'from' depends on 'to'.
 */
export function getDependencyGraph(skills: Map<string, SkillMetadata>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const [name, skill] of skills) {
    if (skill.dependsOn) {
      for (const dep of skill.dependsOn) {
        edges.push([name, dep]);
      }
    }
  }
  return edges;
}

/**
 * Check if a specific skill has all its dependencies met.
 */
export function areDependenciesMet(
  skillName: string,
  skills: Map<string, SkillMetadata>,
): { met: boolean; missing: string[] } {
  const skill = skills.get(skillName);
  if (!skill) return { met: false, missing: [skillName] };
  if (!skill.dependsOn || skill.dependsOn.length === 0) return { met: true, missing: [] };

  const missing = skill.dependsOn.filter(dep => !skills.has(dep));
  return { met: missing.length === 0, missing };
}
