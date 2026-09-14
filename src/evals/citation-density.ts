/**
 * Citation density counter (D-CTG-4 / P3.b.3)
 *
 * 1 citation per 60 tokens of final answer text. This module exposes
 * the deterministic counter used by `src/evals/citation-density.test.ts`
 * and (in a future change) by the eval runner to monitor LLM output.
 *
 * 复用:
 *   - estimateTokens() 来自 src/utils/tokens.ts(项目自有 token 工具)
 *   - 1 cite 视为 1 token (D-CTG-4 "1 citation per 60 tokens" 口径)
 *   - 不引第三方分词器 — 与项目其他 token 估算保持一致
 *
 * 不做的事:
 *   - 不解析 markdown 链接 — 只数 [N] 这种数字脚注
 *   - 不数 author-year / 等其他引用形式 — 投资域内 8-K/10-K 引用
 *     全部走 [src:N] 数字脚注
 */

import { estimateTokens } from '@upup/utils';

export const CITATION_DENSITY_LIMIT = 1 / 60;

/** Match bracketed numeric citations like [1] [2] [12]. */
const CITE_RE = /\[(\d+)\]/g;

export interface CitationDensity {
  citeCount: number;
  tokenCount: number;
  /** citeCount / tokenCount. 0 if no tokens. */
  density: number;
  /** density <= CITATION_DENSITY_LIMIT. */
  withinLimit: boolean;
}

/**
 * Count citation markers and tokens. Pure function, hermetic, no I/O.
 */
export function computeCitationDensity(text: string): CitationDensity {
  const matches = text.match(CITE_RE);
  const citeCount = matches ? matches.length : 0;
  const tokenCount = estimateTokens(text);
  const density = tokenCount > 0 ? citeCount / tokenCount : 0;
  return {
    citeCount,
    tokenCount,
    density,
    withinLimit: density <= CITATION_DENSITY_LIMIT,
  };
}
