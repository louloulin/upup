/**
 * Citation density regression test (D-CTG-4 / P3.b.3)
 *
 * 守护点:
 *   1. computeCitationDensity() 是纯函数, hermetic, 行为可预测
 *   2. 1 cite / 60 tokens 边界精确判定
 *   3. 20 个 finance eval queries 跑 mock compliant answer, 全部 withinLimit
 *
 * 复用:
 *   - computeCitationDensity + CITATION_DENSITY_LIMIT from ./citation-density.js
 *   - finance_agent.csv 现有 240+ query 数据集(取前 20 个)
 *   - 不引第三方 CSV parser — Question 字段无内嵌逗号, split(',', 1) 即可
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CITATION_DENSITY_LIMIT, computeCitationDensity } from './citation-density.js';

const CSV_PATH = join(import.meta.dir, 'dataset', 'finance_agent.csv');

/** Read the first N question strings from finance_agent.csv. CSV column 0 = Question. */
function loadQuestions(limit: number): string[] {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').slice(1).filter((l) => l.trim());
  const out: string[] = [];
  for (const line of lines) {
    if (out.length >= limit) break;
    // First field, strip surrounding quotes. No embedded comma in Question column.
    const firstComma = line.indexOf(',');
    if (firstComma < 0) continue;
    let q = line.slice(0, firstComma);
    if (q.startsWith('"') && q.endsWith('"')) q = q.slice(1, -1);
    if (q.length > 0) out.push(q);
  }
  return out;
}

describe('computeCitationDensity (D-CTG-4 / P3.b.3)', () => {
  test('空文本 → citeCount=0, density=0, withinLimit', () => {
    const r = computeCitationDensity('');
    expect(r.citeCount).toBe(0);
    expect(r.tokenCount).toBe(0);
    expect(r.density).toBe(0);
    expect(r.withinLimit).toBe(true);
  });

  test('单 cite 命中 (精确数字脚注)', () => {
    const r = computeCitationDensity('AAPL reported Q1 revenue of $24.2B [1].');
    expect(r.citeCount).toBe(1);
  });

  test('多 cite 独立计数', () => {
    const r = computeCitationDensity('See [1], [2], and [3] for context. [12] is also relevant.');
    expect(r.citeCount).toBe(4);
  });

  test('非数字脚标不计数 (例如 [src:foo] / [a])', () => {
    const r = computeCitationDensity('Source [src:filings/10k] and [src:news] plus [1] and [2].');
    expect(r.citeCount).toBe(2);
  });

  test('CITATION_DENSITY_LIMIT 等于 1/60', () => {
    expect(CITATION_DENSITY_LIMIT).toBeCloseTo(1 / 60, 10);
  });

  test('密度 = citeCount / tokenCount(单调)', () => {
    // 50 chars body + 1 cite
    const r1 = computeCitationDensity('a'.repeat(50) + ' [1]');
    // 100 chars body + 1 cite — density 减半
    const r2 = computeCitationDensity('a'.repeat(100) + ' [1]');
    expect(r1.citeCount).toBe(r2.citeCount);
    expect(r2.tokenCount).toBeGreaterThan(r1.tokenCount);
    expect(r2.density).toBeLessThan(r1.density);
  });

  test('20 个 finance queries: mock compliant answers 全部 withinLimit', () => {
    const questions = loadQuestions(20);
    expect(questions.length).toBe(20);

    for (const q of questions) {
      // 生成"合规"答案模板: question + 200+ char body + 2 cites
      // 这是 LLM 遵循 prompt.citation_density 指令的预期输出形态
      // ~1000 chars body — keeps density at 2/200 ≈ 0.01, well below 1/60 ≈ 0.0167
      const body =
        'The analysis covers revenue trends, margin compression, competitive positioning, ' +
        'and forward guidance. Supporting data is drawn from the most recent 10-K filing ' +
        'and corroborated by 8-K announcements over the trailing twelve months. ' +
        'Key callouts include unit economics, customer concentration, and regulatory exposure. ' +
        'Cross-references with peer disclosures provide additional context for the read. ' +
        'Forward-looking statements are anchored to management guidance and consensus estimates, ' +
        'with sensitivity to macro variables such as rates, FX, and end-market demand. ' +
        'The capital allocation framework emphasizes disciplined M&A, organic capex, and ' +
        'shareholder returns, with metrics tracked across operating cash flow conversion and ' +
        'return on invested capital. Risk factors are mapped to specific 10-K Item 1A disclosures ' +
        'and refreshed quarterly to reflect new information from earnings calls, conference ' +
        'participation, and industry data points shared across the sell-side coverage universe.';
      const answer = `${q}\n\n${body} [1] [2]`;

      const r = computeCitationDensity(answer);
      expect(
        r.citeCount,
        `query=${q.slice(0, 40)} citeCount=${r.citeCount}`,
      ).toBe(2);
      expect(
        r.withinLimit,
        `query=${q.slice(0, 40)} density=${r.density.toFixed(4)} > limit=${CITATION_DENSITY_LIMIT}`,
      ).toBe(true);
    }
  });

  test('回归: 故意堆 10 cites 触发 violation, 证明函数能 catch', () => {
    // 30-char body + 10 cites — 必超 1/60
    const text = 'a'.repeat(30) + ' [1][2][3][4][5][6][7][8][9][10]';
    const r = computeCitationDensity(text);
    expect(r.citeCount).toBe(10);
    expect(r.withinLimit).toBe(false);
  });
});
