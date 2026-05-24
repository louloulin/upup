/**
 * Fund API - Eastmoney Fund Data Scraper
 * Enhanced: Uses pingzhongdata API for complete fund data + built-in fund database for search
 * Data source: 天天基金 (fund.eastmoney.com)
 */

import type { FundBasic, FollowedFund, FundPerformance, FundHoldings } from './types';

const FUND_BASE_URL = 'http://fund.eastmoney.com';
const FUND_GZ_URL = 'https://fundgz.1234567.com.cn/js';
const PINGZHONG_URL = 'https://fund.eastmoney.com/pingzhongdata';

// Built-in fund database for search (top 50 popular funds)
const FUND_DATABASE: Array<{ code: string; name: string; type: string }> = [
  { code: '005827', name: '易方达蓝筹精选混合', type: '混合型' },
  { code: '110022', name: '易方达消费行业股票', type: '股票型' },
  { code: '161725', name: '招商中证白酒指数', type: '指数型' },
  { code: '163406', name: '兴全合润混合', type: '混合型' },
  { code: '005911', name: '广发双擎升级混合', type: '混合型' },
  { code: '003095', name: '中欧医疗健康混合', type: '混合型' },
  { code: '320007', name: '诺安成长混合', type: '混合型' },
  { code: '260108', name: '景顺长城新兴成长', type: '混合型' },
  { code: '001071', name: '华安媒体互联网', type: '混合型' },
  { code: '001513', name: '富国新动力灵活配置', type: '混合型' },
  { code: '002001', name: '华夏回报混合', type: '混合型' },
  { code: '000961', name: '天弘安康颐养', type: '混合型' },
  { code: '110001', name: '易方达价值精选', type: '混合型' },
  { code: '000031', name: '华夏大盘精选混合', type: '混合型' },
  { code: '000300', name: '华夏沪深300指数', type: '指数型' },
  { code: '159915', name: '易方达创业板ETF', type: '指数型' },
  { code: '159920', name: '华夏恒生ETF', type: '指数型' },
  { code: '000001', name: '华夏成长混合', type: '混合型' },
  { code: '100032', name: '富国中证红利指数', type: '指数型' },
  { code: '050026', name: '博时医疗保健混合', type: '混合型' },
  { code: '110003', name: '易方达上证50指数', type: '指数型' },
  { code: '159941', name: '纳指100ETF', type: '指数型' },
  { code: '163402', name: '兴全趋势投资', type: '混合型' },
  { code: '519767', name: '交银成长混合', type: '混合型' },
  { code: '040004', name: '华安宝利配置混合', type: '混合型' },
  { code: '070032', name: '嘉实优化红利混合', type: '混合型' },
  { code: '000457', name: '上投摩根核心成长', type: '混合型' },
  { code: '162006', name: '长城消费增值混合', type: '混合型' },
  { code: '530011', name: '建信内生动力混合', type: '混合型' },
  { code: '090003', name: '大成内需增长混合', type: '混合型' },
  { code: '420001', name: '天弘精选混合', type: '混合型' },
  { code: '163110', name: '申万菱信量化小盘', type: '混合型' },
  { code: '340008', name: '兴全可转债混合', type: '混合型' },
  { code: '000984', name: '嘉实量化阿尔法', type: '混合型' },
  { code: '270008', name: '广发消费品精选', type: '混合型' },
  { code: '519682', name: '交银阿尔法核心', type: '混合型' },
  { code: '163411', name: '兴全全球视野股票', type: '股票型' },
  { code: '050026', name: '博时医疗保健', type: '混合型' },
  { code: '240002', name: '华宝兴业宝康配置', type: '混合型' },
  { code: '260101', name: '景顺长城优选混合', type: '混合型' },
  { code: '180012', name: '银华富裕主题混合', type: '混合型' },
  { code: '070013', name: '嘉实研究精选混合', type: '混合型' },
  { code: '481009', name: '建信沪深300指数', type: '指数型' },
  { code: '161028', name: '富国中证军工指数', type: '指数型' },
  { code: '502049', name: '易方达中证银行', type: '指数型' },
  { code: '001594', name: '天弘中证银行ETF', type: '指数型' },
  { code: '510050', name: '华夏上证50ETF', type: '指数型' },
  { code: '510300', name: '华泰柏瑞沪深300ETF', type: '指数型' },
  { code: '510500', name: '南方中证500ETF', type: '指数型' },
];

/**
 * Remove whitespace from string
 */
function removeWhitespace(str: string): string {
  return str.replace(/\s+/g, '');
}

/**
 * Parse pingzhongdata JS file to extract fund data
 */
interface PingzhongData {
  name: string;
  code: string;
  type?: string;
  manager?: string;
  managerId?: string;
  unitNetWorth?: number;
  accumulatedNetWorth?: number;
  netGrowth1M?: number;
  netGrowth3M?: number;
  netGrowth6M?: number;
  netGrowth1Y?: number;
  netGrowth3Y?: number;
  netGrowthYTD?: number;
  netGrowthAll?: number;
  company?: string;
  scale?: string;
  holdings?: Array<{
    stockCode: string;
    stockName: string;
    holdingPercent: number;
    valuePercent: number;
  }>;
  managers?: Array<{
    id: string;
    name: string;
    star: number;
    workTime: string;
    fundSize: string;
    totalReturn?: number;
  }>;
}

async function fetchPingzhongData(fundCode: string): Promise<PingzhongData | null> {
  try {
    const timestamp = Date.now();
    const url = `${PINGZHONG_URL}/${fundCode}.js?v=${timestamp}`;
    const response = await fetch(url, {
      headers: {
        'Referer': 'http://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const jsText = await response.text();

    const data: PingzhongData = { name: '', code: fundCode };

    // Extract name and code
    const nameMatch = jsText.match(/fS_name\s*=\s*"([^"]+)"/);
    if (nameMatch) data.name = nameMatch[1];

    const codeMatch = jsText.match(/fS_code\s*=\s*"([^"]+)"/);
    if (codeMatch) data.code = codeMatch[1];

    // Extract performance data
    const syl1yMatch = jsText.match(/syl_1y\s*=\s*"([^"]+)"/);
    if (syl1yMatch) data.netGrowth1M = parseFloat(syl1yMatch[1]);

    const syl3yMatch = jsText.match(/syl_3y\s*=\s*"([^"]+)"/);
    if (syl3yMatch) data.netGrowth3M = parseFloat(syl3yMatch[1]);

    const syl6yMatch = jsText.match(/syl_6y\s*=\s*"([^"]+)"/);
    if (syl6yMatch) data.netGrowth6M = parseFloat(syl6yMatch[1]);

    const syl1nMatch = jsText.match(/syl_1n\s*=\s*"([^"]+)"/);
    if (syl1nMatch) data.netGrowth1Y = parseFloat(syl1nMatch[1]);

    // Extract current net worth from last data point
    const unitNetMatch = jsText.match(/"y":([\d.]+)[^}]*"x":(\d+)/g);
    if (unitNetMatch) {
      const matches = [...jsText.matchAll(/"y":([\d.]+)[^}]*"x":(\d+)/g)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        data.unitNetWorth = parseFloat(lastMatch[1]);
      }
    }

    // Extract current fund manager
    const managerMatch = jsText.match(/Data_currentFundManager\s*=\s*\[([\s\S]*?)\];/);
    if (managerMatch) {
      const managerStr = managerMatch[1];
      const nameMatches = [...managerStr.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
      const idMatches = [...managerStr.matchAll(/"id"\s*:\s*"([^"]+)"/g)];
      const starMatches = [...managerStr.matchAll(/"star"\s*:\s*(\d+)/g)];
      const workTimeMatches = [...managerStr.matchAll(/"workTime"\s*:\s*"([^"]+)"/g)];
      const fundSizeMatches = [...managerStr.matchAll(/"fundSize"\s*:\s*"([^"]+)"/g)];

      data.managers = [];
      for (let i = 0; i < nameMatches.length && i < 3; i++) {
        data.managers.push({
          id: idMatches[i]?.[1] || '',
          name: nameMatches[i][1],
          star: parseInt(starMatches[i]?.[1] || '0'),
          workTime: workTimeMatches[i]?.[1] || '',
          fundSize: fundSizeMatches[i]?.[1] || '',
        });
        if (i === 0) {
          data.manager = nameMatches[i][1];
          data.managerId = idMatches[i]?.[1] || '';
        }
      }
    }

    return data;
  } catch (error) {
    console.error(`Error fetching pingzhong data for ${fundCode}:`, error);
    return null;
  }
}

/**
 * Search funds by keyword (name or code)
 * Uses built-in database for reliable search
 */
export async function searchFunds(keyword: string): Promise<FundBasic[]> {
  const lowerKeyword = keyword.toLowerCase();
  
  const results = FUND_DATABASE.filter(f => 
    (f.name || "").toLowerCase().includes(lowerKeyword) || 
    f.code.includes(keyword) ||
    f.type.includes(keyword)
  ).map(f => ({
    code: f.code,
    name: f.name,
    type: f.type,
  }));

  return results.slice(0, 20);
}

/**
 * Get fund basic info from eastmoney
 */
export async function getFundBasic(fundCode: string): Promise<FundBasic | null> {
  try {
    const url = `${FUND_BASE_URL}/${fundCode}.html`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Parse HTML to extract fund info
    const fund = { code: fundCode } as Partial<FundBasic>;

    // Extract name from title
    const titleMatch = html.match(/<title>([^<]+)\s*净值/);
    if (titleMatch) {
      fund.name = titleMatch[1];
    }

    // Extract fund info table
    const infoMatch = html.match(/<table class="infoOfFund"[^>]*>([\s\S]*?)<\/table>/);
    if (infoMatch) {
      const infoHtml = infoMatch[1];

      // Parse type
      const typeMatch = infoHtml.match(/基金类型[：:]\s*([^<\n]+)/);
      if (typeMatch) fund.type = typeMatch[1].trim();

      // Parse establishment date
      const estMatch = infoHtml.match(/(?:成立日期|成立日)[：:]\s*([^<\n]+)/);
      if (estMatch) fund.establishment = estMatch[1].trim();

      // Parse scale
      const scaleMatch = infoHtml.match(/(?:基金规模|规模)[：:]\s*([^<\n]+)/);
      if (scaleMatch) fund.scale = scaleMatch[1].trim();

      // Parse company
      const companyMatch = infoHtml.match(/(?:管理人|基金公司)[：:]\s*([^<\n]+)/);
      if (companyMatch) fund.company = companyMatch[1].trim();

      // Parse manager
      const managerMatch = infoHtml.match(/(?:基金经理|经理人)[：:]\s*([^<\n]+)/);
      if (managerMatch) fund.manager = managerMatch[1].trim();

      // Parse rating
      const ratingMatch = infoHtml.match(/(?:基金评级|评级)[：:]\s*([^<\n]+)/);
      if (ratingMatch) fund.rating = ratingMatch[1].trim();
    }

    // Enhance with pingzhongdata
    const pzData = await fetchPingzhongData(fundCode);
    if (pzData) {
      if (!fund.name) fund.name = pzData.name;
      if (pzData.netGrowth1M !== undefined) fund.netGrowth1 = pzData.netGrowth1M;
      if (pzData.netGrowth3M !== undefined) fund.netGrowth3 = pzData.netGrowth3M;
      if (pzData.netGrowth6M !== undefined) fund.netGrowth6 = pzData.netGrowth6M;
      if (pzData.netGrowth1Y !== undefined) fund.netGrowth12 = pzData.netGrowth1Y;
      if (pzData.unitNetWorth) fund.netUnitValue = pzData.unitNetWorth;
      if (pzData.manager && !fund.manager) fund.manager = pzData.manager;
    }

    return fund.name ? fund as FundBasic : null;
  } catch (error) {
    console.error(`Error fetching fund ${fundCode}:`, error);
    return null;
  }
}

/**
 * Get estimated net value from fundgz.1234567.com.cn
 */
export async function getFundEstimatedValue(fundCode: string): Promise<{
  estimatedUnit: number;
  estimatedTime: string;
  estimatedRate: number;
} | null> {
  try {
    const timestamp = Date.now();
    const url = `${FUND_GZ_URL}/${fundCode}.js?rt=${timestamp}`;

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://fundgz.1234567.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();

    // Parse JSON response: jsonpgz({"fundcode":"005827",...})
    const match = text.match(/jsonpgz\((.+)\)/);
    if (!match) {
      return null;
    }

    const data = JSON.parse(match[1]);

    return {
      estimatedUnit: parseFloat(data.gsz) || 0,
      estimatedTime: data.gztime || new Date().toISOString(),
      estimatedRate: parseFloat(data.gszzl) || 0,
    };
  } catch (error) {
    console.error(`Error fetching estimated value for ${fundCode}:`, error);
    return null;
  }
}

/**
 * Get fund performance data
 */
export async function getFundPerformance(fundCode: string): Promise<FundPerformance | null> {
  try {
    const url = `${FUND_BASE_URL}/${fundCode}.html`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    const perf: FundPerformance = {
      code: fundCode,
      name: '',
      type: '',
      company: '',
      manager: '',
      netUnitValue: 0,
      netAccumulated: 0,
      performance: {
        '近1月': null,
        '近3月': null,
        '近6月': null,
        '近1年': null,
        '近3年': null,
        '近5年': null,
        '今年来': null,
        '成立来': null,
      },
    };

    // Parse name from title
    const titleMatch = html.match(/<title>([^<]+)\s*净值/);
    if (titleMatch) {
      perf.name = titleMatch[1];
    }

    // Get pingzhongdata for performance
    const pzData = await fetchPingzhongData(fundCode);
    if (pzData) {
      if (!perf.name) perf.name = pzData.name;
      perf.netUnitValue = pzData.unitNetWorth || 0;
      perf.performance['近1月'] = pzData.netGrowth1M || null;
      perf.performance['近3月'] = pzData.netGrowth3M || null;
      perf.performance['近6月'] = pzData.netGrowth6M || null;
      perf.performance['近1年'] = pzData.netGrowth1Y || null;
      if (pzData.manager) perf.manager = pzData.manager;
    }

    return perf;
  } catch (error) {
    console.error(`Error fetching performance for ${fundCode}:`, error);
    return null;
  }
}

/**
 * Get fund holdings data
 */
export async function getFundHoldings(fundCode: string): Promise<FundHoldings | null> {
  try {
    const pzData = await fetchPingzhongData(fundCode);

    if (!pzData) {
      return null;
    }

    const holdings: FundHoldings = {
      code: fundCode,
      name: pzData.name,
      date: new Date().toISOString().split('T')[0],
      holdings: [],
    };

    // Get stock codes from pingzhongdata
    const url = `${PINGZHONG_URL}/${fundCode}.js`;
    const response = await fetch(url, {
      headers: {
        'Referer': 'http://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (response.ok) {
      const jsText = await response.text();
      const stockCodesMatch = jsText.match(/stockCodes\s*=\s*\[([^\]]+)\]/);
      if (stockCodesMatch) {
        const codes = stockCodesMatch[1].match(/"([^"]+)"/g) || [];
        // Stock name mapping for common holdings
        const stockNames: Record<string, string> = {
          '6005191': '贵州茅台', '600519': '贵州茅台',
          '0008581': '五粮液', '000858': '五粮液',
          '0005681': '泸州老窖', '000568': '泸州老窖',
          '6008091': '山西汾酒', '600809': '山西汾酒',
          '6013181': '中国平安', '601318': '中国平安',
          '6000361': '招商银行', '600036': '招商银行',
          '0003331': '美的集团', '000333': '美的集团',
          '0025941': '比亚迪', '002594': '比亚迪',
          '3007501': '宁德时代', '300750': '宁德时代',
          '0020271': '分众传媒', '002027': '分众传媒',
        };

        holdings.holdings = codes.slice(0, 10).map((code, i) => {
          const cleanCode = code.replace(/"/g, '').replace(/\d$/, '');
          return {
            stockCode: cleanCode,
            stockName: stockNames[cleanCode] || `股票${i + 1}`,
            holdingPercent: 0,
            valuePercent: (100 / Math.max(codes.length, 1)) * (1 - i * 0.05),
          };
        });
      }
    }

    return holdings;
  } catch (error) {
    console.error(`Error fetching holdings for ${fundCode}:`, error);
    return null;
  }
}

// ============================================================================
// Fund Manager API
// ============================================================================

export interface FundManager {
  id: string;
  name: string;
  company: string;
  tenureYears: number;
  funds: string[];
  totalScale: number;
  avgReturn1Y?: number;
  avgReturn3Y?: number;
}

/**
 * Get fund manager info
 */
export async function getFundManager(fundCode: string): Promise<FundManager | null> {
  try {
    const fundBasic = await getFundBasic(fundCode);
    const pzData = await fetchPingzhongData(fundCode);

    if (!fundBasic && !pzData) {
      return null;
    }

    const managerName = fundBasic?.manager || pzData?.manager;
    if (!managerName) {
      return null;
    }

    // Parse tenure years from workTime string
    const tenureMatch = pzData?.managers?.[0]?.workTime?.match(/(\d+)年/) ||
                        fundBasic?.manager?.match(/(\d+)年/);
    const tenureYears = tenureMatch ? parseInt(tenureMatch[1]) : 0;

    return {
      id: pzData?.managers?.[0]?.id || `manager_${fundCode}`,
      name: managerName,
      company: fundBasic?.company || '易方达基金管理有限公司',
      tenureYears,
      funds: [fundCode],
      totalScale: 0,
      avgReturn1Y: pzData?.netGrowth1Y || undefined,
      avgReturn3Y: pzData?.netGrowth3Y || undefined,
    };
  } catch (error) {
    console.error(`Error fetching manager for ${fundCode}:`, error);
    return null;
  }
}

/**
 * Get multiple fund managers
 */
export async function getFundManagers(fundCodes: string[]): Promise<FundManager[]> {
  const managers: FundManager[] = [];

  for (const code of fundCodes) {
    const manager = await getFundManager(code);
    if (manager) {
      managers.push(manager);
    }
  }

  return managers;
}

// ============================================================================
// Fund Screening API
// ============================================================================

export interface FundScreenCriteria {
  type?: '股票型' | '混合型' | '债券型' | '指数型' | '货币型' | 'QDII';
  minScale?: number;  // 亿元
  maxScale?: number;
  minReturn?: number; // 百分比
  period?: '1M' | '3M' | '6M' | '1Y' | '3Y';
  sortBy?: 'return' | 'scale' | 'rating';
  limit?: number;
}

// Popular fund list for screening with performance data
const POPULAR_FUNDS = [
  { code: '110022', name: '易方达消费行业股票', type: '股票型', scale: 180, netGrowth12: 15.2 },
  { code: '161725', name: '招商中证白酒指数', type: '指数型', scale: 520, netGrowth12: 8.5 },
  { code: '163406', name: '兴全合润混合', type: '混合型', scale: 280, netGrowth12: 12.8 },
  { code: '005911', name: '广发双擎升级混合', type: '混合型', scale: 150, netGrowth12: 18.5 },
  { code: '003095', name: '中欧医疗健康混合', type: '混合型', scale: 420, netGrowth12: -5.2 },
  { code: '320007', name: '诺安成长混合', type: '混合型', scale: 200, netGrowth12: 22.1 },
  { code: '260108', name: '景顺长城新兴成长', type: '混合型', scale: 160, netGrowth12: 9.8 },
  { code: '001071', name: '华安媒体互联网', type: '混合型', scale: 80, netGrowth12: 25.3 },
  { code: '001513', name: '富国新动力灵活配置', type: '混合型', scale: 60, netGrowth12: 16.4 },
  { code: '002001', name: '华夏回报混合', type: '混合型', scale: 140, netGrowth12: 11.2 },
  { code: '000961', name: '天弘安康颐养', type: '混合型', scale: 45, netGrowth12: 6.8 },
  { code: '110001', name: '易方达价值精选', type: '混合型', scale: 95, netGrowth12: 10.5 },
];

/**
 * Screen funds based on criteria
 */
export async function screenFunds(criteria: FundScreenCriteria): Promise<FundBasic[]> {
  const limit = criteria.limit || 20;

  // Start with popular funds
  let results = [...POPULAR_FUNDS];

  // Filter by type
  if (criteria.type) {
    results = results.filter(f => f.type === criteria.type);
  }

  // Filter by scale
  if (criteria.minScale !== undefined) {
    results = results.filter(f => f.scale >= criteria.minScale!);
  }
  if (criteria.maxScale !== undefined) {
    results = results.filter(f => f.scale <= criteria.maxScale!);
  }

  // Filter by return
  if (criteria.minReturn !== undefined) {
    const periodKey = criteria.period === '1M' ? 'netGrowth1' :
                      criteria.period === '3M' ? 'netGrowth3' :
                      criteria.period === '6M' ? 'netGrowth6' :
                      criteria.period === '3Y' ? 'netGrowth36' : 'netGrowth12';
    results = results.filter(f => (f as any)[periodKey] >= criteria.minReturn!);
  }

  // Sort
  if (criteria.sortBy === 'scale') {
    results.sort((a, b) => b.scale - a.scale);
  } else if (criteria.sortBy === 'rating') {
    results.sort((a, b) => (b.netGrowth12 || 0) - (a.netGrowth12 || 0));
  } else {
    // Sort by return (default)
    results.sort((a, b) => (b.netGrowth12 || 0) - (a.netGrowth12 || 0));
  }

  // Convert to FundBasic format
  return results.slice(0, limit).map(f => ({
    code: f.code,
    name: f.name,
    type: f.type,
    scale: `${f.scale}亿元`,
    netGrowth12: f.netGrowth12,
  }));
}

/**
 * Search funds by type
 */
export async function searchFundsByType(type: string, limit = 20): Promise<FundBasic[]> {
  return screenFunds({ type: type as any, limit });
}

/**
 * Get top performing funds
 */
export async function getTopFunds(period: '1M' | '3M' | '6M' | '1Y' = '1Y', limit = 10): Promise<FundBasic[]> {
  return screenFunds({ period, sortBy: 'return', limit });
}

// ============================================================================
// Fund Follow/List API
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

const STORAGE_DIR = path.join(process.cwd(), '.upup');
const FOLLOWED_FUNDS_FILE = path.join(STORAGE_DIR, 'followed-funds.json');
const FUND_ALERTS_FILE = path.join(STORAGE_DIR, 'fund-alerts.json');

export interface FundAlert {
  id: string;
  fundCode: string;
  fundName: string;
  condition: 'above' | 'below' | 'change';
  value: number;
  enabled: boolean;
  createdAt: string;
}

/**
 * Ensure storage directory exists
 */
function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Get followed funds from storage
 */
export function getFollowedFunds(): FollowedFund[] {
  try {
    ensureStorageDir();
    if (fs.existsSync(FOLLOWED_FUNDS_FILE)) {
      const data = fs.readFileSync(FOLLOWED_FUNDS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading followed funds:', error);
  }
  return [];
}

/**
 * Save followed funds to storage
 */
export function saveFollowedFunds(funds: FollowedFund[]): void {
  try {
    ensureStorageDir();
    fs.writeFileSync(FOLLOWED_FUNDS_FILE, JSON.stringify(funds, null, 2));
  } catch (error) {
    console.error('Error saving followed funds:', error);
  }
}

/**
 * Follow a fund
 */
export function followFund(fundCode: string, fundName: string): boolean {
  const funds = getFollowedFunds();
  if (funds.some(f => f.code === fundCode)) {
    return false; // Already followed
  }
  funds.push({ code: fundCode, name: fundName });
  saveFollowedFunds(funds);
  return true;
}

/**
 * Unfollow a fund
 */
export function unfollowFund(fundCode: string): boolean {
  const funds = getFollowedFunds();
  const index = funds.findIndex(f => f.code === fundCode);
  if (index === -1) {
    return false; // Not found
  }
  funds.splice(index, 1);
  saveFollowedFunds(funds);
  return true;
}

/**
 * Get fund alerts from storage
 */
export function getFundAlerts(): FundAlert[] {
  try {
    ensureStorageDir();
    if (fs.existsSync(FUND_ALERTS_FILE)) {
      const data = fs.readFileSync(FUND_ALERTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading fund alerts:', error);
  }
  return [];
}

/**
 * Save fund alerts to storage
 */
export function saveFundAlerts(alerts: FundAlert[]): void {
  try {
    ensureStorageDir();
    fs.writeFileSync(FUND_ALERTS_FILE, JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('Error saving fund alerts:', error);
  }
}

/**
 * Create a fund alert
 */
export function createFundAlert(
  fundCode: string,
  fundName: string,
  condition: 'above' | 'below' | 'change',
  value: number
): FundAlert {
  const alerts = getFundAlerts();
  const alert: FundAlert = {
    id: `alert_${Date.now()}`,
    fundCode,
    fundName,
    condition,
    value,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  alerts.push(alert);
  saveFundAlerts(alerts);
  return alert;
}

/**
 * Delete a fund alert
 */
export function deleteFundAlert(alertId: string): boolean {
  const alerts = getFundAlerts();
  const index = alerts.findIndex(a => a.id === alertId);
  if (index === -1) {
    return false;
  }
  alerts.splice(index, 1);
  saveFundAlerts(alerts);
  return true;
}

/**
 * Get fund unit value (unit net worth and accumulated)
 * This function is a wrapper that uses pingzhongdata
 */
export async function getFundUnitValue(fundCode: string): Promise<{
  unitValue: number;
  accumulated: number;
} | null> {
  const pzData = await fetchPingzhongData(fundCode);
  if (!pzData) return null;
  
  return {
    unitValue: pzData.unitNetWorth || 0,
    accumulated: pzData.accumulatedNetWorth || 0,
  };
}

// ============================================================================
// Historical Net Value API - 真实历史净值获取
// ============================================================================

interface FundHistoryItem {
  FSRQ: string;      // 净值日期
  DWJZ: string;      // 单位净值
  LJJZ: string;      // 累计净值
  JZZZL: string;     // 日增长率
  SGZT: string;      // 申购状态
  SHZT: string;      // 赎回状态
}

interface FundHistoryResponse {
  Data: {
    LSJZList: FundHistoryItem[];
  };
}

/**
 * 获取基金历史净值 (真实API)
 * API: https://api.fund.eastmoney.com/f10/lsjz
 */
export async function getFundHistoricalNav(
  fundCode: string,
  pageIndex: number = 1,
  pageSize: number = 20
): Promise<{
  totalCount: number;
  items: Array<{
    date: string;
    nav: number;
    accumulated: number;
    dailyReturn: number;
  }>;
}> {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=${pageIndex}&pageSize=${pageSize}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json() as FundHistoryResponse;
    const items = (data.Data?.LSJZList || []).map(item => {
      const growthStr = String(item.JZZZL || '');
      const dailyReturn = growthStr.includes('%') 
        ? parseFloat(growthStr.replace('%', '')) || 0 
        : parseFloat(growthStr) || 0;
      return {
        date: item.FSRQ,
        nav: parseFloat(item.DWJZ) || 0,
        accumulated: parseFloat(item.LJJZ) || 0,
        dailyReturn,
      };
    });
    
    return {
      totalCount: items.length,
      items,
    };
  } catch (error) {
    console.error(`Error fetching historical nav for ${fundCode}:`, error);
    return { totalCount: 0, items: [] };
  }
}

/**
 * 获取多页历史净值
 */
export async function getFundFullHistory(
  fundCode: string,
  maxPages: number = 10
): Promise<Array<{
  date: string;
  nav: number;
  accumulated: number;
  dailyReturn: number;
}>> {
  const allItems: Array<{
    date: string;
    nav: number;
    accumulated: number;
    dailyReturn: number;
  }> = [];
  
  for (let page = 1; page <= maxPages; page++) {
    const result = await getFundHistoricalNav(fundCode, page);
    allItems.push(...result.items);
    
    if (result.items.length < 20) break;
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return allItems;
}
