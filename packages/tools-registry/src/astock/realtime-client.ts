/**
 * Pure TypeScript real-time stock data client.
 * Fetches from multiple sources with fallback: Tencent → Sina → Eastmoney (scraping)
 * No API key required.
 * Features: retry with backoff, timeout handling, multi-source fallback
 */

// ==================== Types ====================

export interface RealtimeQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;      // 成交量 (手)
  amount: number;      // 成交额 (元)
  amplitude: number;   // 振幅 %
  pe: number;         // 市盈率
  priceToBook: number; // 市净率
  marketCap: number;   // 总市值
  circulatingCap: number; // 流通市值
  timestamp: string;
  source: string;
}

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const TIMEOUT_MS = 5000;

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

// ==================== Tencent qt.gtimg.cn ====================

/**
 * Fetch real-time quote from Tencent.
 * Format: sh600519 = Shanghai 600519, sz000001 = Shenzhen 000001, hk00700 = HK 00700
 */
export async function getTencentQuote(symbol: string): Promise<RealtimeQuote> {
  const url = `https://qt.gtimg.cn/q=${symbol}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Referer: 'https://gu.qq.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return parseTencentData(symbol, text);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Tencent fetch failed');
}

function parseTencentData(symbol: string, text: string): RealtimeQuote {
  // Format: v_sz300750="...";"300750","name","price","change","changePercent",...
  const match = text.match(/="([^"]+)"/);
  if (!match) {
    throw new Error(`Failed to parse Tencent data for ${symbol}: ${text}`);
  }

  const parts = match[1].split('~');
  if (parts.length < 45) {
    throw new Error(`Tencent data format unexpected for ${symbol}`);
  }

  // Tencent field mapping (index):
  // 0: stock code, 1: stock name, 3: current price, 4: yesterday close
  // 5: open, 6: volume (hand), 7: external volume
  // 31: high, 32: low, 33: price (latest), 36: amplitude %
  // 37: market cap (万), 38: circulating cap (万)
  // 39: pe, 46: price to book ratio

  const code = parts[0] || symbol;
  const name = parts[1] || '';
  const currentPrice = parseFloat(parts[3]) || 0;
  const yesterdayClose = parseFloat(parts[4]) || 0;
  const open = parseFloat(parts[5]) || 0;
  const volume = parseFloat(parts[6]) || 0;
  const high = parseFloat(parts[31]) || 0;
  const low = parseFloat(parts[32]) || 0;
  const amount = parseFloat(parts[37]) || 0; // Actually amount in 10k
  const marketCap = parseFloat(parts[38]) || 0; // Circulating cap in 10k
  const amplitude = parseFloat(parts[43]) || 0; // Updated: 43 = amplitude
  const pe = parseFloat(parts[39]) || 0;
  const priceToBook = parseFloat(parts[46]) || 0;

  const change = currentPrice - yesterdayClose;
  const changePercent = yesterdayClose !== 0 ? (change / yesterdayClose) * 100 : 0;

  return {
    code,
    name,
    price: currentPrice,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open,
    high,
    low,
    volume,
    amount: amount * 10000,
    amplitude,
    pe,
    priceToBook,
    marketCap: marketCap * 10000,
    circulatingCap: amount * 10000,
    timestamp: new Date().toISOString(),
    source: 'tencent',
  };
}

// ==================== Sina hq.sinajs.cn ====================

/**
 * Fetch real-time quote from Sina.
 * Format: sh600519, sz000001, hk00700
 */
export async function getSinaQuote(symbol: string): Promise<RealtimeQuote> {
  const url = `https://hq.sinajs.cn/list=${symbol}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Referer: 'https://finance.sina.com.cn',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return parseSinaData(symbol, text);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Sina fetch failed');
}

function parseSinaData(symbol: string, text: string): RealtimeQuote {
  // Format: var hq_str_sh600519="name,open,prevClose,price,high,low,buy,sell,volume,amount,bid1vol,bid1,...updatetime";
  const match = text.match(/="([^"]+)"/);
  if (!match) {
    throw new Error(`Failed to parse Sina data for ${symbol}: ${text}`);
  }

  const parts = match[1].split(',');
  if (parts.length < 32) {
    throw new Error(`Sina data format unexpected for ${symbol}`);
  }

  // Sina field mapping:
  // 0: name, 1: open, 2: prev close, 3: price, 4: high, 5: low
  // 6: buy price, 7: sell price, 8: volume (hand), 9: amount (元)
  // 32: pe, 33: price to book, ...

  const name = parts[0] || '';
  const open = parseFloat(parts[1]) || 0;
  const yesterdayClose = parseFloat(parts[2]) || 0;
  const price = parseFloat(parts[3]) || 0;
  const high = parseFloat(parts[4]) || 0;
  const low = parseFloat(parts[5]) || 0;
  const volume = parseFloat(parts[8]) || 0;
  const amount = parseFloat(parts[9]) || 0;

  const change = price - yesterdayClose;
  const changePercent = yesterdayClose !== 0 ? (change / yesterdayClose) * 100 : 0;

  return {
    code: symbol,
    name,
    price,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open,
    high,
    low,
    volume,
    amount,
    amplitude: 0,
    pe: 0,
    priceToBook: 0,
    marketCap: 0,
    circulatingCap: 0,
    timestamp: new Date().toISOString(),
    source: 'sina',
  };
}

// ==================== Eastmoney push2.eastmoney.com (Scraping) ====================

/**
 * Fetch real-time quote from Eastmoney (东方财富).
 * API: https://push2.eastmoney.com/api/qt/stock/get
 *
 * Field mapping (Eastmoney uses different indices):
 * f43: current price (in cents)
 * f44: high price (in cents)
 * f45: low price (in cents)
 * f46: open price (in cents)
 * f47: yesterday close (NOT previous volume - need correct field)
 * f48: change amount (in cents)
 * f49: change percent (already %)
 * f50: volume (手)
 * f57: stock code
 * f58: stock name
 * f60: amount (元)
 * f107: amplitude %
 * f116: total market cap
 * f117: circulating market cap
 * f152: turnover rate %
 */
export async function getEastmoneyQuote(symbol: string): Promise<RealtimeQuote> {
  const eastmoneyCode = toEastmoneyCode(symbol);
  // Request fields: f43=price, f44=high, f45=low, f46=open, f47=yesterdayClose,
  // f48=change, f49=changePercent, f50=volume, f57=code, f58=name,
  // f60=amount, f107=amplitude, f116=marketCap, f117=circulatingCap, f152=turnoverRate
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${eastmoneyCode}&fields=f43,f44,f45,f46,f47,f48,f49,f50,f57,f58,f60,f107,f116,f117,f152`;

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
      return parseEastmoneyData(symbol, json);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Eastmoney fetch failed');
}

export function toEastmoneyCode(symbol: string): string {
  // Tencent format to Eastmoney: sh600519 -> 1.600519, sz002594 -> 0.002594, hk00700 -> 116.00700
  const s = symbol.toLowerCase();
  if (s.startsWith('sh')) return `1.${s.slice(2)}`;
  if (s.startsWith('sz')) return `0.${s.slice(2)}`;
  if (s.startsWith('hk')) return `116.${s.slice(2)}`;
  if (s.startsWith('bj')) return `8.${s.slice(2)}`;
  // Default: assume Shanghai
  return `1.${symbol}`;
}

interface EastmoneyResponse {
  data: {
    f43: number;  // current price (in 0.01 yuan)
    f44: number;  // high price (in 0.01 yuan)
    f45: number;  // low price (in 0.01 yuan)
    f46: number;  // open price (in 0.01 yuan)
    f47: number;  // yesterday close (in 0.01 yuan) - NOT volume!
    f48: number;  // change amount (in 0.01 yuan)
    f49: number;  // change percent (already %)
    f50: number;  // volume (hand)
    f57: string;  // stock code
    f58: string;  // stock name
    f60: number;  // amount (yuan)
    f107: number; // amplitude %
    f116: number; // total market cap
    f117: number; // circulating market cap
    f152: number; // turnover rate %
  };
}

function parseEastmoneyData(symbol: string, json: EastmoneyResponse): RealtimeQuote {
  const d = json.data;
  if (!d) {
    throw new Error(`Eastmoney no data for ${symbol}`);
  }

  // All prices are in 0.01 yuan (cents), divide by 100 to get yuan
  const price = d.f43 / 100;
  const high = d.f44 / 100;
  const low = d.f45 / 100;
  const open = d.f46 / 100;
  const yesterdayClose = d.f47 / 100; // f47 is yesterday close price
  const change = d.f48 / 100; // f48 is change amount
  const changePercent = d.f49; // f49 is already in percent

  const volume = d.f50;  // volume in hand
  const amount = d.f60;  // amount in yuan
  const marketCap = d.f116;  // total market cap in yuan
  const circulatingCap = d.f117;  // circulating market cap in yuan

  return {
    code: d.f57 || symbol,
    name: d.f58 || '',
    price,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open,
    high,
    low,
    volume,
    amount,
    amplitude: d.f107 || d.f152 || 0,
    pe: 0,
    priceToBook: 0,
    marketCap,
    circulatingCap,
    timestamp: new Date().toISOString(),
    source: 'eastmoney',
  };
}

// ==================== Main Export ====================

/**
 * Get real-time quote with multi-source fallback.
 * Tries: Tencent → Sina → Eastmoney
 * @param symbol In Tencent format: sh600519, sz000001, hk00700
 */
export async function getRealtimeQuote(symbol: string): Promise<RealtimeQuote> {
  const sources: Array<{name: string; fn: () => Promise<RealtimeQuote>}> = [
    { name: 'Tencent', fn: () => getTencentQuote(symbol) },
    { name: 'Sina', fn: () => getSinaQuote(symbol) },
    { name: 'Eastmoney', fn: () => getEastmoneyQuote(symbol) },
  ];

  const errors: string[] = [];

  for (const source of sources) {
    try {
      return await source.fn();
    } catch (e) {
      errors.push(`${source.name}: ${e instanceof Error ? e.message : String(e)}`);
      console.warn(`Realtime source ${source.name} failed, trying next...`);
    }
  }

  throw new Error(`All realtime sources failed. Errors: ${errors.join('; ')}`);
}

/**
 * Convert Tushare format to Tencent format.
 * 600519.SH -> sh600519
 * 000001.SZ -> sz000001
 * 00700.HK -> hk00700
 */
export function toTencentSymbol(tushareCode: string): string {
  const [code, market] = tushareCode.split('.');
  if (market === 'SH' || market === 'SHANGHAI') return `sh${code}`;
  if (market === 'SZ' || market === 'SHENZHEN') return `sz${code}`;
  if (market === 'HK' || market === 'HONG KONG') return `hk${code}`;
  if (market === 'BJ') return `bj${code}`;
  // Assume A-share
  if (code.startsWith('6')) return `sh${code}`;
  return `sz${code}`;
}

/**
 * Convert Tushare format to Sina format.
 * 600519.SH -> sh600519
 * 000001.SZ -> sz000001
 */
export function toSinaSymbol(tushareCode: string): string {
  const [code, market] = tushareCode.split('.');
  if (market === 'SH') return `sh${code}`;
  if (market === 'SZ') return `sz${code}`;
  if (market === 'HK') return `hk${code}`;
  if (market === 'BJ') return `bj${code}`;
  if (code.startsWith('6')) return `sh${code}`;
  return `sz${code}`;
}
