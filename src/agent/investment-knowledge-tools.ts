/**
 * Investment Knowledge Tools
 *
 * Tools for managing investment knowledge:
 * - Strategy lookup
 * - Company profile tracking
 * - Risk assessment management
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getInvestmentKnowledge } from './investment-knowledge.js';

// ============================================================================
// Strategy Tools
// ============================================================================

export const getInvestmentStrategiesTool = new DynamicStructuredTool({
  name: 'get_investment_strategies',
  description: 'Get available investment strategies filtered by risk tolerance. Returns strategy details including parameters and expected performance metrics.',
  schema: z.object({
    riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional()
      .describe('Filter strategies by suitable risk tolerance'),
    timeHorizon: z.enum(['short', 'medium', 'long']).optional()
      .describe('Filter strategies by investment time horizon'),
  }),
  func: async ({ riskTolerance, timeHorizon }) => {
    const knowledge = getInvestmentKnowledge();
    let strategies = knowledge.getStrategies();

    if (riskTolerance) {
      strategies = strategies.filter(s => s.suitableFor === riskTolerance);
    }
    if (timeHorizon) {
      strategies = strategies.filter(s => s.timeHorizon === timeHorizon);
    }

    return JSON.stringify({
      count: strategies.length,
      strategies: strategies.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        suitableFor: s.suitableFor,
        timeHorizon: s.timeHorizon,
        parameters: s.parameters,
        performance: s.performance,
      })),
    }, null, 2);
  },
});

// ============================================================================
// Company Profile Tools
// ============================================================================

export const getCompanyProfileTool = new DynamicStructuredTool({
  name: 'get_company_profile',
  description: 'Get stored company profile including fundamentals, competitive advantages, and identified risks. Use after analyzing a company.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
  }),
  func: async ({ ticker }) => {
    const knowledge = getInvestmentKnowledge();
    const company = knowledge.getCompanyByTicker(ticker.toUpperCase());

    if (!company) {
      return JSON.stringify({ found: false, ticker: ticker.toUpperCase() });
    }

    return JSON.stringify({
      found: true,
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      marketCap: company.marketCap,
      summary: company.summary,
      keyMetrics: company.keyMetrics,
      competitiveAdvantages: company.competitiveAdvantages,
      risks: company.risks,
      lastUpdated: new Date(company.lastUpdated).toISOString(),
    }, null, 2);
  },
});

export const trackCompanyTool = new DynamicStructuredTool({
  name: 'track_company',
  description: 'Save or update company profile for future reference. Call this after completing company analysis to build investment knowledge.',
  schema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    name: z.string().describe('Company full name'),
    sector: z.string().describe('Industry sector (e.g., Technology, Healthcare)'),
    industry: z.string().describe('Specific industry (e.g., Software, Banking)'),
    marketCap: z.number().optional().describe('Market capitalization in USD'),
    summary: z.string().describe('Brief company summary'),
    keyMetrics: z.record(z.string(), z.number()).optional()
      .describe('Key financial metrics (e.g., P/E, ROE, revenue growth)'),
    competitiveAdvantages: z.array(z.string()).optional()
      .describe('List of competitive advantages'),
    risks: z.array(z.string()).optional()
      .describe('Identified company risks'),
  }),
  func: async (params) => {
    const knowledge = getInvestmentKnowledge();
    knowledge.addCompany({
      ticker: params.ticker.toUpperCase(),
      name: params.name,
      sector: params.sector,
      industry: params.industry,
      marketCap: params.marketCap,
      summary: params.summary,
      keyMetrics: params.keyMetrics ?? {},
      competitiveAdvantages: params.competitiveAdvantages ?? [],
      risks: params.risks ?? [],
    });

    return JSON.stringify({
      success: true,
      ticker: params.ticker.toUpperCase(),
      message: `Company ${params.ticker} profile saved`,
    });
  },
});

// ============================================================================
// Risk Assessment Tools
// ============================================================================

export const getRisksTool = new DynamicStructuredTool({
  name: 'get_risks',
  description: 'Get risk assessments, optionally filtered by ticker or severity. Use to review identified investment risks.',
  schema: z.object({
    ticker: z.string().optional().describe('Filter risks by company ticker'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
      .describe('Filter risks by severity level'),
    type: z.enum(['market', 'company', 'sector', 'portfolio']).optional()
      .describe('Filter risks by type'),
  }),
  func: async ({ ticker, severity, type }) => {
    const knowledge = getInvestmentKnowledge();

    let risks = ticker
      ? knowledge.getRisksByTicker(ticker)
      : knowledge.getRisks();

    if (severity) {
      risks = risks.filter(r => r.severity === severity);
    }
    if (type) {
      risks = risks.filter(r => r.type === type);
    }

    return JSON.stringify({
      count: risks.length,
      risks: risks.map(r => ({
        id: r.id,
        ticker: r.ticker,
        type: r.type,
        severity: r.severity,
        title: r.title,
        description: r.description,
        probability: r.probability,
        impact: r.impact,
        mitigation: r.mitigation,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    }, null, 2);
  },
});

export const trackRiskTool = new DynamicStructuredTool({
  name: 'track_risk',
  description: 'Record an identified investment risk for tracking. Use after risk analysis to document findings.',
  schema: z.object({
    ticker: z.string().optional().describe('Related company ticker'),
    type: z.enum(['market', 'company', 'sector', 'portfolio'])
      .describe('Risk category'),
    severity: z.enum(['low', 'medium', 'high', 'critical'])
      .describe('Risk severity level'),
    title: z.string().describe('Short risk title'),
    description: z.string().describe('Detailed risk description'),
    probability: z.number().min(0).max(1).describe('Probability of occurrence (0-1)'),
    impact: z.number().min(0).max(1).describe('Potential impact (0-1)'),
    mitigation: z.string().optional().describe('Risk mitigation strategy'),
  }),
  func: async (params) => {
    const knowledge = getInvestmentKnowledge();
    knowledge.addRisk({
      ticker: params.ticker?.toUpperCase(),
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description,
      probability: params.probability,
      impact: params.impact,
      mitigation: params.mitigation,
    });

    return JSON.stringify({
      success: true,
      riskId: `risk-${Date.now()}`,
      message: `Risk "${params.title}" tracked`,
    });
  },
});

// ============================================================================
// Sector Tools
// ============================================================================

export const getSectorsTool = new DynamicStructuredTool({
  name: 'get_sectors',
  description: 'Get sector analysis including trends, outlook, and key metrics.',
  schema: z.object({
    name: z.string().optional().describe('Specific sector name to lookup'),
  }),
  func: async ({ name }) => {
    const knowledge = getInvestmentKnowledge();

    if (name) {
      const sector = knowledge.getSectorByName(name);
      if (!sector) {
        return JSON.stringify({ found: false, sector: name });
      }
      return JSON.stringify({
        found: true,
        sector: {
          name: sector.name,
          description: sector.description,
          trends: sector.trends,
          keyMetrics: sector.keyMetrics,
          outlook: sector.outlook,
          lastUpdated: new Date(sector.lastUpdated).toISOString(),
        },
      }, null, 2);
    }

    const sectors = knowledge.getSectors();
    return JSON.stringify({
      count: sectors.length,
      sectors: sectors.map(s => ({
        name: s.name,
        description: s.description,
        trends: s.trends,
        outlook: s.outlook,
      })),
    }, null, 2);
  },
});

export const trackSectorTool = new DynamicStructuredTool({
  name: 'track_sector',
  description: 'Save or update sector analysis including trends and outlook.',
  schema: z.object({
    name: z.string().describe('Sector name (e.g., Technology, Healthcare)'),
    description: z.string().describe('Sector description'),
    trends: z.array(z.string()).describe('Current sector trends'),
    keyMetrics: z.record(z.string(), z.number()).optional()
      .describe('Key sector metrics'),
    outlook: z.enum(['bullish', 'bearish', 'neutral'])
      .describe('Sector outlook'),
  }),
  func: async (params) => {
    const knowledge = getInvestmentKnowledge();
    knowledge.addSector({
      name: params.name,
      description: params.description,
      trends: params.trends,
      keyMetrics: params.keyMetrics ?? {},
      outlook: params.outlook,
    });

    return JSON.stringify({
      success: true,
      sector: params.name,
      message: `Sector ${params.name} analysis saved`,
    });
  },
});

// ============================================================================
// Knowledge Summary Tool
// ============================================================================

export const getKnowledgeSummaryTool = new DynamicStructuredTool({
  name: 'get_knowledge_summary',
  description: 'Get summary of investment knowledge including counts of tracked companies, sectors, strategies, and risks.',
  schema: z.object({}),
  func: async () => {
    const knowledge = getInvestmentKnowledge();
    const summary = knowledge.getSummary();
    const strategies = knowledge.getStrategies();

    return JSON.stringify({
      investmentKnowledge: {
        companies: summary.companies,
        sectors: summary.sectors,
        strategies: summary.strategies,
        risks: summary.risks,
        lastSync: summary.lastSync ? new Date(summary.lastSync).toISOString() : null,
      },
      availableStrategies: strategies.map(s => ({
        id: s.id,
        name: s.name,
        suitableFor: s.suitableFor,
      })),
    }, null, 2);
  },
});

// ============================================================================
// Export all tools
// ============================================================================

export const investmentKnowledgeTools = [
  getInvestmentStrategiesTool,
  getCompanyProfileTool,
  trackCompanyTool,
  getRisksTool,
  trackRiskTool,
  getSectorsTool,
  trackSectorTool,
  getKnowledgeSummaryTool,
];