/**
 * Fund Types - Type definitions for fund data
 * Data source: 天天基金 (Eastmoney Fund)
 */

export interface FundBasic {
  code: string;           // 基金代码
  name: string;           // 基金简称
  fullName?: string;      // 基金全称
  type?: string;          // 基金类型 (股票型/混合型/债券型/指数型/货币型)
  establishment?: string; // 成立日期
  scale?: string;         // 最新规模(亿元)
  company?: string;       // 基金管理人
  manager?: string;       // 基金经理
  rating?: string;        // 基金评级
  trackingTarget?: string; // 跟踪标的 (for index funds)

  // Net value data
  netUnitValue?: number;         // 单位净值
  netUnitValueDate?: string;     // 单位净值日期
  netEstimatedUnit?: number;     // 估算单位净值
  netEstimatedTime?: string;     // 估算单位净值时间
  netAccumulated?: number;       // 累计净值

  // Performance (涨跌幅)
  netGrowth1?: number;   // 近1月
  netGrowth3?: number;   // 近3月
  netGrowth6?: number;   // 近6月
  netGrowth12?: number;  // 近1年
  netGrowth36?: number;  // 近3年
  netGrowth60?: number;  // 近5年
  netGrowthYTD?: number; // 今年来
  netGrowthAll?: number; // 成立来
}

export interface FollowedFund extends FundBasic {
  netEstimatedRate?: number; // 估算涨跌幅
}

export interface FundSearchResult {
  code: string;
  name: string;
}

export interface FundPerformance {
  code: string;
  name: string;
  type: string;
  company: string;
  manager: string;
  netUnitValue: number;
  netAccumulated: number;
  performance: {
    '近1月': number | null;
    '近3月': number | null;
    '近6月': number | null;
    '近1年': number | null;
    '近3年': number | null;
    '近5年': number | null;
    '今年来': number | null;
    '成立来': number | null;
  };
}

export interface FundHoldings {
  code: string;
  name: string;
  date: string;
  holdings: Array<{
    stockCode: string;
    stockName: string;
    holdingPercent: number;
    valuePercent: number;
  }>;
}
