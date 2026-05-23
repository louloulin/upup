/**
 * Type declarations for screen-stocks.ts
 * Fixes TypeScript errors for pct_chg, screenStocks, and type narrowing
 */

declare module '../astock/screener-client' {
  export interface ScreenInput {
    sector?: string;
    exchange?: string;
    limit?: number;
  }

  export function screenStocks(
    sector?: string,
    exchange?: string,
    limit?: number
  ): Promise<{ stocks: any[]; source: string }>;
}

// Extend Record type for pct_chg
declare global {
  interface PriceRecord {
    ts_code: string;
    name: string;
    industry?: string;
    close: string | number;
    pct_chg: string | number;
  }
}

export {};
