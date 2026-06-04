## ADDED Requirements

### Requirement: AltDataAdapter Interface
The system SHALL define a unified `AltDataAdapter` interface in `src/data/alt/types.ts` with methods: `fetch(input: FetchInput): Promise<RawEvent[]>`, `normalize(raw: RawEvent): NormalizedEvent`, and a static `source: AltDataSource` enum field. The interface MUST accept lazy initialization (no API key required at construction; adapter is registered only when user provides credentials via env or interactive prompt).

#### Scenario: Lazy registration
- **WHEN** user has no `CLS_API_KEY` env var set
- **THEN** the news adapter is not registered; calling `alt_data_fetch({ source: 'cls' })` returns a structured error `AltDataError(NO_CREDENTIALS, 'CLS_API_KEY not set')` with a remediation hint.

### Requirement: News Adapter
The system SHALL provide a news adapter in `src/data/alt/news.ts` that fetches from CLS (财联社) and Xinhua Finance. Output MUST be normalized to `{ title, source, url, publishedAt, symbols[], sentiment, raw }` where `sentiment` is in `[-1, 1]` (negative=bearish, positive=bullish).

#### Scenario: Fetch today's news for 600519
- **WHEN** user calls `alt_data_fetch({ source: 'news', symbols: ['600519'], dateRange: { start: '2026-06-04T00:00:00+08:00', end: '2026-06-04T23:59:59+08:00' } })`
- **THEN** adapter fetches from CLS + Xinhua, deduplicates by URL, filters items where `symbols` contains '600519', and returns the normalized list sorted by `publishedAt` descending.

### Requirement: Research Report Adapter
The system SHALL provide a research report adapter in `src/data/alt/reports.ts` that fetches from 慧博 (HiBoo) and Choice. Output MUST be normalized to `{ title, source, url, publishedAt, symbols[], analyst, rating, targetPrice, summary }`.

#### Scenario: Fetch 30 days of reports
- **WHEN** user calls `alt_data_fetch({ source: 'reports', symbols: ['600519'], dateRange: { ..., days: 30 } })`
- **THEN** adapter returns up to 50 most recent reports covering 600519, ordered by publishedAt desc, with rating distribution summary.

### Requirement: Social Adapter
The system SHALL provide a social adapter in `src/data/alt/social.ts` that fetches from 雪球 (Xueqiu) posts and X (Twitter) financial tweets. Output MUST be normalized to `{ author, content, url, publishedAt, symbols[], engagement, sentiment }`.

#### Scenario: Fetch top 100 雪球 posts
- **WHEN** user calls `alt_data_fetch({ source: 'social', platform: 'xueqiu', symbols: ['600519'], limit: 100 })`
- **THEN** adapter returns top 100 雪球 posts by engagement, filtering for those mentioning 600519, with sentiment scored by simple keyword + LLM-as-judge fallback.

### Requirement: Dragon-Tiger Adapter
The system SHALL provide a dragon-tiger (龙虎榜) adapter in `src/data/alt/dragon-tiger.ts` that fetches daily 龙虎榜 + 大宗交易 (block trade) data from 东方财富. Output MUST be normalized to `{ tradeDate, symbol, name, side, price, volume, amount, buyerType, sellerType, institutionCode }`.

#### Scenario: Fetch dragon-tiger for 600519
- **WHEN** user calls `alt_data_fetch({ source: 'dragon-tiger', symbols: ['600519'], dateRange: { ..., days: 30 } })`
- **THEN** adapter returns all 龙虎榜 + 大宗交易 records where 600519 appeared, with `institutionCode` resolved to institution name when known.

### Requirement: North-Bound Adapter
The system SHALL provide a north-bound (北向资金) adapter in `src/data/alt/north-bound.ts` that fetches 北向资金 + 融资融券 (margin trading) data. Output MUST be normalized to `{ tradeDate, symbol, northBoundNetInflow, shConnectNetInflow, szConnectNetInflow, marginBalance, shortBalance }`.

#### Scenario: Fetch 30 days north-bound
- **WHEN** user calls `alt_data_fetch({ source: 'north-bound', symbols: ['600519'], dateRange: { ..., days: 30 } })`
- **THEN** adapter returns daily north-bound + margin trading data for 600519, ordered by tradeDate asc.

### Requirement: Alt Data Tools
The system SHALL register two new tools: `alt_data_fetch` (fetches from a specified source with optional symbol/date filters) and `alt_data_search` (cross-source search by free-text query, returning merged normalized results from all configured sources).
