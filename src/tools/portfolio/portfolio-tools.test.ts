/**
 * Portfolio Tools Tests
 *
 * Tests file-based persistence, cash management, and transaction history.
 * Uses a temp directory to avoid polluting .dexter/portfolio.json.
 *
 * IMPORTANT: setDataPath must be called on the module instance BEFORE any
 * operation that calls getData(), because getData() caches _data on first
 * read. vi.resetModules() gives a fresh module instance (with _data = null),
 * so setDataPath on that instance will be the only setter it ever sees.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import type { PortfolioData } from './portfolio-tools.js';

// Shared temp dir and file path
const TEST_DIR = path.join('/tmp', `dexter-portfolio-test-${process.pid}`);
const TEST_FILE = path.join(TEST_DIR, 'portfolio.json');

function resetFile(cash = 100000): void {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  const data: PortfolioData = { positions: {}, cash, cashLedger: [], transactions: [] };
  fs.writeFileSync(TEST_FILE, JSON.stringify(data), 'utf-8');
}

beforeAll(() => resetFile());

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: get a fresh module instance with TEST_FILE set as data path.
// Call this FIRST before any data operations in each test.
// ---------------------------------------------------------------------------
async function freshModule() {
  // bun:test does not support vi.resetModules()
  // Instead, clear the module-level cache by resetting the data path
  const mod = await import('./portfolio-tools.js');
  mod.setDataPath(TEST_FILE);
  return mod;
}

describe('add_position', () => {
  beforeEach(() => resetFile());

  it('should add a position and deduct cash', async () => {
    const { addPosition, getPositions, getCash } = await freshModule();
    addPosition('AAPL', 10, 150);

    const pos = getPositions();
    expect(pos.find((p) => p.symbol === 'AAPL')?.quantity).toBe(10);
    expect(getCash()).toBe(100000 - 1500);
  });

  it('should return null when cash is insufficient', async () => {
    const { addPosition } = await freshModule();
    const result = addPosition('TSLA', 1000, 1000);
    expect(result).toBeNull();
  });

  it('should persist position to file', async () => {
    const { addPosition } = await freshModule();
    addPosition('MSFT', 5, 300);

    const raw: PortfolioData = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    expect(raw.positions.MSFT).toBeDefined();
    expect(raw.positions.MSFT.quantity).toBe(5);
  });
});

describe('remove_position', () => {
  beforeEach(() => resetFile());

  it('should remove a position and credit cash at avgCost', async () => {
    const { addPosition, removePosition, getPositions, getCash } = await freshModule();
    addPosition('NVDA', 20, 500); // costs 10000 → cash = 90000
    removePosition('NVDA');         // credits 10000 → cash = 100000

    expect(getPositions().find((p) => p.symbol === 'NVDA')).toBeUndefined();
    expect(getCash()).toBe(100000);
  });

  it('should credit at provided sell price', async () => {
    const { addPosition, removePosition, getCash } = await freshModule();
    addPosition('GOOG', 10, 100);   // costs 1000 → cash = 99000
    removePosition('GOOG', 200);    // proceeds 2000 → cash = 101000

    expect(getCash()).toBe(101000);
  });

  it('should return null for non-existent symbol', async () => {
    const { removePosition } = await freshModule();
    expect(removePosition('NOWHERE')).toBeNull();
  });
});

describe('set_cash', () => {
  beforeEach(() => resetFile());

  it('should set cash balance directly', async () => {
    const { setCash, getCash } = await freshModule();
    setCash(50000, 'Initial deposit');
    expect(getCash()).toBe(50000);
  });
});

describe('transaction history', () => {
  beforeEach(() => resetFile());

  it('should record a buy transaction', async () => {
    const { addPosition, getTransactions } = await freshModule();
    addPosition('AAPL', 10, 150);

    const txs = getTransactions(50);
    const buyTx = txs.find((t) => t.type === 'buy' && t.symbol === 'AAPL');
    expect(buyTx).toBeDefined();
    expect(buyTx!.quantity).toBe(10);
    expect(buyTx!.price).toBe(150);
    expect(buyTx!.total).toBe(1500);
  });

  it('should record a sell transaction', async () => {
    const { addPosition, removePosition, getTransactions } = await freshModule();
    addPosition('TSLA', 5, 700);
    removePosition('TSLA');

    const txs = getTransactions(50);
    const sellTx = txs.find((t) => t.type === 'sell' && t.symbol === 'TSLA');
    expect(sellTx).toBeDefined();
    expect(sellTx!.quantity).toBe(5);
  });

  it('should record an adjust transaction on quantity update', async () => {
    const { addPosition, updatePosition, getTransactions } = await freshModule();
    addPosition('META', 10, 300);
    updatePosition('META', { quantity: 15 });

    const txs = getTransactions(50);
    const adjustTx = txs.find((t) => t.type === 'adjust' && t.symbol === 'META');
    expect(adjustTx).toBeDefined();
    expect(adjustTx!.quantity).toBe(15);
  });

  it('should add a set ledger entry when cash is changed', async () => {
    const { setCash } = await freshModule();
    setCash(50000, 'Test deposit');

    const raw: PortfolioData = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    const ledgerEntry = raw.cashLedger.find((e) => e.type === 'set');
    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry!.amount).toBe(-50000); // diff from 100000 to 50000
  });

  it('should survive a simulated restart with data intact', async () => {
    // Session 1: write positions to the test file
    const { addPosition, removePosition, setCash } = await freshModule();
    setCash(50000);
    addPosition('AAPL', 10, 150);
    addPosition('GOOG', 5, 140);
    removePosition('GOOG');

    // Verify file was written correctly
    const raw: PortfolioData = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    expect(raw.positions.AAPL).toBeDefined();
    expect(raw.positions.GOOG).toBeUndefined();
    expect(raw.transactions.length).toBeGreaterThan(0);

    // Simulate restart: clear data cache then re-import
    // In bun:test, modules are cached; setDataPath(null) forces reload
    const mod2 = await import('./portfolio-tools.js');
    mod2.setDataPath(TEST_FILE);

    const positions = mod2.getPositions();
    const cash = mod2.getCash();
    const txs = mod2.getTransactions(50);

    expect(positions.find((p) => p.symbol === 'AAPL')).toBeDefined();
    expect(positions.find((p) => p.symbol === 'GOOG')).toBeUndefined();
    expect(cash).toBe(50000 - 1500 - 700 + 700); // set 50000, buy AAPL -1500, buy GOOG -700, sell GOOG +700
    expect(txs.some((t) => t.symbol === 'AAPL')).toBe(true);
  });
});

describe('cash ledger', () => {
  beforeEach(() => resetFile());

  it('should track buy as a negative ledger entry', async () => {
    const { addPosition } = await freshModule();
    addPosition('INTC', 100, 30); // costs 3000

    const raw: PortfolioData = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    const buyEntry = raw.cashLedger.find(
      (e) => e.type === 'buy' && e.note?.includes('INTC')
    );
    expect(buyEntry).toBeDefined();
    expect(buyEntry!.amount).toBe(-3000);
    expect(buyEntry!.balance).toBe(100000 - 3000);
  });

  it('should track sell as a positive ledger entry', async () => {
    const { addPosition, removePosition } = await freshModule();
    addPosition('INTC', 100, 30);
    removePosition('INTC');

    const raw: PortfolioData = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    const sellEntry = raw.cashLedger.find((e) => e.type === 'sell');
    expect(sellEntry).toBeDefined();
    expect(sellEntry!.amount).toBe(3000);
    expect(sellEntry!.balance).toBe(100000);
  });
});

describe('corrupted file recovery', () => {
  beforeEach(() => resetFile());

  it('should backup corrupted file and reset to defaults', async () => {
    // Write corrupted JSON to TEST_FILE
    fs.writeFileSync(TEST_FILE, '{ not valid json }', 'utf-8');

    const mod = await import('./portfolio-tools.js');
    // Point the fresh module at TEST_FILE so the load sees the corruption
    mod.setDataPath(TEST_FILE);

    // First call to any data accessor triggers readFromDisk → reset
    expect(mod.getCash()).toBe(100000);
    expect(mod.getPositions()).toEqual([]);

    // A backup file should have been created
    const files = fs.readdirSync(TEST_DIR);
    expect(files.some((f) => f.startsWith('portfolio.json.backup'))).toBe(true);
  });
});
