/**
 * Pure TypeScript news scraping client for A-share stocks.
 * Fetches news from multiple sources without API keys.
 * Sources: Eastmoney, Sina Finance, NetEase (163)
 */

export interface NewsItem {
  title: string;
  content: string;
  url?: string;
  datetime: string;
  source: string;
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

// ==================== Eastmoney News ====================

/**
 * Fetch stock news from Eastmoney (东方财富).
 * URL: https://quote.eastmoney.com/company news
 */
export async function fetchEastmoneyNews(stockCode: string): Promise<NewsItem[]> {
  // Extract numeric code from Tushare format: 600519.SH -> 600519
  const code = stockCode.split('.')[0];
  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=10&page_index=1&ann_type=SHA%2CSZA&client_source=web&stock_list=${code}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://www.eastmoney.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return parseEastmoneyNews(json, code);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Eastmoney news fetch failed');
}

function parseEastmoneyNews(json: any, code: string): NewsItem[] {
  if (!json?.data?.list) return [];

  return json.data.list.map((item: any) => ({
    title: item.title || item.notice_title || '',
    content: item.summary || item.content || '',
    url: `https://www.eastmoney.com` + (item.art_url || ''),
    datetime: item.publish_time ? new Date(item.publish_time).toISOString() : '',
    source: 'eastmoney',
  }));
}

// ==================== Sina Finance News ====================

/**
 * Fetch stock news from Sina Finance.
 */
export async function fetchSinaNews(keyword: string): Promise<NewsItem[]> {
  // Sina finance news API
  const url = `https://vip.stock.finance.sina.com.cn/q/go.php/vFinanceSearch/kind/search/index.phtml?symbol=${encodeURIComponent(keyword)}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://finance.sina.com.cn',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return parseSinaNews(text);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('Sina news fetch failed');
}

function parseSinaNews(html: string): NewsItem[] {
  // Parse HTML table for news items
  const newsItems: NewsItem[] = [];
  const regex = /<tr[^>]*>[\s\S]*?<td[^>]*><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<\/tr>/g;
  let match;

  while ((match = regex.exec(html)) !== null && newsItems.length < 20) {
    newsItems.push({
      title: match[2].trim(),
      content: '',
      url: match[1],
      datetime: match[3].trim(),
      source: 'sina',
    });
  }

  return newsItems;
}

// ==================== NetEase (163) News ====================

/**
 * Fetch stock news from NetEase 163 Finance.
 */
export async function fetch163News(keyword: string): Promise<NewsItem[]> {
  const url = `https://money.163.com/special/00251U62/news/data_for_search.js?callback=data_for_search&keyword=${encodeURIComponent(keyword)}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://money.163.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return parse163News(text);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('163 news fetch failed');
}

function parse163News(text: string): NewsItem[] {
  // Parse JSONP response: data_for_search({...})
  const jsonText = text.replace(/^data_for_search\s*\(\s*/, '').replace(/\s*\)\s*$/, '');

  try {
    const data = JSON.parse(jsonText);
    if (!data?.list) return [];

    return data.list.map((item: any) => ({
      title: item.title || '',
      content: item.desc || '',
      url: item.url || '',
      datetime: item.time || '',
      source: '163',
    }));
  } catch {
    return [];
  }
}

// ==================== Main Export ====================

/**
 * Fetch news for a stock with multi-source fallback.
 * @param stockCode Tushare format (e.g., 600519.SH) or company name
 */
export async function fetchStockNews(stockCode: string): Promise<NewsItem[]> {
  // Extract company name or code
  const code = stockCode.split('.')[0];

  const sources: Array<{name: string; fn: () => Promise<NewsItem[]>}> = [
    { name: 'Eastmoney', fn: () => fetchEastmoneyNews(stockCode) },
    { name: '163', fn: () => fetch163News(code) },
  ];

  for (const source of sources) {
    try {
      const news = await source.fn();
      if (news.length > 0) {
        console.log(`News fetched from ${source.name}`);
        return news;
      }
    } catch (e) {
      console.warn(`News source ${source.name} failed:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Return empty array if all sources fail
  return [];
}

/**
 * Fetch market news (general news, not stock-specific).
 */
export async function fetchMarketNews(limit: number = 20): Promise<NewsItem[]> {
  // Use Eastmoney news API - get latest market news
  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=${limit}&page_index=1&ann_type=SHA%2CSZA&client_source=web`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://www.eastmoney.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return parseMarketNews(json);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }

  return [];
}

function parseMarketNews(json: any): NewsItem[] {
  if (!json?.data?.list) return [];

  return json.data.list.map((item: any) => ({
    title: item.title || item.notice_title || '',
    content: item.summary || item.desc || '',
    url: item.art_url || '',
    datetime: item.publish_time ? new Date(item.publish_time).toISOString() : '',
    source: 'eastmoney',
  }));
}
