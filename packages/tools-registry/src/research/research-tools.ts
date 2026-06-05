/**
 * Investment Research Tools — Investment-Grade Pipeline
 *
 * Implements intelligent investment research capabilities:
 * - Deep sentiment analysis (negation-aware, section-weighted, per-sentence)
 * - Fast keyword pre-filter (quickSentimentScan) as fallback
 * - Sophisticated event detection with value extraction and severity
 * - Multi-lingual entity extraction (US tickers, Chinese stocks, units)
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ---------------------------------------------------------------------------
// Shared keyword dictionaries (used by quickSentimentScan)
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = [
  'growth', 'profit', 'surge', 'gain', 'increase', 'beat', 'exceed',
  'upgrade', 'buy', 'strong', 'positive', 'bullish', 'opportunity',
  'breakthrough', 'innovation', 'success', 'expansion', 'recovery',
  'outperform', 'raise', 'raised', 'raised guidance', 'record high',
  'all-time high', 'above consensus', 'top line growth', 'margin expansion',
  '提升', '增长', '盈利', '超预期', '买入', '增持', '突破', '创新', '成功',
  '新高', '超市场预期', '上调', '业绩亮眼', '大幅增长',
];

const NEGATIVE_WORDS = [
  'loss', 'decline', 'fall', 'drop', 'miss', 'fail', 'downgrade',
  'sell', 'weak', 'negative', 'bearish', 'risk', 'warning',
  'lawsuit', 'investigation', 'fraud', 'scandal', 'bankruptcy',
  'underperform', 'cut', 'lowered', 'lowered guidance', 'record low',
  'below consensus', 'margin compression', 'write-down', 'impairment',
  '下降', '亏损', '下跌', '不及预期', '卖出', '减持', '风险', '警示', '调查',
  '新低', '低于预期', '下调', '业绩下滑', '大幅下跌', '爆雷',
];

const NEUTRAL_WORDS = [
  'maintain', 'hold', 'neutral', 'stable', 'unchanged', 'in-line',
  '观望', '持有', '中性', '稳定',
];

// ---------------------------------------------------------------------------
// Negation patterns (English + Chinese)
// ---------------------------------------------------------------------------

const NEGATION_PATTERNS_EN: RegExp[] = [
  /\bnot\b\s+(?:so\s+)?(?:very\s+)?(?:good|great|positive|bullish|strong|optimistic|encouraging)/i,
  /\bfailed?\s+to\s+(?:meet|beat|reach|achieve|deliver)/i,
  /\bfell?\s+short\s+of/i,
  /\b(?:was|is|were|are)\s+(?:far\s+)?below/i,
  /\bno\s+(?:growth|improvement|recovery|upside)/i,
  /\b(?:despite|in spite of)\s+(?:strong|good|positive)/i,
  /\b(?:hardly|barely|rarely)\s+(?:any|grew|improved)/i,
  /\bunderperform(?:ed|s|ing)?\b/i,
  /\bdid\s+not\s+(?:meet|beat|reach|improve|grow)/i,
  /\b(?:worse|poorer|weaker)\s+than\s+(?:expected|anticipated|forecast)/i,
  /\bmissed?\s+(?:earnings|revenue|estimate|target|expectation)/i,
  /\bconcern(?:s|ed|ing)?\s+(?:about|over|regarding)/i,
];

const NEGATION_PATTERNS_ZH: RegExp[] = [
  /未能(?:达到|完成|实现|交付)/,
  /不及预期/,
  /低于(?:预期|市场预期|分析师预期)/,
  /没有(?:增长|改善|恢复)/,
  /增长(?:乏力|放缓|停滞)/,
  /不及(?:去年同期|上季度)/,
  /面临(?:困难|挑战|压力)/,
  /业绩(?:下滑|衰退|低迷)/,
];

// ---------------------------------------------------------------------------
// Financial-context signals — high-weight phrases that dominate sentiment
// ---------------------------------------------------------------------------

const FINANCIAL_POSITIVE_SIGNALS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /beat(?:s|ing)?\s+(?:earnings|revenue|estimate|consensus|expectation)/i, weight: 3, label: 'beat estimate' },
  { pattern: /(?:revenue|sales|profit|earnings)\s+(?:surged|jumped|climbed|soared)/i, weight: 3, label: 'strong growth' },
  { pattern: /raised?\s+(?:guidance|outlook|forecast|target)/i, weight: 2.5, label: 'raised guidance' },
  { pattern: /(?:record|all-time)\s+(?:high|quarter|revenue|sales|profit)/i, weight: 3, label: 'record high' },
  { pattern: /(?:above|topped?)\s+(?:consensus|estimate|analyst|expectation)/i, weight: 2.5, label: 'above consensus' },
  { pattern: /margin\s+expansion/i, weight: 2, label: 'margin expansion' },
  { pattern: /(?:upgrade[d]?|initiated)\s+(?:to\s+)?(?:buy|overweight|outperform)/i, weight: 2, label: 'analyst upgrade' },
  { pattern: /超出(?:预期|市场预期|分析师预期)/, weight: 3, label: '超出预期' },
  { pattern: /(?:营收|利润|净利|收入)\s*(?:大[幅增]|暴增|翻[倍番])/, weight: 3, label: '业绩暴增' },
  { pattern: /上调(?:评级|目标价|盈利预测)/, weight: 2.5, label: '上调评级' },
  { pattern: /创(?:历史|年内|季度)\s*(?:新高|最高)/, weight: 3, label: '创新高' },
];

const FINANCIAL_NEGATIVE_SIGNALS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /missed?\s+(?:earnings|revenue|estimate|consensus|expectation)/i, weight: 3, label: 'missed estimate' },
  { pattern: /(?:revenue|sales|profit|earnings)\s+(?:plunged|tumbled|collapsed|cratered)/i, weight: 3, label: 'sharp decline' },
  { pattern: /(?:lowered|cut|reduced)\s+(?:guidance|outlook|forecast|target)/i, weight: 2.5, label: 'lowered guidance' },
  { pattern: /(?:record|all-time)\s+low/i, weight: 3, label: 'record low' },
  { pattern: /(?:below|missed?)\s+(?:consensus|estimate|analyst|expectation)/i, weight: 2.5, label: 'below consensus' },
  { pattern: /margin\s+(?:compression|decline|shrink)/i, weight: 2, label: 'margin compression' },
  { pattern: /(?:downgrade[d]?)\s+(?:to\s+)?(?:sell|underweight|underperform)/i, weight: 2, label: 'analyst downgrade' },
  { pattern: /(?:write-?down|impairment|restructuring)\s+(?:charge|cost|loss)/i, weight: 2, label: 'write-down' },
  { pattern: /(?:file[d]?\s+for|declared|entered)\s+bankruptcy/i, weight: 4, label: 'bankruptcy' },
  { pattern: /不及(?:预期|市场预期)/, weight: 3, label: '不及预期' },
  { pattern: /(?:营收|利润|净利|收入)\s*(?:下滑|暴跌|大[幅跌]降|腰斩)/, weight: 3, label: '业绩暴跌' },
  { pattern: /下调(?:评级|目标价|盈利预测)/, weight: 2.5, label: '下调评级' },
  { pattern: /(?:爆雷|暴雷|违约|退市)/, weight: 4, label: '重大风险事件' },
];

// ---------------------------------------------------------------------------
// 1. quickSentimentScan — fast keyword pre-filter (formerly analyzeSentiment)
// ---------------------------------------------------------------------------

/**
 * Fast keyword-based sentiment scan. Useful as a pre-filter or fallback when
 * deep analysis is not required.
 */
export function quickSentimentScan(text: string): {
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

// Backward-compatible alias
export const analyzeSentiment = quickSentimentScan;

// ---------------------------------------------------------------------------
// 2. deepSentimentAnalysis — negation-aware, section-weighted, per-sentence
// ---------------------------------------------------------------------------

/**
 * Split text into headline (first line or first 120 chars) and body.
 */
function splitHeadlineBody(text: string): { headline: string; body: string } {
  const firstNewline = text.indexOf('\n');
  if (firstNewline > 0 && firstNewline <= 200) {
    return {
      headline: text.slice(0, firstNewline).trim(),
      body: text.slice(firstNewline + 1).trim(),
    };
  }
  if (text.length > 120) {
    // Try to split at last space before 120
    const cut = text.lastIndexOf(' ', 120);
    return {
      headline: text.slice(0, cut > 0 ? cut : 120).trim(),
      body: text.slice(cut > 0 ? cut + 1 : 120).trim(),
    };
  }
  return { headline: text, body: '' };
}

/**
 * Check whether a sentence contains a negation pattern that would flip its
 * apparent sentiment.
 */
function detectNegation(sentence: string): { negated: boolean; pattern?: string } {
  for (const p of NEGATION_PATTERNS_EN) {
    if (p.test(sentence)) return { negated: true, pattern: p.source };
  }
  for (const p of NEGATION_PATTERNS_ZH) {
    if (p.test(sentence)) return { negated: true, pattern: p.source };
  }
  return { negated: false };
}

/**
 * Score a single sentence. Returns a raw score in [-1, 1] and the detected
 * financial signals.
 */
function scoreSentence(
  sentence: string,
): { score: number; signals: Array<{ label: string; weight: number; polarity: 'positive' | 'negative' }> } {
  let rawScore = 0;
  const signals: Array<{ label: string; weight: number; polarity: 'positive' | 'negative' }> = [];

  // 1. Check high-weight financial signals first
  for (const sig of FINANCIAL_POSITIVE_SIGNALS) {
    if (sig.pattern.test(sentence)) {
      rawScore += sig.weight * 0.25; // normalise so weight 4 ≈ +1
      signals.push({ label: sig.label, weight: sig.weight, polarity: 'positive' });
    }
  }
  for (const sig of FINANCIAL_NEGATIVE_SIGNALS) {
    if (sig.pattern.test(sentence)) {
      rawScore -= sig.weight * 0.25;
      signals.push({ label: sig.label, weight: sig.weight, polarity: 'negative' });
    }
  }

  // 2. Keyword scan (only if no financial signals dominated)
  if (signals.length === 0) {
    const lower = sentence.toLowerCase();
    let pCount = 0;
    let nCount = 0;
    for (const w of POSITIVE_WORDS) {
      if (lower.includes(w.toLowerCase())) pCount++;
    }
    for (const w of NEGATIVE_WORDS) {
      if (lower.includes(w.toLowerCase())) nCount++;
    }
    const kwTotal = pCount + nCount;
    if (kwTotal > 0) {
      rawScore += (pCount - nCount) / kwTotal * 0.5;
    }
  }

  // 3. Negation flip
  const { negated } = detectNegation(sentence);
  if (negated) rawScore *= -0.75; // flip and slightly dampen (negation is not a full inversion)

  return { score: Math.max(-1, Math.min(1, rawScore)), signals };
}

/** Deep sentiment result type */
export interface DeepSentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  riskLevel: 'low' | 'medium' | 'high';
  /** Per-sentence breakdown */
  sentences: Array<{ text: string; score: number; negated: boolean; signals: string[] }>;
  /** Prompt suitable for an LLM to refine further */
  llmPrompt: string;
}

/**
 * Investment-grade sentiment analysis.
 *
 * - Splits text into headline (weight 0.4) vs body (weight 0.6)
 * - Scores each sentence independently with negation awareness
 * - Prioritises financial-context signals over generic keywords
 * - Returns a structured result with an optional LLM prompt
 */
export function deepSentimentAnalysis(
  text: string,
  symbol?: string,
): DeepSentimentResult {
  const { headline, body } = splitHeadlineBody(text);

  // Split body into sentences (English + Chinese punctuation)
  const sentenceSplitRegex = /[^。！？.!?\n]+[。！？.!?\n]?/g;
  const headlineSentences = headline.match(sentenceSplitRegex) || [headline];
  const bodySentences = body
    ? (body.match(sentenceSplitRegex) || [body]).filter(s => s.trim().length > 0)
    : [];

  const headlineWeight = 0.4;
  const bodyWeight = 0.6;

  // Score headline sentences
  let headlineScore = 0;
  const allFactors: string[] = [];
  const sentenceResults: DeepSentimentResult['sentences'] = [];

  for (const s of headlineSentences) {
    const { score, signals } = scoreSentence(s);
    headlineScore += score;
    const { negated } = detectNegation(s);
    sentenceResults.push({
      text: s.trim(),
      score,
      negated,
      signals: signals.map(sig => sig.label),
    });
    for (const sig of signals) {
      if (!allFactors.includes(sig.label)) allFactors.push(sig.label);
    }
  }
  if (headlineSentences.length > 0) headlineScore /= headlineSentences.length;

  // Score body sentences
  let bodyScore = 0;
  for (const s of bodySentences) {
    const { score, signals } = scoreSentence(s);
    bodyScore += score;
    const { negated } = detectNegation(s);
    sentenceResults.push({
      text: s.trim(),
      score,
      negated,
      signals: signals.map(sig => sig.label),
    });
    for (const sig of signals) {
      if (!allFactors.includes(sig.label)) allFactors.push(sig.label);
    }
  }
  if (bodySentences.length > 0) bodyScore /= bodySentences.length;

  // Weighted combination
  const hasBody = bodySentences.length > 0;
  const combinedScore = hasBody
    ? headlineScore * headlineWeight + bodyScore * bodyWeight
    : headlineScore;

  // Determine sentiment label
  let sentiment: 'bullish' | 'bearish' | 'neutral';
  if (combinedScore > 0.15) sentiment = 'bullish';
  else if (combinedScore < -0.15) sentiment = 'bearish';
  else sentiment = 'neutral';

  // Confidence: how far from neutral + signal density
  const magnitude = Math.abs(combinedScore);
  const signalDensity = Math.min(allFactors.length / 3, 1);
  const sentenceCount = sentenceResults.length;
  const coverage = Math.min(sentenceCount / 5, 1); // more sentences → more info
  const confidence = Math.min(magnitude * 0.5 + signalDensity * 0.3 + coverage * 0.2, 1);

  // Risk level based on negative signals and volatility of scores
  const negSentenceCount = sentenceResults.filter(s => s.score < -0.1).length;
  const negRatio = sentenceCount > 0 ? negSentenceCount / sentenceCount : 0;
  const hasMajorRisk = allFactors.some(f =>
    /bankruptcy|fraud|investigation|暴雷|爆雷|违约|退市/i.test(f),
  );
  let riskLevel: 'low' | 'medium' | 'high';
  if (hasMajorRisk || negRatio > 0.5) riskLevel = 'high';
  else if (negRatio > 0.25 || combinedScore < -0.3) riskLevel = 'medium';
  else riskLevel = 'low';

  // Build reasoning
  const posFactors = allFactors.filter((_, i) => {
    const sig = [...FINANCIAL_POSITIVE_SIGNALS, ...FINANCIAL_NEGATIVE_SIGNALS].find(
      s => s.label === allFactors[i],
    );
    return sig && 'polarity' in sig === false;
  });
  const reasoningParts: string[] = [];
  if (sentiment === 'bullish') {
    reasoningParts.push(`Overall bullish sentiment (score: ${combinedScore.toFixed(3)}).`);
  } else if (sentiment === 'bearish') {
    reasoningParts.push(`Overall bearish sentiment (score: ${combinedScore.toFixed(3)}).`);
  } else {
    reasoningParts.push(`Mixed/neutral sentiment (score: ${combinedScore.toFixed(3)}).`);
  }
  if (headlineScore !== bodyScore && hasBody) {
    reasoningParts.push(
      `Headline leans ${headlineScore > 0 ? 'positive' : headlineScore < 0 ? 'negative' : 'neutral'}, body leans ${bodyScore > 0 ? 'positive' : bodyScore < 0 ? 'negative' : 'neutral'}.`,
    );
  }
  const negatedCount = sentenceResults.filter(s => s.negated).length;
  if (negatedCount > 0) {
    reasoningParts.push(`${negatedCount} sentence(s) contain negation patterns.`);
  }
  if (allFactors.length > 0) {
    reasoningParts.push(`Key signals: ${allFactors.join(', ')}.`);
  }
  const reasoning = reasoningParts.join(' ');

  // Build LLM prompt for optional deeper analysis
  const llmPrompt = [
    `Analyze the following financial text${symbol ? ` about ${symbol}` : ''} for investment sentiment.`,
    `Provide your analysis as JSON with keys: sentiment (bullish/bearish/neutral), confidence (0-1), reasoning (string), keyFactors (string[]), riskLevel (low/medium/high).`,
    '',
    'Text:',
    text,
    '',
    'Rule-based pre-analysis:',
    `  Sentiment: ${sentiment}`,
    `  Score: ${combinedScore.toFixed(3)}`,
    `  Confidence: ${(confidence * 100).toFixed(0)}%`,
    `  Key factors: ${allFactors.join(', ') || 'none detected'}`,
    `  Risk level: ${riskLevel}`,
    `  Negation detected in ${negatedCount}/${sentenceCount} sentences.`,
  ].join('\n');

  return {
    sentiment,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    keyFactors: allFactors.length > 0 ? allFactors : ['no strong financial signals detected'],
    riskLevel,
    sentences: sentenceResults,
    llmPrompt,
  };
}

// ---------------------------------------------------------------------------
// 3. detectEvents — upgraded with value extraction and severity
// ---------------------------------------------------------------------------

/** Upgraded event type */
export interface DetectedEvent {
  type: string;
  description: string;
  confidence: number;
  severity: 'major' | 'minor';
  /** Extracted concrete values (e.g. "Q3", "$5.2B") */
  values: string[];
  /** Where in the text the event was found (0-based char offset) */
  matchStart?: number;
}

/** Event detector pattern definition */
interface EventPattern {
  type: string;
  label: string;
  baseConfidence: number;
  severity: 'major' | 'minor';
  patterns: Array<{
    regex: RegExp;
    /** Group indices that contain extractable values; 0 = whole match */
    valueGroups?: number[];
  }>;
}

const EVENT_PATTERNS: EventPattern[] = [
  // Earnings / Financial Reports
  {
    type: 'earnings',
    label: 'Earnings / Financial Report',
    baseConfidence: 0.7,
    severity: 'major',
    patterns: [
      { regex: /\b(Q[1-4])\s*(?:earnings|results?|revenue|profit|report)?/gi, valueGroups: [1] },
      { regex: /\b(FY\s*\d{4})\b/gi, valueGroups: [1] },
      { regex: /\b(?:earnings|revenue|profit|eps)\s*(?:of|at|was|is|reached|hit)?\s*([\$¥]?\s*[\d,.]+\s*(?:billion|million|B|M|亿|万)?)/gi, valueGroups: [1] },
      { regex: /(?:营收|利润|净利|每股收益)\s*(?:为|达到|约|超?)?\s*([\d,.]+\s*(?:亿|万|元|美元|%))/g, valueGroups: [1] },
      { regex: /(?:季报|年报|财报|业绩)/g },
    ],
  },
  // Earnings beat / miss
  {
    type: 'earnings_surprise',
    label: 'Earnings Surprise (Beat/Miss)',
    baseConfidence: 0.85,
    severity: 'major',
    patterns: [
      { regex: /\b(?:beat|topped?|exceeded?)\s+(?:earnings|revenue|estimate|consensus|expectation)s?\s*(?:by\s*([\$%]?[\d,.]+%?))?/gi, valueGroups: [1] },
      { regex: /\bmissed?\s+(?:earnings|revenue|estimate|consensus|expectation)s?\s*(?:by\s*([\$%]?[\d,.]+%?))?/gi, valueGroups: [1] },
      { regex: /(?:超(?:出|过|预期)|高于预期)\s*([\d,.]+%?)?/g, valueGroups: [1] },
      { regex: /(?:不及预期|低于预期)\s*([\d,.]+%?)?/g, valueGroups: [1] },
    ],
  },
  // M&A
  {
    type: 'ma',
    label: 'M&A / Strategic Deal',
    baseConfidence: 0.8,
    severity: 'major',
    patterns: [
      { regex: /\b(?:acquired?|acquiring|acquisition of)\s+([A-Z][A-Za-z0-9& ]+)/gi, valueGroups: [1] },
      { regex: /\b(?:merger|merge(?:d|s)? with)\s+([A-Z][A-Za-z0-9& ]+)/gi, valueGroups: [1] },
      { regex: /\b(?:takeover|buyout)\s+(?:of|bid for)\s+([A-Z][A-Za-z0-9& ]+)/gi, valueGroups: [1] },
      { regex: /\$(?:[\d,.]+)\s*(?:billion|million)\s+(?:deal|transaction|acquisition)/gi },
      { regex: /(?:收购|并购|合并|战略合作)\s*([^\s,，。]+)?/g, valueGroups: [1] },
    ],
  },
  // Regulatory
  {
    type: 'regulatory',
    label: 'Regulatory / Government Action',
    baseConfidence: 0.7,
    severity: 'major',
    patterns: [
      { regex: /\b(?:FDA|SEC|DOJ|FTC|CFPB|EPA)\s+(?:approved?|rejected|investigat|fined|charged)/gi },
      { regex: /\b(?:approved?|cleared?|rejected|denied)\s+(?:by\s+)?(?:the\s+)?(FDA|SEC|FTC|DOJ|EPA|NMPA|CSRC)/gi, valueGroups: [1] },
      { regex: /\b(?:antitrust|class.action|subpoena|consent decree)/gi },
      { regex: /(?:批准|监管|处罚|问询|立案调查|行政处罚)/g },
    ],
  },
  // Product / Launch
  {
    type: 'product',
    label: 'Product Launch / Announcement',
    baseConfidence: 0.65,
    severity: 'minor',
    patterns: [
      { regex: /\b(?:launched?|unveiled?|announced?|released?)\s+(?:a\s+|its\s+|the\s+)?(?:new\s+)?([A-Za-z0-9\- ]{3,30})/gi, valueGroups: [1] },
      { regex: /\b(?:product launch|product announcement|new product)/gi },
      { regex: /(?:发布|推出|上市)\s*(?:全新|新款|新一代)?\s*([^\s,，。]+)?/g, valueGroups: [1] },
    ],
  },
  // Management changes
  {
    type: 'management',
    label: 'Management Change',
    baseConfidence: 0.7,
    severity: 'major',
    patterns: [
      { regex: /\b(?:appointed?|named|hired)\s+(?:as\s+)?(?:new\s+)?(CEO|CFO|CTO|COO|President|Chairman)/gi, valueGroups: [1] },
      { regex: /\b(CEO|CFO|CTO|COO)\s+(?:resigned?|stepped?\s+down|departed?|ousted)/gi, valueGroups: [1] },
      { regex: /(?:任命|辞[职任]|高管变动|人事变动)/g },
    ],
  },
  // Dividends / Buybacks / Capital
  {
    type: 'capital',
    label: 'Capital Event (Dividend / Buyback / Raise)',
    baseConfidence: 0.65,
    severity: 'minor',
    patterns: [
      { regex: /\b(?:dividend|buyback|share\s+repurchase)\s+(?:of\s+)?([\$¥]?[\d,.]+\s*(?:billion|million|B|M|亿)?)/gi, valueGroups: [1] },
      { regex: /\b(?:special\s+dividend|increased?\s+dividend|initiated?\s+buyback)/gi },
      { regex: /(?:分红|回购|融资|增发|配股)\s*([\d,.]+\s*(?:亿|万|元|美元)?)?/g, valueGroups: [1] },
    ],
  },
  // Guidance / Outlook
  {
    type: 'guidance',
    label: 'Guidance / Outlook Change',
    baseConfidence: 0.75,
    severity: 'major',
    patterns: [
      { regex: /\b(?:raised?|increased?|boosted?)\s+(?:its\s+)?(?:full.year|annual|quarterly)\s+(?:guidance|outlook|forecast)/gi },
      { regex: /\b(?:lowered?|cut|reduced?)\s+(?:its\s+)?(?:full.year|annual|quarterly)\s+(?:guidance|outlook|forecast)/gi },
      { regex: /\b(?:issued?|provided?)\s+(?:guidance|outlook)\s+(?:for|of)/gi },
      { regex: /(?:上调|下调|发布)\s*(?:业绩指引|盈利预测|全年展望|目标价)/g },
    ],
  },
];

/**
 * Detect investment events from text with value extraction and severity.
 */
export function detectEvents(text: string): DetectedEvent[] {
  const events: DetectedEvent[] = [];
  const seenTypes = new Set<string>();

  for (const category of EVENT_PATTERNS) {
    for (const { regex, valueGroups } of category.patterns) {
      // Reset lastIndex for stateful regex with /g flag
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        // Extract values from specified groups
        const values: string[] = [];
        if (valueGroups) {
          for (const gi of valueGroups) {
            const val = match[gi];
            if (val && val.trim().length > 0) {
              values.push(val.trim());
            }
          }
        }

        // Confidence boost when concrete values were extracted
        const valueBoost = values.length > 0 ? 0.1 : 0;
        // Specificity boost: shorter match = more specific
        const specificityBoost = match[0].length < 20 ? 0.05 : 0;
        const confidence = Math.min(category.baseConfidence + valueBoost + specificityBoost, 1);

        const eventKey = `${category.type}:${match[0]}`;
        if (seenTypes.has(eventKey)) continue;
        seenTypes.add(eventKey);

        events.push({
          type: category.type,
          description: category.label,
          confidence: Math.round(confidence * 100) / 100,
          severity: category.severity,
          values,
          matchStart: match.index,
        });
        break; // one match per pattern is enough
      }
    }
  }

  // Deduplicate by type, keeping highest confidence
  const byType = new Map<string, DetectedEvent>();
  for (const e of events) {
    const existing = byType.get(e.type);
    if (!existing || e.confidence > existing.confidence) {
      byType.set(e.type, e);
    } else if (existing && e.values.length > existing.values.length) {
      // Prefer the one with more extracted values
      byType.set(e.type, e);
    }
  }

  return Array.from(byType.values()).sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// 4. extractEntities — upgraded with Chinese stock names, unit normalisation,
//    percentages, and time periods
// ---------------------------------------------------------------------------

/** Upgraded entity type */
export interface ExtractedEntities {
  /** US stock tickers (uppercase 2-5 chars, filtered) */
  stocks: string[];
  /** Chinese stock names detected */
  chineseStocks: string[];
  /** Normalised numbers (with unit conversion) */
  numbers: Array<{ raw: string; normalized?: number; unit?: string }>;
  /** Detected percentages */
  percentages: string[];
  /** Time periods (Q1-Q4, FY2024, etc.) */
  periods: string[];
  /** Dates */
  dates: string[];
}

/** Common English words that look like tickers but are not */
const TICKER_FALSE_POSITIVES = new Set([
  'CEO', 'CFO', 'CTO', 'COO', 'CSO', 'CIO', 'CRO',
  'USA', 'NYSE', 'NASDAQ', 'SEC', 'FDA', 'FTC', 'DOJ', 'EPA', 'NMPA', 'CSRC',
  'GDP', 'ETF', 'IPO', 'SPAC', 'CPI', 'PMI',
  'LTD', 'INC', 'LLC', 'CORP', 'PLC',
  'THE', 'AND', 'FOR', 'NOT', 'BUT', 'ARE', 'WAS', 'HAS', 'HAD',
  'ALL', 'ITS', 'NEW', 'OLD', 'ONE', 'TWO', 'SIX', 'TEN',
  'GOOD', 'BAD', 'BIG', 'TOP', 'LOW', 'HIGH', 'LAST', 'NEXT',
  'OVER', 'VERY', 'FROM', 'WITH', 'THIS', 'THAT', 'THEY', 'THEM',
  'WILL', 'HAVE', 'BEEN', 'WERE', 'SAID', 'MADE', 'MUCH',
  'API', 'SDK', 'URL', 'PDF', 'CEO',
]);

/** Known Chinese stock/company names (extendable) */
const CHINESE_STOCK_NAMES: string[] = [
  '贵州茅台', '五粮液', '宁德时代', '比亚迪', '隆基绿能',
  '招商银行', '中国平安', '工商银行', '建设银行', '农业银行',
  '中国中免', '中芯国际', '腾讯控股', '阿里巴巴', '京东集团',
  '美团', '拼多多', '百度集团', '网易', '小米集团',
  '蔚来', '小鹏汽车', '理想汽车', '字节跳动', '滴滴出行',
  '中国移动', '中国电信', '中国联通', '中国石油', '中国石化',
  '长江电力', '中国神华', '紫金矿业', '洛阳钼业', '万华化学',
  '恒瑞医药', '药明康德', '迈瑞医疗', '爱尔眼科', '通策医疗',
  '格力电器', '美的集团', '海尔智家', '三一重工', '中联重科',
  '中国建筑', '中国铁建', '中国中铁', '中国交建', '中国电建',
  '科大讯飞', '商汤科技', '寒武纪', '海光信息', '中微公司',
  '北方华创', '拓荆科技', '盛美上海', '华海清科', '芯源微',
];

/**
 * Normalise a Chinese or financial unit to its numeric multiplier.
 */
function normalizeUnit(unit: string): number {
  const map: Record<string, number> = {
    '亿': 1e8,
    '万': 1e4,
    '千': 1e3,
    '百': 1e2,
    '十': 10,
    'million': 1e6,
    'billion': 1e9,
    'trillion': 1e12,
    'M': 1e6,
    'B': 1e9,
    'T': 1e12,
    'K': 1e3,
  };
  return map[unit] ?? 1;
}

/**
 * Extract key entities from text with investment-grade precision.
 */
export function extractEntities(text: string): ExtractedEntities {
  // --- US stock tickers ---
  const tickerPattern = /\b([A-Z]{2,5})\b/g;
  const tickerMatches = text.match(tickerPattern) || [];
  // Filter: must not be a common word, must be preceded by $ or space/line start,
  // or appear in a context like "AAPL shares" / "NASDAQ: TSLA"
  const contextTickerPattern = /(?:\$|NASDAQ:|NYSE:|@|^|\s)([A-Z]{2,5})\b/gm;
  const contextTickers = new Set<string>();
  let ctxMatch: RegExpExecArray | null;
  contextTickerPattern.lastIndex = 0;
  while ((ctxMatch = contextTickerPattern.exec(text)) !== null) {
    const t = ctxMatch[1];
    if (!TICKER_FALSE_POSITIVES.has(t)) contextTickers.add(t);
  }
  // Also include any uppercase word that looks like a ticker and appears near "$"
  const dollarTickerPattern = /\$\s*([A-Z]{2,5})\b/g;
  dollarTickerPattern.lastIndex = 0;
  while ((ctxMatch = dollarTickerPattern.exec(text)) !== null) {
    contextTickers.add(ctxMatch[1]);
  }
  // If no context tickers, fall back to all matches minus false positives
  const stocks = contextTickers.size > 0
    ? [...contextTickers]
    : [...new Set(tickerMatches.filter(s => !TICKER_FALSE_POSITIVES.has(s)))];

  // --- Chinese stock names ---
  const chineseStocks: string[] = [];
  for (const name of CHINESE_STOCK_NAMES) {
    if (text.includes(name)) chineseStocks.push(name);
  }

  // --- Numbers with unit normalisation ---
  const numberPattern = /([\$¥]?\s*[\d,]+\.?\d*)\s*(亿|万|billion|million|trillion|B|M|T|K|美元|元|%|个点)?/gi;
  const numbers: ExtractedEntities['numbers'] = [];
  const numSeen = new Set<string>();
  numberPattern.lastIndex = 0;
  let numMatch: RegExpExecArray | null;
  while ((numMatch = numberPattern.exec(text)) !== null && numbers.length < 15) {
    const raw = numMatch[0].trim();
    if (raw.length < 2 || numSeen.has(raw)) continue;
    numSeen.add(raw);

    const digits = parseFloat(numMatch[1].replace(/[$¥,\s]/g, ''));
    const unit = numMatch[2] || '';
    if (isNaN(digits)) continue;

    // Skip if this is a date-like number (4-digit year)
    if (/^\d{4}$/.test(numMatch[1].trim())) continue;

    const multiplier = normalizeUnit(unit);
    const normalized = digits * multiplier;

    numbers.push({ raw, normalized: normalized !== digits ? normalized : undefined, unit: unit || undefined });
  }

  // --- Percentages ---
  const percentagePattern = /[\d,]+\.?\d*\s*%/g;
  const percentages = [...new Set(text.match(percentagePattern) || [])];

  // --- Time periods ---
  const periodPattern = /\b(?:Q[1-4](?:\s*\d{4}|\s*'?\d{2})?|FY\s*\d{4}|H[12]\s*\d{4}|(?:first|second|third|fourth)\s+quarter)\b/gi;
  const cnPeriodPattern = /[上下]半年|(?:第一|第二|第三|第四)季度|(?:上半|下半)年/g;
  const periods = [
    ...new Set([
      ...(text.match(periodPattern) || []),
      ...(text.match(cnPeriodPattern) || []),
    ]),
  ];

  // --- Dates ---
  const datePattern = /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/g;
  const dates = [...new Set((text.match(datePattern) || []))].slice(0, 10);

  return { stocks, chineseStocks, numbers, percentages, periods, dates };
}

// Legacy overload for backward compatibility with tool impl
export function extractEntitiesLegacy(text: string): {
  stocks: string[];
  numbers: string[];
  dates: string[];
} {
  const result = extractEntities(text);
  return {
    stocks: [...result.stocks, ...result.chineseStocks],
    numbers: [
      ...result.numbers.map(n => n.raw),
      ...result.percentages,
    ],
    dates: [...result.dates, ...result.periods],
  };
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const analyzeSentimentSchema = z.object({
  text: z.string().describe('Text to analyze for sentiment'),
  symbol: z.string().optional().describe('Optional stock symbol for context'),
  useDeepAnalysis: z.boolean().default(false).describe('Use deep semantic analysis (default: false uses fast scan)'),
});

const detectEventsSchema = z.object({
  text: z.string().describe('Text to detect investment events from'),
});

const extractEntitiesSchema = z.object({
  text: z.string().describe('Text to extract entities from'),
});

// ---------------------------------------------------------------------------
// Tool: analyze_sentiment
// ---------------------------------------------------------------------------

/**
 * Create sentiment analysis tool.
 *
 * Uses deepSentimentAnalysis when useDeepAnalysis=true (investment-grade,
 * negation-aware, per-sentence scoring with LLM-ready prompt output).
 * Falls back to quickSentimentScan for fast pre-filter mode.
 */
export function createAnalyzeSentimentTool() {
  return new DynamicStructuredTool({
    name: 'analyze_sentiment',
    description: 'Analyze text sentiment for financial news and reports. Supports deep investment-grade analysis with negation detection, per-sentence scoring, and risk assessment.',
    schema: analyzeSentimentSchema,
    func: async ({ text, symbol, useDeepAnalysis = false }) => {
      if (useDeepAnalysis) {
        const result = deepSentimentAnalysis(text, symbol);

        const sentimentIcon = {
          bullish: '📈',
          bearish: '📉',
          neutral: '➖',
        }[result.sentiment];

        const riskIcon = { low: '🟢', medium: '🟡', high: '🔴' }[result.riskLevel];

        return formatToolResult({
          type: 'Deep Sentiment Analysis',
          sentiment: result.sentiment,
          confidence: `${(result.confidence * 100).toFixed(0)}%`,
          reasoning: result.reasoning,
          keyFactors: result.keyFactors,
          riskLevel: result.riskLevel,
          sentenceCount: result.sentences.length,
          message: [
            `${sentimentIcon} Sentiment: ${result.sentiment.toUpperCase()}  ${riskIcon} Risk: ${result.riskLevel.toUpperCase()}`,
            `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
            `Reasoning: ${result.reasoning}`,
            result.keyFactors.length > 0
              ? `Key Factors: ${result.keyFactors.join(', ')}`
              : null,
            result.sentences.some(s => s.negated)
              ? `[!] Negation detected in ${result.sentences.filter(s => s.negated).length} sentence(s)`
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }

      // Fast fallback — quickSentimentScan
      const result = quickSentimentScan(text);

      const sentimentIcon = {
        positive: '📈',
        negative: '📉',
        neutral: '➖',
      }[result.label];

      return formatToolResult({
        type: 'Sentiment Analysis (Fast)',
        sentiment: result.label,
        score: result.score.toFixed(3),
        confidence: `${(result.confidence * 100).toFixed(0)}%`,
        keywords: result.keywords.slice(0, 10),
        message: [
          `${sentimentIcon} Sentiment: ${result.label.toUpperCase()}`,
          `Score: ${result.score.toFixed(3)}  Confidence: ${(result.confidence * 100).toFixed(0)}%`,
          result.keywords.length > 0
            ? `Keywords: ${result.keywords.slice(0, 5).join(', ')}`
            : null,
          'Hint: set useDeepAnalysis=true for investment-grade analysis',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Tool: detect_events
// ---------------------------------------------------------------------------

/**
 * Create event detection tool.
 *
 * Upgraded with: sophisticated regex patterns, concrete value extraction
 * (Q3, $5.2B, etc.), specificity-weighted confidence scoring, and event
 * severity assessment (major / minor).
 */
export function createDetectEventsTool() {
  return new DynamicStructuredTool({
    name: 'detect_events',
    description: 'Detect investment-related events from text with severity and extracted values',
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

      const majorEvents = events.filter(e => e.severity === 'major');
      const minorEvents = events.filter(e => e.severity === 'minor');

      const eventList = events
        .map(e => {
          const badge = e.severity === 'major' ? '[MAJOR]' : '[minor]';
          const vals = e.values.length > 0 ? ` → ${e.values.join(', ')}` : '';
          return `  ${badge} ${e.description} (${(e.confidence * 100).toFixed(0)}% confidence)${vals}`;
        })
        .join('\n');

      return formatToolResult({
        type: 'Event Detection',
        count: events.length,
        majorCount: majorEvents.length,
        minorCount: minorEvents.length,
        events: events.map(e => ({
          type: e.type,
          description: e.description,
          confidence: e.confidence,
          severity: e.severity,
          values: e.values,
        })),
        message: [
          `Detected ${events.length} event(s) [${majorEvents.length} major, ${minorEvents.length} minor]:`,
          eventList,
        ].join('\n'),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Tool: extract_entities
// ---------------------------------------------------------------------------

/**
 * Create entity extraction tool.
 *
 * Upgraded with: precise ticker filtering, Chinese stock name detection,
 * numeric unit normalisation (亿 → 100M, 万 → 10K), percentage detection,
 * and time period extraction (Q1, FY2024, etc.).
 */
export function createExtractEntitiesTool() {
  return new DynamicStructuredTool({
    name: 'extract_entities',
    description: 'Extract stock tickers, numbers, periods, and dates from financial text',
    schema: extractEntitiesSchema,
    func: async ({ text }) => {
      const entities = extractEntities(text);

      const stocksList =
        entities.stocks.length > 0
          ? `US Tickers: ${entities.stocks.slice(0, 10).join(', ')}`
          : 'US Tickers: None found';

      const chineseStocksList =
        entities.chineseStocks.length > 0
          ? `Chinese Stocks: ${entities.chineseStocks.join(', ')}`
          : 'Chinese Stocks: None found';

      const numbersList =
        entities.numbers.length > 0
          ? `Numbers: ${entities.numbers.map(n => n.raw).join(', ')}`
          : 'Numbers: None found';

      const percentagesList =
        entities.percentages.length > 0
          ? `Percentages: ${entities.percentages.join(', ')}`
          : null;

      const periodsList =
        entities.periods.length > 0
          ? `Periods: ${entities.periods.join(', ')}`
          : null;

      const datesList =
        entities.dates.length > 0
          ? `Dates: ${entities.dates.slice(0, 5).join(', ')}`
          : 'Dates: None found';

      const lines = [stocksList, chineseStocksList, numbersList, percentagesList, periodsList, datesList].filter(
        Boolean,
      ) as string[];

      return formatToolResult({
        type: 'Entity Extraction',
        stocks: entities.stocks.slice(0, 10),
        chineseStocks: entities.chineseStocks,
        numbers: entities.numbers.map(n => n.raw),
        normalizedNumbers: entities.numbers.filter(n => n.normalized !== undefined),
        percentages: entities.percentages,
        periods: entities.periods,
        dates: entities.dates.slice(0, 5),
        message: `Extracted:\n  ${lines.join('\n  ')}`,
      });
    },
  });
}

export const researchTools = [
  createAnalyzeSentimentTool(),
  createDetectEventsTool(),
  createExtractEntitiesTool(),
];
