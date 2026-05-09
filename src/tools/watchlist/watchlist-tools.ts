/**
 * Watchlist Management Tools
 *
 * Implements persistent watchlist tracking with alerts:
 * - Add/remove symbols to watchlist
 * - Set price alert thresholds (above/below)
 * - Check alert conditions
 * - File-based persistence
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

// --- Types ---

export interface WatchlistAlert {
  symbol: string;
  type: 'above' | 'below' | 'percent_change';
  value: number;
  triggered: boolean;
  triggeredAt?: string;
  createdAt: string;
}

export interface WatchlistEntry {
  symbol: string;
  addedAt: string;
  notes?: string;
  tags?: string[];
  alerts: WatchlistAlert[];
}

export interface WatchlistData {
  entries: Record<string, WatchlistEntry>;
  updatedAt: string;
}

// --- Persistence ---

const DEFAULT_FILE_PATH = '.upup/watchlist.json';

let dataFilePath: string = DEFAULT_FILE_PATH;
let _data: WatchlistData | null = null;

function getDataPath(): string {
  return dataFilePath;
}

export function setDataPath(p: string): void {
  dataFilePath = p;
  _data = null;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFromDisk(): WatchlistData {
  const filePath = getDataPath();
  ensureDir(filePath);

  if (!fs.existsSync(filePath)) {
    const empty: WatchlistData = { entries: {}, updatedAt: new Date().toISOString() };
    fs.writeFileSync(filePath, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as WatchlistData;
    return parsed;
  } catch {
    const empty: WatchlistData = { entries: {}, updatedAt: new Date().toISOString() };
    return empty;
  }
}

function saveData(data: WatchlistData): void {
  const filePath = getDataPath();
  ensureDir(filePath);
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getData(): WatchlistData {
  if (!_data) {
    _data = readFromDisk();
  }
  return _data;
}

function save(): void {
  if (_data) {
    saveData(_data);
  }
}

// --- Operations ---

export function getEntries(): Record<string, WatchlistEntry> {
  return getData().entries;
}

export function getEntry(symbol: string): WatchlistEntry | undefined {
  return getData().entries[symbol.toUpperCase()];
}

export function addEntry(
  symbol: string,
  notes?: string,
  tags?: string[],
): { success: boolean; entry?: WatchlistEntry; message: string } {
  const data = getData();
  const upper = symbol.toUpperCase();

  if (data.entries[upper]) {
    return { success: false, message: `${upper} is already in watchlist` };
  }

  const entry: WatchlistEntry = {
    symbol: upper,
    addedAt: new Date().toISOString(),
    notes,
    tags: tags || [],
    alerts: [],
  };

  data.entries[upper] = entry;
  _data = data;
  save();

  return { success: true, entry, message: `Added ${upper} to watchlist` };
}

export function removeEntry(symbol: string): { success: boolean; message: string } {
  const data = getData();
  const upper = symbol.toUpperCase();

  if (!data.entries[upper]) {
    return { success: false, message: `${upper} not in watchlist` };
  }

  delete data.entries[upper];
  _data = data;
  save();

  return { success: true, message: `Removed ${upper} from watchlist` };
}

export function addAlert(
  symbol: string,
  alertType: 'above' | 'below' | 'percent_change',
  value: number,
): { success: boolean; alert?: WatchlistAlert; message: string } {
  const data = getData();
  const upper = symbol.toUpperCase();

  const entry = data.entries[upper];
  if (!entry) {
    return { success: false, message: `${upper} not in watchlist` };
  }

  const alert: WatchlistAlert = {
    symbol: upper,
    type: alertType,
    value,
    triggered: false,
    createdAt: new Date().toISOString(),
  };

  entry.alerts.push(alert);
  _data = data;
  save();

  return { success: true, alert, message: `Alert added for ${upper}: ${alertType} ${value}` };
}

export function checkAlerts(
  currentPrices: Record<string, number>,
): { symbol: string; alert: WatchlistAlert; currentPrice: number }[] {
  const data = getData();
  const triggered: { symbol: string; alert: WatchlistAlert; currentPrice: number }[] = [];

  for (const [symbol, entry] of Object.entries(data.entries)) {
    const price = currentPrices[symbol];
    if (price === undefined) continue;

    const purchasePrice = entry.alerts[0]; // Use first alert value as reference for percent change

    for (const alert of entry.alerts) {
      let isTriggered = false;

      if (alert.type === 'above' && price > alert.value) {
        isTriggered = true;
      } else if (alert.type === 'below' && price < alert.value) {
        isTriggered = true;
      }

      if (isTriggered && !alert.triggered) {
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();
        triggered.push({ symbol, alert, currentPrice: price });
      }
    }
  }

  if (triggered.length > 0) {
    saveData(data);
    _data = data;
  }

  return triggered;
}

export function clearAlert(symbol: string, alertIndex: number): { success: boolean; message: string } {
  const data = getData();
  const upper = symbol.toUpperCase();

  const entry = data.entries[upper];
  if (!entry) {
    return { success: false, message: `${upper} not in watchlist` };
  }

  if (alertIndex < 0 || alertIndex >= entry.alerts.length) {
    return { success: false, message: `Invalid alert index` };
  }

  entry.alerts.splice(alertIndex, 1);
  _data = data;
  save();

  return { success: true, message: `Alert ${alertIndex} cleared for ${upper}` };
}

// --- Tool Definitions ---

const addToWatchlistSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
  notes: z.string().optional().describe('Optional notes about why this symbol is being watched'),
  tags: z.array(z.string()).optional().describe('Tags for categorization (e.g., tech, earnings, undervalued)'),
});

export function createAddToWatchlistTool() {
  return new DynamicStructuredTool({
    name: 'add_to_watchlist',
    description: 'Add a stock symbol to your investment watchlist for tracking and alerts.',
    schema: addToWatchlistSchema,
    func: async ({ symbol, notes, tags }) => {
      const result = addEntry(symbol, notes, tags);
      return JSON.stringify(result);
    },
  });
}

const removeFromWatchlistSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol to remove'),
});

export function createRemoveFromWatchlistTool() {
  return new DynamicStructuredTool({
    name: 'remove_from_watchlist',
    description: 'Remove a stock symbol from your investment watchlist.',
    schema: removeFromWatchlistSchema,
    func: async ({ symbol }) => {
      const result = removeEntry(symbol);
      return JSON.stringify(result);
    },
  });
}

const getWatchlistSchema = z.object({
  tag: z.string().optional().describe('Filter by tag (e.g., "tech", "earnings")'),
});

export function createGetWatchlistTool() {
  return new DynamicStructuredTool({
    name: 'get_watchlist',
    description: 'Get your current investment watchlist with all tracked symbols and alerts.',
    schema: getWatchlistSchema,
    func: async ({ tag }) => {
      const entries = getEntries();
      let filtered = Object.values(entries);

      if (tag) {
        filtered = filtered.filter(e => e.tags?.includes(tag));
      }

      return JSON.stringify({
        count: filtered.length,
        entries: filtered,
        message: `Found ${filtered.length} symbols in watchlist${tag ? ` tagged "${tag}"` : ''}`,
      });
    },
  });
}

const addAlertSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol'),
  type: z.enum(['above', 'below', 'percent_change']).describe('Alert type: above (price > value), below (price < value), percent_change'),
  value: z.number().describe('Threshold value (price for above/below, percentage for percent_change)'),
});

export function createAddAlertTool() {
  return new DynamicStructuredTool({
    name: 'add_watchlist_alert',
    description: 'Add a price alert to a watchlist symbol. Alerts trigger when conditions are met.',
    schema: addAlertSchema,
    func: async ({ symbol, type, value }) => {
      const result = addAlert(symbol, type, value);
      return JSON.stringify(result);
    },
  });
}

const checkAlertsSchema = z.object({
  prices: z.record(z.number()).describe('Map of symbol to current price (e.g., {"AAPL": 185.50, "TSLA": 242.30})'),
});

export function createCheckAlertsTool() {
  return new DynamicStructuredTool({
    name: 'check_watchlist_alerts',
    description: 'Check watchlist alerts against current prices and return any triggered alerts.',
    schema: checkAlertsSchema,
    func: async ({ prices }) => {
      const triggered = checkAlerts(prices);
      return JSON.stringify({
        triggeredCount: triggered.length,
        triggered,
        message: triggered.length > 0
          ? `⚠️ ${triggered.length} alert(s) triggered!`
          : 'No alerts triggered',
      });
    },
  });
}

const clearAlertSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol'),
  alertIndex: z.number().describe('Alert index to clear (get from get_watchlist response)'),
});

export function createClearAlertTool() {
  return new DynamicStructuredTool({
    name: 'clear_watchlist_alert',
    description: 'Clear/silence a triggered watchlist alert.',
    schema: clearAlertSchema,
    func: async ({ symbol, alertIndex }) => {
      const result = clearAlert(symbol, alertIndex);
      return JSON.stringify(result);
    },
  });
}

// --- Export all tools ---

export const watchlistTools = [
  createAddToWatchlistTool(),
  createRemoveFromWatchlistTool(),
  createGetWatchlistTool(),
  createAddAlertTool(),
  createCheckAlertsTool(),
  createClearAlertTool(),
];
