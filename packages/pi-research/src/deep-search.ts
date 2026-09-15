/**
 * Deep Search — AlphaSense-style enterprise document intelligence.
 *
 * Public surface (kept narrow on purpose):
 *   - `DeepSearchEngine`        : in-process index, query, citation graph
 *   - `extractKeyClaims`        : NLP claim extraction (polarity + magnitude)
 *   - `expandQuery`             : synonym / lemma expansion (EN + ZH)
 *   - `buildCitationGraph`      : cross-document citation graph + theme clusters
 *   - `search`                  : high-level query returning ranked hits
 *
 * Design goals:
 *   - Pure functions where possible (testable, no I/O)
 *   - Deterministic given the same corpus (no LLM in the hot path)
 *   - Cite every claim back to its source document + sentence index
 *   - Default-off: gated by featureGates.isV2Enabled('research_deep_search')
 *
 * Not in scope (deliberately):
 *   - Fetching real broker research / filings (caller injects documents)
 *   - Persistent storage (caller may serialize via `toJSON()` / `fromJSON()`)
 *   - Embedding-based semantic search (kept as a future hook)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentKind =
  | 'broker_research'
  | 'sec_filing'
  | 'earnings_transcript'
  | 'news'
  | 'analyst_note'
  | 'press_release'
  | 'social';

export interface Document {
  /** Stable id (caller-supplied or sha1 of url+title). */
  id: string;
  source: string;
  title: string;
  /** Free-form body — paragraphs separated by `\n\n`. */
  content: string;
  author?: string;
  /** ISO 8601 date string. */
  date?: string;
  kind: DocumentKind;
  url?: string;
  /** Explicit tickers, e.g. ['AAPL', '600519.SH']. Detected if omitted. */
  tickers?: string[];
  /** Theme tags, e.g. ['AI', 'cloud', 'gold']. Detected if omitted. */
  themes?: string[];
}

export type ClaimKind = 'positive' | 'negative' | 'neutral' | 'risk' | 'opportunity';

export interface Claim {
  id: string;
  docId: string;
  /** 0-based sentence index within the document. */
  sentenceIdx: number;
  text: string;
  /** -1.0 (bearish) .. +1.0 (bullish). 0 = neutral / factual. */
  polarity: number;
  /** 0.0 .. 1.0 strength / conviction. */
  magnitude: number;
  kind: ClaimKind;
  /** Tickers this claim is about (inherited from doc or detected here). */
  targets: string[];
}

export type EdgeType = 'cites' | 'agrees' | 'disagrees' | 'same_theme' | 'same_event';

export interface CitationEdge {
  from: { kind: 'doc' | 'claim'; id: string };
  to: { kind: 'doc' | 'claim'; id: string };
  type: EdgeType;
  /** Edge weight 0..1. */
  weight: number;
  /** Human-readable reason for the edge. */
  reason: string;
}

export interface Snippet {
  text: string;
  sentenceIdx: number;
  /** Char offset within the doc. */
  start: number;
  end: number;
  /** Why this snippet was selected (matched terms, claim, etc.). */
  reason: string;
}

export interface RelatedDoc {
  doc: Document;
  /** Aggregate edge type — strongest edge wins. */
  edge: EdgeType;
  weight: number;
  reason: string;
}

export interface SearchHit {
  doc: Document;
  /** 0..1 relevance score. */
  score: number;
  /** Best-matching snippets (sentence-level). */
  snippets: Snippet[];
  /** Top claims extracted from this doc that match the query. */
  claims: Claim[];
  /** Other docs that agree / disagree / share theme. */
  related: RelatedDoc[];
}

export interface DeepSearchResult {
  query: string;
  expandedQuery: string;
  hits: SearchHit[];
  /** Theme clusters across the top-N hits. */
  themeClusters: Array<{ theme: string; docs: string[]; claims: number }>;
  /** Total docs in corpus scanned. */
  corpusSize: number;
  /** How long the search took (ms). */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Synonym expansion (EN + ZH, intentionally small but curated)
// ---------------------------------------------------------------------------

const SYNONYM_MAP: Record<string, string[]> = {
  // English — finance domain
  buy: ['long', 'accumulate', 'overweight', 'purchase'],
  sell: ['short', 'underweight', 'divest', 'reduce'],
  hold: ['neutral', 'market_weight', 'equal_weight'],
  growth: ['expansion', 'increase', 'rise', 'gain'],
  decline: ['drop', 'fall', 'decrease', 'slip'],
  beat: ['exceed', 'top', 'surpass', 'outperform'],
  miss: ['below', 'short_of', 'underperform', 'disappoint'],
  guidance: ['outlook', 'forecast', 'projection'],
  margin: ['profitability', 'spread'],
  revenue: ['sales', 'top_line', 'turnover'],
  // Chinese
  买入: ['增持', '推荐', '强烈推荐', '加仓'],
  卖出: ['减持', '回避', '减仓'],
  持有: ['中性', '观望'],
  增长: ['上升', '提升', '扩张', '放量'],
  下滑: ['下降', '下跌', '回落', '走低'],
  超预期: ['超市场预期', '高于预期', '好于预期', 'beat'],
  不及预期: ['低于预期', '低于市场预期', 'miss'],
  上调: ['提升', '调高'],
  下调: ['调低', '降低'],
  风险: ['警示', '隐患', '威胁'],
  机会: ['机遇', '潜力', '看点'],
};

const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
  'to', 'of', 'for', 'with', 'by', 'from', 'as', 'this', 'that', 'it', 'its', 'be',
  'has', 'have', 'had', 'will', 'would', 'should', 'could', 'may', 'might',
  // Chinese — common particles / pronouns / prepositions
  '的', '了', '是', '在', '和', '与', '或', '及', '等', '为', '以', '对', '从', '到',
  '一', '一个', '一些', '这', '那', '这个', '那个', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '也', '都', '就', '还', '并', '而', '但', '因为', '所以', '如果', '虽然', '然而', '因此',
]);

/** Tokenize on word boundaries for Latin, char-class for CJK. */
function tokenize(text: string): string[] {
  const out: string[] = [];
  const latin = text.toLowerCase().match(/[a-z][a-z0-9_]+/g);
  if (latin) out.push(...latin);
  const cjk = text.match(/[\u4e00-\u9fff]+/g);
  if (cjk) {
    for (const seg of cjk) {
      if (seg.length >= 2) out.push(seg.toLowerCase());
      for (let i = 0; i < seg.length - 1; i++) {
        out.push(seg.slice(i, i + 2).toLowerCase());
      }
    }
  }
  return out;
}

/** Expand a query with synonyms + lemma forms. Dedup, drop stopwords. */
export function expandQuery(query: string): string {
  const tokens = tokenize(query);
  const expanded = new Set<string>();
  for (const tok of tokens) {
    if (STOPWORDS.has(tok)) continue;
    if (tok.length < 2) continue;
    expanded.add(tok);
    for (const syn of SYNONYM_MAP[tok] ?? []) {
      expanded.add(syn.toLowerCase());
    }
  }
  return [...expanded].join(' ');
}

// ---------------------------------------------------------------------------
// Ticker / theme detection (lightweight, regex-based)
// ---------------------------------------------------------------------------

const US_TICKER_RE = /\$?[A-Z]{1,5}(?:\.[A-Z])?\b/g;
const CN_TICKER_RE = /\b\d{6}\.(?:SH|SZ|BJ)\b/g;
const CN_TICKER_PLAIN_RE = /\b[036]\d{5}\b/g;
const THEMES: Array<[RegExp, string]> = [
  [/人工智能|AI|artificial intelligence|machine learning|ML/i, 'AI'],
  [/云计算|cloud|aws|azure|gcp/i, 'cloud'],
  [/电动车|EV|electric vehicle|新能源车|tesla|byd/i, 'EV'],
  [/半导体|semiconductor|chip|wafer|tsmc|中芯/i, 'semiconductor'],
  [/生物医药|biotech|pharma|drug|fda|创新药/i, 'biotech'],
  [/金融|bank|insurance|证券|保险|银行/i, 'financials'],
  [/消费|consumer|retail|餐饮|白酒|食品/i, 'consumer'],
  [/能源|oil|gas|能源|石油|天然气|煤炭/i, 'energy'],
  [/黄金|gold|白银|silver|贵金属/i, 'precious_metals'],
  [/房地产|real estate|reit|地产|物业/i, 'real_estate'],
];

function detectTickers(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const usRe = new RegExp(US_TICKER_RE.source, 'g');
  while ((m = usRe.exec(text)) !== null) {
    const t = m[0].replace(/^\$/, '').toUpperCase();
    if (t.length >= 1 && t.length <= 6 && !STOPWORDS.has(t.toLowerCase())) {
      out.add(t);
    }
  }
  const cnRe = new RegExp(CN_TICKER_RE.source, 'g');
  while ((m = cnRe.exec(text)) !== null) out.add(m[0]);
  const cnPlain = new RegExp(CN_TICKER_PLAIN_RE.source, 'g');
  while ((m = cnPlain.exec(text)) !== null) out.add(m[0]);
  return [...out];
}

function detectThemes(text: string): string[] {
  const out = new Set<string>();
  for (const [re, theme] of THEMES) {
    if (re.test(text)) out.add(theme);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Key-claim extraction (sentence-level, with polarity + magnitude)
// ---------------------------------------------------------------------------

const CLAIM_POSITIVE: Array<[RegExp, number, ClaimKind]> = [
  [/(?:beat|exceed|topped?|surpass)(?:ed|s|ing)?\s+(?:estimates?|expectations?|consensus|guidance)/i, 0.8, 'positive'],
  [/(?:revenue|sales|earnings|profit)\s+(?:surged|jumped|climbed|soared|beat|grew)/i, 0.7, 'positive'],
  [/raised?\s+(?:guidance|outlook|forecast|target|price\s+target)/i, 0.7, 'positive'],
  [/(?:record|all-time)\s+(?:high|quarter|revenue|sales|profit)/i, 0.7, 'positive'],
  [/(?:upgrade[d]?|initiated)\s+(?:to\s+)?(?:buy|overweight|outperform|强烈推荐|买入|增持)/i, 0.6, 'positive'],
  [/超出?(?:预期|市场预期|分析师预期)/, 0.8, 'positive'],
  [/(?:营收|利润|净利|收入)\s*(?:大[幅增]|暴增|翻[倍番])/, 0.7, 'positive'],
  [/上调(?:评级|目标价|盈利预测)/, 0.7, 'positive'],
  [/创(?:历史|年内|季度)?\s*新高/, 0.7, 'positive'],
  [/(?:breakthrough|milestone|approval|win|partnership|deal)/i, 0.5, 'opportunity'],
];

const CLAIM_NEGATIVE: Array<[RegExp, number, ClaimKind]> = [
  [/(?:miss(?:ed)?|below|short of)\s+(?:estimates?|expectations?|consensus|guidance)/i, -0.8, 'negative'],
  [/(?:revenue|sales|earnings|profit)\s+(?:plunged|tumbled|collapsed|declined|fell)/i, -0.7, 'negative'],
  [/(?:lowered|cut|reduced|trimmed)\s+(?:guidance|outlook|forecast|target)/i, -0.7, 'negative'],
  [/(?:downgrade[d]?)\s+(?:to\s+)?(?:sell|underweight|underperform|减持|卖出|回避)/i, -0.6, 'negative'],
  [/(?:lawsuit|investigation|fraud|scandal|bankruptcy|probe)/i, -0.7, 'risk'],
  [/(?:regulatory|antitrust|recall|safety|cyberattack|breach)/i, -0.5, 'risk'],
  [/不及预期|低于预期|低于市场预期/, -0.8, 'negative'],
  [/下调(?:评级|目标价|盈利预测)/, -0.7, 'negative'],
  [/(?:业绩|利润|营收)\s*(?:下滑|大幅下滑|爆雷|亏损)/, -0.7, 'negative'],
];

function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?。！？])\s+|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

export function extractKeyClaims(doc: Document): Claim[] {
  const sentences = splitSentences(doc.content);
  const claims: Claim[] = [];
  const targets = doc.tickers ?? detectTickers(doc.title + ' ' + doc.content);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    let polarity = 0;
    let magnitude = 0;
    let kind: ClaimKind = 'neutral';
    for (const [re, weight, k] of CLAIM_POSITIVE) {
      if (re.test(s)) {
        if (weight > magnitude) { polarity = 1; magnitude = weight; kind = k; }
      }
    }
    for (const [re, weight, k] of CLAIM_NEGATIVE) {
      if (re.test(s)) {
        if (Math.abs(weight) > magnitude) { polarity = -1; magnitude = Math.abs(weight); kind = k; }
      }
    }
    if (magnitude === 0) continue;
    claims.push({
      id: `${doc.id}#c${i}`,
      docId: doc.id,
      sentenceIdx: i,
      text: s,
      polarity: polarity * magnitude,
      magnitude,
      kind,
      targets,
    });
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Citation graph
// ---------------------------------------------------------------------------

export function buildCitationGraph(docs: Document[], claims: Claim[]): CitationEdge[] {
  const edges: CitationEdge[] = [];
  const byTheme = new Map<string, Document[]>();
  for (const d of docs) {
    const themes = d.themes ?? detectThemes(d.title + ' ' + d.content);
    for (const t of themes) {
      if (!byTheme.has(t)) byTheme.set(t, []);
      byTheme.get(t)!.push(d);
    }
  }
  for (const [theme, group] of byTheme) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        edges.push({
          from: { kind: 'doc', id: group[i].id },
          to: { kind: 'doc', id: group[j].id },
          type: 'same_theme',
          weight: 0.5,
          reason: `both tagged theme="${theme}"`,
        });
      }
    }
  }
  const byTicker = new Map<string, Claim[]>();
  for (const c of claims) {
    for (const t of c.targets) {
      if (!byTicker.has(t)) byTicker.set(t, []);
      byTicker.get(t)!.push(c);
    }
  }
  for (const [ticker, group] of byTicker) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.docId === b.docId) continue;
        const sameKind = a.kind === b.kind;
        const weight = Math.min(a.magnitude, b.magnitude);
        if (sameKind && weight >= 0.5) {
          edges.push({
            from: { kind: 'claim', id: a.id },
            to: { kind: 'claim', id: b.id },
            type: 'agrees',
            weight,
            reason: `both ${a.kind} on ${ticker}`,
          });
        } else if (!sameKind && (a.kind === 'positive' || a.kind === 'opportunity') && (b.kind === 'negative' || b.kind === 'risk')) {
          edges.push({
            from: { kind: 'claim', id: a.id },
            to: { kind: 'claim', id: b.id },
            type: 'disagrees',
            weight,
            reason: `conflicting views on ${ticker}`,
          });
        }
      }
    }
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Engine — the orchestrator
// ---------------------------------------------------------------------------

export class DeepSearchEngine {
  private docs: Map<string, Document> = new Map();
  private claims: Map<string, Claim> = new Map();
  private docIndex: Map<string, Set<string>> = new Map(); // term -> docIds

  /** Add a document to the corpus; re-extracts claims. Idempotent by id. */
  addDocument(doc: Document): Claim[] {
    if (!doc.id) throw new Error('Document.id required');
    const enriched: Document = {
      ...doc,
      tickers: doc.tickers ?? detectTickers(doc.title + ' ' + doc.content),
      themes: doc.themes ?? detectThemes(doc.title + ' ' + doc.content),
    };
    this.docs.set(enriched.id, enriched);
    for (const [cid, c] of this.claims) {
      if (c.docId === enriched.id) this.claims.delete(cid);
    }
    const claims = extractKeyClaims(enriched);
    for (const c of claims) this.claims.set(c.id, c);
    this.reindexDoc(enriched);
    return claims;
  }

  removeDocument(id: string): boolean {
    const existed = this.docs.delete(id);
    for (const [cid, c] of this.claims) {
      if (c.docId === id) this.claims.delete(cid);
    }
    for (const [term, ids] of this.docIndex) {
      ids.delete(id);
      if (ids.size === 0) this.docIndex.delete(term);
    }
    return existed;
  }

  size(): number {
    return this.docs.size;
  }

  listDocuments(): Document[] {
    return [...this.docs.values()];
  }

  listClaims(): Claim[] {
    return [...this.claims.values()];
  }

  private reindexDoc(doc: Document): void {
    const terms = new Set(tokenize(`${doc.title} ${doc.content}`));
    for (const term of terms) {
      if (STOPWORDS.has(term) || term.length < 2) continue;
      if (!this.docIndex.has(term)) this.docIndex.set(term, new Set());
      this.docIndex.get(term)!.add(doc.id);
    }
  }

  /**
   * High-level search. Returns ranked hits with snippets, claims, related docs.
   * Score = sum of IDF over matched terms.
   */
  search(query: string, opts: { limit?: number; kinds?: DocumentKind[]; tickers?: string[] } = {}): DeepSearchResult {
    const t0 = Date.now();
    const expanded = expandQuery(query);
    const queryTerms = tokenize(expanded).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const docScores = new Map<string, number>();
    for (const term of queryTerms) {
      const ids = this.docIndex.get(term);
      if (!ids) continue;
      const idf = Math.log(1 + this.docs.size / (1 + ids.size));
      for (const id of ids) {
        docScores.set(id, (docScores.get(id) ?? 0) + idf);
      }
    }
    let candidates = [...docScores.entries()]
      .map(([id, score]) => ({ id, score, doc: this.docs.get(id)! }))
      .filter((c) => c.doc);
    if (opts.kinds?.length) {
      const kinds = new Set(opts.kinds);
      candidates = candidates.filter((c) => kinds.has(c.doc.kind));
    }
    if (opts.tickers?.length) {
      const ts = new Set(opts.tickers.map((t) => t.toUpperCase()));
      candidates = candidates.filter((c) => (c.doc.tickers ?? []).some((t) => ts.has(t.toUpperCase())));
    }
    candidates.sort((a, b) => b.score - a.score);
    const limit = opts.limit ?? 10;
    const top = candidates.slice(0, limit);
    const topDocs = top.map((c) => c.doc);
    const allClaims = topDocs.flatMap((d) => [...this.claims.values()].filter((c) => c.docId === d.id));
    const graph = buildCitationGraph(topDocs, allClaims);
    const relatedByDoc = new Map<string, RelatedDoc[]>();
    for (const e of graph) {
      const pairs: Array<[string, string]> = [];
      if (e.from.kind === 'doc' && e.to.kind === 'doc') {
        pairs.push([e.from.id, e.to.id], [e.to.id, e.from.id]);
      } else {
        const aDoc = this.claims.get(e.from.id)?.docId;
        const bDoc = this.claims.get(e.to.id)?.docId;
        if (aDoc && bDoc && aDoc !== bDoc) {
          pairs.push([aDoc, bDoc], [bDoc, aDoc]);
        }
      }
      for (const [anchor, other] of pairs) {
        const otherDoc = this.docs.get(other);
        if (!otherDoc) continue;
        const existing = relatedByDoc.get(anchor) ?? [];
        const prev = existing.find((r) => r.doc.id === other);
        if (prev) {
          if (e.weight > prev.weight) {
            existing.splice(existing.indexOf(prev), 1);
            existing.push({ doc: otherDoc, edge: e.type, weight: e.weight, reason: e.reason });
          }
        } else {
          existing.push({ doc: otherDoc, edge: e.type, weight: e.weight, reason: e.reason });
        }
        relatedByDoc.set(anchor, existing);
      }
    }
    const themeAgg = new Map<string, { docs: Set<string>; claims: number }>();
    for (const d of topDocs) {
      for (const t of d.themes ?? []) {
        if (!themeAgg.has(t)) themeAgg.set(t, { docs: new Set(), claims: 0 });
        const agg = themeAgg.get(t)!;
        agg.docs.add(d.id);
        agg.claims += [...this.claims.values()].filter((c) => c.docId === d.id).length;
      }
    }
    const hits: SearchHit[] = top.map((c) => {
      const doc = c.doc;
      const docClaims = [...this.claims.values()].filter((cl) => cl.docId === doc.id);
      const claimMatch = docClaims.filter((cl) => queryTerms.some((qt) => cl.text.toLowerCase().includes(qt)));
      const sentences = splitSentences(doc.content);
      const snippets: Snippet[] = [];
      for (let i = 0; i < sentences.length && snippets.length < 3; i++) {
        const s = sentences[i];
        const lc = s.toLowerCase();
        const matched = queryTerms.find((qt) => lc.includes(qt));
        if (matched) {
          const start = doc.content.indexOf(s);
          snippets.push({
            text: s,
            sentenceIdx: i,
            start: start >= 0 ? start : 0,
            end: start >= 0 ? start + s.length : s.length,
            reason: `matched term "${matched}"`,
          });
        }
      }
      if (snippets.length === 0 && sentences.length > 0) {
        const s = sentences[0];
        const start = doc.content.indexOf(s);
        snippets.push({
          text: s,
          sentenceIdx: 0,
          start: start >= 0 ? start : 0,
          end: start >= 0 ? start + s.length : s.length,
          reason: 'lead sentence (no term match)',
        });
      }
      return {
        doc,
        score: c.score,
        snippets,
        claims: claimMatch.length > 0 ? claimMatch : docClaims.slice(0, 3),
        related: (relatedByDoc.get(doc.id) ?? []).slice(0, 3),
      };
    });
    const themeClusters = [...themeAgg.entries()]
      .map(([theme, v]) => ({ theme, docs: [...v.docs], claims: v.claims }))
      .sort((a, b) => b.claims - a.claims);
    return {
      query,
      expandedQuery: expanded,
      hits,
      themeClusters,
      corpusSize: this.docs.size,
      durationMs: Date.now() - t0,
    };
  }

  /** Serialize engine state (for tests / caching). */
  toJSON(): { docs: Document[]; claims: Claim[] } {
    return { docs: [...this.docs.values()], claims: [...this.claims.values()] };
  }

  /** Re-hydrate from a snapshot. */
  static fromJSON(snapshot: { docs: Document[]; claims: Claim[] }): DeepSearchEngine {
    const eng = new DeepSearchEngine();
    for (const d of snapshot.docs) eng.addDocument(d);
    return eng;
  }
}
