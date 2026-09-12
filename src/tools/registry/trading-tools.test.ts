/**
 * Tests for the trading-tools registry wiring.
 *
 * Verifies the sandbox / broker tools are exposed through the tool
 * registry with the correct shape (name, metadata, concurrency).
 */

import { describe, expect, test } from 'bun:test';
import { loadTradingTools } from './trading-tools.js';

describe('loadTradingTools', () => {
  test('exposes the 5 expected tools', () => {
    const tools = loadTradingTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      'place_trade_order',
      'cancel_trade_order',
      'get_trading_positions',
      'get_trading_balance',
      'get_trade_quote',
    ]);
  });

  test('write tools (place/cancel) are not concurrency-safe and have financial impact', () => {
    const tools = loadTradingTools();
    const place = tools.find((t) => t.name === 'place_trade_order')!;
    const cancel = tools.find((t) => t.name === 'cancel_trade_order')!;
    expect(place.concurrencySafe).toBe(false);
    expect(cancel.concurrencySafe).toBe(false);
    expect(place.concurrencyMetadata?.sideEffects.hasFinancialImpact).toBe(true);
    expect(place.concurrencyMetadata?.sideEffects.modifiesState).toBe(true);
    expect(place.concurrencyMetadata?.safetyLevel).toBe('dangerous');
    expect(cancel.concurrencyMetadata?.safetyLevel).toBe('dangerous');
  });

  test('read tools (positions/balance/quote) are concurrency-safe', () => {
    const tools = loadTradingTools();
    for (const name of ['get_trading_positions', 'get_trading_balance', 'get_trade_quote']) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.concurrencySafe).toBe(true);
      expect(t.concurrencyMetadata?.sideEffects.hasFinancialImpact).toBe(false);
    }
  });

  test('each tool carries a non-empty description', () => {
    const tools = loadTradingTools();
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.compactDescription).toBeTruthy();
    }
  });

  test('each tool exposes a callable PiTool', () => {
    const tools = loadTradingTools();
    for (const t of tools) {
      expect(t.tool).toBeTruthy();
      expect(typeof (t.tool as { invoke?: unknown }).invoke).toBe('function');
    }
  });
});
