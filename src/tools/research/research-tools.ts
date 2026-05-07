/**
 * Investment Research Tools
 *
 * Implements intelligent investment research capabilities:
 * - Sentiment analysis
 * - Event detection
 * - News summarization
 * - Stock insight generation
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// Sentiment keywords for basic analysis
const POSITIVE_WORDS = [
  'growth', 'profit', 'surge', 'gain', 'increase', 'beat', 'exceed',
  'upgrade', 'buy', 'strong', 'positive', 'bullish', 'opportunity',
  'breakthrough', 'innovation', 'success', 'expansion', 'recovery',
  '提升', '增长', '盈利', '超预期', '买入', '增持', '突破', '创新', '成功'
];

const NEGATIVE_WORDS = [
  'loss', 'decline', 'fall', 'drop', 'miss', 'fail', 'downgrade',
  'sell', 'weak', 'negative', 'bearish', 'risk', 'warning',
  'lawsuit', 'investigation', 'fraud', 'scandal', 'bankruptcy',
  '下降', '亏损', '下跌', '不及预期', '卖出', '减持', '风险', '警示', '调查'
];

const NEUTRAL_WORDS = [
  'maintain', 'hold', 'neutral', 'stable', 'unchanged',
  '观望', '持有', '中性', '稳定'
];

/**
 * Simple sentiment analysis
 */
export function analyzeSentiment(text: string): {
  score: number;
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  keywords: string[];
} {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  const matchedKeywords: string[] = [];

  for (const word of words) {
    if (POSITIVE_WORDS.some(pw => word.includes(pw.toLowerCase()))) {
      positiveCount++;
      matchedKeywords.push(word);
    }
    if (NEGATIVE_WORDS.some(nw => word.includes(nw.toLowerCase()))) {
      negativeCount++;
      matchedKeywords.push(word);
    }
    if (NEUTRAL_WORDS.some(nw => word.includes(nw.toLowerCase()))) {
      neutralCount++;
    }
  }

  const total = positiveCount + negativeCount + neutralCount;
  const score = total > 0 ? (positiveCount - negativeCount) / total : 0;
  const confidence = total > 0 ? Math.min(total / 10, 1) : 0;

  let label: 'positive' | 'negative' | 'neutral';
  if (score > 0.1) label = 'positive';
  else if (score < -0.1) label = 'negative';
  else label = 'neutral';

  return { score, label, confidence, keywords: [...new Set(matchedKeywords)] };
}

/**
 * Detect investment events from text
 */
export function detectEvents(text: string): Array<{
  type: string;
  description: string;
  confidence: number;
}> {
  const events: Array<{ type: string; description: string; confidence: number }> = [];
  const lowerText = text.toLowerCase();

  // Earnings events
  if (/q[1-4]|earnings|revenue|profit|营收|利润|季报|年报/.test(lowerText)) {
    events.push({ type: 'earnings', description: 'Earnings/Financial Report', confidence: 0.8 });
  }

  // M&A events
  if (/acquisition|merge|acquire|收购|并购|合并|战略合作/.test(lowerText)) {
    events.push({ type: 'ma', description: 'M&A/Strategic Deal', confidence: 0.85 });
  }

  // Regulatory events
  if (/approval|fda|sec|regulation|批准|监管|处罚|问询/.test(lowerText)) {
    events.push({ type: 'regulatory', description: 'Regulatory/Approval', confidence: 0.75 });
  }

  // Product events
  if (/launch|product|announce|发布|推出|新产品/.test(lowerText)) {
    events.push({ type: 'product', description: 'Product Launch', confidence: 0.7 });
  }

  // Management changes
  if (/ceo|cfo|cto|appointment|resign|ceo|cfo|任命|辞职|高管/.test(lowerText)) {
    events.push({ type: 'management', description: 'Management Change', confidence: 0.75 });
  }

  // Dividends/Capital events
  if (/dividend|buyback|capital|分红|回购|融资/.test(lowerText)) {
    events.push({ type: 'capital', description: 'Capital Event', confidence: 0.7 });
  }

  return events;
}

/**
 * Extract key entities from text
 */
export function extractEntities(text: string): {
  stocks: string[];
  numbers: string[];
  dates: string[];
} {
  // Stock tickers
  const stockPattern = /\b[A-Z]{2,5}\b/g;
  const potentialStocks = text.match(stockPattern) || [];

  // Common false positives
  const excludeWords = ['CEO', 'CFO', 'CTO', 'USA', 'NYSE', 'SEC', 'FDA', 'GDP', 'ETF', 'IPO'];
  const stocks = potentialStocks.filter(s => !excludeWords.includes(s));

  // Numbers with units
  const numberPattern = /[\d,]+\.?\d*%?|[\d,]+\.?\d*\s*(亿|万|美元|元)/g;
  const numbers = (text.match(numberPattern) || []).slice(0, 10);

  // Dates
  const datePattern = /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/g;
  const dates = (text.match(datePattern) || []).slice(0, 5);

  return { stocks, numbers, dates };
}

// Tool schemas
const analyzeSentimentSchema = z.object({
  text: z.string().describe('Text to analyze for sentiment'),
});

const detectEventsSchema = z.object({
  text: z.string().describe('Text to detect investment events from'),
});

const extractEntitiesSchema = z.object({
  text: z.string().describe('Text to extract entities from'),
});

/**
 * Create sentiment analysis tool
 */
export function createAnalyzeSentimentTool() {
  return new DynamicStructuredTool({
    name: 'analyze_sentiment',
    description: 'Analyze text sentiment for financial news and reports',
    schema: analyzeSentimentSchema,
    func: async ({ text }) => {
      const result = analyzeSentiment(text);

      const sentimentIcon = {
        positive: '📈',
        negative: '📉',
        neutral: '➖'
      }[result.label];

      return formatToolResult({
        type: 'Sentiment Analysis',
        sentiment: result.label,
        score: result.score.toFixed(3),
        confidence: `${(result.confidence * 100).toFixed(0)}%`,
        keywords: result.keywords.slice(0, 10),
        message: `${sentimentIcon} Sentiment: ${result.label.toUpperCase()}\nScore: ${result.score.toFixed(3)}\nConfidence: ${(result.confidence * 100).toFixed(0)}%\n${result.keywords.length > 0 ? `Keywords: ${result.keywords.slice(0, 5).join(', ')}` : ''}`,
      });
    },
  });
}

/**
 * Create event detection tool
 */
export function createDetectEventsTool() {
  return new DynamicStructuredTool({
    name: 'detect_events',
    description: 'Detect investment-related events from text',
    schema: detectEventsSchema,
    func: async ({ text }) => {
      const events = detectEvents(text);

      if (events.length === 0) {
        return formatToolResult({
          type: 'Event Detection',
          count: 0,
          message: 'No significant investment events detected.',
        });
      }

      const eventList = events
        .map(e => `  • ${e.description} (${(e.confidence * 100).toFixed(0)}% confidence)`)
        .join('\n');

      return formatToolResult({
        type: 'Event Detection',
        count: events.length,
        events: events.map(e => ({ type: e.type, description: e.description, confidence: e.confidence })),
        message: `Detected ${events.length} event(s):\n${eventList}`,
      });
    },
  });
}

/**
 * Create entity extraction tool
 */
export function createExtractEntitiesTool() {
  return new DynamicStructuredTool({
    name: 'extract_entities',
    description: 'Extract stock tickers, numbers, and dates from text',
    schema: extractEntitiesSchema,
    func: async ({ text }) => {
      const entities = extractEntities(text);

      const stocksList = entities.stocks.length > 0
        ? `Stocks: ${entities.stocks.slice(0, 10).join(', ')}`
        : 'Stocks: None found';

      const numbersList = entities.numbers.length > 0
        ? `Numbers: ${entities.numbers.slice(0, 5).join(', ')}`
        : 'Numbers: None found';

      const datesList = entities.dates.length > 0
        ? `Dates: ${entities.dates.slice(0, 5).join(', ')}`
        : 'Dates: None found';

      return formatToolResult({
        type: 'Entity Extraction',
        stocks: entities.stocks.slice(0, 10),
        numbers: entities.numbers.slice(0, 5),
        dates: entities.dates.slice(0, 5),
        message: `Extracted:\n  ${stocksList}\n  ${numbersList}\n  ${datesList}`,
      });
    },
  });
}

export const researchTools = [
  createAnalyzeSentimentTool(),
  createDetectEventsTool(),
  createExtractEntitiesTool(),
];
