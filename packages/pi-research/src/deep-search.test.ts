import { describe, expect, test } from 'bun:test';
import { DeepSearchEngine, expandQuery, type Document } from './deep-search';

const documents: Document[] = [
  {
    id: 'aapl-positive',
    source: 'fixture://broker',
    title: 'AAPL growth outlook',
    kind: 'broker_research',
    tickers: ['AAPL'],
    content: 'Apple beat earnings and raised guidance. Revenue growth accelerated on stronger demand.',
  },
  {
    id: 'aapl-risk',
    source: 'fixture://news',
    title: 'AAPL valuation risk',
    kind: 'news',
    tickers: ['AAPL'],
    content: 'Apple missed revenue expectations and lowered guidance. Margin compression remains a risk.',
  },
];

describe('Pi research deep-search core', () => {
  test('expands bilingual investment terminology', () => {
    expect(expandQuery('buy 增长')).toContain('overweight');
    expect(expandQuery('buy 增长')).toContain('扩张');
  });

  test('ranks documents and builds related evidence deterministically', () => {
    const engine = new DeepSearchEngine();
    documents.forEach((document) => engine.addDocument(document));
    const result = engine.search('AAPL growth', { limit: 2, tickers: ['AAPL'] });
    expect(result.corpusSize).toBe(2);
    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]?.doc.id).toBe('aapl-positive');
    expect(result.hits[0]?.claims.length).toBeGreaterThan(0);
    expect(result.themeClusters).toBeDefined();
  });
});
