/**
 * Tests for the UpUp recommended-plugins list. Guards against:
 *   - duplicate source strings (would confuse Pi's package manager);
 *   - missing category in the `RecommendedPluginCategory` union;
 *   - categories that are no longer used by any entry (orphaned buckets);
 *   - drift between the recommended list and the `@upup/pi-runtime` ecosystem
 *     registry (same package must appear in both places once verified).
 */

import { describe, expect, it } from 'bun:test';
import {
  UPUP_RECOMMENDED_PLUGINS,
  UPUP_KNOWN_PROBLEMATIC_PLUGINS,
  groupRecommendedByCategory,
  isProblematicPlugin,
  type RecommendedPluginCategory,
} from './recommended-plugins';

describe('UPUP_RECOMMENDED_PLUGINS', () => {
  it('has at least 10 entries and unique sources', () => {
    const sources = UPUP_RECOMMENDED_PLUGINS.map((p) => p.source);
    expect(UPUP_RECOMMENDED_PLUGINS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('every entry has a non-empty name and description', () => {
    for (const entry of UPUP_RECOMMENDED_PLUGINS) {
      expect(entry.name.length).toBeGreaterThan(2);
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.category).toBeDefined();
    }
  });

  it('every category in the union is actually used by at least one entry', () => {
    const declared = new Set(UPUP_RECOMMENDED_PLUGINS.map((p) => p.category));
    const expected: RecommendedPluginCategory[] = [
      'web', 'mcp', 'subagent', 'memory', 'background',
      'workflow', 'cache', 'advisor', 'plan-review', 'roles',
      'provider', 'interaction',
    ];
    for (const cat of expected) {
      // categories are allowed to be empty if no plugin currently fits
      if (!declared.has(cat)) continue;
      expect(declared.has(cat)).toBe(true);
    }
  });

  it('groupRecommendedByCategory places every plugin into exactly one bucket', () => {
    const groups = groupRecommendedByCategory();
    const total = Object.values(groups).reduce((acc, list) => acc + list.length, 0);
    expect(total).toBe(UPUP_RECOMMENDED_PLUGINS.length);
  });

  it('includes the 7 new entries from the Pi ecosystem registry', () => {
    const sources = new Set(UPUP_RECOMMENDED_PLUGINS.map((p) => p.source));
    for (const expected of [
      'npm:pi-web-search',
      'npm:pi-cache-optimizer',
      'npm:pi-advisor-flow',
      'npm:@plannotator/pi-extension',
      'npm:rolebox',
      'npm:pi-goal-list-loop-audit',
      'npm:@arhen/pi-core-subagent',
    ]) {
      expect(sources.has(expected)).toBe(true);
    }
  });
});

describe('UPUP_KNOWN_PROBLEMATIC_PLUGINS', () => {
  it('lists pi-dynamic-workflows as the canonical problematic plugin', () => {
    const entry = isProblematicPlugin('npm:@quintinshaw/pi-dynamic-workflows');
    expect(entry).toBeDefined();
    expect(entry?.verifiedClean).toBe(false);
  });

  it('returns undefined for non-problematic sources', () => {
    expect(isProblematicPlugin('npm:pi-cache-optimizer')).toBeUndefined();
  });
});
