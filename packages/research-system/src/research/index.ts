/**
 * Research module — public API.
 *
 * Exposes the AlphaSense-style deep-search engine, NLP claim extraction,
 * synonym expansion, and a LangChain tool factory for the agent loop.
 *
 * Wiring: `registerResearchTools` is invoked by `src/tools/registry/` (or
 * whichever aggregator lists v2 capabilities). Tool is feature-gated by
 * `research_deep_search` (see `src/agent/feature-gates.ts`).
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { isFeatureCompiledIn } from '@upup/agent-runtime/feature-gates';
import {
  DeepSearchEngine,
  type Document,
  type SearchResult,
  type Claim,
  type CitationEdge,
} from './deep-search.js';

/** Re-exports for callers that only import from the index. */
export {
  DeepSearchEngine,
  extractKeyClaims,
  expandQuery,
  buildCitationGraph,
  type Document,
  type DocumentKind,
  type Claim,
  type ClaimKind,
  type CitationEdge,
  type EdgeType,
  type SearchHit,
  type SearchResult,
  type Snippet,
  type RelatedDoc,
} from './deep-search.js';

/** Shared engine instance (idempotent, feature-gated). */
let sharedEngine: DeepSearchEngine | null = null;
export function getSharedEngine(): DeepSearchEngine {
  if (!sharedEngine) sharedEngine = new DeepSearchEngine();
  return sharedEngine;
}

/** Reset the shared engine (used by tests and `/reset` CLI command). */
export function resetSharedEngine(): void {
  sharedEngine = null;
}

// ---------------------------------------------------------------------------
// Tool — `research_deep_search`
// ---------------------------------------------------------------------------

const ResearchDeepSearchSchema = z.object({
  query: z.string().min(2).describe('Free-form research query (English or Chinese).'),
  limit: z.number().int().min(1).max(50).optional().describe('Max hits to return (default 10).'),
  kinds: z.array(z.enum([
    'broker_research',
    'sec_filing',
    'earnings_transcript',
    'news',
    'analyst_note',
    'press_release',
    'social',
  ])).optional().describe('Restrict to specific document kinds.'),
  tickers: z.array(z.string()).optional().describe('Restrict to documents mentioning these tickers.'),
  documents: z.array(z.object({
    id: z.string(),
    source: z.string(),
    title: z.string(),
    content: z.string(),
    author: z.string().optional(),
    date: z.string().optional(),
    kind: z.enum([
      'broker_research', 'sec_filing', 'earnings_transcript',
      'news', 'analyst_note', 'press_release', 'social',
    ]),
    url: z.string().optional(),
    tickers: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
  })).optional().describe('Inline documents to search (used for ad-hoc corpus).'),
});

export const RESEARCH_DEEP_SEARCH_DESCRIPTION = `## research_deep_search
AlphaSense-style enterprise document search with NLP claim extraction and cross-document citation graph.

**When to use**:
- The user asks for a deep, multi-document research view ("search all broker reports on AAPL", "find everything about 半导体", "show me all the bullish and bearish takes on 600519").
- The user wants sentiment + claim-level analysis, not just keyword hits.
- The user wants theme clustering and cross-document agreement / disagreement.

**Input**:
- query: free-form research question (EN or ZH)
- limit: max hits (default 10, max 50)
- kinds: filter to specific document kinds
- tickers: filter by ticker (e.g. ["AAPL", "600519.SH"])
- documents: optional inline corpus (use when the caller already has the docs in hand)

**Output**: ranked hits with:
- snippets (sentence-level, with char offsets)
- extracted claims (polarity, magnitude, kind, target tickers)
- related docs (agrees / disagrees / same_theme)
- theme clusters across the result set

**Capability**: real cross-document citation graph, NLP key-claim extraction (polarity in [-1, +1], magnitude in [0, 1], kind: positive | negative | neutral | risk | opportunity), synonym expansion (EN + ZH), ticker / theme auto-detection.

**When NOT to use**:
- Quick keyword lookup (use \`web_search\` instead)
- Single document lookup (use \`read_filings\` or \`browser\`)
- LLM-driven analysis (this tool is deterministic + offline — combine with the agent's own reasoning)

**Cost**: in-process only. No LLM call in the hot path.
`;

function compactResult(result: SearchResult, limit: number): Record<string, unknown> {
  return {
    query: result.query,
    expandedQuery: result.expandedQuery,
    corpusSize: result.corpusSize,
    durationMs: result.durationMs,
    themeClusters: result.themeClusters,
    hits: result.hits.slice(0, limit).map((h) => ({
      docId: h.doc.id,
      title: h.doc.title,
      source: h.doc.source,
      kind: h.doc.kind,
      date: h.doc.date,
      tickers: h.doc.tickers,
      themes: h.doc.themes,
      score: Number(h.score.toFixed(3)),
      snippets: h.snippets,
      claims: h.claims.map((c) => ({
        id: c.id,
        sentenceIdx: c.sentenceIdx,
        text: c.text,
        polarity: Number(c.polarity.toFixed(2)),
        magnitude: Number(c.magnitude.toFixed(2)),
        kind: c.kind,
        targets: c.targets,
      })),
      related: h.related.map((r) => ({
        docId: r.doc.id,
        title: r.doc.title,
        edge: r.edge,
        weight: Number(r.weight.toFixed(2)),
        reason: r.reason,
      })),
    })),
  };
}

export function createResearchDeepSearchTool(): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'research_deep_search',
    description: RESEARCH_DEEP_SEARCH_DESCRIPTION,
    schema: ResearchDeepSearchSchema,
    func: async (input) => {
      // Feature-gate check (compiled-in flag, default off)
      if (!isFeatureCompiledIn('RESEARCH_TOOL')) {
        return JSON.stringify({
          error: 'feature_disabled',
          message: 'research_deep_search is not compiled in. Set BUN_CONFIG_FEATURE_RESEARCH_DEEP_SEARCH=1 to enable.',
        });
      }
      try {
        const eng = getSharedEngine();
        // If inline documents were provided, ingest them into a fresh engine
        // so we don't pollute the shared corpus. (Caller can re-add via their
        // own pipeline if persistence is needed.)
        if (input.documents && input.documents.length > 0) {
          const local = new DeepSearchEngine();
          for (const d of input.documents as Document[]) {
            local.addDocument(d);
          }
          const r = local.search(input.query, { limit: input.limit, kinds: input.kinds, tickers: input.tickers });
          return JSON.stringify(compactResult(r, input.limit ?? 10));
        }
        if (eng.size() === 0) {
          return JSON.stringify({
            error: 'empty_corpus',
            message:
              'Shared corpus is empty. Pass `documents` inline, or seed the engine via getSharedEngine().addDocument() at startup.',
          });
        }
        const r = eng.search(input.query, { limit: input.limit, kinds: input.kinds, tickers: input.tickers });
        return JSON.stringify(compactResult(r, input.limit ?? 10));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: 'search_failed', message });
      }
    },
  });
}

export const researchTools = [createResearchDeepSearchTool];

export const RESEARCH_DEEP_SEARCH_TOOL_NAME = 'RESEARCH_TOOL';
