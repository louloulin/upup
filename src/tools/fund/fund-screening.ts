/**
 * Fund Screening API - 智能基金筛选
 * 基于多维度条件的基金筛选和智能推荐
 */

import type { FundBasic, FundPerformance, FundManager } from './types';
import { searchFunds, getFundBasic, getFundPerformance, getFundManager, screenFunds as baseScreenFunds, getTopFunds } from './fund-api';

// ============================================================================
// Types
// ============================================================================

export interface ScreeningCriteria {
  // 基础条件
  type?: '股票型' | '混合型' | '债券型' | '指数型' | '货币型' | 'QDII';
  
  // 规模条件
  minScale?: number;  // 最小规模(亿元)
  maxScale?: number;  // 最大规模(亿元)
  
  // 业绩条件
  minPerformance?: {
    period: '1M' | '3M' | '6M' | '1Y' | '3Y';
    threshold: number;
  };
  
  // 经理条件
  managerTenure?: number;  // 最短任职年限
  
  // 排序
  sortBy?: 'performance' | 'scale' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface FundRecommendationScore {
  fund: FundBasic;
  score: number;
  factors: {
    performance: number;  // 业绩评分
    risk: number;         // 风险评分
    manager: number;      // 经理评分
    scale: number;        // 规模评分
  };
  rank: number;
}

export interface FundRecommendation {
  fund: FundBasic;
  score: number;
  recommendation: '强烈推荐' | '推荐' | '谨慎推荐' | '不推荐';
  reasons: string[];
  warnings: string[];
  periodPerformance?: Record<string, number>;
}

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * 计算基金综合评分
 */
function calculateFundScore(
  fund: FundBasic,
  perf: FundPerformance | null,
  mgr: FundManager | null
): { score: number; factors: FundRecommendationScore['factors'] } {
  const factors = {
    performance: 0,
    risk: 0,
    manager: 0,
    scale: 0,
  };
  
  // 业绩评分 (0-40分)
  if (perf?.performance) {
    const p = perf.performance;
    const avgPerf = [
      p['近1月'] || 0,
      p['近3月'] || 0,
      p['近1年'] || 0,
    ].reduce((a, b) => a + b, 0) / 3;
    
    if (avgPerf > 20) factors.performance = 40;
    else if (avgPerf > 10) factors.performance = 30;
    else if (avgPerf > 0) factors.performance = 20;
    else if (avgPerf > -10) factors.performance = 10;
    else factors.performance = 5;
  }
  
  // 经理评分 (0-25分)
  if (mgr?.tenureYears) {
    if (mgr.tenureYears >= 10) factors.manager = 25;
    else if (mgr.tenureYears >= 5) factors.manager = 20;
    else if (mgr.tenureYears >= 3) factors.manager = 15;
    else if (mgr.tenureYears >= 1) factors.manager = 10;
    else factors.manager = 5;
  } else {
    factors.manager = 10; // 默认10分
  }
  
  // 规模评分 (0-20分)
  const scale = parseFloat(fund.scale || '0');
  if (scale >= 100) factors.scale = 20;
  else if (scale >= 50) factors.scale = 18;
  else if (scale >= 20) factors.scale = 15;
  else if (scale >= 10) factors.scale = 12;
  else if (scale >= 5) factors.scale = 8;
  else factors.scale = 5;
  
  // 风险评分 (0-15分) - 基于波动
  // 简单处理：股票型波动大得分低
  if (fund.type === '债券型' || fund.type === '货币型') {
    factors.risk = 15;
  } else if (fund.type === '混合型') {
    factors.risk = 10;
  } else {
    factors.risk = 7;
  }
  
  const totalScore = factors.performance + factors.manager + factors.scale + factors.risk;
  
  return { score: totalScore, factors };
}

/**
 * 确定推荐等级
 */
function getRecommendationLevel(score: number): FundRecommendation['recommendation'] {
  if (score >= 80) return '强烈推荐';
  if (score >= 60) return '推荐';
  if (score >= 40) return '谨慎推荐';
  return '不推荐';
}

/**
 * 生成推荐理由
 */
function generateReasons(
  fund: FundBasic,
  score: number,
  factors: FundRecommendationScore['factors']
): string[] {
  const reasons: string[] = [];
  
  if (factors.performance >= 30) {
    reasons.push('近期业绩表现优秀');
  }
  if (factors.manager >= 20) {
    reasons.push('基金经理任职时间长，管理经验丰富');
  }
  if (factors.scale >= 15) {
    reasons.push('基金规模适中，流动性好');
  }
  if (fund.type === '混合型') {
    reasons.push('混合型基金，攻守兼备');
  }
  if (fund.type === '指数型') {
    reasons.push('指数基金，费率低，分散风险');
  }
  
  return reasons;
}

/**
 * 生成风险提示
 */
function generateWarnings(
  fund: FundBasic,
  perf: FundPerformance | null,
  mgr: FundManager | null
): string[] {
  const warnings: string[] = [];
  
  if (perf?.performance) {
    const p = perf.performance;
    if ((p['近1月'] || 0) < -10) {
      warnings.push('近期回撤较大，注意风险');
    }
    if ((p['近1年'] || 0) < -20) {
      warnings.push('近1年收益为负，长期持有需谨慎');
    }
  }
  
  if (mgr && mgr.tenureYears < 2) {
    warnings.push('基金经理任职时间较短');
  }
  
  const scale = parseFloat(fund.scale || '0');
  if (scale < 1) {
    warnings.push('基金规模较小，存在清盘风险');
  }
  
  if (fund.type === '股票型') {
    warnings.push('股票型基金波动较大');
  }
  
  warnings.push('历史业绩不代表未来表现');
  
  return warnings;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 增强版基金筛选
 */
export async function screenFunds(criteria: ScreeningCriteria): Promise<FundBasic[]> {
  let funds = await baseScreenFunds({});
  
  // 按类型筛选
  if (criteria.type) {
    funds = funds.filter(f => f.type === criteria.type);
  }
  
  // 按规模筛选
  if (criteria.minScale !== undefined) {
    funds = funds.filter(f => {
      const scale = parseFloat(f.scale || '0');
      return scale >= criteria.minScale!;
    });
  }
  
  if (criteria.maxScale !== undefined) {
    funds = funds.filter(f => {
      const scale = parseFloat(f.scale || '0');
      return scale <= criteria.maxScale!;
    });
  }
  
  // 按业绩筛选
  if (criteria.minPerformance) {
    const periodMap: Record<string, keyof FundBasic> = {
      '1M': 'netGrowth1',
      '3M': 'netGrowth3',
      '6M': 'netGrowth6',
      '1Y': 'netGrowth12',
      '3Y': 'netGrowth36',
    };
    const field = periodMap[criteria.minPerformance.period];
    funds = funds.filter(f => {
      const val = f[field];
      return typeof val === 'number' && val >= criteria.minPerformance!.threshold;
    });
  }
  
  // 排序
  if (criteria.sortBy) {
    funds.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (criteria.sortBy) {
        case 'performance':
          aVal = a.netGrowth12 || 0;
          bVal = b.netGrowth12 || 0;
          break;
        case 'scale':
          aVal = parseFloat(a.scale || '0');
          bVal = parseFloat(b.scale || '0');
          break;
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
      }
      
      if (criteria.sortOrder === 'asc') {
        return aVal < bVal ? -1 : 1;
      }
      return aVal > bVal ? -1 : 1;
    });
  }
  
  return funds;
}

/**
 * 获取基金智能推荐
 */
export async function getFundRecommendations(
  criteria?: {
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
    investmentGoal?: 'preservation' | 'income' | 'growth';
    maxResults?: number;
  }
): Promise<FundRecommendation[]> {
  const results: FundRecommendation[] = [];
  
  // 根据风险偏好确定筛选条件
  let type: ScreeningCriteria['type'] = '混合型';
  let minPerf = 5;
  
  if (criteria?.riskTolerance === 'conservative') {
    type = '债券型';
    minPerf = 0;
  } else if (criteria?.riskTolerance === 'aggressive') {
    type = '股票型';
    minPerf = 10;
  }
  
  // 获取候选基金
  const candidates = await screenFunds({
    type,
    minScale: 5,
    minPerformance: { period: '1Y', threshold: minPerf },
    sortBy: 'performance',
    sortOrder: 'desc',
  });
  
  // 限制数量
  const limited = candidates.slice(0, 20);
  
  // 计算评分
  for (const fund of limited) {
    try {
      const [perf, mgr] = await Promise.all([
        getFundPerformance(fund.code),
        getFundManager(fund.code),
      ]);
      
      const { score, factors } = calculateFundScore(fund, perf, mgr);
      
      results.push({
        fund,
        score,
        recommendation: getRecommendationLevel(score),
        reasons: generateReasons(fund, score, factors),
        warnings: generateWarnings(fund, perf, mgr),
        periodPerformance: perf?.performance ? Object.fromEntries(
            Object.entries(perf.performance).map(([k, v]) => [k, v ?? 0])
          ) : undefined,
      });
    } catch (e) {
      // 跳过失败的基金
    }
  }
  
  // 按评分排序
  results.sort((a, b) => b.score - a.score);
  
  // 限制返回数量
  const maxResults = criteria?.maxResults || 5;
  return results.slice(0, maxResults);
}

/**
 * 获取基金对比数据
 */
export async function compareFunds(fundCodes: string[]): Promise<{
  funds: FundBasic[];
  performances: Map<string, FundPerformance>;
  managers: Map<string, FundManager>;
  scores: Map<string, { score: number; factors: FundRecommendationScore['factors'] }>;
}> {
  const funds: FundBasic[] = [];
  const performances = new Map<string, FundPerformance>();
  const managers = new Map<string, FundManager>();
  const scores = new Map<string, { score: number; factors: FundRecommendationScore['factors'] }>();
  
  for (const code of fundCodes) {
    try {
      const [fund, perf, mgr] = await Promise.all([
        getFundBasic(code),
        getFundPerformance(code),
        getFundManager(code),
      ]);
      
      if (fund) {
        funds.push(fund);
        const { score, factors } = calculateFundScore(fund, perf, mgr);
        
        if (perf) performances.set(code, perf);
        if (mgr) managers.set(code, mgr);
        scores.set(code, { score, factors });
      }
    } catch (e) {
      console.error(`Error comparing fund ${code}:`, e);
    }
  }
  
  return { funds, performances, managers, scores };
}

/**
 * 获取基金筛选策略模板
 */
export function getScreeningStrategies() {
  return [
    {
      name: '保守型策略',
      description: '适合养老/保本需求',
      criteria: {
        type: '债券型' as const,
        minScale: 5,
      },
    },
    {
      name: '稳健型策略',
      description: '适合工薪族定投',
      criteria: {
        type: '混合型' as const,
        minScale: 20,
        minPerformance: { period: '1Y' as const, threshold: 10 },
      },
    },
    {
      name: '积极型策略',
      description: '适合高净值投资者',
      criteria: {
        type: '股票型' as const,
        minScale: 10,
        minPerformance: { period: '1Y' as const, threshold: 15 },
      },
    },
    {
      name: '定投型策略',
      description: '适合长期定投',
      criteria: {
        type: '指数型' as const,
        minScale: 10,
      },
    },
  ];
}
