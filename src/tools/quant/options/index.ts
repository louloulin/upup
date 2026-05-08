/**
 * Options Pricing Tools
 *
 * Exports Black-Scholes option pricing tools
 */

export {
  blackScholes,
  impliedVolatility,
  createCalculateOptionPriceTool,
  createCalculateGreeksTool,
  createCalculateImpliedVolTool,
  optionsTools,
} from '../options-pricing.js';

export const CALCULATE_OPTION_PRICE_DESCRIPTION = `
Calculate Black-Scholes option price for calls and puts.

## When to Use
- Valuing stock options
- Pre-trade analysis
- Strategy evaluation

## Formula
Uses standard Black-Scholes formula with:
- Continuous dividend yield = 0
- European-style options

## Interpretation
- ITM options have higher intrinsic value
- Time to expiry affects premium
- Higher volatility = higher premium
`.trim();

export const CALCULATE_GREEKS_DESCRIPTION = `
Calculate option Greeks - sensitivity measures.

## Greeks Explained
- **Delta**: Price sensitivity to underlying
- **Gamma**: Delta sensitivity to underlying
- **Theta**: Time decay per day
- **Vega**: Sensitivity to IV changes
- **Rho**: Sensitivity to interest rate
`.trim();

export const CALCULATE_IMPLIED_VOL_DESCRIPTION = `
Calculate implied volatility from market option price.

## When to Use
- Market expectations analysis
- Volatility trading
- Strategy setup

## Method
Newton-Raphson numerical solver
`.trim();
