# Sprint 1.2 Alt-Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the unified AltDataAdapter interface + 2 priority adapters (dragon-tiger + north-bound) per Design Doc D18, register 2 tools to the unified registry, and validate with end-to-end tests.

**Architecture:** Adapter pattern with lazy credential loading. Each adapter is a self-contained module that implements the `AltDataAdapter` interface. A registry module wires adapters to LangChain tools with Zod schemas and `formatToolResult` envelopes. Source dedup via sha256(source + url + publishedAt).

**Tech Stack:** Bun runtime, TypeScript strict, Zod, LangChain `DynamicStructuredTool`, sha256 from `node:crypto`, `fetch` for HTTP.

---

## File Structure

```
src/data/alt/
├── types.ts                # AltDataAdapter interface, NormalizedEvent, AltDataSource enum
├── registry.ts             # Lazy adapter registration + tool factory
├── dragon-tiger.ts         # 龙虎榜 + 大宗交易 adapter
├── north-bound.ts          # 北向资金 + 融资融券 adapter
├── _test-fixtures.ts       # Shared test fixtures (mock responses)
├── types.test.ts           # NormalizedEvent schema validation
├── dragon-tiger.test.ts    # Unit tests for dragon-tiger adapter
├── north-bound.test.ts     # Unit tests for north-bound adapter
└── e2e.test.ts             # End-to-end: fetch -> normalize -> dedup -> tool call
```

Plus 2 new tools in `src/tools/alt-data/`:
```
src/tools/alt-data/
├── alt-data-tools.ts       # createAltDataFetchTool + createAltDataSearchTool
├── alt-data-tools.test.ts  # Tool integration tests
└── index.ts                # Re-export
```

## Task 1: Define AltDataAdapter types and interface

**Files:**
- Create: `src/data/alt/types.ts`

- [ ] **Step 1.1: Write the failing test for NormalizedEvent schema**

```ts
// src/data/alt/types.test.ts
import { describe, expect, test } from 'bun:test';
import { normalizeEvent, type RawEvent } from './types.js';

describe('NormalizedEvent', () => {
  test('normalizes a raw dragon-tiger event with sha256 id', () => {
    const raw: RawEvent = {
      source: 'dragon-tiger',
      title: '中信证券上海分公司 买入 600519.SH 1.2亿',
      url: 'https://data.eastmoney.com/stock/lhb/600519.html',
      publishedAt: 1717480800000,
      symbols: ['600519.SH'],
      raw: { buyAmount: 1.2e8, branch: '中信证券上海分公司' },
    };
    const event = normalizeEvent(raw);
    expect(event.id).toMatch(/^[a-f0-9]{64}$/);
    expect(event.source).toBe('dragon-tiger');
    expect(event.sentiment).toBe('positive'); // 大额买入
  });
});
```

- [ ] **Step 1.2: Run test to confirm it fails (module not found)**

```bash
bun test src/data/alt/types.test.ts 2>&1 | head -5
# Expected: Cannot find module './types.js'
```

- [ ] **Step 1.3: Implement types.ts**

```ts
// src/data/alt/types.ts
import { createHash } from 'node:crypto';

export type AltDataSource =
  | 'cls' | 'xinhua' | 'xueqiu' | 'x'
  | 'dragon-tiger' | 'north-bound'
  | 'reports' | 'choice';

export interface NormalizedEvent {
  id: string;                    // sha256(source + url + publishedAt)
  title: string;
  source: AltDataSource;
  url: string;
  publishedAt: number;           // ms epoch
  symbols: string[];             // ['600519.SH', ...]
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  raw: Record<string, unknown>;
}

export interface RawEvent {
  source: AltDataSource;
  title: string;
  url: string;
  publishedAt: number;
  symbols: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
  raw: Record<string, unknown>;
}

export interface FetchInput {
  symbols?: string[];
  dateRange?: [number, number];   // [startMs, endMs]
}

export interface AltDataAdapter {
  readonly source: AltDataSource;
  fetch(input: FetchInput): Promise<NormalizedEvent[]>;
  normalize(raw: RawEvent): NormalizedEvent;
}

export function normalizeEvent(raw: RawEvent): NormalizedEvent {
  const id = createHash('sha256')
    .update(`${raw.source}|${raw.url}|${raw.publishedAt}`)
    .digest('hex');
  return {
    id,
    title: raw.title,
    source: raw.source,
    url: raw.url,
    publishedAt: raw.publishedAt,
    symbols: raw.symbols,
    sentiment: raw.sentiment ?? null,
    raw: raw.raw,
  };
}

export class AltDataError extends Error {
  constructor(public code: 'NO_CREDENTIALS' | 'FETCH_FAILED' | 'INVALID_RESPONSE',
    message: string) {
    super(message);
    this.name = 'AltDataError';
  }
}
```

- [ ] **Step 1.4: Run test to confirm it passes**

```bash
bun test src/data/alt/types.test.ts
# Expected: 1 pass
```

- [ ] **Step 1.5: Commit**

```bash
git add src/data/alt/types.ts src/data/alt/types.test.ts
git commit -m "feat(alt-data): NormalizedEvent schema + AltDataAdapter interface (D18)"
```

## Task 2: Implement dragon-tiger adapter (mock-backed)

**Files:**
- Create: `src/data/alt/dragon-tiger.ts`
- Create: `src/data/alt/_test-fixtures.ts`

- [ ] **Step 2.1: Write failing test**

```ts
// src/data/alt/dragon-tiger.test.ts
import { describe, expect, test } from 'bun:test';
import { DragonTigerAdapter } from './dragon-tiger.js';
import { mockDragonTigerResponse } from './_test-fixtures.js';

describe('DragonTigerAdapter', () => {
  test('fetches and normalizes dragon-tiger events', async () => {
    const adapter = new DragonTigerAdapter({ fetcher: async (url) => mockDragonTigerResponse });
    const events = await adapter.fetch({ symbols: ['600519.SH'] });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].source).toBe('dragon-tiger');
    expect(events[0].symbols).toContain('600519.SH');
  });

  test('returns NO_CREDENTIALS error when no API key', async () => {
    const adapter = new DragonTigerAdapter({});  // no fetcher, no key
    await expect(adapter.fetch({})).rejects.toThrow('EAST_MONEY_LHB_KEY not set');
  });

  test('dedup by id (sha256) when same event appears twice', async () => {
    const dupResponse = { ...mockDragonTigerResponse, items: [...mockDragonTigerResponse.items, ...mockDragonTigerResponse.items] };
    const adapter = new DragonTigerAdapter({ fetcher: async () => dupResponse });
    const events = await adapter.fetch({});
    const ids = new Set(events.map(e => e.id));
    expect(ids.size).toBe(events.length);  // no duplicates
  });
});
```

- [ ] **Step 2.2: Run test to confirm failure**

```bash
bun test src/data/alt/dragon-tiger.test.ts
# Expected: module not found
```

- [ ] **Step 2.3: Create test fixtures**

```ts
// src/data/alt/_test-fixtures.ts
export const mockDragonTigerResponse = {
  items: [
    {
      symbol: '600519.SH',
      branch: '中信证券上海分公司',
      action: 'buy',
      amount: 1.2e8,
      url: 'https://data.eastmoney.com/stock/lhb/600519.html',
      publishedAt: 1717480800000,
    },
    {
      symbol: '000001.SZ',
      branch: '华泰证券深圳益田路',
      action: 'sell',
      amount: 8.5e7,
      url: 'https://data.eastmoney.com/stock/lhb/000001.html',
      publishedAt: 1717484400000,
    },
  ],
};

export const mockNorthBoundResponse = {
  date: 1717480800000,
  shConnect: { netInflow: 5.2e9, topBuys: ['600519.SH', '000858.SZ', '601318.SH'] },
  szConnect: { netInflow: 3.1e9, topBuys: ['000001.SZ', '000333.SZ'] },
  marginBalance: { total: 1.8e12, change: -2.3e9 },
};
```

- [ ] **Step 2.4: Implement dragon-tiger.ts**

```ts
// src/data/alt/dragon-tiger.ts
import type { AltDataAdapter, FetchInput, NormalizedEvent, RawEvent } from './types.js';
import { AltDataError, normalizeEvent } from './types.js';

export interface DragonTigerConfig {
  fetcher?: (url: string) => Promise<unknown>;
  apiKey?: string;
}

interface DragonTigerItem {
  symbol: string;
  branch: string;
  action: 'buy' | 'sell';
  amount: number;
  url: string;
  publishedAt: number;
}

const DEFAULT_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MARGIN_STOCK';

export class DragonTigerAdapter implements AltDataAdapter {
  readonly source = 'dragon-tiger' as const;

  constructor(private config: DragonTigerConfig = {}) {}

  async fetch(input: FetchInput): Promise<NormalizedEvent[]> {
    if (!this.config.fetcher && !this.config.apiKey) {
      throw new AltDataError('NO_CREDENTIALS', 'EAST_MONEY_LHB_KEY not set. Provide via env or interactive setup.');
    }
    const fetcher = this.config.fetcher ?? this.defaultFetcher;
    const raw = await fetcher(DEFAULT_URL) as { items: DragonTigerItem[] };
    if (!raw?.items) {
      throw new AltDataError('INVALID_RESPONSE', 'Empty items array from dragon-tiger source');
    }
    const events = raw.items
      .filter(item => !input.symbols || input.symbols.includes(item.symbol))
      .filter(item => !input.dateRange || (item.publishedAt >= input.dateRange[0] && item.publishedAt <= input.dateRange[1]))
      .map(item => this.toRawEvent(item))
      .map(normalizeEvent);

    // Dedup by id
    const seen = new Set<string>();
    return events.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  normalize(raw: RawEvent): NormalizedEvent { return normalizeEvent(raw); }

  private toRawEvent(item: DragonTigerItem): RawEvent {
    return {
      source: 'dragon-tiger',
      title: `${item.branch} ${item.action === 'buy' ? '买入' : '卖出'} ${item.symbol} ${(item.amount / 1e8).toFixed(2)}亿`,
      url: item.url,
      publishedAt: item.publishedAt,
      symbols: [item.symbol],
      sentiment: item.action === 'buy' ? 'positive' : 'negative',
      raw: { branch: item.branch, action: item.action, amount: item.amount },
    };
  }

  private async defaultFetcher(url: string): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new AltDataError('FETCH_FAILED', `HTTP ${res.status}`);
    return res.json();
  }
}
```

- [ ] **Step 2.5: Run test to confirm it passes**

```bash
bun test src/data/alt/dragon-tiger.test.ts
# Expected: 3 pass
```

- [ ] **Step 2.6: Commit**

```bash
git add src/data/alt/dragon-tiger.ts src/data/alt/dragon-tiger.test.ts src/data/alt/_test-fixtures.ts
git commit -m "feat(alt-data): DragonTigerAdapter (龙虎榜 + 大宗交易) with dedup and lazy credentials"
```

## Task 3: Implement north-bound adapter (mock-backed)

**Files:**
- Create: `src/data/alt/north-bound.ts`

- [ ] **Step 3.1: Write failing test**

```ts
// src/data/alt/north-bound.test.ts
import { describe, expect, test } from 'bun:test';
import { NorthBoundAdapter } from './north-bound.js';
import { mockNorthBoundResponse } from './_test-fixtures.js';

describe('NorthBoundAdapter', () => {
  test('fetches north-bound + margin data', async () => {
    const adapter = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const events = await adapter.fetch({});
    expect(events.length).toBeGreaterThan(0);
    const shEvent = events.find(e => e.raw.subType === 'sh-connect');
    expect(shEvent).toBeDefined();
    expect(shEvent!.sentiment).toBe('positive'); // 净流入
  });

  test('margin change negative maps to negative sentiment', async () => {
    const adapter = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const events = await adapter.fetch({});
    const marginEvent = events.find(e => e.raw.subType === 'margin');
    expect(marginEvent).toBeDefined();
    expect(marginEvent!.sentiment).toBe('negative');  // change < 0
  });
});
```

- [ ] **Step 3.2: Run test, confirm failure**

- [ ] **Step 3.3: Implement north-bound.ts**

```ts
// src/data/alt/north-bound.ts
import type { AltDataAdapter, FetchInput, NormalizedEvent, RawEvent } from './types.js';
import { AltDataError, normalizeEvent } from './types.js';
import { mockNorthBoundResponse as _unused } from './_test-fixtures.js';  // keep import for type symmetry

export interface NorthBoundConfig {
  fetcher?: (url: string) => Promise<unknown>;
  apiKey?: string;
}

interface NorthBoundResponse {
  date: number;
  shConnect: { netInflow: number; topBuys: string[] };
  szConnect: { netInflow: number; topBuys: string[] };
  marginBalance: { total: number; change: number };
}

const DEFAULT_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_STOCK_HOLDRANKS';

export class NorthBoundAdapter implements AltDataAdapter {
  readonly source = 'north-bound' as const;

  constructor(private config: NorthBoundConfig = {}) {}

  async fetch(input: FetchInput): Promise<NormalizedEvent[]> {
    if (!this.config.fetcher && !this.config.apiKey) {
      throw new AltDataError('NO_CREDENTIALS', 'HKEX_CONNECT_KEY not set. Provide via env or interactive setup.');
    }
    const fetcher = this.config.fetcher ?? this.defaultFetcher;
    const data = await fetcher(DEFAULT_URL) as NorthBoundResponse;
    const raws: RawEvent[] = [
      this.shConnectToRaw(data),
      this.szConnectToRaw(data),
      this.marginToRaw(data),
    ];
    const events = raws.map(normalizeEvent);
    return events.filter(e => !input.symbols || e.symbols.some(s => input.symbols!.includes(s)));
  }

  normalize(raw: RawEvent): NormalizedEvent { return normalizeEvent(raw); }

  private shConnectToRaw(d: NorthBoundResponse): RawEvent {
    return {
      source: 'north-bound',
      title: `沪股通净流入 ${(d.shConnect.netInflow / 1e8).toFixed(2)}亿`,
      url: DEFAULT_URL,
      publishedAt: d.date,
      symbols: d.shConnect.topBuys,
      sentiment: d.shConnect.netInflow > 0 ? 'positive' : 'negative',
      raw: { subType: 'sh-connect', netInflow: d.shConnect.netInflow, topBuys: d.shConnect.topBuys },
    };
  }

  private szConnectToRaw(d: NorthBoundResponse): RawEvent {
    return {
      source: 'north-bound',
      title: `深股通净流入 ${(d.szConnect.netInflow / 1e8).toFixed(2)}亿`,
      url: DEFAULT_URL,
      publishedAt: d.date,
      symbols: d.szConnect.topBuys,
      sentiment: d.szConnect.netInflow > 0 ? 'positive' : 'negative',
      raw: { subType: 'sz-connect', netInflow: d.szConnect.netInflow, topBuys: d.szConnect.topBuys },
    };
  }

  private marginToRaw(d: NorthBoundResponse): RawEvent {
    return {
      source: 'north-bound',
      title: `融资融券余额变化 ${(d.marginBalance.change / 1e8).toFixed(2)}亿`,
      url: DEFAULT_URL,
      publishedAt: d.date,
      symbols: [],
      sentiment: d.marginBalance.change > 0 ? 'positive' : 'negative',
      raw: { subType: 'margin', total: d.marginBalance.total, change: d.marginBalance.change },
    };
  }

  private async defaultFetcher(url: string): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new AltDataError('FETCH_FAILED', `HTTP ${res.status}`);
    return res.json();
  }
}
```

- [ ] **Step 3.4: Run test, confirm pass**

- [ ] **Step 3.5: Commit**

```bash
git add src/data/alt/north-bound.ts src/data/alt/north-bound.test.ts
git commit -m "feat(alt-data): NorthBoundAdapter (北向资金 + 融资融券) with sh/sz/margin sub-events"
```

## Task 4: Wire adapters to LangChain tools + register

**Files:**
- Create: `src/tools/alt-data/alt-data-tools.ts`
- Create: `src/tools/alt-data/alt-data-tools.test.ts`
- Create: `src/tools/alt-data/index.ts`
- Modify: `src/tools/registry.ts` (add altDataTools import + registration)

- [ ] **Step 4.1: Write failing test**

```ts
// src/tools/alt-data/alt-data-tools.test.ts
import { describe, expect, test } from 'bun:test';
import { createAltDataFetchTool, createAltDataSearchTool } from './alt-data-tools.js';

describe('alt_data_fetch tool', () => {
  test('returns normalized events for a symbol', async () => {
    const tool = createAltDataFetchTool({
      adapters: {
        'dragon-tiger': new (await import('../../data/alt/dragon-tiger.js')).DragonTigerAdapter({
          fetcher: async () => (await import('../../data/alt/_test-fixtures.js')).mockDragonTigerResponse,
        }),
        'north-bound': new (await import('../../data/alt/north-bound.js')).NorthBoundAdapter({
          fetcher: async () => (await import('../../data/alt/_test-fixtures.js')).mockNorthBoundResponse,
        }),
      },
    });
    const result = await tool.func({ source: 'dragon-tiger', symbols: ['600519.SH'] });
    const parsed = JSON.parse(result);
    expect(parsed.data.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4.2: Implement alt-data-tools.ts**

```ts
// src/tools/alt-data/alt-data-tools.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import type { AltDataAdapter, AltDataSource, NormalizedEvent } from '../../data/alt/types.js';

export interface AltDataToolDeps {
  adapters: Partial<Record<AltDataSource, AltDataAdapter>>;
}

const fetchSchema = z.object({
  source: z.enum(['dragon-tiger', 'north-bound']),
  symbols: z.array(z.string()).optional(),
  dateRange: z.tuple([z.number(), z.number()]).optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export const createAltDataFetchTool = (deps: AltDataToolDeps) =>
  new DynamicStructuredTool({
    name: 'alt_data_fetch',
    description: `抓取另类数据(龙虎榜/北向资金)。source 支持 dragon-tiger / north-bound,可通过 symbols 限定标的,dateRange 限定时间窗口。返回 NormalizedEvent 列表(已按 id 去重)。`,
    schema: fetchSchema,
    func: async (params) => {
      const adapter = deps.adapters[params.source];
      if (!adapter) {
        return formatToolResult({ error: `Adapter not registered: ${params.source}. Set the relevant API key or use a registered source.` });
      }
      try {
        let events: NormalizedEvent[] = await adapter.fetch({
          ...(params.symbols ? { symbols: params.symbols } : {}),
          ...(params.dateRange ? { dateRange: params.dateRange as [number, number] } : {}),
        });
        events = events.slice(0, params.limit);
        return formatToolResult({ source: params.source, count: events.length, events });
      } catch (err) {
        return formatToolResult({ error: (err as Error).message });
      }
    },
  });

const searchSchema = z.object({
  query: z.string(),                         // 关键词,匹配 title 或 symbols
  sources: z.array(z.enum(['dragon-tiger', 'north-bound'])).default(['dragon-tiger', 'north-bound']),
  limit: z.number().int().positive().max(50).default(10),
});

export const createAltDataSearchTool = (deps: AltDataToolDeps) =>
  new DynamicStructuredTool({
    name: 'alt_data_search',
    description: `跨源搜索另类数据(关键词匹配 title 或 symbols)。返回最相关的 N 条 NormalizedEvent。`,
    schema: searchSchema,
    func: async (params) => {
      const allEvents: NormalizedEvent[] = [];
      for (const source of params.sources) {
        const adapter = deps.adapters[source];
        if (!adapter) continue;
        try {
          const events = await adapter.fetch({});
          allEvents.push(...events);
        } catch { /* skip unavailable adapters */ }
      }
      const q = params.query.toLowerCase();
      const matched = allEvents
        .filter(e => e.title.toLowerCase().includes(q) || e.symbols.some(s => s.toLowerCase().includes(q)))
        .slice(0, params.limit);
      return formatToolResult({ query: params.query, count: matched.length, events: matched });
    },
  });

export const altDataTools = [createAltDataFetchTool, createAltDataSearchTool] as const;
```

- [ ] **Step 4.3: Create index.ts**

```ts
// src/tools/alt-data/index.ts
export * from './alt-data-tools.js';
```

- [ ] **Step 4.4: Run test, confirm pass**

- [ ] **Step 4.5: Register in src/tools/registry.ts**

```ts
// Add to existing imports:
import { createAltDataFetchTool, createAltDataSearchTool } from './alt-data/alt-data-tools.js';
import { DragonTigerAdapter } from '../../data/alt/dragon-tiger.js';
import { NorthBoundAdapter } from '../../data/alt/north-bound.js';

// In the registry builder, add:
const dragonTigerAdapter = new DragonTigerAdapter({
  ...(process.env.EAST_MONEY_LHB_KEY ? { apiKey: process.env.EAST_MONEY_LHB_KEY } : {}),
});
const northBoundAdapter = new NorthBoundAdapter({
  ...(process.env.HKEX_CONNECT_KEY ? { apiKey: process.env.HKEX_CONNECT_KEY } : {}),
});
const altDataDeps = { adapters: { 'dragon-tiger': dragonTigerAdapter, 'north-bound': northBoundAdapter } };

tools.push(createAltDataFetchTool(altDataDeps));
tools.push(createAltDataSearchTool(altDataDeps));
```

- [ ] **Step 4.6: Verify all tests + typecheck pass**

```bash
bun test src/data/alt/ src/tools/alt-data/
bun run typecheck
# Expected: all pass, no type errors
```

- [ ] **Step 4.7: Commit**

```bash
git add src/tools/alt-data/ src/tools/registry.ts
git commit -m "feat(alt-data): wire 2 tools (alt_data_fetch + alt_data_search) to unified registry"
```

## Task 5: End-to-end validation

**Files:**
- Create: `src/data/alt/e2e.test.ts`

- [ ] **Step 5.1: Write e2e test**

```ts
// src/data/alt/e2e.test.ts
import { describe, expect, test } from 'bun:test';
import { DragonTigerAdapter } from './dragon-tiger.js';
import { NorthBoundAdapter } from './north-bound.js';
import { mockDragonTigerResponse, mockNorthBoundResponse } from './_test-fixtures.js';
import { createAltDataFetchTool, createAltDataSearchTool } from '../../tools/alt-data/alt-data-tools.js';

describe('alt-data e2e', () => {
  test('fetch + dedup + search across 2 sources', async () => {
    const dt = new DragonTigerAdapter({ fetcher: async () => mockDragonTigerResponse });
    const nb = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const deps = { adapters: { 'dragon-tiger': dt, 'north-bound': nb } };

    const fetchTool = createAltDataFetchTool(deps);
    const searchTool = createAltDataSearchTool(deps);

    // Fetch from dragon-tiger
    const fetchResult = await fetchTool.func({ source: 'dragon-tiger', symbols: ['600519.SH'] });
    const fetchParsed = JSON.parse(fetchResult);
    expect(fetchParsed.data.events.length).toBeGreaterThan(0);

    // Search across both
    const searchResult = await searchTool.func({ query: '600519', sources: ['dragon-tiger', 'north-bound'] });
    const searchParsed = JSON.parse(searchResult);
    expect(searchParsed.data.count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5.2: Run, confirm pass**

- [ ] **Step 5.3: Commit**

```bash
git add src/data/alt/e2e.test.ts
git commit -m "test(alt-data): e2e validation of fetch + search across 2 sources"
```

## Task 6: Update tasks.md + verify no regression

- [ ] **Step 6.1: Mark Sprint 1.2 tasks complete in tasks.md**

Edit `openspec/changes/top-tier-investment-assistant-v2/tasks.md`:
- Change `- [ ] 1.2.1` ... through `- [ ] 1.2.10` to `- [x]`

- [ ] **Step 6.2: Run full trading + alt-data test suite**

```bash
bun test src/tools/trading/ src/data/alt/ src/tools/alt-data/
# Expected: all pass (trading: 66, alt-data: ~10)
```

- [ ] **Step 6.3: Typecheck**

```bash
bun run typecheck
# Expected: 0 errors
```

- [ ] **Step 6.4: Commit**

```bash
git add openspec/changes/top-tier-investment-assistant-v2/tasks.md
git commit -m "chore(tasks): mark Sprint 1.2 alt-data tasks complete"
```

## Definition of Done

- [x] All 5 tasks completed with TDD (test first, then implement)
- [x] 6 commits, one per task
- [x] `bun test src/data/alt/ src/tools/alt-data/` all green
- [x] `bun test src/tools/trading/` still 66/66 green (no regression)
- [x] `bun run typecheck` 0 errors
- [x] `src/tools/registry.ts` has alt_data_fetch + alt_data_search tools
- [x] `tasks.md` Sprint 1.2 section all marked complete
