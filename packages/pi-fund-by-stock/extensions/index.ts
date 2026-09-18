/**
 * Pi Extension entry: registers fund-by-stock tools into the Pi runtime.
 * 工具列表（3 个）：
 *   - fund_search_by_stock   反向搜索：股票 → 重仓基金
 *   - fund_heavy_holdings   正向查询：基金 → 前 N 大重仓股
 *   - fund_holders_count    统计：某只股票被多少只基金重仓
 */

import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  searchFundsByStockCore,
  getFundHeavyHoldingsCore,
} from '../src/index';
import type {
  SearchFundsByStockResult,
  FundHoldingRef,
} from '../src/index';

// ============================================================================
// TypeBox Schemas
// ============================================================================

const searchByStockParameters = Type.Object({
  query: Type.String({ minLength: 1, description: '股票代码（如 600519.SH）或股票名称（如 贵州茅台）' }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 60, description: '返回基金数量上限，默认 20' })),
  top10_only: Type.Optional(Type.Boolean({ description: '仅返回该股票进入前 10 大重仓的基金' })),
  min_value_percent: Type.Optional(Type.Number({ minimum: 0, description: '持仓占比下限 (%)，过滤低暴露基金' })),
});

const heavyHoldingsParameters = Type.Object({
  fund_code: Type.String({ minLength: 1, description: '基金代码，例如 005827' }),
  top_n: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: '返回前 N 大重仓股，默认 10' })),
});

const holdersCountParameters = Type.Object({
  query: Type.String({ minLength: 1, description: '股票代码或名称' }),
  min_value_percent: Type.Optional(Type.Number({ minimum: 0, description: '持仓占比下限 (%)' })),
});

// ============================================================================
// Helpers
// ============================================================================

function toToolResult(text: string, details?: unknown) {
  return { content: [{ type: 'text' as const, text }], details };
}

function summarizeFunds(funds: FundHoldingRef[]): string {
  if (funds.length === 0) return '_（无结果）_';
  const lines = funds.map((f, i) =>
    `${i + 1}. **${f.fundName}**（${f.fundCode}）— ${f.valuePercent.toFixed(2)}%${f.isTop10Holding ? ' · 前 10 重仓' : ''}`
  );
  return lines.join('\n');
}

// ============================================================================
// Extension Registration
// ============================================================================

export function registerFundByStockExtension(pi: ExtensionAPI): void {
  // ----------------------------------------------------------------------
  // Tool 1: fund_search_by_stock — 核心反向搜索
  // ----------------------------------------------------------------------
  pi.registerTool({
    name: 'fund_search_by_stock',
    label: 'Fund search by stock',
    description:
      '输入股票代码（如 600519.SH / 00700.HK）或名称（如 贵州茅台），返回所有重仓该股票的公募基金，按持仓占比降序排列。可用于：评估某只股票被基金"抱团"的程度，或筛选暴露同一主题的基金组合。',
    parameters: searchByStockParameters,
    async execute(_toolCallId, params, signal) {
      if (signal?.aborted) {
        return toToolResult('fund_search_by_stock request aborted', { aborted: true });
      }
      const result: SearchFundsByStockResult = await searchFundsByStockCore({
        query: params.query,
        limit: params.limit ?? 20,
        top10Only: params.top10_only ?? false,
        minValuePercent: params.min_value_percent ?? 0,
      });

      const header = `## 基金反向搜索：${result.resolvedStockName}\n\n` +
        `- 查询：\`${result.query}\`\n` +
        `- 命中基金数：**${result.totalFunds}**\n` +
        `- 持仓占比总和：**${result.totalValuePercent.toFixed(2)}%**\n` +
        `- 快照日期：${result.asOf ?? '未知'}\n`;

      const fundList = `\n### 重仓基金清单（前 ${result.funds.length} 只）\n${summarizeFunds(result.funds)}\n`;

      const warnings = result.warnings.length > 0
        ? `\n### ⚠️ 提示\n${result.warnings.map((w) => `- ${w}`).join('\n')}\n`
        : '';

      const footer = `\n---\n_本结果基于已知 UpUp 基金持仓快照，非实时数据，不构成投资建议。_`;

      return toToolResult(header + fundList + warnings + footer, result);
    }
  });

  // ----------------------------------------------------------------------
  // Tool 2: fund_heavy_holdings — 已知基金看前 N 大重仓
  // ----------------------------------------------------------------------
  pi.registerTool({
    name: 'fund_heavy_holdings',
    label: 'Fund heavy holdings',
    description: '已知基金代码，返回该基金前 N 大重仓股及占比。常用于交叉验证"这只基金重仓什么"。',
    parameters: heavyHoldingsParameters,
    async execute(_toolCallId, params, signal) {
      if (signal?.aborted) {
        return toToolResult('fund_heavy_holdings request aborted', { aborted: true });
      }
      const data = await getFundHeavyHoldingsCore(params.fund_code, params.top_n ?? 10);
      const text =
        `## 基金 ${params.fund_code} 前 ${data.holdings.length} 大重仓股\n\n` +
        (data.holdings.length === 0
          ? '_（无持仓数据）_'
          : data.holdings
              .map((h, i) =>
                `${i + 1}. **${h.stockName}**（${h.stockCode}）— 净值占比 ${h.valuePercent.toFixed(2)}% / 股票投资占比 ${h.holdingPercent.toFixed(2)}%`
              )
              .join('\n')) +
        (data.asOf? `\n\n快照日期：${data.asOf}` : '') +
        (data.warnings.length > 0
          ? `\n\n⚠️ ${data.warnings.join('；')}`
          : '');
      return toToolResult(text, data);
    }
  });

  // ----------------------------------------------------------------------
  // Tool 3: fund_holders_count — 简化版：只返回被多少只基金重仓
  // ----------------------------------------------------------------------
  pi.registerTool({
    name: 'fund_holders_count',
    label: 'Fund holders count',
    description: '简化版反向搜索：只返回某只股票被多少只基金重仓，以及总持仓占比。适合快速评估。',
    parameters: holdersCountParameters,
    async execute(_toolCallId, params, signal) {
      if (signal?.aborted) {
        return toToolResult('fund_holders_count request aborted', { aborted: true });
      }
      const result = await searchFundsByStockCore({
        query: params.query,
        limit: 60,
        minValuePercent: params.min_value_percent ?? 0,
      });
      const text =
        `## 持仓基金数：${result.resolvedStockName}\n\n` +
        `- 重仓基金数：**${result.totalFunds}**\n` +
        `- 持仓占比总和：**${result.totalValuePercent.toFixed(2)}%**\n` +
        `- 数据快照：${result.asOf ?? '未知'}\n` +
        (result.warnings.length > 0 ? `\n⚠️ ${result.warnings.join('；')}` : '');
      return toToolResult(text, result);
    }
  });
}

// ============================================================================
// Default Export (Pi auto-discovery convention)
// ============================================================================

export default function (pi: ExtensionAPI): void {
  registerFundByStockExtension(pi);
}