/**
 * X / Twitter Search — P1.a.1 data source for sell-side / buy-side analyst tweets.
 *
 * Design:
 *   - Mock backend by default (no real Twitter API call). Deterministic on ticker.
 *   - Real backend plumbed via XSearchBackend type — caller passes a real impl
 *     when X / Twitter API credentials are available (out of scope for P1.a.1).
 *   - Used by buildEarningsPreviewAsync in src/commands/investment/earnings-preview.ts
 *     to fill EarningsPreview.recentTweets[].
 *
 * Module boundary:
 *   x-search.ts → zero internal deps (pure data + injected backend)
 *   No state, no I/O beyond the injected backend.
 *
 * Citation: Each result.url is suitable for direct registration in a
 * CitationRegistry (kind: 'tweet') per design D-CTG-5.
 */

export type XAuthorKind = 'analyst-sell' | 'analyst-buy' | 'analyst-other' | 'company' | 'other';

export interface XSearchResult {
  handle: string;
  tweetId: string;
  url: string;
  ts: number;
  authorKind: XAuthorKind;
  /** <= 240 chars — fits a single tweet. */
  snippet: string;
}

export type XSearchBackend = (
  query: string,
  opts: { windowDays: number; now: number },
) => Promise<XSearchResult[]>;

export interface SearchXOptions {
  /** Restrict to last N days. Default 7 (per design P1.a.1 spec). */
  windowDays?: number;
  /** Inject clock for tests. */
  now?: () => number;
  /** Override the backend (default = mock). */
  backend?: XSearchBackend;
}

const DEFAULT_WINDOW_DAYS = 7;

export async function searchX(
  query: string,
  opts: SearchXOptions = {},
): Promise<XSearchResult[]> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = opts.now ?? ((): number => Date.now());
  const backend = opts.backend ?? mockSearchX;
  return backend(query, { windowDays, now: now() });
}

// ---------------------------------------------------------------------------
// Mock backend — deterministic, offline, no network.
// Curated analyst / company voices keyed off ticker. Real impl is a thin
// wrapper around the Twitter API (out of scope for P1.a.1).
// ---------------------------------------------------------------------------

interface MockVoice {
  handle: string;
  kind: XAuthorKind;
  bias: string;
}

const KNOWN_VOICES: Record<string, MockVoice[]> = {
  NVDA: [
    { handle: 'TrefisResearch', kind: 'analyst-sell', bias: 'NVDA 估值已透支 AI 预期,毛利率扩张见顶' },
    { handle: 'TechBullArt', kind: 'analyst-buy', bias: 'Blackwell 出货加速,Q4 数据中心收入或超预期' },
    { handle: 'NVIDIACorp', kind: 'company', bias: 'We are excited to share our latest AI advances at #GTC25' },
  ],
  AAPL: [
    { handle: 'AboveAvalon', kind: 'analyst-other', bias: 'iPhone 16 销量疲软,大中华区同比 -8%' },
    { handle: 'AAPLBull', kind: 'analyst-buy', bias: '服务业务收入创新高,毛利率扩张持续' },
    { handle: 'Apple', kind: 'company', bias: 'Today we are pleased to announce our Q3 results' },
  ],
  TSLA: [
    { handle: 'TSLASkeptic', kind: 'analyst-sell', bias: 'Cybertruck 产能爬坡缓慢,毛利承压' },
    { handle: 'TeslaEnergy', kind: 'analyst-buy', bias: '储能业务 Q4 装机超预期,毛利率 30%+' },
    { handle: 'Tesla', kind: 'company', bias: 'Q3 deliveries update: 462,890 vehicles produced' },
  ],
  MSFT: [
    { handle: 'MSFTBull', kind: 'analyst-buy', bias: 'Azure AI 收入增长 90%+,Capex 回报开始显现' },
    { handle: 'CloudBear', kind: 'analyst-sell', bias: 'Azure 增速放缓,AI 货币化路径仍未明确' },
    { handle: 'Microsoft', kind: 'company', bias: 'We are thrilled to announce our Q1 earnings' },
  ],
};

const FALLBACK_VOICES: MockVoice[] = [
  { handle: 'WallStreetConsensus', kind: 'analyst-other', bias: '关注下周业绩,共识预期已上调' },
  { handle: 'Bloomberg', kind: 'analyst-other', bias: 'Sell-side sees upside risks to FY guidance' },
];

let mockCounter = 0;

export function mockSearchX(
  query: string,
  opts: { windowDays: number; now: number },
): Promise<XSearchResult[]> {
  const ticker = (query.toUpperCase().split(/\s+/)[0] ?? '').replace(/\.SH$/, '');
  const voices = KNOWN_VOICES[ticker] ?? FALLBACK_VOICES;
  const dayMs = 24 * 60 * 60 * 1000;
  const stride = Math.max(1, Math.floor(opts.windowDays / (voices.length + 1)));
  const results: XSearchResult[] = voices.map((v, idx) => {
    const offsetDays = (idx + 1) * stride;
    const ts = opts.now - offsetDays * dayMs;
    const tweetId = `${ts.toString(36)}-${mockCounter++}`;
    return {
      handle: v.handle,
      tweetId,
      url: `https://x.com/${v.handle}/status/${tweetId}`,
      ts,
      authorKind: v.kind,
      snippet: v.bias.slice(0, 240),
    };
  });
  return Promise.resolve(results);
}
