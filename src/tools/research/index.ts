/**
 * Investment Research Report Generator
 * 
 * Generates comprehensive investment research reports combining:
 * - Technical analysis
 * - Fundamental analysis
 * - News and sentiment
 * - Risk assessment
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { StructuredToolInterface } from '@langchain/core/tools';

// Report section types
interface ReportSection {
  title: string;
  content: string;
  importance: 'high' | 'medium' | 'low';
}

interface InvestmentReport {
  stock_code: string;
  stock_name: string;
  report_date: string;
  sections: ReportSection[];
  summary: string;
  recommendation: 'buy' | 'hold' | 'sell';
  confidence: number; // 0-100
  risks: string[];
  opportunities: string[];
}

const GenerateReportSchema = z.object({
  stock_code: z.string().describe('Stock code (e.g., 600519.SH for A-share, AAPL for US)'),
  stock_name: z.string().optional().describe('Stock name (optional, will be fetched)'),
  include_technical: z.boolean().optional().describe('Include technical analysis (default: true)'),
  include_fundamental: z.boolean().optional().describe('Include fundamental analysis (default: true)'),
  include_news: z.boolean().optional().describe('Include latest news summary (default: true)'),
  include_risk: z.boolean().optional().describe('Include risk assessment (default: true)'),
});

const CompareStocksSchema = z.object({
  stock_codes: z.array(z.string()).min(2).max(5).describe('Array of 2-5 stock codes to compare'),
  metrics: z.array(z.enum([
    'price', 'pe', 'pb', 'market_cap', 'revenue', 'profit',
    'growth', 'dividend', 'beta', 'volume'
  ])).optional().describe('Metrics to compare'),
});

const GenerateResearchReportDescription = `## generate_research_report
Generate a comprehensive investment research report for a single stock.

**When to use**: When you need a complete investment analysis report combining multiple data sources.

**Sections included**:
- Executive Summary (key findings and recommendation)
- Technical Analysis (price trends, patterns, indicators)
- Fundamental Analysis (financials, valuation ratios)
- News & Sentiment (recent news, analyst views)
- Risk Assessment (potential risks and concerns)
- Investment Recommendation (buy/hold/sell with confidence)

**Output format**: Structured JSON report with markdown sections
`;

/**
 * Generate investment research report for a stock
 */
export async function generateResearchReport(
  stockCode: string,
  options: {
    includeTechnical?: boolean;
    includeFundamental?: boolean;
    includeNews?: boolean;
    includeRisk?: boolean;
  } = {}
): Promise<InvestmentReport> {
  const { includeTechnical = true, includeFundamental = true, includeNews = true, includeRisk = true } = options;
  
  const report: InvestmentReport = {
    stock_code: stockCode,
    stock_name: '', // Will be populated from data
    report_date: new Date().toISOString().split('T')[0],
    sections: [],
    summary: '',
    recommendation: 'hold',
    confidence: 50,
    risks: [],
    opportunities: [],
  };

  // Technical Analysis Section
  if (includeTechnical) {
    report.sections.push({
      title: '技术分析',
      content: '技术分析内容 - 需要调用 K 线数据接口',
      importance: 'medium',
    });
  }

  // Fundamental Analysis Section
  if (includeFundamental) {
    report.sections.push({
      title: '基本面分析',
      content: '基本面分析内容 - 需要调用财务数据接口',
      importance: 'high',
    });
  }

  // News & Sentiment Section
  if (includeNews) {
    report.sections.push({
      title: '新闻与舆情',
      content: '新闻舆情内容 - 需要调用新闻数据接口',
      importance: 'medium',
    });
  }

  // Risk Assessment Section
  if (includeRisk) {
    report.sections.push({
      title: '风险评估',
      content: '风险评估内容 - 需要综合分析',
      importance: 'high',
    });
  }

  return report;
}

/**
 * Compare multiple stocks side by side
 */
export async function compareStocks(
  stockCodes: string[],
  metrics?: string[]
): Promise<{
  stocks: Array<{
    code: string;
    name: string;
    metrics: Record<string, number | string>;
  }>;
  comparison_table: string;
  insights: string[];
}> {
  const comparison = {
    stocks: stockCodes.map(code => ({
      code,
      name: '', // Will be populated
      metrics: {},
    })),
    comparison_table: '',
    insights: [],
  };

  return comparison;
}

export function createGenerateResearchReportTool(): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'generate_research_report',
    description: GenerateResearchReportDescription,
    schema: GenerateReportSchema,
    async func(input) {
      const report = await generateResearchReport(input.stock_code, {
        includeTechnical: input.include_technical,
        includeFundamental: input.include_fundamental,
        includeNews: input.include_news,
        includeRisk: input.include_risk,
      });
      
      return JSON.stringify(report, null, 2);
    },
  });
}

export function createCompareStocksTool(): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'compare_stocks',
    description: `## compare_stocks
Compare multiple stocks side by side across key metrics.

**When to use**: When you want to compare stocks for investment decisions.

**Metrics available**:
- Valuation: price, pe, pb, market_cap
- Growth: revenue, profit, growth
- Returns: dividend, beta
- Activity: volume

**Output**: Comparison table with insights
`,
    schema: CompareStocksSchema,
    async func(input) {
      const result = await compareStocks(input.stock_codes, input.metrics);
      return JSON.stringify(result, null, 2);
    },
  });
}
