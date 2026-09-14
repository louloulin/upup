/**
 * Citation Registry — source-attributed answer infrastructure (Gap G1)
 *
 * Minimal, self-contained module providing:
 *   - CitationRef: normalized source reference (filing / news / transcript / tweet / kb)
 *   - CitationRegistry: per-query 1-based numbering, deterministic markdown rendering
 *   - estimateCitationDensity: enforce the 1 citation per 60 tokens upper bound
 *
 * Module boundary (zero coupling):
 *   - No imports from src/tools/*, src/memory/*, or legacy agent modules
 *   - Pure data types + string ops; safe to import anywhere in the agent core
 *
 * See design doc D-CTG-4 and D-CTG-5.
 */

export type CitationKind = 'filing' | 'news' | 'transcript' | 'tweet' | 'kb';

export interface CitationRef {
  index: number;
  url: string;
  kind: CitationKind;
  offset?: number;
  snippet: string;
  ts: number;
}

export interface CitationInput {
  url: string;
  kind: CitationKind;
  snippet: string;
  offset?: number;
  ts?: number;
}

/**
 * In-process registry. One instance per query → guarantees 1-based numbering
 * stable across tool invocations within a single scratchpad lifetime.
 */
export class CitationRegistry {
  private readonly refs: CitationRef[] = [];
  private readonly byIndex = new Map<number, CitationRef>();

  /** Append a citation; returns its 1-based index. */
  add(input: Omit<CitationRef, 'index' | 'ts'> & { ts?: number }): number {
    if (!input.url || !input.kind || !input.snippet) {
      throw new Error('CitationRegistry.add: url/kind/snippet are required');
    }
    const ref: CitationRef = { ...input, ts: input.ts ?? Date.now(), index: this.refs.length + 1 };
    this.refs.push(ref);
    this.byIndex.set(ref.index, ref);
    return ref.index;
  }

  /** Lookup by 1-based index. Throws on unknown — prompts must not invent numbers. */
  get(index: number): CitationRef {
    const ref = this.byIndex.get(index);
    if (!ref) throw new Error(`Unknown citation [src:${index}]`);
    return ref;
  }

  /** Render as inline markdown link. */
  getMarkdownLink(index: number): string {
    const ref = this.get(index);
    return `[${ref.snippet}](${ref.url})`;
  }

  /** Number of registered citations. */
  size(): number {
    return this.refs.length;
  }

  /** Snapshot — for evals, MCP resources, audit trail. */
  toJSON(): CitationRef[] {
    return this.refs.map(r => ({ ...r }));
  }

  /** Restore from snapshot — used by `upup://citations/{query-id}` resource reader. */
  static fromJSON(refs: CitationRef[]): CitationRegistry {
    const r = new CitationRegistry();
    for (const ref of refs) {
      // index is preserved, but re-add increments the counter — we need direct insertion
      r.refs.push({ ...ref });
      r.byIndex.set(ref.index, { ...ref });
    }
    return r;
  }
}

// ============================================================================
// Citation density enforcement (D-CTG-4: ≤ 1 citation per 60 tokens)
// ============================================================================

/** Rough token estimator — ~4 chars/token, conservative for English/Chinese mix. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface DensityResult {
  citations: number;
  tokens: number;
  ratio: number;        // citations / tokens
  exceedsBudget: boolean;
  budget: number;       // tokens per citation (e.g., 60)
}

/**
 * Enforce citation density upper bound.
 * Returns a result the caller can log/throw on.
 */
export function estimateCitationDensity(
  text: string,
  citationCount: number,
  budget = 60,
): DensityResult {
  const tokens = estimateTokens(text);
  const ratio = tokens === 0 ? 0 : citationCount / tokens;
  return {
    citations: citationCount,
    tokens,
    ratio,
    exceedsBudget: tokens > 0 && ratio > 1 / budget,
    budget,
  };
}

/**
 * Extract [src:N] references from a piece of text in left-to-right order.
 * Used by the final-answer post-processor to assert coverage and density.
 */
export function extractCitationRefs(text: string): number[] {
  const out: number[] = [];
  const re = /\[src:(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/**
 * Render a numbered citation footer (e.g. used in /dossier command output).
 */
export function renderCitationFooter(refs: CitationRef[]): string {
  if (refs.length === 0) return '';
  const lines = ['', '## 引用', ''];
  for (const r of refs) {
    lines.push(`[${r.index}] (${r.kind}) ${r.snippet} — ${r.url}`);
  }
  return lines.join('\n');
}
