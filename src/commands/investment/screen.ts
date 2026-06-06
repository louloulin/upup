/**
 * /screen <NL query>  /  /scr <NL query>
 *
 * v5 Sprint 2.3 + P1.b.4 — 自然语言选股 (Gap G4)
 *
 * Wraps the `nl_screen` tool from `src/tools/screening/nl-screen.ts` and
 * renders the result as a one-pager in the CLI. Module boundary:
 *   screen.ts (Layer 4 CLI) → tools/screening (Layer 3) + plan/filter-spec (Layer 2)
 *   No new dependencies; the heavy lifting lives in nl_screen.
 */

import { createNlScreenTool, type NlScreenOutput } from '../../tools/screening/nl-screen.js';

const USAGE = [
  '',
  '  用法: /screen <NL 查询>  (alias: /scr)',
  '  示例:',
  '    /screen AAPL-like 跌深 ex-金融',
  '    /screen PE < 15 且 ROE > 20%',
  '    /screen RSI < 35',
  '    /screen 市值 $10B-$50B',
  '    /screen 复利型 组合',
  '',
].join('\n');

/** Default cap when caller doesn't specify. */
const DEFAULT_LIMIT = 20;

/**
 * Parse "/screen [universe=<us|cn|hk|crypto>] [realtime=true] <NL query...>".
 * Returns { query, universe, realtime } or null when the args are empty.
 */
function parseScreenArgs(args: string): { query: string; universe: 'us' | 'cn' | 'hk' | 'crypto'; realtime: boolean } | null {
  const raw = args.trim();
  if (!raw) return null;
  let universe: 'us' | 'cn' | 'hk' | 'crypto' = 'us';
  let realtime = false;
  let rest = raw;
  const uMatch = rest.match(/\buniverse\s*=\s*(us|cn|hk|crypto)\b/i);
  if (uMatch) { universe = uMatch[1]!.toLowerCase() as 'us' | 'cn' | 'hk' | 'crypto'; rest = rest.replace(uMatch[0], '').trim(); }
  const rMatch = rest.match(/\brealtime\s*=\s*(true|1|yes)\b/i);
  if (rMatch) { realtime = true; rest = rest.replace(rMatch[0], '').trim(); }
  if (!rest) return null;
  return { query: rest, universe, realtime };
}

function renderResultsBlock(out: NlScreenOutput): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  Source: ${out.source}  ·  Universe: ${out.universe}` + (out.template ? `  ·  Template: ${out.template}` : ''));
  lines.push(`  Filters: ${out.filterCount}  ·  Scanned: ${out.scannedCount}  ·  Matched: ${out.matchedCount}`);
  lines.push('');
  if (out.results.length === 0) {
    lines.push('  (无结果 — 放宽过滤条件或扩大 universe)');
    return lines;
  }
  lines.push(`  ${'#'.padStart(3)}  ${'Ticker'.padEnd(8)}${'Name'.padEnd(22)}${'Score'.padStart(6)}  Thesis`);
  lines.push('  ' + '─'.repeat(80));
  for (let i = 0; i < out.results.length; i++) {
    const r = out.results[i]!;
    const t = r.ticker.padEnd(8);
    const n = r.name.length > 20 ? r.name.slice(0, 19) + '…' : r.name.padEnd(22);
    const s = String(r.score).padStart(6);
    lines.push(`  ${String(i + 1).padStart(3)}  ${t}${n}${s}  ${r.thesis}`);
  }
  return lines;
}

/**
 * Run the /screen CLI. Returns plain text (matches the rest of the
 * investment commands). Always returns a string; never throws.
 */
export async function runScreen(args: string): Promise<string> {
  const parsed = parseScreenArgs(args);
  if (!parsed) return USAGE;
  const tool = createNlScreenTool();
  let out: NlScreenOutput;
  try {
    const raw = await tool.invoke({
      query: parsed.query,
      universe: parsed.universe,
      limit: DEFAULT_LIMIT,
      realtime: parsed.realtime,
    });
    out = JSON.parse(raw as string) as NlScreenOutput;
  } catch (err) {
    return [
      '',
      '  /screen 执行失败:',
      `  ${err instanceof Error ? err.message : String(err)}`,
      '',
    ].join('\n');
  }
  if ((out as unknown as { error?: string }).error) {
    return [
      '',
      '  /screen FilterSpec 校验失败:',
      `  ${(out as unknown as { error: string }).error}`,
      '',
    ].join('\n');
  }
  return [
    '',
    '═══════════════════════════════════════',
    `  /screen — ${parsed.query}`,
    '═══════════════════════════════════════',
    ...renderResultsBlock(out),
    '',
    `  MCP 路径: 走 nl_screen 工具(能力组: screening,前缀 nl_)`,
    '',
  ].join('\n');
}
