/**
 * Pure TypeScript stock screener client for A-share stocks.
 * Scrapes stock data from public sources without API keys.
 * Sources: Eastmoney
 */

export interface StockBasic {
  ts_code: string;
  symbol: string;
  name: string;
  area?: string;
  industry?: string;
  market?: string;
  list_date?: string;
}

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const TIMEOUT_MS = 10000;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==================== Eastmoney Stock List ====================

/**
 * Fetch stock list from Eastmoney by industry.
 */
export async function fetchStocksByIndustry(industry: string): Promise<StockBasic[]> {
  // Eastmoney industry classification API
  const industryCode = getIndustryCode(industry);
  const url = `https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=50&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:${industryCode}&fields=f12,f14,f13`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return parseEastmoneyStocks(json);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Eastmoney stock list fetch failed');
}

/**
 * Fetch stock list from Eastmoney by exchange.
 */
export async function fetchStocksByExchange(exchange: string): Promise<StockBasic[]> {
  // Map exchange to Eastmoney market code
  let fs = '';
  if (exchange === 'SH' || exchange === 'SHANGHAI') {
    fs = 'm:1+t:2'; // Shanghai A shares
  } else if (exchange === 'SZ' || exchange === 'SHENZHEN') {
    fs = 'm:0+t:6'; // Shenzhen A shares
  } else if (exchange === 'BJ') {
    fs = 'm:0+t:80'; // Beijing
  } else {
    fs = 'm:0+t:6,m:1+t:2'; // All A shares
  }

  const url = `https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${fs}&fields=f12,f14,f13,f17`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return parseEastmoneyStocks(json);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Eastmoney stock list fetch failed');
}

/**
 * Map industry name to Eastmoney industry code.
 */
function getIndustryCode(industry: string): string {
  const industryMap: Record<string, string> = {
    // 证监会行业分类
    '银行': '7',
    '证券': '8',
    '保险': '9',
    '白酒': '4',
    '房地产': '11',
    '汽车整车': '3',
    '电力设备': '2',
    '医药生物': '1',
    '电子': '28',
    '计算机': '27',
    '通信': '26',
    '传媒': '24',
    '军工': '18',
    '新能源': '15',
    '锂电池': '16',
    '光伏': '17',
    '半导体': '29',
    // 常见行业别名
    '新能源车': '3',
    '电动车': '3',
    '芯片': '29',
    'AI': '27',
    '人工智能': '27',
    '互联网': '24',
  };

  // Search in map keys (partial match)
  for (const [key, code] of Object.entries(industryMap)) {
    if (industry.includes(key) || key.includes(industry)) {
      return code;
    }
  }

  // Default to "全部" (all) if not found
  return '0';
}

interface EastmoneyStockResponse {
  data: {
    diff: {
      f12: string;  // stock code
      f14: string;  // stock name
      f13: string;  // exchange code (sh/sz)
      f17: number;  // industry code
    }[];
  };
}

function parseEastmoneyStocks(json: EastmoneyStockResponse): StockBasic[] {
  if (!json?.data?.diff) return [];

  return json.data.diff.map((stock) => ({
    ts_code: `${stock.f12}.${stock.f13?.toUpperCase() || 'SH'}`,
    symbol: stock.f12,
    name: stock.f14,
    industry: String(stock.f17 || ''),
    market: stock.f13?.toUpperCase() === 'SH' ? '主板' : '主板',
  }));
}

// ==================== Main Export ====================

/**
 * Screen stocks with fallback to scraping when Tushare unavailable.
 */
export async function screenStocks(
  sector?: string,
  exchange?: string,
  limit: number = 50
): Promise<{ stocks: StockBasic[]; source: string }> {
  try {
    // Try Eastmoney scraping first
    let stocks: StockBasic[] = [];

    if (sector) {
      stocks = await fetchStocksByIndustry(sector);
    } else if (exchange) {
      stocks = await fetchStocksByExchange(exchange);
    } else {
      stocks = await fetchStocksByExchange('SH,SZ');
    }

    if (stocks.length > 0) {
      return {
        stocks: stocks.slice(0, limit),
        source: 'eastmoney_screener',
      };
    }
  } catch (e) {
    console.warn('Eastmoney screener failed:', e instanceof Error ? e.message : String(e));
  }

  return {
    stocks: [],
    source: 'none',
  };
}

