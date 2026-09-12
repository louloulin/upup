import { describe, expect, it, beforeEach } from 'bun:test';
import fs from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import {
  addToWatchlistParams,
  removeFromWatchlistParams,
  getWatchlistParams,
  addWatchlistAlertParams,
  checkWatchlistAlertsParams,
  clearWatchlistAlertParams,
  createAddToWatchlistTool,
  createRemoveFromWatchlistTool,
  createGetWatchlistTool,
  createAddWatchlistAlertTool,
  createCheckWatchlistAlertsTool,
  createClearWatchlistAlertTool,
  registerWatchlistExtension,
  type AddToWatchlistParams,
  type RemoveFromWatchlistParams,
  type GetWatchlistParams,
  type AddWatchlistAlertParams,
  type CheckWatchlistAlertsParams,
  type ClearWatchlistAlertParams,
} from './pi-watchlist-tool.js';
import { createFakeApi } from '../pi-main.js';
import { setDataPath } from '../tools/watchlist/watchlist-tools.js';

const TEST_FILE = '/tmp/upup-pi-watchlist-test.json';

describe('pi watchlist tools', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
    setDataPath(TEST_FILE);
  });

  it('validates all six TypeBox schemas', () => {
    expect(Value.Check(addToWatchlistParams, { symbol: 'AAPL' })).toBe(true);
    expect(Value.Check(removeFromWatchlistParams, { symbol: 'AAPL' })).toBe(true);
    expect(Value.Check(getWatchlistParams, {})).toBe(true);
    expect(Value.Check(addWatchlistAlertParams, { symbol: 'AAPL', type: 'above', value: 100 })).toBe(true);
    expect(Value.Check(checkWatchlistAlertsParams, { prices: { AAPL: 101 } })).toBe(true);
    expect(Value.Check(clearWatchlistAlertParams, { symbol: 'AAPL', alertIndex: 0 })).toBe(true);
  });

  it('rejects invalid alert type and negative alert index', () => {
    expect(Value.Check(addWatchlistAlertParams, { symbol: 'AAPL', type: 'invalid', value: 100 })).toBe(false);
    expect(Value.Check(clearWatchlistAlertParams, { symbol: 'AAPL', alertIndex: -1 })).toBe(false);
  });

  it('adds and reads a watchlist entry through strict pi execute', async () => {
    const add = createAddToWatchlistTool();
    const result = await (add.execute as any)('call', {
      symbol: 'aapl', notes: 'earnings', tags: ['tech'],
    }, undefined, undefined, undefined);
    expect(result.details.success).toBe(true);
    expect(result.details.entry.symbol).toBe('AAPL');

    const get = createGetWatchlistTool();
    const read = await (get.execute as any)('call', { tag: 'tech' }, undefined, undefined, undefined);
    expect(read.details.count).toBe(1);
    expect(read.details.entries[0].symbol).toBe('AAPL');
  });

  it('throws for failed side-effecting watchlist operations', async () => {
    const remove = createRemoveFromWatchlistTool();
    await expect((remove.execute as any)('call', { symbol: 'MISSING' }, undefined, undefined, undefined)).rejects.toThrow('not in watchlist');

    const addAlert = createAddWatchlistAlertTool();
    await expect((addAlert.execute as any)('call', { symbol: 'MISSING', type: 'above', value: 100 }, undefined, undefined, undefined)).rejects.toThrow('not in watchlist');
  });

  it('short-circuits side-effecting tools when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const add = createAddToWatchlistTool();
    await expect((add.execute as any)('call', { symbol: 'AAPL' }, controller.signal, undefined, undefined)).rejects.toThrow('aborted');
  });

  it('triggers and clears alerts through strict pi execute', async () => {
    await (createAddToWatchlistTool().execute as any)('call', { symbol: 'AAPL' }, undefined, undefined, undefined);
    await (createAddWatchlistAlertTool().execute as any)('call', { symbol: 'AAPL', type: 'above', value: 100 }, undefined, undefined, undefined);
    const checked = await (createCheckWatchlistAlertsTool().execute as any)('call', { prices: { AAPL: 101 } }, undefined, undefined, undefined);
    expect(checked.details.triggeredCount).toBe(1);
    const cleared = await (createClearWatchlistAlertTool().execute as any)('call', { symbol: 'AAPL', alertIndex: 0 }, undefined, undefined, undefined);
    expect(cleared.details.success).toBe(true);
  });

  it('registers six strict tools with prompt metadata', () => {
    const api = createFakeApi();
    registerWatchlistExtension(api);
    expect(api.tools.map((tool) => tool.name)).toEqual([
      'add_to_watchlist', 'remove_from_watchlist', 'get_watchlist',
      'add_watchlist_alert', 'check_watchlist_alerts', 'clear_watchlist_alert',
    ]);
    for (const tool of api.tools) {
      expect(tool.promptSnippet).toBeString();
      expect(Array.isArray(tool.promptGuidelines)).toBe(true);
      expect((tool.promptGuidelines as string[]).length).toBeGreaterThan(0);
    }
  });
});

describe('pi watchlist tool type contracts', () => {
  it('keeps parameter static types usable', () => {
    const add: AddToWatchlistParams = { symbol: 'AAPL' };
    const remove: RemoveFromWatchlistParams = { symbol: 'AAPL' };
    const get: GetWatchlistParams = {};
    const alert: AddWatchlistAlertParams = { symbol: 'AAPL', type: 'below', value: 90 };
    const prices: CheckWatchlistAlertsParams = { prices: { AAPL: 91 } };
    const clear: ClearWatchlistAlertParams = { symbol: 'AAPL', alertIndex: 0 };
    expect([add, remove, get, alert, prices, clear]).toHaveLength(6);
  });
});
