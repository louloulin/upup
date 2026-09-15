import { NativeEarningsTranscriptClient, createNativeResearchDataAdapters } from '@upup/pi-finance-sdk';
import type { NativeTranscriptRef } from '@upup/pi-finance-sdk';
import { buildResearchPlan, type ResearchPlan } from '@upup/pi-planning';
import { searchX as searchPackageX } from './search';

export type EarningsPreviewSource = 'framework' | 'partial' | 'full';
export interface ConsensusEstimate { readonly period: string; readonly metric: string; readonly consensus: number; readonly prior?: number; readonly revisionPct?: number; readonly currency?: string; }
export interface TweetRef { readonly handle: string; readonly tweetId: string; readonly url: string; readonly ts: number; readonly authorKind: 'analyst-sell' | 'analyst-buy' | 'analyst-other' | 'company' | 'other'; readonly snippet: string; }
export type TranscriptRef = NativeTranscriptRef;
export interface EarningsPreview { readonly ticker: string; readonly generatedAt: number; readonly source: EarningsPreviewSource; readonly consensus: readonly ConsensusEstimate[]; readonly recentTweets: readonly TweetRef[]; readonly transcripts: readonly TranscriptRef[]; readonly planFramework: ResearchPlan; }
export type TranscriptFetcher = (ticker: string, options: { readonly limit: number; readonly windowDays: number }) => Promise<readonly TranscriptRef[]>;
export interface BuildEarningsPreviewOptions { readonly now?: () => number; readonly offline?: boolean; readonly transcriptFetcher?: TranscriptFetcher; readonly researchApiKey?: string; }

interface AnalystEstimateRow { readonly period?: string; readonly estimated_revenue?: number; readonly estimated_eps?: number; readonly revenue_estimate?: number; readonly eps_estimate?: number; readonly revenue?: number; readonly eps?: number; readonly prior_period_value?: number; readonly revision_pct?: number; readonly currency?: string; }

function parseEstimates(raw: unknown): ConsensusEstimate[] {
  let rows: AnalystEstimateRow[] = [];
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed as AnalystEstimateRow[];
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { analyst_estimates?: unknown[] }).analyst_estimates)) rows = (parsed as { analyst_estimates: AnalystEstimateRow[] }).analyst_estimates;
    } catch { return []; }
  } else if (Array.isArray(raw)) rows = raw as AnalystEstimateRow[];
  return rows.slice(0, 4).flatMap((row) => {
    const common = { period: row.period ?? '?', prior: row.prior_period_value, revisionPct: row.revision_pct, currency: row.currency ?? 'USD' };
    const output: ConsensusEstimate[] = [];
    const revenue = row.estimated_revenue ?? row.revenue_estimate ?? row.revenue;
    const eps = row.estimated_eps ?? row.eps_estimate ?? row.eps;
    if (typeof revenue === 'number') output.push({ ...common, metric: 'revenue', consensus: revenue });
    if (typeof eps === 'number') output.push({ ...common, metric: 'eps', consensus: eps });
    return output;
  });
}

async function fetchConsensus(ticker: string, offline: boolean, apiKey?: string): Promise<ConsensusEstimate[]> {
  if (offline || !(apiKey ?? process.env.FINANCIAL_DATASETS_API_KEY)?.trim()) return [];
  try { return parseEstimates(await createNativeResearchDataAdapters({ apiKey }).getAnalystEstimates.invoke({ ticker, period: 'quarterly' })); } catch { return []; }
}

async function fetchTranscripts(ticker: string, options: BuildEarningsPreviewOptions): Promise<TranscriptRef[]> {
  const query = { limit: 4, windowDays: 90 } as const;
  if (options.transcriptFetcher) { try { return [...await options.transcriptFetcher(ticker, query)]; } catch { return []; } }
  try { return await new NativeEarningsTranscriptClient().fetch(ticker, query); } catch { return []; }
}

export async function buildEarningsPreview(ticker: string, options: BuildEarningsPreviewOptions = {}): Promise<EarningsPreview> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) throw new Error('ticker must not be empty');
  const now = options.now ?? (() => Date.now());
  const offline = options.offline ?? false;
  const [consensus, tweets, transcripts] = await Promise.all([
    fetchConsensus(normalized, offline, options.researchApiKey),
    offline || !process.env.X_BEARER_TOKEN?.trim()
      ? Promise.resolve([])
      : searchPackageX({ command: 'search', query: normalized, limit: 5 })
        .then((result) => (result.value.tweets ?? []).map((tweet) => ({ handle: tweet.username, tweetId: tweet.id, url: tweet.tweet_url, ts: Date.parse(tweet.created_at), authorKind: 'analyst-other' as const, snippet: tweet.text.slice(0, 240) })))
        .catch(() => []),
    fetchTranscripts(normalized, options),
  ]);
  const reached = [consensus.length > 0, tweets.length > 0, transcripts.length > 0].filter(Boolean).length;
  return {
    ticker: normalized,
    generatedAt: now(),
    source: reached === 3 ? 'full' : reached > 0 ? 'partial' : 'framework',
    consensus,
    recentTweets: tweets,
    transcripts,
    planFramework: buildResearchPlan(`分析 ${normalized} 估值与财报`, {
      description: `财报前瞻: 下次财报日期 + 共识预期 + 历史 surprise 平均`,
      ticker: normalized,
      phases: ['detect', 'plan'],
    }),
  };
}
