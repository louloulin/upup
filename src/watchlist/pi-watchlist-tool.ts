import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  addEntry,
  removeEntry,
  getEntries,
  addAlert,
  checkAlerts,
  clearAlert,
} from '../tools/watchlist/watchlist-tools.js';
import type { PiUpupExtensionApi } from '../pi-main.js';

const AlertTypeSchema = Type.Union([
  Type.Literal('above'),
  Type.Literal('below'),
  Type.Literal('percent_change'),
]);

export const addToWatchlistParams = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Stock ticker symbol.' }),
  notes: Type.Optional(Type.String({ description: 'Optional investment notes.' })),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: 'Optional categorization tags.' })),
});
export type AddToWatchlistParams = Static<typeof addToWatchlistParams>;

export const removeFromWatchlistParams = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Stock ticker symbol to remove.' }),
});
export type RemoveFromWatchlistParams = Static<typeof removeFromWatchlistParams>;

export const getWatchlistParams = Type.Object({
  tag: Type.Optional(Type.String({ minLength: 1, description: 'Optional tag filter.' })),
});
export type GetWatchlistParams = Static<typeof getWatchlistParams>;

export const addWatchlistAlertParams = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Stock ticker symbol.' }),
  type: AlertTypeSchema,
  value: Type.Number({ description: 'Price or percentage threshold.' }),
});
export type AddWatchlistAlertParams = Static<typeof addWatchlistAlertParams>;

export const checkWatchlistAlertsParams = Type.Object({
  prices: Type.Record(Type.String(), Type.Number(), { description: 'Current prices keyed by symbol.' }),
});
export type CheckWatchlistAlertsParams = Static<typeof checkWatchlistAlertsParams>;

export const clearWatchlistAlertParams = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Stock ticker symbol.' }),
  alertIndex: Type.Integer({ minimum: 0, description: 'Alert array index from get_watchlist.' }),
});
export type ClearWatchlistAlertParams = Static<typeof clearWatchlistAlertParams>;

type TextResult<T> = { content: Array<{ type: 'text'; text: string }>; details: T };

function result<T>(details: T): TextResult<T> {
  return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
}

function assertNotAborted(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) throw new Error(`${operation} aborted by caller`);
}

export function createAddToWatchlistTool() {
  return defineTool({
    name: 'add_to_watchlist', label: 'Add to Watchlist',
    description: 'Add a stock symbol to the persistent investment watchlist.',
    promptSnippet: 'Add a stock to the investment watchlist',
    promptGuidelines: ['Use this before adding watchlist alerts.', 'Normalize user-provided symbols as stock tickers.'],
    parameters: addToWatchlistParams, executionMode: 'sequential',
    async execute(_id, params: AddToWatchlistParams, signal): Promise<TextResult<ReturnType<typeof addEntry>>> {
      assertNotAborted(signal, 'Add to watchlist');
      const details = addEntry(params.symbol, params.notes, params.tags);
      if (!details.success) throw new Error(details.message);
      return result(details);
    },
  });
}

export function createRemoveFromWatchlistTool() {
  return defineTool({
    name: 'remove_from_watchlist', label: 'Remove from Watchlist',
    description: 'Remove a stock symbol from the persistent investment watchlist.',
    promptSnippet: 'Remove a stock from the investment watchlist',
    promptGuidelines: ['Use only after confirming the symbol should no longer be monitored.'],
    parameters: removeFromWatchlistParams, executionMode: 'sequential',
    async execute(_id, params: RemoveFromWatchlistParams, signal): Promise<TextResult<ReturnType<typeof removeEntry>>> {
      assertNotAborted(signal, 'Remove from watchlist');
      const details = removeEntry(params.symbol);
      if (!details.success) throw new Error(details.message);
      return result(details);
    },
  });
}

export function createGetWatchlistTool() {
  return defineTool({
    name: 'get_watchlist', label: 'Get Watchlist',
    description: 'Read the persistent investment watchlist and its alerts.',
    promptSnippet: 'Read the investment watchlist',
    promptGuidelines: ['Use tag to narrow results when the user asks about a category.'],
    parameters: getWatchlistParams,
    async execute(_id, params: GetWatchlistParams): Promise<TextResult<{ count: number; entries: unknown[]; message: string }>> {
      const entries = Object.values(getEntries()).filter((entry) => !params.tag || entry.tags?.includes(params.tag));
      return result({ count: entries.length, entries, message: `Found ${entries.length} symbols in watchlist${params.tag ? ` tagged "${params.tag}"` : ''}` });
    },
  });
}

export function createAddWatchlistAlertTool() {
  return defineTool({
    name: 'add_watchlist_alert', label: 'Add Watchlist Alert',
    description: 'Add a price or percentage alert to a watchlist symbol.',
    promptSnippet: 'Add a price alert to a watched stock',
    promptGuidelines: ['The symbol must already be in the watchlist.', 'Use above/below for prices and percent_change for percentage monitoring.'],
    parameters: addWatchlistAlertParams, executionMode: 'sequential',
    async execute(_id, params: AddWatchlistAlertParams, signal): Promise<TextResult<ReturnType<typeof addAlert>>> {
      assertNotAborted(signal, 'Add watchlist alert');
      const details = addAlert(params.symbol, params.type, params.value);
      if (!details.success) throw new Error(details.message);
      return result(details);
    },
  });
}

export function createCheckWatchlistAlertsTool() {
  return defineTool({
    name: 'check_watchlist_alerts', label: 'Check Watchlist Alerts',
    description: 'Check watchlist alerts against current prices.',
    promptSnippet: 'Check watched-stock alerts against current prices',
    promptGuidelines: ['Pass the latest prices keyed by ticker symbol.', 'This is read-only unless an alert transitions to triggered.'],
    parameters: checkWatchlistAlertsParams,
    async execute(_id, params: CheckWatchlistAlertsParams): Promise<TextResult<{ triggeredCount: number; triggered: unknown[]; message: string }>> {
      const triggered = checkAlerts(params.prices);
      return result({ triggeredCount: triggered.length, triggered, message: triggered.length ? `⚠️ ${triggered.length} alert(s) triggered!` : 'No alerts triggered' });
    },
  });
}

export function createClearWatchlistAlertTool() {
  return defineTool({
    name: 'clear_watchlist_alert', label: 'Clear Watchlist Alert',
    description: 'Clear a watchlist alert by its index.',
    promptSnippet: 'Clear a watched-stock alert',
    promptGuidelines: ['Use the alertIndex returned by get_watchlist.', 'Only clear an alert after user confirmation when appropriate.'],
    parameters: clearWatchlistAlertParams, executionMode: 'sequential',
    async execute(_id, params: ClearWatchlistAlertParams, signal): Promise<TextResult<ReturnType<typeof clearAlert>>> {
      assertNotAborted(signal, 'Clear watchlist alert');
      const details = clearAlert(params.symbol, params.alertIndex);
      if (!details.success) throw new Error(details.message);
      return result(details);
    },
  });
}

export function registerWatchlistExtension(pi: PiUpupExtensionApi): void {
  pi.registerTool(createAddToWatchlistTool());
  pi.registerTool(createRemoveFromWatchlistTool());
  pi.registerTool(createGetWatchlistTool());
  pi.registerTool(createAddWatchlistAlertTool());
  pi.registerTool(createCheckWatchlistAlertsTool());
  pi.registerTool(createClearWatchlistAlertTool());
}
