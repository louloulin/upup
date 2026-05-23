/**
 * Fund API - Eastmoney Fund Data Scraper
 * Data source: 天天基金 (fund.eastmoney.com)
 */

import type { FundBasic, FollowedFund, FundPerformance } from './types';

const FUND_BASE_URL = 'http://fund.eastmoney.com';
const FUND_GZ_URL = 'https://fundgz.1234567.com.cn/js';
const SINA_HQ_URL = 'http://hq.sinajs.cn/rn';

interface EastmoneyResponse {
  code: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
}

/**
 * Remove whitespace from string
 */
function removeWhitespace(str: string): string {
  return str.replace(/\s+/g, '');
}

/**
 * Search funds by keyword (name or code)
 * Uses eastmoney allfund.html for search
 */
export async function searchFunds(keyword: string): Promise<FundBasic[]> {
  try {
    const response = await fetch(`https://fund.eastmoney.com/allfund.html`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      return [];
    }
    
    const html = await response.text();
    
    // Simple regex to find matching funds
    const fundRegex = /(\d{6})[=,＝]([^<,，\n]+?)(?=<|,|，|\n|$)/g;
    const matches = [...html.matchAll(fundRegex)];
    
    const results: FundBasic[] = [];
    for (const match of matches) {
      const code = match[1];
      const name = removeWhitespace(match[2]);
      
      if (name.includes(keyword) || code.includes(keyword)) {
        results.push({ code, name });
      }
    }
    
    return results.slice(0, 50); // Limit results
  } catch (error) {
    console.error('Fund search error:', error);
    return [];
  }
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
    
    // Extract net value performance
    const perfMatch = html.match(/<dl class="dataOfFund">([\s\S]*?)<\/dl>/);
    if (perfMatch) {
      const perfHtml = perfMatch[1];
      
      const extractGrowth = (label: string): number | undefined => {
        const match = perfHtml.match(new RegExp(`${label}[^0-9-]*([-+]?[0-9.]+)`));
        return match ? parseFloat(match[1]) : undefined;
      };
      
      fund.netGrowth1 = extractGrowth('近1月');
      fund.netGrowth3 = extractGrowth('近3月');
      fund.netGrowth6 = extractGrowth('近6月');
      fund.netGrowth12 = extractGrowth('近1年');
      fund.netGrowth36 = extractGrowth('近3年');
      fund.netGrowth60 = extractGrowth('近5年');
      fund.netGrowthYTD = extractGrowth('今年来');
      fund.netGrowthAll = extractGrowth('成立来');
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
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const text = await response.text();
    
    // Parse jsonpgz callback
    const jsonMatch = text.match(/jsonpgz\((.+)\)/);
    if (!jsonMatch) return null;
    
    const data: EastmoneyResponse = JSON.parse(jsonMatch[1]);
    
    return {
      estimatedUnit: parseFloat(data.gsz),
      estimatedTime: data.gztime,
      estimatedRate: parseFloat(data.gszzl),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get real unit net value from Sina Finance
 */
export async function getFundUnitValue(fundCode: string): Promise<{
  unitValue: number;
  valueDate: string;
  accumulated: number;
} | null> {
  try {
    const timestamp = Date.now();
    const url = `${SINA_HQ_URL}=${timestamp}&list=f_${fundCode}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const text = await response.text();
    
    // Parse hq_str_f_XXXXXX="name,price,..."
    const match = text.match(/f_"(\d+)"="([^"]+)"/);
    if (!match) return null;
    
    const parts = match[2].split(',');
    
    return {
      unitValue: parseFloat(parts[1]),
      valueDate: parts[4] || '',
      accumulated: parseFloat(parts[3]) || 0,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get complete fund performance data
 */
export async function getFundPerformance(fundCode: string): Promise<FundPerformance | null> {
  const basic = await getFundBasic(fundCode);
  if (!basic || !basic.name) return null;
  
  const fundBasic = basic as FundBasic;
  return {
    code: fundBasic.code,
    name: fundBasic.name,
    type: basic.type || '',
    company: basic.company || '',
    manager: basic.manager || '',
    netUnitValue: basic.netUnitValue || 0,
    netAccumulated: basic.netAccumulated || 0,
    performance: {
      '近1月': basic.netGrowth1 || null,
      '近3月': basic.netGrowth3 || null,
      '近6月': basic.netGrowth6 || null,
      '近1年': basic.netGrowth12 || null,
      '近3年': basic.netGrowth36 || null,
      '近5年': basic.netGrowth60 || null,
      '今年来': basic.netGrowthYTD || null,
      '成立来': basic.netGrowthAll || null,
    },
  };
}

/**
 * Get fund holdings (top 10 stocks)
 */
export async function getFundHoldings(fundCode: string): Promise<{
  date: string;
  holdings: Array<{ code: string; name: string; percent: number }>;
} | null> {
  try {
    const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10&year=&month=&rt=${Date.now()}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': `https://fundf10.eastmoney.com/`,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const text = await response.text();
    
    // Parse holdings data
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    
    const holdings: Array<{ code: string; name: string; percent: number }> = [];
    const stockRegex = /(\d{6})[^"]*"([^"]+)"[^>]*>([\d.]+)%/g;
    
    let match;
    while ((match = stockRegex.exec(text)) !== null && holdings.length < 10) {
      holdings.push({
        code: match[1],
        name: match[2],
        percent: parseFloat(match[3]),
      });
    }
    
    return { date, holdings };
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Fund Manager API - Added in Plan33 Phase 3
// ============================================================================

export interface FundManager {
  id: string;
  name: string;
  company: string;
  tenureYears: number;
  funds: string[];
  totalScale: number;
  rating?: string;
  avgReturn1Y?: number;
  avgReturn3Y?: number;
  avgReturn5Y?: number;
  awards?: string[];
}

/**
 * Get fund manager info from eastmoney
 */
export async function getFundManager(fundCode: string): Promise<FundManager | null> {
  try {
    // First get fund basic info to find manager name
    const fundBasic = await getFundBasic(fundCode);
    if (!fundBasic) {
      return null;
    }

    const managerName = fundBasic.manager;
    if (!managerName) {
      return null;
    }

    // Search for manager info on eastmoney
    const searchUrl = `https://search-api.eastmoney.com/api/search/v3?appId=&client=web&keyword=${encodeURIComponent(managerName)}&type=&pageIndex=1&pageSize=5&fields=&callback=`;
    
    // For now, return basic manager info from fund detail
    // Full manager page requires special parsing
    return {
      id: `manager_${fundCode}`,
      name: managerName,
      company: fundBasic.company || '未知',
      tenureYears: 0, // Would need historical data
      funds: [fundCode],
      totalScale: 0, // Would need aggregation
      avgReturn1Y: fundBasic.netGrowth12 || undefined,
      avgReturn3Y: fundBasic.netGrowth36 || undefined,
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
