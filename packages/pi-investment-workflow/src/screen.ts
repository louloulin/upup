/**
 * /screen <NL query>  /  /scr <NL query>
 *
 * v5 Sprint 2.3 + P1.b.4 — 自然语言选股 (Gap G4)
 *
 * Wraps the natural-language screener from `@upup/pi-market-data` and renders
 * the result as a one-pager in the CLI. The default row loader reads live
 * 东方财富 data (沪深选股器 / 行情列表 / 板块成员); nothing is fabricated when
 * the provider is unreachable. Module boundary:
 *   screen.ts (Layer 4 CLI) → @upup/pi-market-data public API.
 */

import { runNaturalLanguageScreen, type NaturalLanguageScreenOutput, type ScreenerRowLoader } from '@upup/pi-market-data';

const USAGE = [
  '',
  '  用法: /screen [universe=cn|hk|us] <NL 查询>  (alias: /scr)',
  '  数据源: 东方财富公开接口 (沪深选股器 / 行情列表 / 板块成员)，实时读取',
  '  示例:',
  '    /screen universe=cn 白酒 低估值',
  '    /screen universe=cn PE < 15 且 ROE > 20%',
  '    /screen universe=cn 股息率 > 5',
  '    /screen universe=hk 市值 > 100000000000',
  '    /screen universe=us AAPL-like',
  '  说明: RSI / 一年涨跌等逐标的指标请用 get_technical_data。',
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

function renderResultsBlock(out: NaturalLanguageScreenOutput): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  Source: ${out.source}  ·  Universe: ${out.universe}  ·  AsOf: ${out.asOf}` + (out.template ? `  ·  Template: ${out.template}` : ''));
  lines.push(`  Filters: ${out.filterCount}  ·  Scanned: ${out.scannedCount}${out.universeCount !== undefined ? ` of ${out.universeCount}` : ''}  ·  Matched: ${out.matchedCount}`);
  if (out.sourceUrls.length > 0) lines.push(`  Provider: ${out.sourceUrls.join('  ')}`);
  if (out.note) lines.push(`  注意: ${out.note}`);
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
export async function runScreen(args: string, options: { loader?: ScreenerRowLoader } = {}): Promise<string> {
  const parsed = parseScreenArgs(args);
  if (!parsed) return USAGE;
  let out: NaturalLanguageScreenOutput;
  try {
    out = await runNaturalLanguageScreen(parsed.query, {
      universe: parsed.universe,
      limit: DEFAULT_LIMIT,
      realtime: parsed.realtime,
      ...(options.loader ? { loader: options.loader } : {}),
    });
  } catch (err) {
    return [
      '',
      '  /screen 执行失败:',
      `  ${err instanceof Error ? err.message : String(err)}`,
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
    '  Pi 路径: @upup/pi-market-data native screener → 东方财富公开接口',
    '',
  ].join('\n');
}
