/**
 * Fund Trading & Backtest - 模拟交易与回测系统
 * 支持DCA定投、一次性投资、条件触发交易
 */

import { getFundBasic, getFundEstimatedValue } from './fund-api';

// ============================================================================
// Types
// ============================================================================

export interface SimulatedTrade {
  id: string;
  fundCode: string;
  fundName: string;
  type: 'buy' | 'sell';
  amount: number;      // 投入金额(元)
  nav: number;         // 成交净值
  shares: number;      // 购买份额
  fee: number;         // 手续费
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface PortfolioHolding {
  fundCode: string;
  fundName: string;
  shares: number;       // 持有份额
  avgCost: number;      // 平均成本价
  totalInvested: number; // 总投入
  currentNav: number;   // 当前净值
  currentValue: number;  // 当前市值
  unrealizedGain: number;  // 浮盈/亏
  unrealizedGainPercent: number;  // 浮盈/亏百分比
}

export interface Portfolio {
  id: string;
  name: string;
  cash: number;          // 现金余额
  holdings: PortfolioHolding[];
  totalValue: number;    // 总市值
  totalInvested: number; // 总投入
  totalReturn: number;   // 总收益
  totalReturnPercent: number;  // 总收益率
  dailyChange: number;   // 今日涨跌
  lastUpdated: string;
}

// ============================================================================
// Storage
// ============================================================================

const PORTFOLIO_FILE = '.upup/portfolio.json';
const TRADES_FILE = '.upup/trades.json';

interface StoredData {
  portfolio: Portfolio | null;
  trades: SimulatedTrade[];
}

function loadData(): StoredData {
  try {
    const fs = require('fs');
    if (fs.existsSync(PORTFOLIO_FILE)) {
      const data = fs.readFileSync(PORTFOLIO_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return { portfolio: null, trades: [] };
}

function saveData(data: StoredData): void {
  try {
    const fs = require('fs');
    const dir = '.upup';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

// ============================================================================
// Fee Calculation
// ============================================================================

/**
 * 计算手续费
 */
function calculateFee(amount: number, fundType?: string): number {
  let rate = 0.001;
  if (fundType === '货币型') rate = 0;
  else if (fundType === '债券型') rate = 0.0008;
  return Math.round(amount * rate * 100) / 100;
}

// ============================================================================
// Portfolio Operations
// ============================================================================

/**
 * 创建新组合
 */
export function createPortfolio(name: string, initialCash: number = 100000): Portfolio {
  const portfolio: Portfolio = {
    id: `portfolio_${Date.now()}`,
    name,
    cash: initialCash,
    holdings: [],
    totalValue: initialCash,
    totalInvested: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    dailyChange: 0,
    lastUpdated: new Date().toISOString(),
  };
  
  const data = loadData();
  data.portfolio = portfolio;
  saveData(data);
  
  return portfolio;
}

/**
 * 获取当前组合
 */
export function getPortfolio(): Portfolio | null {
  const data = loadData();
  if (!data.portfolio) return null;
  return updatePortfolioNav(data.portfolio);
}

/**
 * 更新组合净值
 */
async function updatePortfolioNav(portfolio: Portfolio): Promise<Portfolio> {
  let totalValue = portfolio.cash;
  let dailyChange = 0;
  
  for (const holding of portfolio.holdings) {
    try {
      const fund = await getFundBasic(holding.fundCode);
      const estimated = await getFundEstimatedValue(holding.fundCode);
      
      const currentNav = estimated?.estimatedUnit || fund?.netUnitValue || holding.currentNav;
      const prevNav = holding.currentNav;
      
      holding.currentNav = currentNav;
      holding.currentValue = holding.shares * currentNav;
      holding.unrealizedGain = holding.currentValue - holding.totalInvested;
      holding.unrealizedGainPercent = holding.totalInvested > 0 
        ? (holding.unrealizedGain / holding.totalInvested) * 100 
        : 0;
      
      if (prevNav && prevNav > 0) {
        const change = ((currentNav - prevNav) / prevNav) * 100;
        dailyChange += holding.currentValue * (change / 100);
      }
      
      totalValue += holding.currentValue;
    } catch (e) {
      totalValue += holding.currentValue;
    }
  }
  
  portfolio.totalValue = Math.round(totalValue * 100) / 100;
  portfolio.totalReturn = Math.round((totalValue - portfolio.totalInvested - portfolio.cash) * 100) / 100;
  portfolio.totalReturnPercent = portfolio.totalInvested > 0 
    ? (portfolio.totalReturn / portfolio.totalInvested) * 100 
    : 0;
  portfolio.dailyChange = Math.round(dailyChange * 100) / 100;
  portfolio.lastUpdated = new Date().toISOString();
  
  return portfolio;
}

/**
 * 买入基金
 */
export async function buyFund(fundCode: string, amount: number): Promise<SimulatedTrade> {
  const data = loadData();
  let portfolio = data.portfolio;
  
  if (!portfolio) {
    portfolio = createPortfolio('默认组合');
    data.portfolio = portfolio;
  }
  
  const fund = await getFundBasic(fundCode);
  const estimated = await getFundEstimatedValue(fundCode);
  const nav = estimated?.estimatedUnit || fund?.netUnitValue || 1.0;
  
  const fee = calculateFee(amount, fund?.type);
  const actualAmount = amount - fee;
  const shares = actualAmount / nav;
  
  const trade: SimulatedTrade = {
    id: `trade_${Date.now()}`,
    fundCode,
    fundName: fund?.name || fundCode,
    type: 'buy',
    amount,
    nav,
    shares,
    fee,
    timestamp: new Date().toISOString(),
    status: 'completed',
  };
  
  portfolio.cash -= amount;
  
  const existing = portfolio.holdings.find(h => h.fundCode === fundCode);
  if (existing) {
    const totalShares = existing.shares + shares;
    const totalInvested = existing.totalInvested + amount;
    existing.shares = totalShares;
    existing.avgCost = totalInvested / totalShares;
    existing.totalInvested = totalInvested;
  } else {
    portfolio.holdings.push({
      fundCode,
      fundName: fund?.name || fundCode,
      shares,
      avgCost: amount / shares,
      totalInvested: amount,
      currentNav: nav,
      currentValue: actualAmount,
      unrealizedGain: 0,
      unrealizedGainPercent: 0,
    });
  }
  
  portfolio.totalInvested += amount;
  const updatedPortfolio = await updatePortfolioNav(portfolio);
  
  data.trades.push(trade);
  data.portfolio = updatedPortfolio;
  saveData(data);
  
  return trade;
}

/**
 * 卖出基金
 */
export async function sellFund(fundCode: string, sharesToSell: number): Promise<SimulatedTrade | null> {
  const data = loadData();
  const portfolio = data.portfolio;
  
  if (!portfolio) return null;
  
  const holding = portfolio.holdings.find(h => h.fundCode === fundCode);
  if (!holding || holding.shares < sharesToSell) {
    return null;
  }
  
  const fund = await getFundBasic(fundCode);
  const estimated = await getFundEstimatedValue(fundCode);
  const nav = estimated?.estimatedUnit || fund?.netUnitValue || holding.currentNav;
  
  const amount = sharesToSell * nav;
  const fee = calculateFee(amount, fund?.type);
  const actualAmount = amount - fee;
  
  const trade: SimulatedTrade = {
    id: `trade_${Date.now()}`,
    fundCode,
    fundName: fund?.name || fundCode,
    type: 'sell',
    amount: actualAmount,
    nav,
    shares: sharesToSell,
    fee,
    timestamp: new Date().toISOString(),
    status: 'completed',
  };
  
  holding.shares -= sharesToSell;
  holding.totalInvested -= holding.avgCost * sharesToSell;
  portfolio.cash += actualAmount;
  
  if (holding.shares <= 0) {
    portfolio.holdings = portfolio.holdings.filter(h => h.fundCode !== fundCode);
  }
  
  const updatedPortfolio = await updatePortfolioNav(portfolio);
  
  data.trades.push(trade);
  data.portfolio = updatedPortfolio;
  saveData(data);
  
  return trade;
}

/**
 * 获取交易记录
 */
export function getTrades(fundCode?: string): SimulatedTrade[] {
  const data = loadData();
  if (fundCode) {
    return data.trades.filter(t => t.fundCode === fundCode);
  }
  return data.trades;
}

/**
 * 重置组合
 */
export function resetPortfolio(): void {
  saveData({ portfolio: null, trades: [] });
}
