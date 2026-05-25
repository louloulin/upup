/**
 * Skills Suggestions Tests
 * Tests for getSkillsByTrigger, suggestSkills, and CLI integration
 */

import { describe, expect, test, beforeAll } from 'bun:test';
import { clearSkillCache } from '../src/skills/registry.ts';
import { initializeSkills } from '../src/skills/commands.ts';
import { getSkillCommandRegistry } from '../src/skills/slash-command.ts';
import { suggestSkills, formatSkillSuggestions, shouldSuggestSkills, getCliSkillSuggestion } from '../src/skills/skills-menu.ts';

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initializeSkills();
    initialized = true;
  }
}

describe('getSkillsByTrigger', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('should match skills by description keywords', async () => {
    const registry = getSkillCommandRegistry();
    expect(registry).toBeDefined();
    
    const matches = registry.getSkillsByTrigger('ETF基金涨跌排名');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].skill.name).toBe('a-share-fund');
  });

  test('should return empty array for no matches', async () => {
    const registry = getSkillCommandRegistry();
    const matches = registry.getSkillsByTrigger('xyznonexistent123');
    expect(matches.length).toBe(0);
  });

  test('should limit results correctly', async () => {
    const registry = getSkillCommandRegistry();
    const matches = registry.getSkillsByTrigger('分析基金', 2);
    expect(matches.length).toBeLessThanOrEqual(2);
  });
});

describe('suggestSkills', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('should return formatted suggestions', async () => {
    const suggestions = suggestSkills('ETF基金涨跌排名', 3);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toHaveProperty('name');
    expect(suggestions[0]).toHaveProperty('description');
    expect(suggestions[0]).toHaveProperty('score');
  });

  test('should respect limit parameter', async () => {
    const suggestions = suggestSkills('分析', 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe('formatSkillSuggestions', () => {
  test('should return empty message for empty array', () => {
    const result = formatSkillSuggestions([]);
    expect(result).toContain('No skill suggestions');
  });

  test('should format suggestions correctly', () => {
    const suggestions = [
      { name: 'test-skill', description: 'Test description', score: 50 }
    ];
    const result = formatSkillSuggestions(suggestions);
    expect(result).toContain('test-skill');
    expect(result).toContain('50');
  });
});

describe('shouldSuggestSkills', () => {
  test('should return false for slash commands', () => {
    expect(shouldSuggestSkills('/a-share-fund')).toBe(false);
  });

  test('should return false for short inputs', () => {
    expect(shouldSuggestSkills('ab')).toBe(false);
    expect(shouldSuggestSkills('测')).toBe(false);
  });

  test('should return true for normal inputs', () => {
    expect(shouldSuggestSkills('帮我分析基金')).toBe(true);
  });
});

describe('getCliSkillSuggestion', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('should return empty for slash commands', () => {
    expect(getCliSkillSuggestion('/a-share-fund')).toBe('');
  });

  test('should return hint for high confidence matches', () => {
    const result = getCliSkillSuggestion('ETF基金涨跌排名', 20);
    expect(result).toContain('💡');
    expect(result).toContain('/a-share-fund');
  });
});
