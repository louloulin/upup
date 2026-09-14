/**
 * /morning-brief
 *
 * v5 Sprint 2.1 — 早盘简报: 今日待执行 plan + watchlist + 近期 plans 总览
 * Fast lane(< 1s,纯本地状态读取)
 *
 * 模块边界:
 * - 只依赖 src/utils/storage-paths + src/plan/plan-executor(只读 plan)
 * - 不依赖 src/tools/*
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS_DIR, WATCHLIST_FILE } from '@upup/utils';
import { loadPlan } from '@upup/pi-planning';
import type { ResearchPlan } from '@upup/pi-planning';
import { readWatchlist } from './watchlist-edit.js';

interface BriefSection {
  title: string;
  status: 'ok' | 'unavailable' | 'empty';
  lines: string[];
}

/** 收集今日待执行 / 进行中 / 刚完成的 plan(本地状态) */
function collectPlanBriefs(): BriefSection {
  if (!existsSync(PLANS_DIR)) {
    return { title: '📋 投资研究 Plan', status: 'empty', lines: ['  暂无 plan — 用自然语言问"分析 NVDA"自动建 plan'] };
  }
  try {
    const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      return { title: '📋 投资研究 Plan', status: 'empty', lines: ['  暂无 plan — 用自然语言问"分析 NVDA"自动建 plan'] };
    }
    const plans: ResearchPlan[] = [];
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      const p = loadPlan(id);
      if (p) plans.push(p);
    }
    // 排序:active > plan > confirm > done
    const order: Record<string, number> = { execute: 0, confirm: 1, plan: 2, review: 3, done: 4 };
    plans.sort((a, b) => (order[a.phase] ?? 9) - (order[b.phase] ?? 9));

    const lines: string[] = [];
    const pending = plans.filter(p => p.phase === 'plan' || p.phase === 'confirm').slice(0, 3);
    const active = plans.filter(p => p.phase === 'execute' || p.phase === 'review').slice(0, 3);
    const recent = plans.filter(p => p.phase === 'done').sort((a, b) =>
      (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    ).slice(0, 2);

    if (pending.length > 0) {
      lines.push(`  待确认 (${pending.length}):`);
      for (const p of pending) {
        lines.push(`    • ${p.ticker ?? '(无 ticker)'} — ${p.goal.slice(0, 40)} [${p.phase}]`);
      }
    }
    if (active.length > 0) {
      lines.push(`  进行中 (${active.length}):`);
      for (const p of active) {
        const done = p.steps.filter(s => s.status === 'completed').length;
        const total = p.steps.length;
        lines.push(`    • ${p.ticker ?? '(无 ticker)'} — ${done}/${total} 步 [${p.phase}]`);
      }
    }
    if (recent.length > 0) {
      lines.push(`  最近完成 (${recent.length}):`);
      for (const p of recent) {
        const date = p.completedAt?.toISOString().slice(0, 10) ?? '?';
        lines.push(`    • ${p.ticker ?? '(无 ticker)'} — ${date}`);
      }
    }
    if (lines.length === 0) {
      return { title: '📋 投资研究 Plan', status: 'empty', lines: ['  暂无 plan — 用自然语言问"分析 NVDA"自动建 plan'] };
    }
    return { title: '📋 投资研究 Plan', status: 'ok', lines };
  } catch (e) {
    return { title: '📋 投资研究 Plan', status: 'unavailable', lines: [`  ⚠ 加载失败: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** 收集 watchlist 概要(从本地 watchlist.json) */
function collectWatchlistBrief(): BriefSection {
  try {
    const data = readWatchlist();
    const entries = Object.values(data.entries);
    if (entries.length === 0) {
      return { title: '👀 Watchlist', status: 'empty', lines: ['  watchlist 为空 — /watchlist-edit add <TICKER>'] };
    }
    return {
      title: '👀 Watchlist',
      status: 'ok',
      lines: entries.slice(0, 5).map(e => `  • ${e.symbol}${e.note ? ` — ${e.note}` : ''}`),
    };
  } catch (e) {
    return { title: '👀 Watchlist', status: 'unavailable', lines: [`  ⚠ 加载失败: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** 收集 plan 审计日志摘要(最近 5 条) */
function collectAuditBrief(): BriefSection {
  const auditPath = join(PLANS_DIR, 'audit.log');
  if (!existsSync(auditPath)) {
    return { title: '📜 审计日志', status: 'empty', lines: ['  暂无审计记录'] };
  }
  try {
    const raw = readFileSync(auditPath, 'utf-8').trim();
    if (!raw) return { title: '📜 审计日志', status: 'empty', lines: ['  暂无审计记录'] };
    const lines = raw.split('\n').filter(Boolean);
    const tail = lines.slice(-5).map(l => {
      try {
        const e = JSON.parse(l) as { action: string; ts: string; planId?: string };
        const time = e.ts.slice(11, 19);
        const planShort = e.planId ? e.planId.slice(0, 8) : '?';
        return `  • ${time}  [${planShort}]  ${e.action}`;
      } catch {
        return null;
      }
    }).filter((l): l is string => l !== null);
    if (tail.length === 0) return { title: '📜 审计日志', status: 'empty', lines: ['  暂无审计记录'] };
    return { title: '📜 审计日志', status: 'ok', lines: tail };
  } catch (e) {
    return { title: '📜 审计日志', status: 'unavailable', lines: [`  ⚠ 加载失败: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** CLI 入口 */
export function runMorningBrief(_args: string): string {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    '  Morning Brief',
    `  ${now} UTC`,
    '═══════════════════════════════════════',
    '',
  ];
  for (const section of [collectPlanBriefs(), collectWatchlistBrief(), collectAuditBrief()]) {
    lines.push(section.title);
    if (section.lines.length === 0) {
      lines.push('  (无数据)');
    } else {
      lines.push(...section.lines);
    }
    lines.push('');
  }
  lines.push('  数据源: 纯本地 .upup/ 状态(无外部 API 调用)');
  lines.push('');
  return lines.join('\n');
}
