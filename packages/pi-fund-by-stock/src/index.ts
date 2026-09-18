/**
 * Fund-by-Stock reverse search core
 * 输入股票代码 / 股票名称，返回重仓该股票的公募基金清单（按持仓比例排序）
 *
 * 设计要点：
 * - 优先用股票代码（6 位 A 股 / 港股 5 位）以减少歧义
 * - 退化为按名称搜索（鲁棒匹配中英文）
 * - 排序按 valuePercent（占基金净值比）降序
 * - 返回：基金基础信息 + 持仓占比 + 是否为前 10 大重仓
 */

import {
  getFundsHoldingStock,
  getFundHoldings,
} from '@upup/pi-finance-sdk';
import type { StockFundMapping } from '@upup/pi-finance-sdk';

// ============================================================================
// Eastmoney FundSearchAPI — 实时反向搜索（生产级数据）
// ============================================================================

const EASTMONEY_FUND_SEARCH_URL =
  'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx';

interface EastmoneyFundSearchResponse {
  ErrCode: number;
  ErrMsg: string;
  Datas: Array<{
    CODE: string;       // 股票代码（不含后缀）
    NAME: string;       // 股票中文名
    JP: string;         // 拼音缩写
    CATEGORY: number;
    CATEGORYDESC: string;
    STOCKMARKET: string;
    MatchCount: number;
    StockHolder: Array<{ Name: string; Code: string }> | null;
  }>;
}

interface EastmoneyFundHolding {
  fundCode: string;
  fundName: string;
  valuePercent: number;
  holdingPercent: number;
  isTop10Holding: boolean;
}

/**
 * 调用 Eastmoney 实时搜索接口，按股票名/代码查重仓基金
 */
async function searchEastmoneyFundsHoldingStock(
  query: string
): Promise<{ stockCode: string; stockName: string; funds: EastmoneyFundHolding[]; warnings: string[] }> {
  const warnings: string[] = [];
  const url = `${EASTMONEY_FUND_SEARCH_URL}?key=${encodeURIComponent(query)}&m=1&_=${Date.now()}`;
  try {
    const resp = await fetch(url, {
      headers: {
        'Referer': 'http://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!resp.ok) {
      warnings.push(`Eastmoney API 返回 HTTP ${resp.status}`);
      return { stockCode: '', stockName: '', funds: [], warnings };
    }
    const json = (await resp.json()) as EastmoneyFundSearchResponse;
    if (json.ErrCode !== 0 || !json.Datas || json.Datas.length === 0) {
      warnings.push(`Eastmoney 未命中股票：${query}`);
      return { stockCode: '', stockName: '', funds: [], warnings };
    }
    // 取第一条最匹配的
    const data = json.Datas[0];
    const stockCode = data.CODE;
    const stockName = data.NAME;
    const holders = data.StockHolder || [];
    if (holders.length === 0) {
      warnings.push(`${stockName}（${stockCode}）未公开重仓该股的基金（可能为港股或披露滞后）`);
      return { stockCode, stockName, funds: [], warnings };
    }
    // 对每个候选基金代码，调 pingzhongdata 拿真实持仓比例
    const funds: EastmoneyFundHolding[] = [];
    for (const h of holders) {
      try {
        const holding = await getFundHoldings(h.Code);
        if (!holding || !holding.holdings) continue;
        const hit = holding.holdings.find(
          (x) => x.stockCode === stockCode || x.stockCode === `${stockCode}.SH` || x.stockCode === `${stockCode}.SZ` || x.stockName === stockName
        );
        if (hit) {
          funds.push({
            fundCode: h.Code,
            fundName: h.Name,
            valuePercent: hit.valuePercent,
            holdingPercent: hit.holdingPercent,
            isTop10Holding: holding.holdings.indexOf(hit) < 10,
          });
        }
      } catch {
        // 单只失败跳过
      }
    }
    // 即使详细持仓全部失败，仍然返回 Eastmoney 给出的基金名称
    if (funds.length === 0 && holders.length > 0) {
      warnings.push(`已找到 ${holders.length} 只重仓基金（Eastmoney），但获取详细持仓比例失败（可能为网络问题）`);
      for (const h of holders) {
        funds.push({
          fundCode: h.Code,
          fundName: h.Name,
          valuePercent: 0,
          holdingPercent: 0,
          isTop10Holding: true,
        });
      }
    }
    return { stockCode, stockName, funds, warnings };
  } catch (err) {
    warnings.push(`Eastmoney 请求失败: ${err instanceof Error ? err.message : String(err)}`);
    return { stockCode: '', stockName: '', funds: [], warnings };
  }
}

// ============================================================================
// Types
// ============================================================================

export interface FundHoldingRef {
  fundCode: string;
  fundName: string;
  /** 占基金净值比 (%) */
  valuePercent: number;
  /** 占基金股票投资市值比 (%) */
  holdingPercent: number;
  /** 是否进入基金前 10 大重仓 */
  isTop10Holding: boolean;
}

export interface SearchFundsByStockOptions {
  /** 股票代码或名称，必填 */
  query: string;
  /** 返回数量上限，默认 20 */
  limit?: number;
  /** 仅返回前 10 大重仓的基金 */
  top10Only?: boolean;
  /** 持仓占比下限 (%) */
  minValuePercent?: number;
}

export interface SearchFundsByStockResult {
  /** 输入的查询词 */
  query: string;
  /** 解析出的股票名称（与 query 不同时会算默认） */
  resolvedStockName: string;
  /** 是否命中至少一个重仓该股票的基金 */
  found: boolean;
  /** 重仓基金数 */
  totalFunds: number;
  /** 所有重仓基金持仓占比之和（仅参考，数学上无上限） */
  totalValuePercent: number;
  /** 基金清单（按 valuePercent 降序） */
  funds: FundHoldingRef[];
  /** 数据快照日期 */
  asOf?: string;
  /** 提示 */
  warnings: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 简单展开：去空格、转全角 → 半角
 */
function normalize(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .trim();
}

// ============================================================================
// Core API
// ============================================================================

/**
 * 反向搜索：找出重仓某只股票的所有基金
 *
 * @example
 *   const r = await searchFundsByStockCore({ query: '600519.SH' });
 *   const r2 = await searchFundsByStockCore({ query: '贵州茅台', limit: 10, top10Only: true });
 */
export async function searchFundsByStockCore(
  options: SearchFundsByStockOptions
): Promise<SearchFundsByStockResult> {
  const { query, limit = 20, top10Only = false, minValuePercent = 0 } = options;

  if (!query || typeof query !== 'string') {
    return {
      query: String(query || ''),
      resolvedStockName: '',
      found: false,
      totalFunds: 0,
      totalValuePercent: 0,
      funds: [],
      warnings: ['query is required'],
    };
  }

  const q = normalize(query);
  const warnings: string[] = [];

  // 策略一：实时反向搜索（Eastmoney FundSearchAPI）
  const eastmoney = await searchEastmoneyFundsHoldingStock(q);

  let resolvedStockName = eastmoney.stockName || q;
  let funds: FundHoldingRef[] = eastmoney.funds.map((f) => ({
    fundCode: f.fundCode,
    fundName: f.fundName,
    valuePercent: f.valuePercent,
    holdingPercent: f.holdingPercent,
    isTop10Holding: f.isTop10Holding,
  }));
  warnings.push(...eastmoney.warnings);

  // 策略二：如果 Eastmoney 0 命中，退化到 SDK 内置搜
  if (funds.length === 0) {
    let mapping: StockFundMapping;
    try {
      mapping = await getFundsHoldingStock(q, Math.min(Math.max(limit * 2, 10), 60));
    } catch (err) {
      return {
        query,
        resolvedStockName,
        found: false,
        totalFunds: 0,
        totalValuePercent: 0,
        funds: [],
        warnings: [...warnings, `底层搜索失败: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
    if (mapping.stockName) resolvedStockName = mapping.stockName;
    funds = mapping.funds.map((f) => ({
      fundCode: f.fundCode,
      fundName: f.fundName,
      valuePercent: f.valuePercent,
      holdingPercent: f.holdingPercent,
      isTop10Holding: f.isTop10Holding,
    }));
  }

  // 过滤：前 10 大 + 持仓下限
  if (top10Only) funds = funds.filter((f) => f.isTop10Holding);
  if (minValuePercent > 0) funds = funds.filter((f) => f.valuePercent >= minValuePercent);

  // 排序：按 valuePercent 降序
  funds.sort((a, b) => b.valuePercent - a.valuePercent);
  funds = funds.slice(0, limit);

  // 汇总指标
  const totalValuePercent = funds.reduce((s, f) => s + f.valuePercent, 0);

  if (funds.length === 0) {
    warnings.push(
      `未找到重仓 ${resolvedStockName} 的基金。可能原因：股票名称/代码有误，或该股票不在主流基金前 10 大重仓。`
    );
  }

  return {
    query,
    resolvedStockName,
    found: funds.length > 0,
    totalFunds: funds.length,
    totalValuePercent: Math.round(totalValuePercent * 100) / 100,
    funds,
    asOf: new Date().toISOString().slice(0, 10),
    warnings,
  };
}

/**
 * 聚合统计：给定多只股票，返回它们在基金层面上的暴露
 * （为后续扩展预留，当前版本先不实现）
 */
export async function searchFundsByStocksCore(
  queries: string[],
  options: { limit?: number; top10Only?: boolean } = {}
): Promise<Array<SearchFundsByStockResult & { query: string }>> {
  const results = await Promise.all(
    queries.map((q) => searchFundsByStockCore({ query: q, ...options }))
  );
  return results;
}

/**
 * 列出某只基金的"重仓股" — 反向：在已知基金代码时取其前 N 大重仓股
 * （借调 SDK 已有的 getFundHoldings）
 */
export async function getFundHeavyHoldingsCore(
  fundCode: string,
  topN = 10
): Promise<{
  fundCode: string;
  holdings: Array<{ stockCode: string; stockName: string; valuePercent: number; holdingPercent: number }>;
  asOf?: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  try {
    const holdings = await getFundHoldings(fundCode);
    if (!holdings || holdings.holdings.length === 0) {
      warnings.push(`未取到基金 ${fundCode} 的持仓快照`);
      return { fundCode, holdings: [], warnings };
    }
    return {
      fundCode,
      holdings: holdings.holdings.slice(0, topN),
      asOf: holdings.date,
      warnings,
    };
  } catch (err) {
    return {
      fundCode,
      holdings: [],
      warnings: [`读取基金持仓失败: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}