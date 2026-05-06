/**
 * Pure TypeScript Tushare Pro API client - no Python subprocess.
 * Direct HTTP calls to api.tushare.pro
 * Features: retry with exponential backoff, timeout handling
 */

export interface TushareResponse {
  code: number;
  msg: string;
  data: {
    fields: string[];
    items: string[][];
  } | null;
}

export interface TushareClientConfig {
  token?: string;
  maxRetries?: number;
  timeout?: number;
}

// Retry configuration
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const RETRY_DELAY_MS = 1000; // Base delay for exponential backoff

export class TushareClient {
  private token: string;
  private readonly baseUrl = 'http://api.tushare.pro';
  private maxRetries: number;
  private timeout: number;

  constructor(config: TushareClientConfig = {}) {
    this.token = config.token || process.env.TUSHARE_TOKEN || '';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

  private async call<T = unknown>(
    apiName: string,
    params: Record<string, unknown> = {},
    fields?: string[]
  ): Promise<T> {
    if (!this.token) {
      throw new Error('TUSHARE_TOKEN not set. Please set TUSHARE_TOKEN in your .env file.');
    }

    const body = {
      api_name: apiName,
      token: this.token,
      params,
      fields: fields?.join(',') || undefined,
    };

    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Tushare API error: HTTP ${response.status}`);
        }

        const result: TushareResponse = await response.json();

        if (result.code !== 0) {
          throw new Error(`Tushare API error [${result.code}]: ${result.msg}`);
        }

        return result.data as T;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        // Don't retry on certain errors
        if (
          lastError.message.includes('TUSHARE_TOKEN not set') ||
          lastError.message.includes('API error [') ||
          attempt >= this.maxRetries
        ) {
          throw lastError;
        }

        // Exponential backoff: 1s, 2s, 4s...
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Tushare API attempt ${attempt + 1} failed, retrying in ${delay}ms...`, lastError.message);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Tushare API call failed after retries');
  }

  /** Parse Tushare response into array of objects keyed by field names */
  parseResult<T extends Record<string, unknown>>(data: TushareResponse['data']): T[] {
    if (!data || !data.fields || !data.items) return [];
    return data.items.map((item) => {
      const obj: Record<string, unknown> = {};
      data.fields.forEach((field, i) => {
        obj[field] = item[i];
      });
      return obj as T;
    });
  }

  // ==================== Stock Price ====================

  /** Daily K-line data */
  async daily(params: {
    ts_code: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('daily', params);
    return this.parseResult(data);
  }

  /** Weekly K-line data */
  async weekly(params: {
    ts_code: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('weekly', params);
    return this.parseResult(data);
  }

  /** Monthly K-line data */
  async monthly(params: {
    ts_code: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('monthly', params);
    return this.parseResult(data);
  }

  /** Real-time quote (today's snapshot) */
  async realtimeQuote(ts_code: string): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('daily', {
      ts_code,
      trade_date: formatDate(new Date()),
    });
    return this.parseResult(data);
  }

  // ==================== Financials ====================

  /** Income statement (利润表) */
  async income(params: {
    ts_code: string;
    ann_date?: string;
    start_date?: string;
    end_date?: string;
    period?: string;
    report_type?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('income', params);
    return this.parseResult(data);
  }

  /** Balance sheet (资产负债表) */
  async balancesheet(params: {
    ts_code: string;
    ann_date?: string;
    start_date?: string;
    end_date?: string;
    period?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('balancesheet', params);
    return this.parseResult(data);
  }

  /** Cash flow statement (现金流量表) */
  async cashflow(params: {
    ts_code: string;
    ann_date?: string;
    start_date?: string;
    end_date?: string;
    period?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('cashflow', params);
    return this.parseResult(data);
  }

  // ==================== Fundamentals ====================

  /** Stock basic info */
  async stockBasic(params: {
    ts_code?: string;
    name?: string;
    market?: string;
    list_status?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('stock_basic', params);
    return this.parseResult(data);
  }

  /** Company overview */
  async stockCompany(ts_code: string): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('stock_company', { ts_code });
    return this.parseResult(data);
  }

  // ==================== News & Announcements ====================

  /** Company announcements */
  async announcement(params: {
    ts_code?: string;
    ann_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('announcement', params);
    return this.parseResult(data);
  }

  /** News from major sources (stock hint) */
  async news(source: string = 'sina'): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('news', { source });
    return this.parseResult(data);
  }

  // ==================== Market Structure ====================

  /** Top list (龙虎榜) */
  async topList(params: {
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('top_list', params);
    return this.parseResult(data);
  }

  /** HSGT top 10 (北向资金十大成交) */
  async hsgtTop10(params: {
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('hsgt_top10', params);
    return this.parseResult(data);
  }

  /** Money flow (资金流向) */
  async moneyFlow(params: {
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('moneyflow', params);
    return this.parseResult(data);
  }

  /** Margin detail (融资融券) */
  async marginDetail(params: {
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    ts_code?: string;
  }): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('margin_detail', params);
    return this.parseResult(data);
  }

  // ==================== Screening ====================

  /** Concept detail (概念板块成分股) */
  async conceptDetail(concept_code: string): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('concept_detail', {
      id: concept_code,
    });
    return this.parseResult(data);
  }

  /** Index weight (index_weight) */
  async indexWeight(index_code: string): Promise<Record<string, unknown>[]> {
    const data = await this.call<{ fields: string[]; items: string[][] }>('index_weight', {
      index_code,
    });
    return this.parseResult(data);
  }
}

// ==================== Helper Functions ====================

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function getToday(): string {
  return formatDate(new Date());
}

// ==================== Legacy API (for existing code compatibility) ====================

let _client: TushareClient | null = null;

export function getTushareClient(): TushareClient {
  if (!_client) {
    _client = new TushareClient({ token: process.env.TUSHARE_TOKEN });
  }
  return _client;
}

export async function fetchAStockPrice(code: string): Promise<unknown> {
  const client = getTushareClient();
  const today = getToday();
  try {
    const data = await client.daily({ ts_code: code, trade_date: today });
    if (data.length > 0) return data;
    // If today's data not available, get recent data
    const recent = await client.daily({ ts_code: code, end_date: today });
    return recent.length > 0 ? recent : [];
  } catch (e) {
    throw e;
  }
}

export async function fetchAStockFinancials(code: string): Promise<unknown> {
  const client = getTushareClient();
  const [income, balance, cashflow] = await Promise.all([
    client.income({ ts_code: code }),
    client.balancesheet({ ts_code: code }),
    client.cashflow({ ts_code: code }),
  ]);
  return { income, balance, cashflow };
}

export async function fetchAStockInfo(code: string): Promise<unknown> {
  const client = getTushareClient();
  return client.stockBasic({ ts_code: code });
}