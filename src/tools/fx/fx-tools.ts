/**
 * FX Currency Conversion Tools
 *
 * Simple currency conversion for investment analysis:
 * - USD/CNY/HKD/KRW/JPY/EUR/GBP
 * - Real-time rates from free API (fallback to cached rates)
 * - Investment-specific conversions
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';

// Standard exchange rates (USD base, approximate as of 2024)
// These serve as fallback when API is unavailable
const FALLBACK_RATES: Record<string, number> = {
  CNY: 7.24,
  HKD: 7.82,
  JPY: 149.5,
  EUR: 0.92,
  GBP: 0.79,
  KRW: 1320,
  SGD: 1.34,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.88,
};

// Currency metadata
const CURRENCY_INFO: Record<string, { name: string; flag: string; type: 'fiat' | 'crypto' }> = {
  USD: { name: 'US Dollar', flag: '🇺🇸', type: 'fiat' },
  CNY: { name: 'Chinese Yuan', flag: '🇨🇳', type: 'fiat' },
  HKD: { name: 'Hong Kong Dollar', flag: '🇭🇰', type: 'fiat' },
  JPY: { name: 'Japanese Yen', flag: '🇯🇵', type: 'fiat' },
  EUR: { name: 'Euro', flag: '🇪🇺', type: 'fiat' },
  GBP: { name: 'British Pound', flag: '🇬🇧', type: 'fiat' },
  KRW: { name: 'Korean Won', flag: '🇰🇷', type: 'fiat' },
  SGD: { name: 'Singapore Dollar', flag: '🇸🇬', type: 'fiat' },
  AUD: { name: 'Australian Dollar', flag: '🇦🇺', type: 'fiat' },
  CAD: { name: 'Canadian Dollar', flag: '🇨🇦', type: 'fiat' },
  CHF: { name: 'Swiss Franc', flag: '🇨🇭', type: 'fiat' },
};

// Cached rate (updated on first API fetch)
let cachedRates: Record<string, number> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchExchangeRates(): Promise<Record<string, number> | null> {
  // Use frankfurter.app free API for real rates
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD');
    if (!response.ok) return null;

    const data = await response.json() as { rates: Record<string, number> };
    const rates: Record<string, number> = { USD: 1 };
    for (const [currency, rate] of Object.entries(data.rates)) {
      rates[currency] = rate;
    }
    return rates;
  } catch {
    return null;
  }
}

async function getRates(): Promise<Record<string, number>> {
  const now = Date.now();

  if (cachedRates && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRates;
  }

  const fetched = await fetchExchangeRates();
  if (fetched) {
    cachedRates = fetched;
    cacheTimestamp = now;
    return fetched;
  }

  // Fallback to hardcoded rates
  return FALLBACK_RATES;
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (fromUpper === toUpper) return amount;

  // Convert to USD first, then to target
  const fromRate = rates[fromUpper];
  const toRate = rates[toUpper];

  if (!fromRate || !toRate) return null;

  const inUsd = amount / fromRate;
  return inUsd * toRate;
}

export function getSupportedCurrencies(): { code: string; name: string; flag: string }[] {
  return Object.entries(CURRENCY_INFO).map(([code, info]) => ({
    code,
    name: info.name,
    flag: info.flag,
  }));
}

// --- Tool Definitions ---

const convertSchema = z.object({
  amount: z.number().describe('Amount to convert'),
  from: z.string().describe('Source currency code (USD, CNY, HKD, JPY, EUR, GBP, KRW)'),
  to: z.string().describe('Target currency code (USD, CNY, HKD, JPY, EUR, GBP, KRW)'),
});

export function createConvertCurrencyTool() {
  return new PiTool({
    name: 'convert_currency',
    description: 'Convert amounts between currencies (USD, CNY, HKD, JPY, EUR, GBP, KRW).',
    schema: convertSchema,
    func: async ({ amount, from, to }) => {
      const rates = await getRates();
      const result = convertCurrency(amount, from, to, rates);

      if (result === null) {
        return JSON.stringify({
          error: `Conversion not available for ${from} to ${to}`,
          supported: Object.keys(CURRENCY_INFO),
        });
      }

      const fromInfo = CURRENCY_INFO[from.toUpperCase()];
      const toInfo = CURRENCY_INFO[to.toUpperCase()];

      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const lines = [
        `💱 **Currency Conversion**`,
        '',
        `${fromInfo?.flag || ''} **${formatted.format(amount)} ${from.toUpperCase()}**`,
        `   =`,
        `${toInfo?.flag || ''} **${formatted.format(result)} ${to.toUpperCase()}**`,
        '',
        `Rate: 1 ${from.toUpperCase()} = ${(result / amount).toFixed(4)} ${to.toUpperCase()}`,
      ];

      return lines.join('\n');
    },
  });
}

const listCurrenciesSchema = z.object({});

export function createListCurrenciesTool() {
  return new PiTool({
    name: 'list_currencies',
    description: 'List all supported currencies for conversion.',
    schema: listCurrenciesSchema,
    func: async () => {
      const currencies = getSupportedCurrencies();

      const lines = [
        '## Supported Currencies',
        '',
        '| Code | Flag | Name |',
        '|------|------|------|',
        ...currencies.map(c => `| ${c.code} | ${c.flag} | ${c.name} |`),
        '',
        'Rates are fetched from Frankfurter API (cached 1 hour). Fallback rates used if API unavailable.',
      ];

      return lines.join('\n');
    },
  });
}

const getRateSchema = z.object({
  from: z.string().describe('Base currency code'),
  to: z.string().describe('Quote currency code'),
});

export function createGetRateTool() {
  return new PiTool({
    name: 'get_exchange_rate',
    description: 'Get current exchange rate between two currencies.',
    schema: getRateSchema,
    func: async ({ from, to }) => {
      const rates = await getRates();
      const result = convertCurrency(1, from, to, rates);

      if (result === null) {
        return JSON.stringify({
          error: `Rate not available for ${from} to ${to}`,
        });
      }

      return JSON.stringify({
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate: result,
        inverse: 1 / result,
        timestamp: new Date().toISOString(),
      });
    },
  });
}

// --- Export ---

export const fxTools = [
  createConvertCurrencyTool(),
  createListCurrenciesTool(),
  createGetRateTool(),
];
