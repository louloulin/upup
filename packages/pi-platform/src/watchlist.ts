export type PlatformWatchlistAlertType = 'above' | 'below' | 'percent_change';

export interface PlatformWatchlistAlert {
  readonly symbol: string;
  readonly type: PlatformWatchlistAlertType;
  readonly value: number;
  readonly referencePrice?: number;
  readonly triggered: boolean;
  readonly triggeredAt?: string;
  readonly createdAt: string;
}

export interface PlatformWatchlistEntry {
  readonly symbol: string;
  readonly addedAt: string;
  readonly notes?: string;
  readonly tags: readonly string[];
  readonly alerts: readonly PlatformWatchlistAlert[];
}

export interface PlatformWatchlistState {
  readonly schema: 1;
  readonly entries: Readonly<Record<string, PlatformWatchlistEntry>>;
  readonly updatedAt: string;
}

const MAX_ENTRIES = 1_000;
const MAX_ALERTS = 100;

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringValue(value: unknown): value is string { return typeof value === 'string'; }
function finiteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function symbolValue(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!symbol || symbol.length > 32 || /[^A-Z0-9._-]/.test(symbol)) throw new Error('symbol must contain only letters, numbers, dot, underscore, or hyphen');
  return symbol;
}

export function createInitialPlatformWatchlistState(now = new Date().toISOString()): PlatformWatchlistState {
  return { schema: 1, entries: {}, updatedAt: now };
}

export function parsePlatformWatchlistState(value: unknown): PlatformWatchlistState {
  if (!record(value) || value.schema !== 1 || !stringValue(value.updatedAt) || !record(value.entries)) return createInitialPlatformWatchlistState();
  const entries: Record<string, PlatformWatchlistEntry> = {};
  for (const [key, candidate] of Object.entries(value.entries).slice(-MAX_ENTRIES)) {
    if (!record(candidate) || !stringValue(candidate.symbol) || !stringValue(candidate.addedAt) || !Array.isArray(candidate.tags) || candidate.tags.some((tag) => !stringValue(tag)) || !Array.isArray(candidate.alerts)) continue;
    const symbol = candidate.symbol.trim().toUpperCase();
    if (!symbol || symbol !== key) continue;
    const alerts = candidate.alerts.slice(-MAX_ALERTS).filter((alert): alert is Record<string, unknown> => record(alert)).filter((alert) => stringValue(alert.symbol) && alert.symbol === symbol && ['above', 'below', 'percent_change'].includes(String(alert.type)) && finiteNumber(alert.value) && typeof alert.triggered === 'boolean' && stringValue(alert.createdAt) && (alert.referencePrice === undefined || finiteNumber(alert.referencePrice)));
    entries[symbol] = {
      symbol,
      addedAt: candidate.addedAt,
      ...(stringValue(candidate.notes) ? { notes: candidate.notes } : {}),
      tags: candidate.tags as string[],
      alerts: alerts.map((alert) => ({ symbol, type: alert.type as PlatformWatchlistAlertType, value: alert.value as number, ...(finiteNumber(alert.referencePrice) ? { referencePrice: alert.referencePrice } : {}), triggered: alert.triggered as boolean, ...(stringValue(alert.triggeredAt) ? { triggeredAt: alert.triggeredAt } : {}), createdAt: alert.createdAt as string })),
    };
  }
  return { schema: 1, entries, updatedAt: value.updatedAt };
}

function changed(state: PlatformWatchlistState, entries: Readonly<Record<string, PlatformWatchlistEntry>>, now: string): PlatformWatchlistState {
  return { schema: 1, entries, updatedAt: now };
}

export function addPlatformWatchlistEntry(state: PlatformWatchlistState, input: { symbol: string; notes?: string; tags?: readonly string[] }, now: string): { readonly state: PlatformWatchlistState; readonly added: boolean; readonly symbol: string } {
  const symbol = symbolValue(input.symbol);
  if (state.entries[symbol]) return { state, added: false, symbol };
  const entry: PlatformWatchlistEntry = { symbol, addedAt: now, ...(input.notes ? { notes: input.notes } : {}), tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 50), alerts: [] };
  return { state: changed(state, { ...state.entries, [symbol]: entry }, now), added: true, symbol };
}

export function removePlatformWatchlistEntry(state: PlatformWatchlistState, inputSymbol: string, now: string): { readonly state: PlatformWatchlistState; readonly removed: boolean; readonly symbol: string } {
  const symbol = symbolValue(inputSymbol);
  if (!state.entries[symbol]) return { state, removed: false, symbol };
  const entries = { ...state.entries };
  delete entries[symbol];
  return { state: changed(state, entries, now), removed: true, symbol };
}

export function addPlatformWatchlistAlert(state: PlatformWatchlistState, input: { symbol: string; type: PlatformWatchlistAlertType; value: number; referencePrice?: number }, now: string): { readonly state: PlatformWatchlistState; readonly added: boolean; readonly alert?: PlatformWatchlistAlert; readonly symbol: string } {
  const symbol = symbolValue(input.symbol);
  const entry = state.entries[symbol];
  if (!entry) return { state, added: false, symbol };
  if (!finiteNumber(input.value) || (input.type === 'percent_change' && input.referencePrice !== undefined && !finiteNumber(input.referencePrice))) throw new Error('alert value and reference price must be finite numbers');
  const alert: PlatformWatchlistAlert = { symbol, type: input.type, value: input.value, ...(input.referencePrice !== undefined ? { referencePrice: input.referencePrice } : {}), triggered: false, createdAt: now };
  const nextEntry = { ...entry, alerts: [...entry.alerts, alert].slice(-MAX_ALERTS) };
  return { state: changed(state, { ...state.entries, [symbol]: nextEntry }, now), added: true, alert, symbol };
}

export function checkPlatformWatchlistAlerts(state: PlatformWatchlistState, prices: Readonly<Record<string, number>>, now: string): { readonly state: PlatformWatchlistState; readonly triggered: readonly { symbol: string; alert: PlatformWatchlistAlert; currentPrice: number }[] } {
  const triggered: { symbol: string; alert: PlatformWatchlistAlert; currentPrice: number }[] = [];
  const entries: Record<string, PlatformWatchlistEntry> = { ...state.entries };
  for (const [symbol, entry] of Object.entries(state.entries)) {
    const currentPrice = prices[symbol] ?? prices[symbol.toUpperCase()];
    if (!finiteNumber(currentPrice)) continue;
    const alerts = entry.alerts.map((alert) => {
      const change = alert.referencePrice && alert.referencePrice !== 0 ? ((currentPrice - alert.referencePrice) / Math.abs(alert.referencePrice)) * 100 : undefined;
      const matches = alert.type === 'above' ? currentPrice > alert.value : alert.type === 'below' ? currentPrice < alert.value : change !== undefined && Math.abs(change) >= Math.abs(alert.value);
      if (!matches || alert.triggered) return alert;
      const next = { ...alert, triggered: true, triggeredAt: now };
      triggered.push({ symbol, alert: next, currentPrice });
      return next;
    });
    entries[symbol] = { ...entry, alerts };
  }
  return { state: triggered.length > 0 ? changed(state, entries, now) : state, triggered };
}

export function clearPlatformWatchlistAlert(state: PlatformWatchlistState, input: { symbol: string; alertIndex: number }, now: string): { readonly state: PlatformWatchlistState; readonly cleared: boolean; readonly symbol: string } {
  const symbol = symbolValue(input.symbol);
  const entry = state.entries[symbol];
  if (!entry || !Number.isInteger(input.alertIndex) || input.alertIndex < 0 || input.alertIndex >= entry.alerts.length) return { state, cleared: false, symbol };
  const alerts = entry.alerts.filter((_alert, index) => index !== input.alertIndex);
  return { state: changed(state, { ...state.entries, [symbol]: { ...entry, alerts } }, now), cleared: true, symbol };
}

export function listPlatformWatchlistEntries(state: PlatformWatchlistState, tag?: string): readonly PlatformWatchlistEntry[] {
  return Object.values(state.entries).filter((entry) => !tag || entry.tags.includes(tag)).sort((left, right) => left.addedAt.localeCompare(right.addedAt));
}

export function serializePlatformWatchlist(state: PlatformWatchlistState, format: 'csv' | 'json', includeAlerts: boolean): string {
  const entries = listPlatformWatchlistEntries(state);
  if (format === 'json') return JSON.stringify(entries, null, 2);
  const headers = includeAlerts ? ['Symbol', 'Added At', 'Notes', 'Tags', 'Alert Type', 'Alert Value', 'Reference Price', 'Alert Triggered'] : ['Symbol', 'Added At', 'Notes', 'Tags'];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows: unknown[][] = [];
  for (const entry of entries) {
    if (includeAlerts && entry.alerts.length > 0) {
      for (const alert of entry.alerts) rows.push([entry.symbol, entry.addedAt, entry.notes ?? '', entry.tags.join(';'), alert.type, alert.value, alert.referencePrice ?? '', alert.triggered]);
    } else rows.push([entry.symbol, entry.addedAt, entry.notes ?? '', entry.tags.join(';')]);
  }
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}
