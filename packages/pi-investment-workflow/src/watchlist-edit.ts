/**
 * /watchlist-edit [add|remove|list] [TICKER] [NOTE]
 *
 * v5 Sprint 2.5 — fast lane 投资 CLI(不进 LLM,直接读 .upup/watchlist.json)
 *
 * 模块边界:
 * - 只依赖 storage package 的只读 API(读 WATCHLIST_FILE)
 * - 只依赖 node:fs / node:path
 * - 不依赖外部工具实现(避免 finance → agent 反向引用循环)
 * - 不依赖 packages/commands(避免跨包)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { WATCHLIST_FILE } from '@upup/utils';

export type WatchlistSubCmd = 'add' | 'remove' | 'list';

export interface WatchlistEntry {
  symbol: string;
  note?: string;
  addedAt: string;
  alerts?: Array<{ type: 'above' | 'below' | 'percent_change'; value: number }>;
}

export interface WatchlistData {
  entries: Record<string, WatchlistEntry>;
}

const EMPTY: WatchlistData = { entries: {} };

/** 测试/部署可覆盖 WATCHLIST_FILE,避免污染用户 ~/.upup/ */
function getWatchlistFile(): string {
  return process.env['UPUP_WATCHLIST_FILE'] ?? WATCHLIST_FILE;
}

/** 读本地 watchlist.json,文件不存在返回空 */
export function readWatchlist(): WatchlistData {
  if (!existsSync(getWatchlistFile())) return structuredClone(EMPTY);
  try {
    const raw = readFileSync(getWatchlistFile(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WatchlistData>;
    return {
      entries: (parsed.entries ?? {}) as Record<string, WatchlistEntry>,
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

/** 写本地 watchlist.json(自动 mkdir) */
export function writeWatchlist(data: WatchlistData): void {
  const dir = dirname(getWatchlistFile());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getWatchlistFile(), JSON.stringify(data, null, 2), 'utf-8');
}

/** 解析命令行参数 */
export function parseWatchlistArgs(input: string): { sub: WatchlistSubCmd; ticker?: string; note?: string } {
  const parts = input.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return { sub: 'list' };
  const raw = parts[0]!.toLowerCase();
  let sub: WatchlistSubCmd;
  if (raw === 'list' || raw === 'ls' || raw === 'show') sub = 'list';
  else if (raw === 'add' || raw === '+') sub = 'add';
  else if (raw === 'remove' || raw === 'rm' || raw === 'del' || raw === '-') sub = 'remove';
  else {
    // bare ticker = list(向后兼容,显示内容)
    sub = 'list';
  }
  const ticker = parts[1]?.toUpperCase();
  const note = parts.slice(2).join(' ') || undefined;
  return { sub, ticker, note };
}

/** add 入口 */
export function addWatchlistEntry(ticker: string, note?: string): { ok: boolean; message: string } {
  if (!ticker) return { ok: false, message: '需要 ticker' };
  const data = readWatchlist();
  if (data.entries[ticker]) {
    return { ok: false, message: `${ticker} 已在 watchlist` };
  }
  data.entries[ticker] = {
    symbol: ticker,
    ...(note ? { note } : {}),
    addedAt: new Date().toISOString(),
    alerts: [],
  };
  writeWatchlist(data);
  return { ok: true, message: `已添加 ${ticker}${note ? ` (${note})` : ''}` };
}

/** remove 入口 */
export function removeWatchlistEntry(ticker: string): { ok: boolean; message: string } {
  if (!ticker) return { ok: false, message: '需要 ticker' };
  const data = readWatchlist();
  if (!data.entries[ticker]) {
    return { ok: false, message: `${ticker} 不在 watchlist` };
  }
  delete data.entries[ticker];
  writeWatchlist(data);
  return { ok: true, message: `已移除 ${ticker}` };
}

/** list 入口(返回格式化文本) */
export function listWatchlistText(): string {
  const data = readWatchlist();
  const entries = Object.values(data.entries);
  if (entries.length === 0) {
    return [
      '',
      '  watchlist 为空。',
      '  用法: /watchlist-edit add <TICKER> [NOTE]',
      '        /watchlist-edit remove <TICKER>',
      '        /watchlist-edit list',
      '',
    ].join('\n');
  }
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Watchlist',
    '═══════════════════════════════════════',
    '',
    `  ${'Symbol'.padEnd(10)} ${'Note'.padEnd(28)} ${'Added'.padStart(11)}  ${'Alerts'.padStart(7)}`,
    '  ' + '─'.repeat(62),
  ];
  for (const e of entries.sort((a, b) => a.addedAt.localeCompare(b.addedAt))) {
    const note = (e.note ?? '').slice(0, 28).padEnd(28);
    const date = e.addedAt.slice(0, 10).padStart(11);
    const alerts = String(e.alerts?.length ?? 0).padStart(7);
    lines.push(`  ${e.symbol.padEnd(10)} ${note} ${date}  ${alerts}`);
  }
  lines.push('', `  共 ${entries.length} 项`, '');
  return lines.join('\n');
}

/** CLI 入口 — 接收原始参数字符串,返回渲染文本 */
export function runWatchlistEdit(args: string): string {
  const { sub, ticker, note } = parseWatchlistArgs(args);
  if (sub === 'add') {
    if (!ticker) return '\n  ✗ add 子命令需要 ticker: /watchlist-edit add <TICKER> [NOTE]\n';
    const r = addWatchlistEntry(ticker, note);
    return r.ok ? `\n  ✓ ${r.message}\n` : `\n  ✗ ${r.message}\n`;
  }
  if (sub === 'remove') {
    if (!ticker) return '\n  ✗ remove 子命令需要 ticker: /watchlist-edit remove <TICKER>\n';
    const r = removeWatchlistEntry(ticker);
    return r.ok ? `\n  ✓ ${r.message}\n` : `\n  ✗ ${r.message}\n`;
  }
  return listWatchlistText();
}
