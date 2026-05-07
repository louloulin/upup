/**
 * Research Tools
 *
 * Exports investment research tools:
 * - Sentiment analysis
 * - Event detection
 * - Entity extraction
 */

export {
  researchTools,
  analyzeSentiment,
  detectEvents,
  extractEntities,
} from './research-tools.js';

export const ANALYZE_SENTIMENT_DESCRIPTION = `
Analyze sentiment of financial text.

## When to Use
- Analyzing news sentiment for a stock
- Determining market mood from reports
- Assessing positive/negative signals

## Output
Returns sentiment label (positive/negative/neutral), score, confidence, and matched keywords.
`.trim();

export const DETECT_EVENTS_DESCRIPTION = `
Detect investment-related events from text.

## When to Use
- Identifying earnings, M&A, regulatory events
- Extracting key corporate actions from announcements
- Categorizing news by event type

## Event Types
- earnings: Financial reports
- ma: Mergers & acquisitions
- regulatory: FDA, SEC, approvals
- product: Product launches
- management: CEO/CFO changes
- capital: Dividends, buybacks
`.trim();

export const EXTRACT_ENTITIES_DESCRIPTION = `
Extract financial entities from text.

## When to Use
- Finding stock tickers in news articles
- Extracting numbers and dates
- Parsing structured information from reports

## Output
Returns arrays of stock tickers, numbers (with units), and dates.
`.trim();

export const RESEARCH_TOOLS_DESCRIPTION = `
Research tools for investment analysis:
- analyze_sentiment: Sentiment analysis for financial text
- detect_events: Event detection (earnings, M&A, regulatory)
- extract_entities: Entity extraction (stocks, numbers, dates)
`.trim();
