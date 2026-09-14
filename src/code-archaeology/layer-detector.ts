/**
 * 5 Layer 推断(基于路径前缀 + import 模式 + capability-manifest 命中度)。
 *
 * v3 claude-code-5layer spec REQ-1:
 *   L1 基础循环(Pi runtime)
 *   L2 工具 + 技能(tools / skills)
 *   L3 多 Agent 编排(Pi-backed multi-agent / subagent / tasks)
 *   L4 远程协同(bridge / session)
 *   L5 持续自主(kairos / proactive / telemetry / coach)
 *
 * 推断策略(多信号投票):
 *   1. 路径前缀(权重 5)
 *   2. import 是否引用 L1-L5 关键模块(权重 2)
 *   3. capability-manifest 的 prefix 命中(权重 3)
 */
import type { Layer } from './types.js';

const LAYER_PREFIXES: Array<{ layer: Layer; prefixes: string[]; weight: number }> = [
  { layer: 'L1', prefixes: ['src/runtime/pi/', 'src/cli.tsx', 'src/index.tsx'], weight: 5 },
  { layer: 'L2', prefixes: ['src/tools/', 'src/skills/', 'src/data/', 'src/research/', 'src/analysis/', 'src/screening/'], weight: 5 },
  { layer: 'L3', prefixes: ['src/subagent/', 'src/tasks/', 'src/worktree/', 'src/multi-agent/'], weight: 5 },
  { layer: 'L4', prefixes: ['packages/pi-bridge/', 'packages/daemon/', 'src/session/', 'src/gateway/'], weight: 5 },
  { layer: 'L5', prefixes: ['src/kairos/', 'src/proactive/', 'src/telemetry/', 'src/coach/', 'packages/cron/'], weight: 5 },
];

/** 关键模块 import 模式(被这些模块 import 暗示该文件属于对应 layer) */
const LAYER_IMPORTS: Array<{ layer: Layer; patterns: RegExp[]; weight: number }> = [
  { layer: 'L1', patterns: [/\/runtime\/pi\/(?:runner|agent-session-factory)(\.tsx?)?/, /\/runtime\/pi\/role-system/], weight: 2 },
  { layer: 'L3', patterns: [/\/subagent\//, /\/tasks\//], weight: 2 },
  { layer: 'L4', patterns: [/\/bridge\//, /\/session\//], weight: 2 },
  { layer: 'L5', patterns: [/\/kairos\//, /\/proactive\//, /\/telemetry\//, /\/coach\//], weight: 2 },
];

/** 推断一个文件的 layer(纯路径,无 IO) */
export function detectLayer(relPath: string): Layer {
  const normalized = relPath.split('\\').join('/');
  const votes = new Map<Layer, number>();

  for (const rule of LAYER_PREFIXES) {
    if (rule.prefixes.some((p) => normalized === p.replace(/\/$/, '') || normalized.startsWith(p))) {
      votes.set(rule.layer, (votes.get(rule.layer) ?? 0) + rule.weight);
    }
  }
  if (votes.size === 0) return 'other';
  // 最高票
  let best: Layer = 'other';
  let bestScore = 0;
  for (const [l, v] of votes) {
    if (v > bestScore) {
      best = l;
      bestScore = v;
    }
  }
  return best;
}

/** 加权调整(可选,用 import 模式二次投票) */
export function refineLayer(relPath: string, currentLayer: Layer, content: string): Layer {
  if (currentLayer !== 'other') return currentLayer; // 已确定
  const votes = new Map<Layer, number>();
  votes.set('other', 1);
  for (const rule of LAYER_IMPORTS) {
    if (rule.patterns.some((p) => p.test(content))) {
      votes.set(rule.layer, (votes.get(rule.layer) ?? 0) + rule.weight);
    }
  }
  let best: Layer = 'other';
  let bestScore = 0;
  for (const [l, v] of votes) {
    if (v > bestScore) {
      best = l;
      bestScore = v;
    }
  }
  return best;
}
