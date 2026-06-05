/**
 * Alt-Data tool registration — wires the AltDataAdapter implementations
 * (DragonTigerAdapter, NorthBoundAdapter) into the unified tool registry.
 *
 * Tools:
 *  - alt_data_fetch (network read — fetches from 东方财富)
 *  - alt_data_search (network read — cross-source keyword search)
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/alt-data
 * Design: docs/superpowers/specs/2026-06-04-top-tier-investment-assistant-v2-design.md D18
 */

import type { RegisteredTool } from './types.js';
import { networkMetadata } from './types.js';
import { DragonTigerAdapter } from '@upup/data/alt/dragon-tiger';
import { NorthBoundAdapter } from '@upup/data/alt/north-bound';
import {
  createAltDataFetchTool,
  createAltDataSearchTool,
  type AltDataToolDeps,
} from '../alt-data/index.js';

export function loadAltDataTools(): RegisteredTool[] {
  const read = networkMetadata();

  // Lazy credential loading: pass apiKey only if env var is set, otherwise
  // the adapter's default fetcher will throw AltDataError(NO_CREDENTIALS)
  // at first call. This matches the spec's "lazy registration" contract.
  const dragonTiger = new DragonTigerAdapter(
    process.env['EAST_MONEY_LHB_KEY']
      ? { apiKey: process.env['EAST_MONEY_LHB_KEY'] }
      : {},
  );
  const northBound = new NorthBoundAdapter(
    process.env['HKEX_CONNECT_KEY']
      ? { apiKey: process.env['HKEX_CONNECT_KEY'] }
      : {},
  );

  const deps: AltDataToolDeps = {
    adapters: {
      'dragon-tiger': dragonTiger,
      'north-bound': northBound,
    },
  };

  return [
    {
      name: 'alt_data_fetch',
      tool: createAltDataFetchTool(deps),
      description: 'Fetch alternative data (龙虎榜 / 北向资金 / 融资融券) for a given source, optional symbol/date range filters.',
      compactDescription: '抓取另类数据 (龙虎榜/北向/融资融券)',
      concurrencySafe: true,
      concurrencyMetadata: read,
    },
    {
      name: 'alt_data_search',
      tool: createAltDataSearchTool(deps),
      description: 'Cross-source keyword search over alternative data (matches title or symbols).',
      compactDescription: '跨源搜索另类数据',
      concurrencySafe: true,
      concurrencyMetadata: read,
    },
  ];
}
