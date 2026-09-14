/**
 * Fund Holdings Analysis - 持仓股票关联分析
 * 基金→股票双向映射、行业分布、持仓变化追踪
 */

import { getFundHoldings, searchFunds } from './fund-api.js';
import type { FundHoldings } from './fund-types.js';

// ============================================================================
// Types
// ============================================================================

export interface StockInfo {
  code: string;
  name: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
  pe?: number;
  sector?: string;
}

export interface FundHoldingWithStock extends FundHoldings {
  holdingsWithInfo: Array<{
    stockCode: string;
    stockName: string;
    valuePercent: number;
    holdingPercent: number;
    change?: string;  // 持仓变化: '增持' | '减持' | '新进' | '不变'
    stockInfo?: StockInfo;
  }>;
}

export interface StockFundMapping {
  stockCode: string;
  stockName: string;
  funds: Array<{
    fundCode: string;
    fundName: string;
    valuePercent: number;
    holdingPercent: number;
    isTop10Holding: boolean;
  }>;
  totalFunds: number;
  totalValuePercent: number;
}

export interface SectorAllocation {
  sector: string;
  percent: number;
  stockCount: number;
  topStocks: string[];
  trend: '上升' | '平稳' | '下降';
}

export interface FundHoldingAnalysis {
  fundCode: string;
  fundName: string;
  
  // 基本持仓信息
  topHoldings: Array<{
    stockCode: string;
    stockName: string;
    valuePercent: number;
  }>;
  
  // 行业分布
  sectorAllocation: SectorAllocation[];
  
  // 持仓集中度
  concentration: {
    top10Percent: number;  // 前十大持仓占比
    top5Percent: number;    // 前五大持仓占比
    singleMaxPercent: number;  // 单一股票最大占比
  };
  
  // 持仓风格
  style: {
    growthPercent: number;  // 成长股占比
    valuePercent: number;   // 价值股占比
    blueChipPercent: number;  // 蓝筹股占比
  };
  
  // 关联股票详情
  relatedStocks: StockInfo[];
}

// ============================================================================
// 行业映射 (简化版)
// ============================================================================

const SECTOR_MAPPING: Record<string, string> = {
  // 白酒
  '贵州茅台': '白酒',
  '五粮液': '白酒',
  '泸州老窖': '白酒',
  '山西汾酒': '白酒',
  '洋河股份': '白酒',
  
  // 互联网
  '腾讯控股': '互联网',
  '阿里巴巴': '互联网',
  '美团': '互联网',
  '京东': '互联网',
  '拼多多': '互联网',
  
  // 新能源
  '宁德时代': '新能源',
  '比亚迪': '新能源',
  '隆基绿能': '新能源',
  '亿纬锂能': '新能源',
  
  // 医药
  '恒瑞医药': '医药',
  '药明康德': '医药',
  '爱尔眼科': '医药',
  '迈瑞医疗': '医药',
  
  // 金融
  '中国平安': '金融',
  '招商银行': '金融',
  '兴业银行': '金融',
  '中国太保': '金融',
  
  // 消费
  '美的集团': '消费',
  '格力电器': '消费',
  '海尔智家': '消费',
  '伊利股份': '消费',
  
  // 科技
  '立讯精密': '科技',
  '歌尔股份': '科技',
  '海康威视': '科技',
  '中兴通讯': '科技',
  
  // 房地产
  '万科A': '房地产',
  '保利发展': '房地产',
  '中国建筑': '房地产',
  
  // 军工
  '中航沈飞': '军工',
  '航发动力': '军工',
  '中航光电': '军工',
};

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 获取持仓股票行业分类
 */
function getSectorFromStock(stockName: string): string {
  return SECTOR_MAPPING[stockName] || '其他';
}

/**
 * 获取持仓的行业分布
 */
export function analyzeSectorAllocation(holdings: FundHoldings): SectorAllocation[] {
  const sectorMap = new Map<string, { percent: number; stocks: string[] }>();
  
  for (const h of holdings.holdings) {
    const sector = getSectorFromStock(h.stockName);
    const existing = sectorMap.get(sector);
    
    if (existing) {
      existing.percent += h.valuePercent;
      existing.stocks.push(h.stockName);
    } else {
      sectorMap.set(sector, {
        percent: h.valuePercent,
        stocks: [h.stockName],
      });
    }
  }
  
  // 转换为数组并排序
  const sectors: SectorAllocation[] = [];
  
  sectorMap.forEach((data, sector) => {
    sectors.push({
      sector,
      percent: Math.round(data.percent * 100) / 100,
      stockCount: data.stocks.length,
      topStocks: data.stocks.slice(0, 3),
      trend: '平稳', // 简化处理
    });
  });
  
  // 按占比排序
  sectors.sort((a, b) => b.percent - a.percent);
  
  return sectors;
}

/**
 * 计算持仓集中度
 */
function analyzeConcentration(holdings: FundHoldings): {
  top10Percent: number;
  top5Percent: number;
  singleMaxPercent: number;
} {
  const sorted = [...holdings.holdings].sort((a, b) => b.valuePercent - a.valuePercent);
  
  const top10 = sorted.slice(0, 10).reduce((sum, h) => sum + h.valuePercent, 0);
  const top5 = sorted.slice(0, 5).reduce((sum, h) => sum + h.valuePercent, 0);
  const max = sorted[0]?.valuePercent || 0;
  
  return {
    top10Percent: Math.round(top10 * 100) / 100,
    top5Percent: Math.round(top5 * 100) / 100,
    singleMaxPercent: max,
  };
}

/**
 * 获取基金持仓深度分析
 */
export async function getFundHoldingAnalysis(fundCode: string): Promise<FundHoldingAnalysis | null> {
  const holdings = await getFundHoldings(fundCode);
  
  if (!holdings) return null;
  
  const sectorAllocation = analyzeSectorAllocation(holdings);
  const concentration = analyzeConcentration(holdings);
  
  // 简化风格分析
  let growthPercent = 0;
  let valuePercent = 0;
  let blueChipPercent = 0;
  
  for (const h of holdings.holdings) {
    const sector = getSectorFromStock(h.stockName);
    if (['互联网', '科技', '新能源'].includes(sector)) {
      growthPercent += h.valuePercent;
    } else if (['金融', '房地产', '白酒'].includes(sector)) {
      valuePercent += h.valuePercent;
    }
    if (['贵州茅台', '腾讯控股', '阿里巴巴', '中国平安'].includes(h.stockName)) {
      blueChipPercent += h.valuePercent;
    }
  }
  
  return {
    fundCode,
    fundName: holdings.name,
    topHoldings: holdings.holdings.slice(0, 10).map(h => ({
      stockCode: h.stockCode,
      stockName: h.stockName,
      valuePercent: h.valuePercent,
    })),
    sectorAllocation,
    concentration,
    style: {
      growthPercent: Math.round(growthPercent * 100) / 100,
      valuePercent: Math.round(valuePercent * 100) / 100,
      blueChipPercent: Math.round(blueChipPercent * 100) / 100,
    },
    relatedStocks: holdings.holdings.map(h => ({
      code: h.stockCode,
      name: h.stockName,
      sector: getSectorFromStock(h.stockName),
    })),
  };
}

/**
 * 反查持有某股票的基金
 */
export async function getFundsHoldingStock(stockName: string, limit = 20): Promise<StockFundMapping> {
  // 搜索重仓该股票的基金
  const searchResults = await searchFunds(stockName);
  
  const funds: StockFundMapping['funds'] = [];
  let totalValuePercent = 0;
  
  for (const result of searchResults.slice(0, limit)) {
    try {
      const holdings = await getFundHoldings(result.code);
      
      if (holdings) {
        const holding = holdings.holdings.find(
          h => h.stockName.includes(stockName) || stockName.includes(h.stockName)
        );
        
        if (holding) {
          funds.push({
            fundCode: result.code,
            fundName: result.name,
            valuePercent: holding.valuePercent,
            holdingPercent: holding.holdingPercent,
            isTop10Holding: holdings.holdings.indexOf(holding) < 10,
          });
          totalValuePercent += holding.valuePercent;
        }
      }
    } catch (e) {
      // 跳过失败的基金
    }
  }
  
  // 按持仓比例排序
  funds.sort((a, b) => b.valuePercent - a.valuePercent);
  
  return {
    stockCode: '', // 股票代码需要额外查询
    stockName: stockName,
    funds,
    totalFunds: funds.length,
    totalValuePercent: Math.round(totalValuePercent * 100) / 100,
  };
}

/**
 * 生成持仓分析报告
 */
export async function generateHoldingReport(fundCode: string): Promise<string> {
  const analysis = await getFundHoldingAnalysis(fundCode);
  
  if (!analysis) {
    return `未找到基金 ${fundCode} 的持仓数据`;
  }
  
  let report = `# ${analysis.fundName} (${fundCode}) 持仓分析报告\n\n`;
  
  // 1. 持仓集中度
  report += `## 持仓集中度\n`;
  report += `| 指标 | 数值 |\n`;
  report += `|------|------|\n`;
  report += `| 前十大持仓占比 | ${analysis.concentration.top10Percent}% |\n`;
  report += `| 前五大持仓占比 | ${analysis.concentration.top5Percent}% |\n`;
  report += `| 单一最大持仓 | ${analysis.concentration.singleMaxPercent}% |\n\n`;
  
  // 2. 行业分布
  report += `## 行业分布\n`;
  report += `| 行业 | 占比 | 代表股票 |\n`;
  report += `|------|------|----------|\n`;
  analysis.sectorAllocation.forEach(s => {
    report += `| ${s.sector} | ${s.percent}% | ${s.topStocks.join(', ')} |\n`;
  });
  
  // 3. 投资风格
  report += `\n## 投资风格\n`;
  report += `| 风格 | 占比 |\n`;
  report += `|------|------|\n`;
  report += `| 成长股 | ${analysis.style.growthPercent}% |\n`;
  report += `| 价值股 | ${analysis.style.valuePercent}% |\n`;
  report += `| 蓝筹股 | ${analysis.style.blueChipPercent}% |\n`;
  
  // 4. 重仓股
  report += `\n## 重仓股 Top10\n`;
  report += `| 排名 | 股票 | 占比 | 行业 |\n`;
  report += `|------|------|------|------|\n`;
  analysis.topHoldings.slice(0, 10).forEach((h, i) => {
    report += `| ${i + 1} | ${h.stockName} | ${h.valuePercent}% | ${getSectorFromStock(h.stockName)} |\n`;
  });
  
  report += `\n> 数据来源: 天天基金 (季报披露, 可能存在3个月延迟)`;
  
  return report;
}
