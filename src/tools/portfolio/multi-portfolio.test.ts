/**
 * Multi-Portfolio Tools Tests
 *
 * Tests file-based persistence for multiple named portfolios.
 * Uses a temp directory to avoid polluting .upup/portfolios/.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

// Shared temp dir and file path
const TEST_DIR = path.join('/tmp', `upup-multiportfolio-test-${process.pid}`);
const TEST_FILE = path.join(TEST_DIR, 'index.json');

function resetFile(): void {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  const data = {
    portfolios: {
      default: {
        name: 'default',
        positions: {},
        cash: 100000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    activePortfolio: 'default',
    defaultCash: 100000,
  };
  fs.writeFileSync(TEST_FILE, JSON.stringify(data), 'utf-8');
}

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeAll(() => {
  cleanDir();
  resetFile();
});

afterAll(() => {
  cleanDir();
});

// ---------------------------------------------------------------------------
// Helper: get a fresh module instance with TEST_FILE set as data path
// ---------------------------------------------------------------------------
async function freshModule() {
  const mod = await import('./multi-portfolio.js');
  mod._setTestDataPath(TEST_FILE);
  mod._resetData(); // Clear any cached data
  return mod;
}

describe('Multi-Portfolio Operations', () => {
  beforeEach(() => resetFile());

  it('should create a new named portfolio', async () => {
    const { createPortfolio, getPortfolio } = await freshModule();
    
    const portfolio = createPortfolio('growth', 50000);
    expect(portfolio.name).toBe('growth');
    expect(portfolio.cash).toBe(50000);
    expect(getPortfolio('growth')).not.toBeNull();
  });

  it('should list all portfolios', async () => {
    const { createPortfolio, listPortfolios, getActivePortfolio } = await freshModule();
    
    createPortfolio('income', 30000);
    createPortfolio('retirement', 100000);
    
    const portfolios = listPortfolios();
    expect(portfolios.length).toBe(3); // default + income + retirement
    expect(getActivePortfolio()).toBe('retirement'); // Last created becomes active
  });

  it('should switch between portfolios', async () => {
    const { createPortfolio, setActivePortfolio, getActivePortfolio } = await freshModule();
    
    // Create a new portfolio - this sets it as active
    createPortfolio('trading', 50000);
    
    // Now we have 'default' and 'trading'
    // setActivePortfolio should work for existing portfolios
    const success = setActivePortfolio('default');
    expect(success).toBe(true);
    expect(getActivePortfolio()).toBe('default');
  });

  it('should add positions to specific portfolios', async () => {
    const { createPortfolio, addPositionToPortfolio, getPortfolio } = await freshModule();
    
    createPortfolio('aggressive', 200000);
    const success = addPositionToPortfolio('aggressive', 'AAPL', 10, 150);
    
    expect(success).toBe(true);
    const portfolio = getPortfolio('aggressive');
    expect(portfolio?.positions.AAPL).toBeDefined();
    expect(portfolio?.positions.AAPL.quantity).toBe(10);
  });

  it('should calculate portfolio P&L', async () => {
    const { createPortfolio, addPositionToPortfolio, calculatePortfolioPnL } = await freshModule();
    
    createPortfolio('tech', 50000);
    addPositionToPortfolio('tech', 'AAPL', 10, 150);
    
    const prices = new Map([['AAPL', 200]]);
    const result = calculatePortfolioPnL('tech', prices);
    
    expect(result).not.toBeNull();
    expect(result!.positions.length).toBe(1);
    expect(result!.positions[0].pnl).toBe(500); // (200 - 150) * 10 = 500
    expect(result!.positions[0].pnlPercent).toBeCloseTo(33.33, 1);
  });

  it('should remove positions from portfolios', async () => {
    const { createPortfolio, addPositionToPortfolio, removePositionFromPortfolio, getPortfolio } = await freshModule();
    
    createPortfolio('swing', 100000);
    addPositionToPortfolio('swing', 'TSLA', 5, 200);
    
    const result = removePositionFromPortfolio('swing', 'TSLA', 250);
    
    expect(result).not.toBeNull();
    expect(result!.proceeds).toBe(1250); // 5 * 250
    expect(getPortfolio('swing')?.positions.TSLA).toBeUndefined();
  });

  it('should prevent deleting the last portfolio', async () => {
    const { deletePortfolio } = await freshModule();
    
    // Trying to delete when there's only one should throw
    expect(() => deletePortfolio('default')).toThrow();
  });

  it('should allow deleting non-last portfolio', async () => {
    const { createPortfolio, deletePortfolio, listPortfolios } = await freshModule();
    
    // Create a second portfolio
    createPortfolio('extra', 50000);
    
    // Should be able to delete now (2 portfolios exist)
    const success = deletePortfolio('extra');
    expect(success).toBe(true);
    
    // Should still have 'default'
    const portfolios = listPortfolios();
    expect(portfolios.length).toBe(1);
  });

  it('should average in when adding to existing position', async () => {
    const { createPortfolio, addPositionToPortfolio, getPortfolio } = await freshModule();
    
    createPortfolio('test', 100000);
    addPositionToPortfolio('test', 'AAPL', 10, 150);  // 10 shares at $150
    addPositionToPortfolio('test', 'AAPL', 10, 200);  // 10 more at $200
    
    const position = getPortfolio('test')?.positions.AAPL;
    expect(position?.quantity).toBe(20);
    expect(position?.avgCost).toBe(175); // (1500 + 2000) / 20
  });
});

describe('Portfolio Tools', () => {
  beforeEach(() => resetFile());

  it('should create list_portfolios tool', async () => {
    const { createListPortfoliosTool } = await freshModule();
    const tool = createListPortfoliosTool();
    
    expect(tool.name).toBe('list_portfolios');
    expect(typeof tool.func).toBe('function');
  });

  it('should create create_portfolio tool', async () => {
    const { createCreatePortfolioTool } = await freshModule();
    const tool = createCreatePortfolioTool();
    
    expect(tool.name).toBe('create_portfolio');
    expect(typeof tool.func).toBe('function');
  });

  it('should export all multiPortfolioTools', async () => {
    const { multiPortfolioTools } = await import('./multi-portfolio.js');
    
    expect(multiPortfolioTools.length).toBe(7);
    const toolNames = multiPortfolioTools.map(t => t.name);
    expect(toolNames).toContain('list_portfolios');
    expect(toolNames).toContain('create_portfolio');
    expect(toolNames).toContain('delete_portfolio');
    expect(toolNames).toContain('switch_portfolio');
    expect(toolNames).toContain('add_position_multi');
    expect(toolNames).toContain('remove_position_multi');
    expect(toolNames).toContain('get_portfolio_multi');
  });
});

// ---------------------------------------------------------------------------
// v7-5 — PriceProvider integration
// ---------------------------------------------------------------------------
// 用 NullPriceProvider + 自定义 fake provider 测试价格拉取路径
import { NullPriceProvider, type PriceProvider } from './service.js';

class FakePriceProvider implements PriceProvider {
  constructor(private readonly quotes: Record<string, number>) {}
  async quote(code: string, _date: string) {
    const price = this.quotes[code.toUpperCase()];
    return price != null ? { price, name: code } : null;
  }
}

describe('v7-5 PriceProvider integration', () => {
  beforeEach(() => resetFile());

  it('setPriceProvider + __resetPriceProvider swap provider cleanly', async () => {
    const { setPriceProvider, __resetPriceProvider } = await import('./multi-portfolio.js');
    setPriceProvider(new NullPriceProvider());
    __resetPriceProvider();
    // 重置后再注入一次,确保 setter 可重复调用
    setPriceProvider(new NullPriceProvider());
    expect(true).toBe(true); // 不抛错即通过
  });

  it('get_portfolio_multi uses explicit prices when provided (backward compat)', async () => {
    const { createPortfolio, addPositionToPortfolio, createGetPortfolioMultiTool, setPriceProvider } = await freshModule();
    setPriceProvider(new NullPriceProvider());

    createPortfolio('compat', 100000);
    addPositionToPortfolio('compat', 'AAPL', 10, 150);

    const tool = createGetPortfolioMultiTool();
    const result = await tool.func({ portfolio: 'compat', prices: { AAPL: 200 } });
    const parsed = JSON.parse(result as string);

    expect(parsed.data.priceSource).toBe('explicit');
    expect(parsed.data.positions[0].currentPrice).toBe(200);
    expect(parsed.data.positions[0].pnl).toBe('500.00'); // (200-150)*10
    expect(parsed.data.summary.totalValue).toBe('$100500.00');
  });

  it('get_portfolio_multi auto-fetches from PriceProvider when no prices given', async () => {
    const { createPortfolio, addPositionToPortfolio, createGetPortfolioMultiTool, setPriceProvider } = await freshModule();
    setPriceProvider(new FakePriceProvider({ AAPL: 175, TSLA: 250 }));

    createPortfolio('live', 100000);
    addPositionToPortfolio('live', 'AAPL', 10, 150);
    addPositionToPortfolio('live', 'TSLA', 4, 200);

    const tool = createGetPortfolioMultiTool();
    const result = await tool.func({ portfolio: 'live' });
    const parsed = JSON.parse(result as string);

    expect(parsed.data.priceSource).toBe('provider');
    // 2 个 positions 都有 currentPrice
    expect(parsed.data.positions.length).toBe(2);
    const aapl = parsed.data.positions.find((p: any) => p.symbol === 'AAPL');
    expect(aapl.currentPrice).toBe(175);
    expect(aapl.pnl).toBe('250.00'); // (175-150)*10
    // 现金: 100000 - (10*150) - (4*200) = 97700
    expect(parsed.data.summary.cash).toBe('97700.00');
  });

  it('get_portfolio_multi falls back to cost-basis when provider returns null for all', async () => {
    const { createPortfolio, addPositionToPortfolio, createGetPortfolioMultiTool, setPriceProvider } = await freshModule();
    setPriceProvider(new NullPriceProvider()); // 永远返回 null

    createPortfolio('empty-prices', 100000);
    addPositionToPortfolio('empty-prices', 'AAPL', 10, 150);

    const tool = createGetPortfolioMultiTool();
    const result = await tool.func({ portfolio: 'empty-prices' });
    const parsed = JSON.parse(result as string);

    expect(parsed.data.priceSource).toBe('cost-basis');
    // 没有 currentPrice 字段
    expect(parsed.data.positions[0].currentPrice).toBeUndefined();
    expect(parsed.data.priceNote).toContain('No prices available');
  });
});