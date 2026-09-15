/**
 * Tests for the broker registry.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createBroker,
  createBrokerAsync,
  LIVE_TRADING_DISABLED_MESSAGE,
  listBrokers,
  registerBroker,
  resolveActiveBroker,
  unregisterBroker,
} from './registry';
import type { BrokerAdapter } from './types';

describe('broker registry', () => {
  const originalBroker = process.env.UPUP_BROKER;

  beforeEach(() => {
    delete process.env.UPUP_BROKER;
    delete process.env.UPUP_TRADING_MODE;
    delete process.env.UPUP_ALLOW_LIVE_TRADING;
  });

  afterEach(() => {
    if (originalBroker === undefined) {
      delete process.env.UPUP_BROKER;
    } else {
      process.env.UPUP_BROKER = originalBroker;
    }
  });

  test('live broker construction is denied unless both explicit safety flags are enabled', async () => {
    await expect(createBrokerAsync('ibkr')).rejects.toThrow(LIVE_TRADING_DISABLED_MESSAGE);
    process.env.UPUP_TRADING_MODE = 'live';
    await expect(createBrokerAsync('ibkr')).rejects.toThrow(LIVE_TRADING_DISABLED_MESSAGE);
    process.env.UPUP_ALLOW_LIVE_TRADING = 'true';
    await expect(createBrokerAsync('ibkr')).resolves.toMatchObject({ name: 'ibkr' });
  });

  test('default registration includes sandbox, ibkr, xueqiu', () => {
    const names = listBrokers();
    expect(names).toContain('sandbox');
    expect(names).toContain('ibkr');
    expect(names).toContain('xueqiu');
  });

  test('createBroker("sandbox") returns a sandbox broker with name "sandbox"', () => {
    const broker = createBroker('sandbox');
    expect(broker.name).toBe('sandbox');
  });

  test('createBroker with unknown name throws with helpful message', () => {
    expect(() => createBroker('robinhood')).toThrow(/not registered/);
    expect(() => createBroker('robinhood')).toThrow(/Available:/);
  });

  test('resolveActiveBroker defaults to sandbox when UPUP_BROKER is unset', () => {
    const broker = resolveActiveBroker();
    expect(broker.name).toBe('sandbox');
  });

  test('resolveActiveBroker honors UPUP_BROKER env var', () => {
    process.env.UPUP_BROKER = 'sandbox';
    const broker = resolveActiveBroker();
    expect(broker.name).toBe('sandbox');
  });

  test('createBroker("ibkr") synchronously throws (use async variant)', () => {
    expect(() => createBroker('ibkr')).toThrow(/createBrokerAsync/);
  });

  test('createBroker("xueqiu") synchronously throws (use async variant)', () => {
    expect(() => createBroker('xueqiu')).toThrow(/createBrokerAsync/);
  });

  test('createBrokerAsync returns a working sandbox broker', async () => {
    const broker = await createBrokerAsync('sandbox');
    expect(broker.name).toBe('sandbox');
    const balance = await broker.getBalance();
    expect(balance.cash).toBeGreaterThan(0);
  });

  test('createBrokerAsync("ibkr") returns an IbkrAdapter with name "ibkr"', async () => {
    process.env.UPUP_TRADING_MODE = 'live';
    process.env.UPUP_ALLOW_LIVE_TRADING = 'true';
    const broker = await createBrokerAsync('ibkr');
    expect(broker.name).toBe('ibkr');
  });

  test('createBrokerAsync("xueqiu") returns a XueqiuAdapter with name "xueqiu"', async () => {
    process.env.UPUP_TRADING_MODE = 'live';
    process.env.UPUP_ALLOW_LIVE_TRADING = 'true';
    const broker = await createBrokerAsync('xueqiu');
    expect(broker.name).toBe('xueqiu');
  });

  test('createBrokerAsync with unknown name throws with helpful message', async () => {
    await expect(createBrokerAsync('robinhood')).rejects.toThrow(/not registered/);
  });

  test('registerBroker rejects duplicate names', () => {
    const factory = () => ({ name: 'fake' }) as unknown as BrokerAdapter;
    expect(() => registerBroker('sandbox', factory)).toThrow(/already registered/);
  });

  test('registerBroker + unregisterBroker round-trip', () => {
    const factory = () => ({ name: 'temp' }) as unknown as BrokerAdapter;
    registerBroker('temp-broker', factory);
    expect(listBrokers()).toContain('temp-broker');
    expect(unregisterBroker('temp-broker')).toBe(true);
    expect(listBrokers()).not.toContain('temp-broker');
  });

  test('unregisterBroker returns false when name is unknown', () => {
    expect(unregisterBroker('does-not-exist')).toBe(false);
  });

  test('IBKR adapter implements the full BrokerAdapter contract', async () => {
    process.env.UPUP_TRADING_MODE = 'live';
    process.env.UPUP_ALLOW_LIVE_TRADING = 'true';
    const broker = await createBrokerAsync('ibkr');
    const order = await broker.placeOrder({
      symbol: 'AAPL',
      side: 'buy',
      type: 'market',
      quantity: 10,
    } as Parameters<BrokerAdapter['placeOrder']>[0]);
    expect(order.id).toMatch(/^IBKR-/);
    expect(order.status).toBe('pending');

    const fetched = await broker.getOrder(order.id);
    expect(fetched?.id).toBe(order.id);

    const pending = await broker.listPendingOrders();
    expect(pending.map((o) => o.id)).toContain(order.id);

    const cancelled = await broker.cancelOrder(order.id);
    expect(cancelled.status).toBe('cancelled');

    const positions = await broker.getPositions();
    expect(Array.isArray(positions)).toBe(true);

    const balance = await broker.getBalance();
    expect(balance.currency).toBeTruthy();

    const quote = await broker.getQuote('AAPL');
    expect(quote.symbol).toBe('AAPL');
    expect(quote.last).toBeGreaterThan(0);
  });

  test('Xueqiu adapter implements the full BrokerAdapter contract', async () => {
    process.env.UPUP_TRADING_MODE = 'live';
    process.env.UPUP_ALLOW_LIVE_TRADING = 'true';
    const broker = await createBrokerAsync('xueqiu');
    const order = await broker.placeOrder({
      symbol: '600519.SH',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      price: 1800,
    } as Parameters<BrokerAdapter['placeOrder']>[0]);
    expect(order.id).toMatch(/^XQ-/);
    expect(order.status).toBe('pending');

    const pending = await broker.listPendingOrders();
    expect(pending.length).toBeGreaterThan(0);

    const balance = await broker.getBalance();
    expect(balance.currency).toBe('CNY');

    const quote = await broker.getQuote('600519.SH');
    expect(quote.symbol).toBe('600519.SH');
  });
});
