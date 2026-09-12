/**
 * Alt-Data Tools (Pi-compatible wrapper)
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/alt-data
 *      → Requirement: Alt-Data Tools Registration
 *
 * Two LLM-facing tools backed by the AltDataAdapter registry:
 * - `alt_data_fetch` — pull raw events from a single source
 * - `alt_data_search` — cross-source keyword search (title + symbols)
 *
 * Adapters are injected via deps so production code wires real fetchers
 * (with API keys) and tests can plug in mock responses.
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import type { AltDataAdapter, AltDataSource, NormalizedEvent } from '../../data/alt/types.js';

export interface AltDataToolDeps {
  adapters: Partial<Record<AltDataSource, AltDataAdapter>>;
}

const SUPPORTED_SOURCES = ['dragon-tiger', 'north-bound'] as const;

const fetchSchema = z.object({
  source: z.enum(SUPPORTED_SOURCES),
  symbols: z.array(z.string()).optional(),
  dateRange: z.tuple([z.number(), z.number()]).optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export const createAltDataFetchTool = (deps: AltDataToolDeps) =>
  new PiTool({
    name: 'alt_data_fetch',
    description: `抓取另类数据(龙虎榜 / 北向资金)。source 支持 dragon-tiger (龙虎榜+大宗交易) / north-bound (北向+融资融券)。可通过 symbols 限定标的,dateRange 限定时间窗口(毫秒)。返回 NormalizedEvent 列表(已按 id 去重)。`,
    schema: fetchSchema,
    func: async (params) => {
      const adapter = deps.adapters[params.source];
      if (!adapter) {
        return formatToolResult({
          error: `Adapter not registered: ${params.source}. Set the relevant API key (EAST_MONEY_LHB_KEY for dragon-tiger, HKEX_CONNECT_KEY for north-bound) or use a registered source.`,
        });
      }
      try {
        let events: NormalizedEvent[] = await adapter.fetch({
          ...(params.symbols ? { symbols: params.symbols } : {}),
          ...(params.dateRange ? { dateRange: params.dateRange as [number, number] } : {}),
        });
        events = events.slice(0, params.limit);
        return formatToolResult({ source: params.source, count: events.length, events });
      } catch (err) {
        return formatToolResult({ error: (err as Error).message });
      }
    },
  });

const searchSchema = z.object({
  query: z.string().min(1),
  sources: z.array(z.enum(SUPPORTED_SOURCES)).default([...SUPPORTED_SOURCES]),
  limit: z.number().int().positive().max(50).default(10),
});

export const createAltDataSearchTool = (deps: AltDataToolDeps) =>
  new PiTool({
    name: 'alt_data_search',
    description: `跨源搜索另类数据。query 关键词匹配 title 或 symbols。返回最相关的 N 条 NormalizedEvent。`,
    schema: searchSchema,
    func: async (params) => {
      // Defensive defaults — tests call tool.func() directly without Zod parsing,
      // so the schema-level .default() never fires in those paths.
      const sources = params.sources ?? [...SUPPORTED_SOURCES];
      const limit = params.limit ?? 10;
      const allEvents: NormalizedEvent[] = [];
      for (const source of sources) {
        const adapter = deps.adapters[source];
        if (!adapter) continue;
        try {
          const events = await adapter.fetch({});
          allEvents.push(...events);
        } catch { /* skip unavailable adapters silently */ }
      }
      const q = params.query.toLowerCase();
      const matched = allEvents
        .filter(e => e.title.toLowerCase().includes(q)
          || e.symbols.some(s => s.toLowerCase().includes(q)))
        .slice(0, limit);
      return formatToolResult({ query: params.query, count: matched.length, events: matched });
    },
  });

export const altDataTools = [createAltDataFetchTool, createAltDataSearchTool] as const;
