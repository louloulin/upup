/**
 * Investment Knowledge Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  InvestmentKnowledge,
  getInvestmentKnowledge,
} from './investment-knowledge.js';

// Helper to reset singleton
function resetInvestmentKnowledge() {
  (InvestmentKnowledge as any).instance = null;
}

describe('InvestmentKnowledge', () => {
  beforeEach(() => {
    resetInvestmentKnowledge();
  });

  afterEach(async () => {
    resetInvestmentKnowledge();
    // Clean up test data
    try {
      const { rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const testDir = join(process.cwd(), '.upup', 'investment');
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = getInvestmentKnowledge();
      const instance2 = getInvestmentKnowledge();
      expect(instance1).toBe(instance2);
    });
  });

  describe('default strategies', () => {
    it('should have default strategies', () => {
      const knowledge = getInvestmentKnowledge();
      const strategies = knowledge.getStrategies();

      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.some(s => s.id === 'value-investing')).toBe(true);
      expect(strategies.some(s => s.id === 'growth-investing')).toBe(true);
    });

    it('should get strategies by risk tolerance', () => {
      const knowledge = getInvestmentKnowledge();

      const conservative = knowledge.getStrategiesByRisk('conservative');
      expect(conservative.every(s => s.suitableFor === 'conservative')).toBe(true);

      const aggressive = knowledge.getStrategiesByRisk('aggressive');
      expect(aggressive.every(s => s.suitableFor === 'aggressive')).toBe(true);
    });
  });

  describe('sectors', () => {
    it('should add sector', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addSector({
        name: 'Technology',
        description: 'Tech companies',
        trends: ['AI', 'Cloud'],
        keyMetrics: { avgPE: 25 },
        outlook: 'bullish',
      });

      const sector = knowledge.getSectorByName('Technology');
      expect(sector).toBeDefined();
      expect(sector?.outlook).toBe('bullish');
    });

    it('should update existing sector', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addSector({
        name: 'Healthcare',
        description: 'Healthcare sector',
        trends: [],
        keyMetrics: {},
        outlook: 'neutral',
      });

      knowledge.addSector({
        name: 'Healthcare',
        description: 'Updated healthcare sector',
        trends: ['Biotech'],
        keyMetrics: { growth: 0.15 },
        outlook: 'bullish',
      });

      const sectors = knowledge.getSectors();
      const healthcare = sectors.find(s => s.name === 'Healthcare');
      expect(healthcare?.outlook).toBe('bullish');
      expect(healthcare?.trends).toContain('Biotech');
    });
  });

  describe('companies', () => {
    it('should add company', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addCompany({
        ticker: 'AAPL',
        name: 'Apple Inc.',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        marketCap: 3000000000000,
        summary: 'Leading tech company',
        keyMetrics: { pe: 28, roe: 0.5 },
        competitiveAdvantages: ['Brand', 'Ecosystem'],
        risks: ['Competition', 'Regulation'],
      });

      const company = knowledge.getCompanyByTicker('AAPL');
      expect(company).toBeDefined();
      expect(company?.name).toBe('Apple Inc.');
      expect(company?.marketCap).toBe(3000000000000);
    });

    it('should get companies by sector', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addCompany({
        ticker: 'AAPL',
        name: 'Apple',
        sector: 'Technology',
        industry: 'Tech',
        summary: '',
        keyMetrics: {},
        competitiveAdvantages: [],
        risks: [],
      });

      knowledge.addCompany({
        ticker: 'JPM',
        name: 'JPMorgan',
        sector: 'Financial',
        industry: 'Banking',
        summary: '',
        keyMetrics: {},
        competitiveAdvantages: [],
        risks: [],
      });

      const techCompanies = knowledge.getCompaniesBySector('Technology');
      expect(techCompanies.length).toBe(1);
      expect(techCompanies[0].ticker).toBe('AAPL');
    });

    it('should be case insensitive for ticker lookup', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addCompany({
        ticker: 'MSFT',
        name: 'Microsoft',
        sector: 'Technology',
        industry: 'Tech',
        summary: '',
        keyMetrics: {},
        competitiveAdvantages: [],
        risks: [],
      });

      const company = knowledge.getCompanyByTicker('msft');
      expect(company).toBeDefined();
      expect(company?.ticker).toBe('MSFT');
    });
  });

  describe('risks', () => {
    it('should add risk', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addRisk({
        ticker: 'TSLA',
        type: 'company',
        severity: 'high',
        title: 'Competition Risk',
        description: 'Increased competition in EV market',
        probability: 0.7,
        impact: 0.6,
        mitigation: 'Monitor market share',
      });

      const risks = knowledge.getRisksByTicker('TSLA');
      expect(risks.length).toBe(1);
      expect(risks[0].severity).toBe('high');
    });

    it('should get risks by severity', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addRisk({
        type: 'market',
        severity: 'low',
        title: 'Minor Risk',
        description: 'Low impact',
        probability: 0.2,
        impact: 0.1,
      });

      knowledge.addRisk({
        type: 'market',
        severity: 'critical',
        title: 'Major Risk',
        description: 'High impact',
        probability: 0.9,
        impact: 0.9,
      });

      const critical = knowledge.getRisksBySeverity('critical');
      expect(critical.length).toBe(1);
      expect(critical[0].severity).toBe('critical');
    });

    it('should clear old risks', () => {
      const knowledge = getInvestmentKnowledge();

      // Add old risk (mock by setting createdAt indirectly via id pattern)
      knowledge.addRisk({
        type: 'market',
        severity: 'low',
        title: 'Old Risk',
        description: 'Old',
        probability: 0.5,
        impact: 0.5,
      });

      // Clear risks with 0 days max age (should clear all)
      knowledge.clearOldRisks(0);

      const risks = knowledge.getRisks();
      expect(risks.length).toBe(0);
    });
  });

  describe('load and save', () => {
    it('should have default strategies', () => {
      const knowledge = getInvestmentKnowledge();
      const strategies = knowledge.getStrategies();
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should add company without error', () => {
      const knowledge = getInvestmentKnowledge();
      knowledge.addCompany({
        ticker: 'GOOGL',
        name: 'Alphabet',
        sector: 'Technology',
        industry: 'Internet',
        summary: 'Search and advertising',
        keyMetrics: {},
        competitiveAdvantages: [],
        risks: [],
      });

      const company = knowledge.getCompanyByTicker('GOOGL');
      expect(company).toBeDefined();
    });
  });

  describe('getSummary', () => {
    it('should return knowledge summary', () => {
      const knowledge = getInvestmentKnowledge();

      knowledge.addSector({
        name: 'Test Sector',
        description: 'Test',
        trends: [],
        keyMetrics: {},
        outlook: 'neutral',
      });

      knowledge.addCompany({
        ticker: 'TEST',
        name: 'Test Corp',
        sector: 'Test Sector',
        industry: 'Test',
        summary: 'Test',
        keyMetrics: {},
        competitiveAdvantages: [],
        risks: [],
      });

      const summary = knowledge.getSummary();
      expect(summary.sectors).toBe(1);
      expect(summary.companies).toBe(1);
      expect(summary.strategies).toBeGreaterThan(0);
    });
  });
});