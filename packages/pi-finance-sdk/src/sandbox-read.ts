import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SandboxPosition {
  symbol: string;
  quantity: number;
  avgCost: number;
  realizedPnL: number;
  openedAt: number;
  closedAt?: number;
}

export interface SandboxQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

export interface SandboxBalance {
  cash: number;
  marketValue: number;
  totalEquity: number;
  currency: string;
}

interface SandboxState {
  cash?: unknown;
  positions?: unknown;
}

export function sandboxStateFile(): string {
  return process.env.UPUP_SANDBOX_STATE_FILE?.trim() || join(homedir(), '.upup', 'sandbox-state.json');
}

export function sandboxQuote(symbol: string, timestamp = Date.now()): SandboxQuote {
  void symbol;
  void timestamp;
  throw new Error('sandbox quote requires an injected market-data provider');
}

function parsePosition(value: unknown): SandboxPosition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.symbol !== 'string' || typeof item.quantity !== 'number' || typeof item.avgCost !== 'number' || typeof item.realizedPnL !== 'number' || typeof item.openedAt !== 'number') return undefined;
  return {
    symbol: item.symbol,
    quantity: item.quantity,
    avgCost: item.avgCost,
    realizedPnL: item.realizedPnL,
    openedAt: item.openedAt,
    ...(typeof item.closedAt === 'number' ? { closedAt: item.closedAt } : {}),
  };
}

async function readState(stateFile = sandboxStateFile()): Promise<SandboxState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(stateFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed as SandboxState : {};
  } catch {
    return {};
  }
}

export async function sandboxPositions(stateFile?: string): Promise<SandboxPosition[]> {
  const state = await readState(stateFile);
  if (!Array.isArray(state.positions)) return [];
  const positions = state.positions.map(parsePosition).filter((position): position is SandboxPosition => Boolean(position));
  return positions.filter((position) => position.quantity !== 0);
}

export async function sandboxBalance(stateFile?: string): Promise<SandboxBalance> {
  void stateFile;
  throw new Error('sandbox balance requires an injected market-data provider');
}
