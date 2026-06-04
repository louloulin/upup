/**
 * /risk-dashboard
 *
 * v5 Sprint 2.3 — 风险面板
 * 从 .upup/plans/*.json 拉 active plan 步骤进度 + 组合集中度
 * 纯本地状态(无 src/tools/* 依赖,无 API)
 *
 * 模块边界:
 * - 只依赖 src/plan/plan-executor(只读) + src/utils/storage-paths
 * - 不依赖 src/tools/portfolio(避免 finance → agent 反向引用循环)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PLANS_DIR, SETTINGS_FILE } from '../../utils/storage-paths.js';
import { loadPlan } from '../../plan/plan-executor.js';
import type { ResearchPlan } from '../../plan/research-plan.js';
import { calculateProgress } from '../../plan/plan-context.js';
import { readWatchlist } from './watchlist-edit.js';

interface RiskSettings {
  riskPreference?: 'conservative' | 'moderate' | 'aggressive';
  maxPositionPct?: number;
  maxSectorPct?: number;
}

function readRiskSettings(): RiskSettings {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as RiskSettings;
  } catch {
    return {};
  }
}

interface ActivePlanSummary {
  plan: ResearchPlan;
  progress: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
}

function collectActivePlans(): ActivePlanSummary[] {
  if (!existsSync(PLANS_DIR)) return [];
  const result: ActivePlanSummary[] = [];
  try {
    const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      const p = loadPlan(id);
      if (!p) continue;
      if (p.phase === 'execute' || p.phase === 'confirm' || p.phase === 'review') {
        const steps = p.steps;
        result.push({
          plan: p,
          progress: calculateProgress(p),
          pending: steps.filter(s => s.status === 'pending').length,
          inProgress: steps.filter(s => s.status === 'in_progress').length,
          completed: steps.filter(s => s.status === 'completed').length,
          failed: steps.filter(s => s.status === 'failed').length,
        });
      }
    }
  } catch {
    // ignore
  }
  return result.sort((a, b) => a.progress - b.progress);
}

/** 计算 watchlist 集中度(模拟组合视角) */
function watchlistConcentration(): { count: number; topSymbol: string | undefined; alerts: number } {
  const data = readWatchlist();
  const entries = Object.values(data.entries);
  return {
    count: entries.length,
    topSymbol: entries[0]?.symbol,
    alerts: entries.reduce((s, e) => s + (e.alerts?.length ?? 0), 0),
  };
}

/** CLI 入口 */
export function runRiskDashboard(_args: string): string {
  const settings = readRiskSettings();
  const active = collectActivePlans();
  const conc = watchlistConcentration();
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    '  Risk Dashboard',
    `  ${now} UTC`,
    '═══════════════════════════════════════',
    '',
  ];

  // 1. 风险偏好
  lines.push('  ⚙️  风险偏好(.upup/settings.json)');
  if (settings.riskPreference) {
    const icon = settings.riskPreference === 'aggressive' ? '🔥' : settings.riskPreference === 'moderate' ? '⚖️' : '🛡️';
    lines.push(`  • 风险偏好:  ${icon}  ${settings.riskPreference}`);
  } else {
    lines.push('  • 风险偏好:  (未设置)');
  }
  if (settings.maxPositionPct !== undefined) {
    lines.push(`  • 单股上限:  ${(settings.maxPositionPct * 100).toFixed(0)}%`);
  }
  if (settings.maxSectorPct !== undefined) {
    lines.push(`  • 行业上限:  ${(settings.maxSectorPct * 100).toFixed(0)}%`);
  }
  lines.push('');

  // 2. Active plans
  lines.push(`  📊 进行中 plan (${active.length})`);
  if (active.length === 0) {
    lines.push('  (无 active plan)');
  } else {
    for (const a of active.slice(0, 5)) {
      const t = a.plan.ticker ?? '(无 ticker)';
      const bar = '█'.repeat(Math.round(a.progress / 10)) + '░'.repeat(10 - Math.round(a.progress / 10));
      const warn = a.failed > 0 ? ` ⚠ ${a.failed} 失败` : '';
      lines.push(`  • ${t.padEnd(10)} [${bar}] ${String(a.progress).padStart(3)}%  ${a.completed}/${a.plan.steps.length}${warn}`);
    }
  }
  lines.push('');

  // 3. Watchlist 集中度
  lines.push('  👀 Watchlist 集中度');
  lines.push(`  • 标的数:    ${conc.count}`);
  if (conc.topSymbol) {
    lines.push(`  • 最新添加:  ${conc.topSymbol}`);
  }
  lines.push(`  • 告警数:    ${conc.alerts}`);
  lines.push('');

  // 4. 框架占位(接入 src/tools/risk 后自动填充)
  lines.push('  📈 框架指标(接入 src/tools/risk/management 后自动填充)');
  lines.push('  • Portfolio β (weighted)         — 待计算');
  lines.push('  • VaR (95%, 1d)                 — 待计算');
  lines.push('  • Max Drawdown (252d)           — 待计算');
  lines.push('  • 行业集中度 (HHI)              — 待计算');
  lines.push('');

  return lines.join('\n');
}
