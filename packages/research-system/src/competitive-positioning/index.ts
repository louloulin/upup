/**
 * Competitive Positioning — 公开 API (Sprint v4-2).
 *
 * 统一入口,对外暴露 4 个 capability:
 *   - 13 竞品 7 维度矩阵
 *   - 4 唯一差异化证据(动态 fs 扫描)
 *   - 4 类投资者决策路径
 *   - 30 字 sologan + 3 反驳
 *
 * 软降级: COMPETITIVE_POSITIONING feature flag 关闭时,所有函数
 * 返回空/默认值,不抛错(以便 CLI 命令、role-system 注入无副作用)。
 *
 * 编译开关: BUN_CONFIG_FEATURE_COMPETITIVE_POSITIONING=0 排除整模块。
 */

import { isFeatureCompiledIn } from '@upup/agent-runtime/feature-gates';

import { COMPETITORS, validateMatrix, groupByTier, leadCountByDim } from './matrix.js';
import { collectFourUniques, makeReportFromMetrics } from './four-uniques.js';
import { DECISION_PATHS, findPathByPersona, validateDecisionPaths } from './decision-path.js';
import { SOLOGAN_BUNDLE, validateSologan } from './sologan.js';

import type { CompetitorMatrix } from './types.js';

// Re-export types
export type {
  Competitor,
  CompetitorDims,
  CompetitorMatrix,
  UniqueEvidence,
  FourUniquesReport,
  InvestorPersona,
  DecisionPath,
  DecisionPaths,
  CounterArgument,
  SologanBundle,
} from './types.js';

// Re-export values
export {
  COMPETITORS,
  validateMatrix,
  groupByTier,
  leadCountByDim,
  collectFourUniques,
  makeReportFromMetrics,
  DECISION_PATHS,
  findPathByPersona,
  validateDecisionPaths,
  SOLOGAN_BUNDLE,
  validateSologan,
};

/** 编译期是否启用(BUN_CONFIG_FEATURE_COMPETITIVE_POSITIONING=0 排除) */
export function isCompetitivePositioningCompiledIn(): boolean {
  return isFeatureCompiledIn('COMPETITIVE_POSITIONING');
}

/**
 * 启动期是否启用(默认 true;UPUP_FEATURE_COMPETITIVE_POSITIONING=0 关闭)。
 * 注: 默认走"软降级=不抛错",所以所有 caller 应当空结果/默认值兜底。
 */
export function isCompetitivePositioningEnabled(): boolean {
  if (!isCompetitivePositioningCompiledIn()) return false;
  const env = process.env.UPUP_FEATURE_COMPETITIVE_POSITIONING;
  if (env === '0' || env === 'false' || env === 'off' || env === 'no') return false;
  return true;
}

/** 软降级入口:gate off → null;on → report */
export async function safeCollectFourUniques(rootPath?: string) {
  if (!isCompetitivePositioningEnabled()) return null;
  return collectFourUniques(rootPath);
}

/** 软降级入口:gate off → null;on → matrix */
export function safeGetMatrix(): CompetitorMatrix | null {
  if (!isCompetitivePositioningEnabled()) return null;
  return COMPETITORS;
}

/**
 * 一次 collect-all:返回一个 snapshot,用于 docs/COMPETITIVE.md 渲染。
 * 包含 matrix + four-uniques + decision-paths + sologan。
 */
export interface CompetitiveSnapshot {
  generatedAt: string;
  enabled: boolean;
  matrix: {
    entries: CompetitorMatrix;
    validation: ReturnType<typeof validateMatrix>;
    byTier: ReturnType<typeof groupByTier>;
    leadByDim: ReturnType<typeof leadCountByDim>;
  };
  uniques: Awaited<ReturnType<typeof collectFourUniques>> | null;
  decisionPaths: typeof DECISION_PATHS;
  sologan: typeof SOLOGAN_BUNDLE;
}

export async function snapshotCompetitive(rootPath?: string): Promise<CompetitiveSnapshot> {
  const enabled = isCompetitivePositioningEnabled();
  return {
    generatedAt: new Date().toISOString(),
    enabled,
    matrix: {
      entries: COMPETITORS,
      validation: validateMatrix(),
      byTier: groupByTier(),
      leadByDim: leadCountByDim(),
    },
    uniques: enabled ? await collectFourUniques(rootPath) : null,
    decisionPaths: DECISION_PATHS,
    sologan: SOLOGAN_BUNDLE,
  };
}
