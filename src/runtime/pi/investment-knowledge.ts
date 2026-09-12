/**
 * Investment Knowledge — Investment-specific knowledge structures for UpUp
 *
 * Provides structured investment knowledge:
 * - Sector analysis
 * - Company profiles
 * - Investment strategies
 * - Risk assessments
 *
 * This extends the existing memory system with investment-specific knowledge.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getUpupDir } from '../../utils/paths.js';
import { info, warn } from '../../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Sector analysis record
 */
export interface SectorAnalysis {
  id: string;
  name: string;
  description: string;
  trends: string[];
  keyMetrics: Record<string, number>;
  outlook: 'bullish' | 'bearish' | 'neutral';
  lastUpdated: number;
}

/**
 * Company profile
 */
export interface CompanyProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap?: number;
  summary: string;
  keyMetrics: Record<string, number>;
  competitiveAdvantages: string[];
  risks: string[];
  lastUpdated: number;
}

/**
 * Investment strategy
 */
export interface InvestmentStrategy {
  id: string;
  name: string;
  description: string;
  suitableFor: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon: 'short' | 'medium' | 'long';
  minCapital?: number;
  parameters: Record<string, unknown>;
  performance?: {
    sharpe?: number;
    maxDrawdown?: number;
    winRate?: number;
  };
}

/**
 * Risk assessment
 */
export interface RiskAssessment {
  id: string;
  ticker?: string;
  type: 'market' | 'company' | 'sector' | 'portfolio';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  probability: number;
  impact: number;
  mitigation?: string;
  createdAt: number;
}

/**
 * Investment knowledge state
 */
export interface InvestmentKnowledgeState {
  sectors: SectorAnalysis[];
  companies: CompanyProfile[];
  strategies: InvestmentStrategy[];
  risks: RiskAssessment[];
  lastSync: number;
}

// ============================================================================
// Default Strategies
// ============================================================================

const DEFAULT_STRATEGIES: InvestmentStrategy[] = [
  {
    id: 'value-investing',
    name: 'Value Investing',
    description: 'Buy undervalued companies with strong fundamentals at a discount to intrinsic value',
    suitableFor: 'conservative',
    timeHorizon: 'long',
    parameters: {
      minDiscount: 0.2,
      minYears: 5,
      metrics: ['P/E', 'P/B', 'P/S', 'EV/EBITDA'],
    },
    performance: {
      sharpe: 0.8,
      maxDrawdown: 0.3,
    },
  },
  {
    id: 'growth-investing',
    name: 'Growth Investing',
    description: 'Invest in high-growth companies with expanding revenues and market opportunity',
    suitableFor: 'aggressive',
    timeHorizon: 'medium',
    parameters: {
      minRevenueGrowth: 0.2,
      minMarketCap: 1_000_000_000,
      targetMarket: 'large',
    },
    performance: {
      sharpe: 0.7,
      maxDrawdown: 0.5,
    },
  },
  {
    id: 'dividend-growth',
    name: 'Dividend Growth',
    description: 'Focus on companies with sustainable, growing dividend payments',
    suitableFor: 'moderate',
    timeHorizon: 'long',
    parameters: {
      minDividendYield: 0.02,
      minDividendGrowth: 0.05,
      minYearsOfGrowth: 5,
    },
    performance: {
      sharpe: 0.9,
      maxDrawdown: 0.25,
    },
  },
  {
    id: 'momentum',
    name: 'Momentum',
    description: 'Buy assets with recent strong performance, expecting continued outperformance',
    suitableFor: 'aggressive',
    timeHorizon: 'short',
    parameters: {
      lookbackPeriod: 90,
      rebalanceFrequency: 'monthly',
    },
    performance: {
      sharpe: 0.6,
      maxDrawdown: 0.4,
    },
  },
  {
    id: 'index-investing',
    name: 'Index Investing',
    description: 'Passive investment in broad market indices for diversified exposure',
    suitableFor: 'conservative',
    timeHorizon: 'long',
    parameters: {
      index: 'S&P 500',
      expenseRatio: 0.0003,
      reinvestDividends: true,
    },
    performance: {
      sharpe: 0.75,
      maxDrawdown: 0.35,
    },
  },
];

// ============================================================================
// Investment Knowledge Manager
// ============================================================================

const KNOWLEDGE_DIR = 'investment';

export class InvestmentKnowledge {
  private static instance: InvestmentKnowledge | null = null;
  private state: InvestmentKnowledgeState;
  private dirty = false;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.state = this.createDefaultState();
  }

  static getInstance(): InvestmentKnowledge {
    if (!InvestmentKnowledge.instance) {
      InvestmentKnowledge.instance = new InvestmentKnowledge();
    }
    return InvestmentKnowledge.instance;
  }

  /**
   * Load knowledge from disk
   */
  async load(): Promise<void> {
    try {
      const statePath = this.getStatePath();
      const content = await readFile(statePath, 'utf-8');
      const loaded = JSON.parse(content) as Partial<InvestmentKnowledgeState>;
      this.state = {
        ...this.createDefaultState(),
        ...loaded,
        strategies: loaded.strategies?.length
          ? loaded.strategies
          : DEFAULT_STRATEGIES,
      };
      info('agent', `Loaded investment knowledge: ${this.state.companies.length} companies, ${this.state.sectors.length} sectors`);
    } catch {
      info('agent', 'No existing investment knowledge, using defaults');
      this.state.strategies = DEFAULT_STRATEGIES;
    }
  }

  /**
   * Save knowledge to disk (auto-saves with debounce)
   */
  async save(): Promise<void> {
    this.scheduleSave();
  }

  /**
   * Immediately save (bypass debounce)
   */
  async saveNow(): Promise<void> {
    if (!this.dirty) return;

    try {
      await this.ensureDirectoryExists();
      const statePath = this.getStatePath();
      await writeFile(statePath, JSON.stringify(this.state, null, 2), 'utf-8');
      this.dirty = false;
      info('agent', 'Investment knowledge saved');
    } catch (e) {
      warn('agent', `Failed to save investment knowledge: ${e}`);
    }
  }

  private scheduleSave(): void {
    if (this.autoSaveTimer) return;
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveNow().catch(() => {});
    }, 500);
  }

  // --------------------------------------------------------------------------
  // Sectors
  // --------------------------------------------------------------------------

  /**
   * Add or update sector analysis
   */
  addSector(sector: Omit<SectorAnalysis, 'id' | 'lastUpdated'>): void {
    const existing = this.state.sectors.find(s => s.name === sector.name);
    if (existing) {
      Object.assign(existing, sector, { lastUpdated: Date.now() });
    } else {
      this.state.sectors.push({
        ...sector,
        id: `sector-${Date.now()}`,
        lastUpdated: Date.now(),
      });
    }
    this.dirty = true;
  }

  /**
   * Get all sectors
   */
  getSectors(): SectorAnalysis[] {
    return [...this.state.sectors];
  }

  /**
   * Get sector by name
   */
  getSectorByName(name: string): SectorAnalysis | undefined {
    return this.state.sectors.find(s =>
      s.name.toLowerCase() === name.toLowerCase()
    );
  }

  // --------------------------------------------------------------------------
  // Companies
  // --------------------------------------------------------------------------

  /**
   * Add or update company profile
   */
  addCompany(company: Omit<CompanyProfile, 'lastUpdated'>): void {
    const existing = this.state.companies.find(c =>
      c.ticker.toUpperCase() === company.ticker.toUpperCase()
    );
    if (existing) {
      Object.assign(existing, company, { lastUpdated: Date.now() });
    } else {
      this.state.companies.push({
        ...company,
        lastUpdated: Date.now(),
      });
    }
    this.dirty = true;
  }

  /**
   * Get all companies
   */
  getCompanies(): CompanyProfile[] {
    return [...this.state.companies];
  }

  /**
   * Get company by ticker
   */
  getCompanyByTicker(ticker: string): CompanyProfile | undefined {
    return this.state.companies.find(c =>
      c.ticker.toUpperCase() === ticker.toUpperCase()
    );
  }

  /**
   * Get companies by sector
   */
  getCompaniesBySector(sector: string): CompanyProfile[] {
    return this.state.companies.filter(c =>
      c.sector.toLowerCase() === sector.toLowerCase()
    );
  }

  // --------------------------------------------------------------------------
  // Strategies
  // --------------------------------------------------------------------------

  /**
   * Get all strategies
   */
  getStrategies(): InvestmentStrategy[] {
    return [...this.state.strategies];
  }

  /**
   * Get strategy by ID
   */
  getStrategyById(id: string): InvestmentStrategy | undefined {
    return this.state.strategies.find(s => s.id === id);
  }

  /**
   * Get strategies suitable for risk tolerance
   */
  getStrategiesByRisk(risk: 'conservative' | 'moderate' | 'aggressive'): InvestmentStrategy[] {
    return this.state.strategies.filter(s => s.suitableFor === risk);
  }

  /**
   * Add custom strategy
   */
  addStrategy(strategy: InvestmentStrategy): void {
    const existing = this.state.strategies.findIndex(s => s.id === strategy.id);
    if (existing >= 0) {
      this.state.strategies[existing] = strategy;
    } else {
      this.state.strategies.push(strategy);
    }
    this.dirty = true;
  }

  // --------------------------------------------------------------------------
  // Risks
  // --------------------------------------------------------------------------

  /**
   * Add risk assessment
   */
  addRisk(risk: Omit<RiskAssessment, 'id' | 'createdAt'>): void {
    this.state.risks.push({
      ...risk,
      id: `risk-${Date.now()}`,
      createdAt: Date.now(),
    });
    this.dirty = true;
  }

  /**
   * Get all risks
   */
  getRisks(): RiskAssessment[] {
    return [...this.state.risks];
  }

  /**
   * Get risks by ticker
   */
  getRisksByTicker(ticker: string): RiskAssessment[] {
    return this.state.risks.filter(r =>
      r.ticker?.toUpperCase() === ticker.toUpperCase()
    );
  }

  /**
   * Get risks by severity
   */
  getRisksBySeverity(severity: RiskAssessment['severity']): RiskAssessment[] {
    return this.state.risks.filter(r => r.severity === severity);
  }

  /**
   * Clear old risks
   */
  clearOldRisks(maxAgeDays = 30): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const before = this.state.risks.length;
    this.state.risks = this.state.risks.filter(r => r.createdAt > cutoff);
    if (this.state.risks.length !== before) {
      this.dirty = true;
    }
  }

  // --------------------------------------------------------------------------
  // Query
  // --------------------------------------------------------------------------

  /**
   * Get knowledge summary
   */
  getSummary(): {
    sectors: number;
    companies: number;
    strategies: number;
    risks: number;
    lastSync: number;
  } {
    return {
      sectors: this.state.sectors.length,
      companies: this.state.companies.length,
      strategies: this.state.strategies.length,
      risks: this.state.risks.length,
      lastSync: this.state.lastSync,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private createDefaultState(): InvestmentKnowledgeState {
    return {
      sectors: [],
      companies: [],
      strategies: DEFAULT_STRATEGIES,
      risks: [],
      lastSync: 0,
    };
  }

  private getStatePath(): string {
    return join(getUpupDir(), KNOWLEDGE_DIR, 'knowledge.json');
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = join(getUpupDir(), KNOWLEDGE_DIR);
    await mkdir(dir, { recursive: true });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function getInvestmentKnowledge(): InvestmentKnowledge {
  return InvestmentKnowledge.getInstance();
}

export async function loadInvestmentKnowledge(): Promise<void> {
  const knowledge = InvestmentKnowledge.getInstance();
  await knowledge.load();
}

export async function saveInvestmentKnowledge(): Promise<void> {
  const knowledge = InvestmentKnowledge.getInstance();
  await knowledge.saveNow();
}
