/**
 * Citation Registry Tests (Gap G1)
 *
 * Coverage:
 *  - add / get / getMarkdownLink / size / toJSON / fromJSON
 *  - estimateTokens / estimateCitationDensity (≤ 1 per 60)
 *  - extractCitationRefs (preserves order)
 *  - renderCitationFooter
 *  - unknown index throws (prompt must not invent [src:N])
 */

import { describe, expect, test } from 'bun:test';
import {
  CitationRegistry,
  estimateCitationDensity,
  estimateTokens,
  extractCitationRefs,
  renderCitationFooter,
} from './citation.js';

describe('CitationRegistry', () => {
  test('add returns 1-based sequential indices', () => {
    const r = new CitationRegistry();
    expect(r.add({ url: 'https://sec.gov/abc', kind: 'filing', snippet: '10-K' })).toBe(1);
    expect(r.add({ url: 'https://news/xyz', kind: 'news', snippet: 'Reuters' })).toBe(2);
    expect(r.add({ url: 'upup://dossier/AAPL', kind: 'kb', snippet: 'dossier' })).toBe(3);
    expect(r.size()).toBe(3);
  });

  test('getMarkdownLink renders inline markdown', () => {
    const r = new CitationRegistry();
    const idx = r.add({ url: 'https://sec.gov/abc', kind: 'filing', snippet: '10-K' });
    expect(r.getMarkdownLink(idx)).toBe('[10-K](https://sec.gov/abc)');
  });

  test('unknown index throws — prevents hallucinated [src:N]', () => {
    const r = new CitationRegistry();
    r.add({ url: 'https://x', kind: 'news', snippet: 's' });
    expect(() => r.get(99)).toThrow(/Unknown citation/);
    expect(() => r.getMarkdownLink(99)).toThrow(/Unknown citation/);
  });

  test('add rejects empty required fields', () => {
    const r = new CitationRegistry();
    expect(() => r.add({ url: '', kind: 'news', snippet: 's' })).toThrow();
    expect(() => r.add({ url: 'u', kind: 'news', snippet: '' })).toThrow();
  });

  test('toJSON + fromJSON round-trip preserves all refs', () => {
    const r = new CitationRegistry();
    r.add({ url: 'https://a', kind: 'filing', snippet: 'A' });
    r.add({ url: 'https://b', kind: 'news', snippet: 'B' });
    const restored = CitationRegistry.fromJSON(r.toJSON());
    expect(restored.size()).toBe(2);
    expect(restored.getMarkdownLink(1)).toBe('[A](https://a)');
    expect(restored.getMarkdownLink(2)).toBe('[B](https://b)');
  });
});

describe('citation density', () => {
  test('estimateTokens rough but consistent', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
    expect(estimateTokens('a'.repeat(240))).toBe(60);
  });

  test('on budget boundary (1 per 60) → not exceedsBudget', () => {
    // 240 chars / 4 = 60 tokens; 1 citation → 1/60 ratio
    const r = estimateCitationDensity('a'.repeat(240), 1);
    expect(r.tokens).toBe(60);
    expect(r.ratio).toBeCloseTo(1 / 60);
    // Boundary: not strict-greater, so not exceeds
    expect(r.exceedsBudget).toBe(false);
  });

  test('over budget → exceedsBudget = true', () => {
    // 240 chars / 4 = 60 tokens; 4 citations → 4/60 > 1/60
    const r = estimateCitationDensity('a'.repeat(240), 4);
    expect(r.tokens).toBe(60);
    expect(r.ratio).toBeCloseTo(4 / 60);
    expect(r.exceedsBudget).toBe(true);
  });

  test('well under budget with sparse citations', () => {
    // 600 tokens, 2 citations → 2/600 < 1/60
    const r = estimateCitationDensity('a'.repeat(2400), 2);
    expect(r.tokens).toBe(600);
    expect(r.exceedsBudget).toBe(false);
  });

  test('empty text → ratio 0, not exceeds', () => {
    const r = estimateCitationDensity('', 5);
    expect(r.ratio).toBe(0);
    expect(r.exceedsBudget).toBe(false);
  });
});

describe('extractCitationRefs', () => {
  test('preserves left-to-right order', () => {
    const text = 'NVDA [src:2] reported [src:1] revenue [src:3] growth [src:2].';
    expect(extractCitationRefs(text)).toEqual([2, 1, 3, 2]);
  });

  test('ignores malformed references', () => {
    expect(extractCitationRefs('no refs here')).toEqual([]);
    expect(extractCitationRefs('[src:0] [src:abc]')).toEqual([]); // 0 and non-numeric
  });
});

describe('renderCitationFooter', () => {
  test('renders numbered list with kind and url', () => {
    const refs = [
      { index: 1, url: 'https://a', kind: 'filing' as const, snippet: '10-K', ts: 1 },
      { index: 2, url: 'https://b', kind: 'news' as const, snippet: 'Reuters', ts: 2 },
    ];
    const out = renderCitationFooter(refs);
    expect(out).toContain('## 引用');
    expect(out).toContain('[1] (filing) 10-K — https://a');
    expect(out).toContain('[2] (news) Reuters — https://b');
  });

  test('empty refs → empty string', () => {
    expect(renderCitationFooter([])).toBe('');
  });
});
