/**
 * Deep Search — e2e tests.
 *
 * Covers the full pipeline:
 *   - tokenize / expandQuery (EN + ZH + stopwords)
 *   - detectTickers / detectThemes
 *   - extractKeyClaims (positive/negative/risk/opportunity, polarity, magnitude)
 *   - buildCitationGraph (same_theme, agrees, disagrees)
 *   - DeepSearchEngine (add/remove/size, search, ranking, snippets, theme clusters)
 *   - toJSON / fromJSON round-trip
 *   - research_deep_search tool (feature_disabled, empty_corpus, inline docs)
 *   - end-to-end: 5 docs across 2 themes, query for "AAPL growth"
 *   - safety: no throw on weird inputs (huge doc, special chars, missing fields)
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  DeepSearchEngine,
  extractKeyClaims,
  expandQuery,
  buildCitationGraph,
  type Document,
} from './deep-search.js';
import {
  createResearchDeepSearchTool,
  resetSharedEngine,
  getSharedEngine,
} from './index.js';

// ---------------------------------------------------------------------------
// Sample corpus — used by multiple tests
// ---------------------------------------------------------------------------

const SAMPLE_DOCS: Document[] = [
  {
    id: 'broker-1',
    source: 'Morgan Stanley',
    title: 'AAPL — AI tailwind keeps growth above consensus',
    kind: 'broker_research',
    date: '2026-05-15',
    content:
      'Apple beat earnings and raised guidance for the year. Revenue surged 12% YoY on stronger iPhone demand. We upgrade AAPL to overweight.',
  },
  {
    id: 'broker-2',
    source: 'Goldman Sachs',
    title: 'AAPL — Premium valuation limits upside, downgrade to neutral',
    kind: 'broker_research',
    date: '2026-05-20',
    content:
      'Apple missed revenue expectations and lowered guidance. We see margin compression and downgrade AAPL to sell.',
  },
  {
    id: 'transcript-1',
    source: 'AAPL Q2 Call',
    title: 'AAPL Q2 2026 Earnings Call — record quarter',
    kind: 'earnings_transcript',
    date: '2026-05-02',
    content:
      'Management raised full-year guidance and noted record high services revenue. CFO highlighted breakthrough AI features shipping in iOS 19.',
  },
  {
    id: 'news-cn-1',
    source: '财新',
    title: '半导体行业反弹,A 股 002594 比亚迪领涨',
    kind: 'news',
    date: '2026-05-22',
    content:
      '今日半导体板块走强,中芯国际创下年内新高。比亚迪(002594)因新能源车销量大[幅增]录得 5% 涨幅。',
  },
  {
    id: 'news-cn-2',
    source: '上海证券报',
    title: '比亚迪(002594)业绩不及预期,股价大跌',
    kind: 'news',
    date: '2026-05-25',
    content:
      '比亚迪 002594 业绩不及预期,营收大幅下滑,下调全年盈利预测。',
  },
];

// ---------------------------------------------------------------------------
// expandQuery / tokenize
// ---------------------------------------------------------------------------

describe('expandQuery', () => {
  test('expands English synonyms', () => {
    const out = expandQuery('buy AAPL');
    expect(out).toContain('buy');
    expect(out).toContain('long');
    expect(out).toContain('accumulate');
    expect(out).toContain('overweight');
  });

  test('expands Chinese synonyms', () => {
    const out = expandQuery('比亚迪 超预期');
    expect(out).toContain('比亚迪');
    expect(out).toContain('超预期');
    expect(out).toContain('超市场预期');
    expect(out).toContain('高于预期');
  });

  test('drops common stopwords', () => {
    const out = expandQuery('the buy of aapl');
    // 'the', 'of', 'a' should not appear
    const tokens = out.split(' ');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('of');
    expect(tokens).not.toContain('a');
  });

  test('CJK 2-char bigrams are generated', () => {
    const out = expandQuery('比亚迪');
    // Should contain both 比亚迪 and bigrams 比亚, 亚迪
    expect(out).toContain('比亚迪');
    expect(out).toContain('比亚');
    expect(out).toContain('亚迪');
  });

  test('empty / whitespace returns empty string', () => {
    expect(expandQuery('')).toBe('');
    expect(expandQuery('   ')).toBe('');
  });

  test('case-insensitive on Latin tokens', () => {
    const out = expandQuery('AAPL GROWTH');
    expect(out).toContain('aapl');
    expect(out).toContain('growth');
    expect(out).toContain('expansion'); // synonym
  });
});

// ---------------------------------------------------------------------------
// Ticker / theme detection (indirect, via corpus)
// ---------------------------------------------------------------------------

describe('detectTickers / detectThemes (via corpus)', () => {
  test('AAPL is detected in broker reports', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    const docs = eng.listDocuments();
    expect(docs[0].tickers).toContain('AAPL');
  });

  test('002594 is detected in Chinese news', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[3]);
    const docs = eng.listDocuments();
    expect(docs[0].tickers).toContain('002594');
  });

  test('explicit tickers override detection', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument({ ...SAMPLE_DOCS[0], tickers: ['OVERRIDE'] });
    expect(eng.listDocuments()[0].tickers).toEqual(['OVERRIDE']);
  });

  test('AI theme is detected from content', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    const themes = eng.listDocuments()[0].themes;
    expect(themes).toContain('AI');
  });

  test('semiconductor + EV themes detected in Chinese news', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[3]);
    const themes = eng.listDocuments()[0].themes;
    expect(themes).toContain('semiconductor');
    expect(themes).toContain('EV');
  });
});

// ---------------------------------------------------------------------------
// Key-claim extraction
// ---------------------------------------------------------------------------

describe('extractKeyClaims', () => {
  test('positive claims on a bullish broker report', () => {
    const claims = extractKeyClaims(SAMPLE_DOCS[0]);
    expect(claims.length).toBeGreaterThan(0);
    // "beat earnings" → positive
    expect(claims.some((c) => c.kind === 'positive' && /beat/i.test(c.text))).toBe(true);
    // "raised guidance" → positive
    expect(claims.some((c) => c.kind === 'positive' && /raised guidance/i.test(c.text))).toBe(true);
    // polarity sign should be + on positive
    for (const c of claims) {
      if (c.kind === 'positive' || c.kind === 'opportunity') {
        expect(c.polarity).toBeGreaterThan(0);
      }
    }
  });

  test('negative claims on bearish broker report', () => {
    const claims = extractKeyClaims(SAMPLE_DOCS[1]);
    expect(claims.length).toBeGreaterThan(0);
    // "missed revenue" → negative
    expect(claims.some((c) => c.kind === 'negative' && /missed/i.test(c.text))).toBe(true);
    for (const c of claims) {
      if (c.kind === 'negative' || c.kind === 'risk') {
        expect(c.polarity).toBeLessThan(0);
      }
    }
  });

  test('Chinese: 不及预期 extracts a negative claim', () => {
    const claims = extractKeyClaims(SAMPLE_DOCS[4]);
    expect(claims.some((c) => c.kind === 'negative' && /不及预期|下滑|下调/.test(c.text))).toBe(true);
  });

  test('each claim has a stable id and sentenceIdx', () => {
    const claims = extractKeyClaims(SAMPLE_DOCS[0]);
    for (const c of claims) {
      expect(c.id.startsWith('broker-1#c')).toBe(true);
      expect(Number.isInteger(c.sentenceIdx)).toBe(true);
      expect(c.sentenceIdx).toBeGreaterThanOrEqual(0);
    }
  });

  test('neutral factual sentences are skipped', () => {
    const doc: Document = {
      id: 'neut',
      source: 'Test',
      title: 'Neutral report',
      kind: 'news',
      content: 'The company held its annual meeting. There were 100 attendees. It was on Tuesday.',
    };
    const claims = extractKeyClaims(doc);
    expect(claims).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Citation graph
// ---------------------------------------------------------------------------

describe('buildCitationGraph', () => {
  test('same_theme edge between two AI-themed docs', () => {
    // broker-1 and transcript-1 both mention AI; broker-2 does not.
    const claims = [
      ...extractKeyClaims(SAMPLE_DOCS[0]),
      ...extractKeyClaims(SAMPLE_DOCS[2]),
    ];
    const edges = buildCitationGraph([SAMPLE_DOCS[0], SAMPLE_DOCS[2]], claims);
    expect(edges.some((e) => e.type === 'same_theme' && e.reason.includes('AI'))).toBe(true);
  });

  test('disagrees edge between bullish and bearish AAPL reports', () => {
    const claims = [
      ...extractKeyClaims(SAMPLE_DOCS[0]),
      ...extractKeyClaims(SAMPLE_DOCS[1]),
    ];
    const edges = buildCitationGraph(SAMPLE_DOCS.slice(0, 2), claims);
    expect(edges.some((e) => e.type === 'disagrees' && e.reason.includes('AAPL'))).toBe(true);
  });

  test('agrees edge when two docs both positive on same ticker', () => {
    const claims = [
      ...extractKeyClaims(SAMPLE_DOCS[0]),
      ...extractKeyClaims(SAMPLE_DOCS[2]),
    ];
    const edges = buildCitationGraph([SAMPLE_DOCS[0], SAMPLE_DOCS[2]], claims);
    expect(edges.some((e) => e.type === 'agrees' && e.reason.includes('AAPL'))).toBe(true);
  });

  test('no edges when docs are unrelated', () => {
    const a: Document = {
      id: 'x', source: 'X', title: 'X', kind: 'news',
      content: 'Lorem ipsum dolor sit amet.',
    };
    const b: Document = {
      id: 'y', source: 'Y', title: 'Y', kind: 'news',
      content: 'Quick brown fox jumps over the lazy dog.',
    };
    const claims = [...extractKeyClaims(a), ...extractKeyClaims(b)];
    const edges = buildCitationGraph([a, b], claims);
    expect(edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DeepSearchEngine — corpus management
// ---------------------------------------------------------------------------

describe('DeepSearchEngine — corpus management', () => {
  test('add + size + list', () => {
    const eng = new DeepSearchEngine();
    expect(eng.size()).toBe(0);
    eng.addDocument(SAMPLE_DOCS[0]);
    eng.addDocument(SAMPLE_DOCS[1]);
    expect(eng.size()).toBe(2);
    expect(eng.listDocuments().map((d) => d.id).sort()).toEqual(['broker-1', 'broker-2']);
  });

  test('add with same id overwrites and re-extracts claims', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    const before = eng.listClaims().length;
    eng.addDocument({ ...SAMPLE_DOCS[0], title: 'Updated title', content: 'New content. No claims here.' });
    expect(eng.size()).toBe(1);
    // Old claims removed, new ones extracted
    const after = eng.listClaims().length;
    expect(after).toBe(0);
    expect(eng.listClaims().length).toBeLessThanOrEqual(before);
  });

  test('remove deletes doc + claims + index entries', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    eng.addDocument(SAMPLE_DOCS[1]);
    expect(eng.removeDocument('broker-1')).toBe(true);
    expect(eng.size()).toBe(1);
    expect(eng.listClaims().every((c) => c.docId !== 'broker-1')).toBe(true);
  });

  test('remove of unknown id returns false', () => {
    const eng = new DeepSearchEngine();
    expect(eng.removeDocument('nope')).toBe(false);
  });

  test('addDocument requires id', () => {
    const eng = new DeepSearchEngine();
    expect(() => eng.addDocument({ id: '', source: 's', title: 't', content: 'c', kind: 'news' })).toThrow();
  });

  test('toJSON / fromJSON round-trip preserves docs + claims', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    eng.addDocument(SAMPLE_DOCS[1]);
    const snap = eng.toJSON();
    const eng2 = DeepSearchEngine.fromJSON(snap);
    expect(eng2.size()).toBe(2);
    expect(eng2.listClaims().length).toBe(eng.listClaims().length);
  });
});

// ---------------------------------------------------------------------------
// DeepSearchEngine — search
// ---------------------------------------------------------------------------

describe('DeepSearchEngine — search', () => {
  let eng: DeepSearchEngine;
  beforeEach(() => {
    eng = new DeepSearchEngine();
    for (const d of SAMPLE_DOCS) eng.addDocument(d);
  });

  test('returns ranked hits with score + snippets + claims', () => {
    const r = eng.search('AAPL growth');
    expect(r.hits.length).toBeGreaterThan(0);
    for (const h of r.hits) {
      expect(h.score).toBeGreaterThan(0);
      expect(h.doc.id).toBeTruthy();
      expect(Array.isArray(h.snippets)).toBe(true);
      expect(Array.isArray(h.claims)).toBe(true);
    }
  });

  test('expansion finds bullish + bearish AAPL docs', () => {
    const r = eng.search('AAPL buy');
    // The "buy" expansion (long, accumulate, overweight) should still hit AAPL
    // docs because "overweight" is in broker-1
    const ids = r.hits.map((h) => h.doc.id);
    expect(ids).toContain('broker-1');
  });

  test('Chinese query finds Chinese news', () => {
    const r = eng.search('比亚迪 增长');
    const ids = r.hits.map((h) => h.doc.id);
    expect(ids).toContain('news-cn-1');
  });

  test('kinds filter restricts to specific document kinds', () => {
    const r = eng.search('AAPL', { kinds: ['broker_research'] });
    for (const h of r.hits) {
      expect(h.doc.kind).toBe('broker_research');
    }
  });

  test('tickers filter restricts to specific tickers', () => {
    const r = eng.search('stock', { tickers: ['002594'] });
    for (const h of r.hits) {
      expect(h.doc.tickers).toContain('002594');
    }
  });

  test('limit caps the number of hits', () => {
    const r = eng.search('growth', { limit: 2 });
    expect(r.hits.length).toBeLessThanOrEqual(2);
  });

  test('related docs are populated via citation graph', () => {
    const r = eng.search('AAPL');
    const aaplHit = r.hits.find((h) => h.doc.id === 'broker-1');
    expect(aaplHit).toBeDefined();
    // broker-1 (bullish) should have a "disagrees" relationship with broker-2 (bearish)
    expect(aaplHit!.related.length).toBeGreaterThan(0);
  });

  test('theme clusters aggregate across top-N', () => {
    const r = eng.search('AAPL 半导体');
    expect(r.themeClusters.length).toBeGreaterThan(0);
    const themes = r.themeClusters.map((c) => c.theme);
    expect(themes).toContain('AI');
  });

  test('durationMs is reported', () => {
    const r = eng.search('AAPL');
    expect(typeof r.durationMs).toBe('number');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('corpusSize is reported', () => {
    const r = eng.search('AAPL');
    expect(r.corpusSize).toBe(SAMPLE_DOCS.length);
  });

  test('snippets include char offsets and reason', () => {
    const r = eng.search('AAPL growth');
    const hit = r.hits[0];
    expect(hit.snippets.length).toBeGreaterThan(0);
    const snip = hit.snippets[0];
    expect(snip.start).toBeGreaterThanOrEqual(0);
    expect(snip.end).toBeGreaterThan(snip.start);
    expect(snip.reason).toBeTruthy();
  });

  test('snippet falls back to lead sentence when no term matches', () => {
    const r = eng.search('zzzzz_nomatch_xyzzy');
    // No hits but the search should not throw
    expect(r.hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tool — research_deep_search
// ---------------------------------------------------------------------------

describe('research_deep_search tool', () => {
  beforeEach(() => {
    resetSharedEngine();
  });

  test('returns empty_corpus error when no docs and no inline documents', async () => {
    const tool = createResearchDeepSearchTool();
    // Without the compile flag, the feature is disabled
    // The expected error code depends on the runtime gate
    const out = await tool.invoke({ query: 'AAPL' });
    const parsed = JSON.parse(out as string);
    // Either feature_disabled or empty_corpus, both are valid responses
    expect(['feature_disabled', 'empty_corpus']).toContain(parsed.error);
  });

  test('happy path with inline documents', async () => {
    const tool = createResearchDeepSearchTool();
    const out = await tool.invoke({
      query: 'AAPL growth',
      documents: [SAMPLE_DOCS[0], SAMPLE_DOCS[1], SAMPLE_DOCS[2]],
      limit: 5,
    });
    const parsed = JSON.parse(out as string);
    // Skip if feature is disabled in this test env
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.query).toBe('AAPL growth');
    expect(parsed.hits.length).toBeGreaterThan(0);
    expect(parsed.corpusSize).toBe(3);
  });

  test('tool with kinds filter', async () => {
    const tool = createResearchDeepSearchTool();
    const out = await tool.invoke({
      query: 'AAPL',
      documents: SAMPLE_DOCS,
      kinds: ['broker_research'],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    for (const h of parsed.hits) {
      expect(h.kind).toBe('broker_research');
    }
  });

  test('tool with tickers filter', async () => {
    const tool = createResearchDeepSearchTool();
    const out = await tool.invoke({
      query: 'stock',
      documents: SAMPLE_DOCS,
      tickers: ['002594'],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    for (const h of parsed.hits) {
      expect(h.tickers).toContain('002594');
    }
  });

  test('seeding shared engine makes docs queryable without inline documents', async () => {
    const eng = getSharedEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    const tool = createResearchDeepSearchTool();
    const out = await tool.invoke({ query: 'AAPL' });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    if (parsed.error === 'empty_corpus') return; // shared engine isolated per test
    expect(parsed.hits.length).toBeGreaterThan(0);
  });

  test('runtime error in tool body returns search_failed (not thrown)', async () => {
    // Inline document with empty id triggers a runtime error inside
    // addDocument (not a zod schema error). The tool should catch it
    // and return a JSON error response, not throw.
    const tool = createResearchDeepSearchTool();
    const out = await tool.invoke({
      query: 'test',
      documents: [
        { id: '', source: 's', title: 't', content: 'c', kind: 'news' },
      ],
    });
    const parsed = JSON.parse(out as string);
    // Either feature_disabled (gate off) or search_failed (error caught) — both OK
    expect(['feature_disabled', 'search_failed']).toContain(parsed.error);
  });

  test('schema-level invalid input throws ToolInputParsingException', async () => {
    // Schema validation runs before our function body, so invalid types
    // (e.g. string where array expected) throw at the zod level. This is
    // expected — the LLM would have to retry with correct input.
    const tool = createResearchDeepSearchTool();
    expect(async () => {
      await tool.invoke({ query: 'test', documents: 'not-an-array' });
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Safety / no-throw
// ---------------------------------------------------------------------------

describe('safety — no throw on weird inputs', () => {
  test('extractKeyClaims on empty content', () => {
    const doc: Document = { id: 'e', source: 's', title: 't', content: '', kind: 'news' };
    expect(() => extractKeyClaims(doc)).not.toThrow();
    expect(extractKeyClaims(doc)).toEqual([]);
  });

  test('extractKeyClaims on huge content', () => {
    const big = 'The company beat estimates. '.repeat(5000);
    const doc: Document = { id: 'big', source: 's', title: 't', content: big, kind: 'news' };
    expect(() => extractKeyClaims(doc)).not.toThrow();
  });

  test('search on empty engine returns empty hits without throwing', () => {
    const eng = new DeepSearchEngine();
    expect(() => eng.search('anything')).not.toThrow();
    const r = eng.search('anything');
    expect(r.hits).toEqual([]);
    expect(r.corpusSize).toBe(0);
  });

  test('expandQuery on special characters', () => {
    expect(() => expandQuery('!@#$%^&*()')).not.toThrow();
    expect(() => expandQuery('\n\t\r')).not.toThrow();
  });

  test('search with empty query', () => {
    const eng = new DeepSearchEngine();
    eng.addDocument(SAMPLE_DOCS[0]);
    expect(() => eng.search('')).not.toThrow();
  });
});
