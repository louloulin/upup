/**
 * Pure TypeScript real-time stock data client.
 * Fetches from Tencent qt.gtimg.cn and Sina hq.sinajs.cn
 * No API key required.
 */

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

// ==================== Tencent qt.gtimg.cn ====================

/**
 * Fetch real-time quote from Tencent.
 * Format: sh600519 = Shanghai 600519, sz000001 = Shenzhen 000001, hk00700 = HK 00700
 */
export async function getTencentQuote(symbol: string): Promise<RealtimeQuote> {
  const url = `https://qt.gtimg.cn/q=${symbol}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: 'https://gu.qq.com',
    },
  });

  if (!response.ok) {
    throw new Error(`Tencent API error: HTTP ${response.status}`);
  }

  const text = await response.text();
  return parseTencentData(symbol, text);
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

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: 'https://finance.sina.com.cn',
    },
  });

  if (!response.ok) {
    throw new Error(`Sina API error: HTTP ${response.status}`);
  }

  const text = await response.text();
  return parseSinaData(symbol, text);
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

// ==================== Main Export ====================

/**
 * Get real-time quote, trying Tencent first then Sina.
 * @param symbol In Tencent format: sh600519, sz000001, hk00700
 */
export async function getRealtimeQuote(symbol: string): Promise<RealtimeQuote> {
  try {
    return await getTencentQuote(symbol);
  } catch {
    return getSinaQuote(symbol);
  }
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