/**
 * Skill Fuzzy Search Module
 *
 * Provides fuzzy search functionality for skills using Fuse.js.
 * Implements search with priority sorting: exact > prefix > fuzzy.
 *
 * Reference: Claude Code's commandSuggestions.ts
 */

import Fuse, { type FuseResultMatch } from 'fuse.js';
import type { SkillCommand } from './types.js';


// ============================================================================
// Types
// ============================================================================

/**
 * Search options for fuzzy search
 */
export interface SearchOptions {
  /** Match threshold (0-1), lower is stricter */
  threshold?: number;
  /** Maximum number of results */
  limit?: number;
  /** Include description in search */
  includeDescription?: boolean;
}

/**
 * Skill search result with score
 */
export interface SearchResult {
  /** The matched skill command */
  item: SkillCommand;
  /** Fuse.js score (lower is better) */
  score: number;
  /** Match details */
  matches?: readonly FuseResultMatch[];
}


// ============================================================================
// Fuse.js Instance
// ============================================================================

let fuseInstance: Fuse<SkillCommand> | null = null;
let fuseSkills: SkillCommand[] = [];
let searchInitialized = false;

/**
 * Initialize Fuse.js search index with skills
 */
export function initFuseSearch(skills: SkillCommand[]): void {
  if (skills.length === 0) {
    fuseInstance = null;
    fuseSkills = [];
    searchInitialized = false;
    return;
  }

  fuseSkills = skills;
  fuseInstance = new Fuse(skills, {
    includeScore: true,
    includeMatches: true,
    threshold: 0.3, // Relatively strict matching
    location: 0,
    distance: 100, // Allow matches in description
    keys: [
      { name: 'name', weight: 3 },           // Highest priority
      { name: 'argumentHint', weight: 2 },    // Argument hints
      { name: 'whenToUse', weight: 1.5 },    // When to use hints
      { name: 'description', weight: 0.5 },  // Description (lowest priority)
    ],
  });
  searchInitialized = true;
}

/**
 * Check if search index is initialized
 */
export function isSearchInitialized(): boolean {
  return searchInitialized;
}

/**
 * Clear search index
 */
export function clearSearchIndex(): void {
  fuseInstance = null;
  fuseSkills = [];
  searchInitialized = false;
}


// ============================================================================
// Search Functions
// ============================================================================

/**
 * Fuzzy search skills by query
 */
export function searchSkills(
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  if (!query || query.trim() === '') {
    // No query - return first N skills
    return fuseSkills
      .slice(0, options.limit || 10)
      .map(item => ({ item, score: 0 }));
  }

  if (!fuseInstance) {
    return [];
  }

  const results = fuseInstance.search(query, {
    limit: options.limit || 20,
  });

  return results.map(r => ({
    item: r.item,
    score: r.score ?? 0,
    matches: r.matches,
  }));
}

/**
 * Search and sort by match quality
 *
 * Priority:
 * 1. Exact name match
 * 2. Prefix name match (shorter first)
 * 3. Fuse.js score
 * 4. Recent usage score (if enabled)
 */
export function searchSkillsSorted(
  query: string,
  options: SearchOptions = {}
): SkillCommand[] {
  const results = searchSkills(query, options);
  const q = query.toLowerCase();

  return results
    .sort((a, b) => {
      const aName = a.item.name.toLowerCase();
      const bName = b.item.name.toLowerCase();

      // 1. Exact match first
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;

      // 2. Prefix match (shorter name first)
      const aPrefix = aName.startsWith(q);
      const bPrefix = bName.startsWith(q);
      if (aPrefix && !bPrefix) return -1;
      if (bPrefix && !aPrefix) return 1;
      if (aPrefix && bPrefix) {
        return aName.length - bName.length;
      }

      // 3. Fuse score (lower is better)
      return a.score - b.score;
    })
    .map(r => r.item);
}

/**
 * Search and sort with recent usage boost
 *
 * Priority:
 * 1. Exact name match
 * 2. Prefix name match (shorter first)
 * 3. Recent usage score (7-day half-life)
 * 4. Fuse.js score
 */
export function searchSkillsWithRecent(
  query: string,
  options: SearchOptions = {}
): SkillCommand[] {
  const results = searchSkills(query, options);
  const q = query.toLowerCase();

  // Lazy import to avoid circular dependency
  const { getRecentScore } = require('./recent-usage.js');

  return results
    .sort((a, b) => {
      const aName = a.item.name.toLowerCase();
      const bName = b.item.name.toLowerCase();

      // 1. Exact match first
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;

      // 2. Prefix match (shorter name first)
      const aPrefix = aName.startsWith(q);
      const bPrefix = bName.startsWith(q);
      if (aPrefix && !bPrefix) return -1;
      if (bPrefix && !aPrefix) return 1;
      if (aPrefix && bPrefix) {
        return aName.length - bName.length;
      }

      // 3. Recent usage score (higher is better)
      const aRecent = getRecentScore(aName);
      const bRecent = getRecentScore(bName);
      if (aRecent !== bRecent) {
        return bRecent - aRecent;  // Higher recent score first
      }

      // 4. Fuse score (lower is better)
      return a.score - b.score;
    })
    .map(r => r.item);
}

/**
 * Quick search with just prefix matching
 * This is faster than fuzzy search for simple cases
 */
export function searchSkillsPrefix(
  skills: SkillCommand[],
  query: string,
  limit?: number
): SkillCommand[] {
  if (!query || query.trim() === '') {
    return skills.slice(0, limit || 10);
  }

  const q = query.toLowerCase();
  const matches = skills.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q)
  );

  // Sort by: exact > prefix > contains
  return matches
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      // Exact match first
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;

      // Prefix match (shorter first)
      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      if (aStarts && bStarts) {
        return aName.length - bName.length;
      }

      // Then by name length
      return aName.length - bName.length;
    })
    .slice(0, limit);
}


// ============================================================================
// CLI Integration Helpers
// ============================================================================

/**
 * Get search results for CLI autocomplete
 * Initializes search index if needed
 */
export function getSearchResultsForCli(
  skills: SkillCommand[],
  query: string,
  limit?: number
): SkillCommand[] {
  // Initialize if needed
  if (!searchInitialized || fuseSkills !== skills) {
    initFuseSearch(skills);
  }

  // For very simple queries (prefix only), use faster prefix search
  if (isPrefixOnlyQuery(query)) {
    return searchSkillsPrefix(skills, query, limit);
  }

  // For complex queries, use fuzzy search
  return searchSkillsSorted(query, { limit });
}

/**
 * Check if query is simple prefix only (no special characters)
 */
function isPrefixOnlyQuery(query: string): boolean {
  // Simple alphanumeric prefixes don't need fuzzy search
  const simplePattern = /^[a-zA-Z0-9_-]+$/;
  return simplePattern.test(query) && query.length < 4;
}
