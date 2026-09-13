/**
 * Tests for the citation registry and density utilities. The registry
 * numbers citations 1-based for a single query, enforces required fields
 * on `add`, and provides snapshot/restore for evals and MCP resources.
 * Density utilities enforce a configurable citations-per-tokens budget.
 */

import { describe, expect, test } from 'bun:test';
import {
  CitationRegistry,
  estimateCitationDensity,
  estimateTokens,
  extractCitationRefs,
  renderCitationFooter,
  type CitationRef,
} from './citation.js';

describe('CitationRegistry', () => {
  test('numbers citations 1-based and rejects missing required fields', () => {
    const registry = new CitationRegistry();
    const first = registry.add({ url: 'https://sec.gov/10k', kind: 'filing', snippet: 'AAPL FY24 10-K' });
    const second = registry.add({ url: 'https://news.example/aapl', kind: 'news', snippet: 'AAPL Q4 results' });
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(registry.size()).toBe(2);
    expect(registry.get(1).url).toBe('https://sec.gov/10k');
    expect(() => registry.add({ url: '', kind: 'filing', snippet: 'broken' })).toThrow(/required/);
    expect(() => registry.add({ url: 'https://x', kind: 'filing', snippet: '' })).toThrow(/required/);
  });

  test('throws on unknown index and renders markdown links deterministically', () => {
    const registry = new CitationRegistry();
    registry.add({ url: 'https://a', kind: 'news', snippet: 'snippet-A' });
    expect(() => registry.get(99)).toThrow(/Unknown citation/);
    expect(registry.getMarkdownLink(1)).toBe('[snippet-A](https://a)');
  });

  test('round-trips via toJSON and fromJSON preserving indices', () => {
    const registry = new CitationRegistry();
    registry.add({ url: 'https://a', kind: 'filing', snippet: 'a' });
    registry.add({ url: 'https://b', kind: 'news', snippet: 'b' });
    const snapshot = registry.toJSON();
    const restored = CitationRegistry.fromJSON(snapshot);
    expect(restored.size()).toBe(2);
    expect(restored.get(2).snippet).toBe('b');
    expect(restored.getMarkdownLink(1)).toBe('[a](https://a)');
  });
});

describe('citation density and token utilities', () => {
  test('estimateTokens uses the ~4 chars/token heuristic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  test('estimateCitationDensity flags when the budget is exceeded', () => {
    // 60 chars => 15 tokens; 2 citations => ratio 2/15 = 0.1333 > 1/60.
    const tight = estimateCitationDensity('a'.repeat(60), 2);
    expect(tight.tokens).toBe(15);
    expect(tight.exceedsBudget).toBe(true);
    // 720 chars => 180 tokens; 2 citations => ratio 2/180 = 0.0111 < 1/60.
    const roomy = estimateCitationDensity('a'.repeat(720), 2);
    expect(roomy.tokens).toBe(180);
    expect(roomy.exceedsBudget).toBe(false);
    // Zero text always reports zero density, never exceeds.
    expect(estimateCitationDensity('', 5).exceedsBudget).toBe(false);
  });

  test('extractCitationRefs returns left-to-right 1-based numbers from [src:N] markers', () => {
    expect(extractCitationRefs('No citations here.')).toEqual([]);
    expect(extractCitationRefs('See [src:2] then [src:1] then [src:3].')).toEqual([2, 1, 3]);
    expect(extractCitationRefs('Bad [src:0] and [src:-1] and [src:abc] are dropped.')).toEqual([]);
  });
});

describe('renderCitationFooter', () => {
  test('returns empty string when there are no refs and renders a numbered footer otherwise', () => {
    expect(renderCitationFooter([])).toBe('');
    const refs: CitationRef[] = [
      { index: 1, url: 'https://sec.gov/a', kind: 'filing', snippet: 'AAPL 10-K', ts: 0 },
      { index: 2, url: 'https://news/b', kind: 'news', snippet: 'AAPL Q4', ts: 0 },
    ];
    const footer = renderCitationFooter(refs);
    expect(footer).toContain('## 引用');
    expect(footer).toContain('[1] (filing) AAPL 10-K — https://sec.gov/a');
    expect(footer).toContain('[2] (news) AAPL Q4 — https://news/b');
  });
});
