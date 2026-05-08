/**
 * FX Currency Conversion Tools
 */

export {
  convertCurrency,
  getSupportedCurrencies,
  createConvertCurrencyTool,
  createListCurrenciesTool,
  createGetRateTool,
  fxTools,
} from './fx-tools.js';

export const CONVERT_CURRENCY_DESCRIPTION = `
Convert amounts between supported currencies.

## When to Use
- Converting portfolio values between USD/CNY/HKD
- Analyzing international investments
- Currency-adjusted performance calculation

## Supported Currencies
USD, CNY, HKD, JPY, EUR, GBP, KRW, SGD, AUD, CAD, CHF
`.trim();

export const LIST_CURRENCIES_DESCRIPTION = `
List all supported currencies for conversion.
`.trim();

export const GET_EXCHANGE_RATE_DESCRIPTION = `
Get current exchange rate between two currencies.

## When to Use
- Before cross-border investment analysis
- Checking current FX rates
`.trim();
