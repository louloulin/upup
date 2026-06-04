/**
 * /portfolio-review
 *
 * v5 Sprint 2.4 — 组合复盘
 * 从 .upup/plans/*.json 拉最近完成 plan,展示复盘框架
 *
 * 模块边界:
 * - 只依赖 src/plan/plan-executor(只读) + src/utils/storage-paths + src/plan/plan-context
 * - 不依赖 src/tools/portfolio/brinson(避免 finance → agent 反向引用循环)
 * - 复用 src/plan/plan-context.calculateProgress
 */

import { existsSync, readdirSync } from 'node:fs';
import { PLANS_DIR } from '../../utils/storage-paths.js';
import { loadPlan } from '../../plan/plan-executor.js';
import type { ResearchPlan } from '../../plan/research-plan.js';
import { calculateProgress } from '../../plan/plan-context.js';
import { readWatchlist } from './watchlist-edit.js';

interface CompletedPlanSummary {
  plan: ResearchPlan;
  progress: number;
  totalDurationMs: number;
  stepResults: Array<{ step: string; status: string; result: string }>;
}

function collectCompletedPlans(limit = 5): CompletedPlanSummary[] {
  if (!existsSync(PLANS_DIR)) return [];
  const result: CompletedPlanSummary[] = [];
  try {
    const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      const p = loadPlan(id);
      if (!p || p.phase !== 'done') continue;
      const updatedMs = p.updatedAt.getTime();
      const createdMs = p.createdAt.getTime();
      result.push({
        plan: p,
        progress: calculateProgress(p),
        totalDurationMs: updatedMs - createdMs,
        stepResults: p.steps.map(s => ({
          step: s.description,
          status: s.status,
          result: s.result ? s.result.slice(0, 80) : '',
        })),
      });
    }
  } catch {
    // ignore
  }
  return result
    .sort((a, b) => b.plan.completedAt?.getTime() ?? 0 - (a.plan.completedAt?.getTime() ?? 0))
    .slice(0, limit);
}

/** 渲染单个完成 plan 的复盘 */
function renderPlanReview(s: CompletedPlanSummary): string[] {
  const p = s.plan;
  const date = p.completedAt?.toISOString().slice(0, 10) ?? '?';
  const ticker = p.ticker ?? '(无 ticker)';
  const phases = p.phases.join(' → ');

  const lines: string[] = [
    `  ┌─ ${ticker}  [${date}]`,
    `  │  Goal: ${p.goal.slice(0, 60)}`,
    `  │  Phases: ${phases}`,
    `  │  Steps: ${p.steps.length}  Progress: ${s.progress}%  Duration: ${(s.totalDurationMs / 1000).toFixed(1)}s`,
    `  │  Step Results:`,
  ];
  for (const r of s.stepResults) {
    const icon = r.status === 'completed' ? '✓' : r.status === 'failed' ? '✗' : r.status === 'skipped' ? '⊘' : '○';
    const res = r.result ? `  → ${r.result.replace(/\n/g, ' ').slice(0, 60)}` : '';
    lines.push(`  │    ${icon} ${r.step.slice(0, 50)}${res}`);
  }
  lines.push('  └─');
  return lines;
}

/** CLI 入口 */
export function runPortfolioReview(_args: string): string {
  const completed = collectCompletedPlans(5);
  const watchlistCount = Object.keys(readWatchlist().entries).length;

  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    '  Portfolio Review',
    `  ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '═══════════════════════════════════════',
    '',
  ];

  lines.push(`  📈 最近完成 plan (${completed.length})`);
  if (completed.length === 0) {
    lines.push('  (暂无完成 plan — 用 plan-builder 建一个)');
  } else {
    for (const s of completed) {
      lines.push(...renderPlanReview(s));
    }
  }
  lines.push('');

  // Brinson 框架占位
  lines.push('  🏛️  Brinson 归因框架(接入 src/tools/portfolio/brinson 后自动填充)');
  lines.push('  • Allocation Effect   — 行业配置贡献  (待计算)');
  lines.push('  • Selection Effect    — 行业内选股贡献 (待计算)');
  lines.push('  • Interaction Effect  — 配置×选股交叉   (待计算)');
  lines.push('  • Active Return       — 主动收益合计   (待计算)');
  lines.push('');

  lines.push('  📊 复盘相关:');
  lines.push(`  • watchlist 标的数:  ${watchlistCount}`);
  lines.push(`  • 完成 plan 数:      ${completed.length}`);
  lines.push('');

  lines.push('  💡 完整 Brinson 归因需接入真实持仓 + 基准权重数据');
  lines.push('');

  return lines.join('\n');
}
