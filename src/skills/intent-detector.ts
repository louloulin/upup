/**
 * Intent Detector - 投资意图检测器
 *
 * 从用户输入中检测投资相关的意图：
 * - 股票代码检测 (A股/港股/美股)
 * - 意图关键词匹配
 * - 自动触发技能建议
 *
 * 基于 Claude Code 的意图检测模式
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 检测到的意图类型
 */
export type IntentType =
  | 'ticker'           // 股票代码
  | 'valuation'        // 估值分析
  | 'technical'        // 技术分析
  | 'fundamental'       // 基本面分析
  | 'risk'            // 风险评估
  | 'news'            // 新闻/舆情
  | 'fund'            // 基金分析
  | 'macro'           // 宏观经济
  | 'portfolio'       // 组合管理
  | 'alert'           // 告警设置
  | 'research'        // 研究报告
  | 'command';         // 斜杠命令

/**
 * 检测到的意图
 */
export interface Intent {
  /** 意图类型 */
  type: IntentType;
  /** 匹配的关键词 */
  trigger: string;
  /** 意图值 (如股票代码、分析类型) */
  value?: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 建议触发的技能 */
  suggestedSkills: string[];
  /** 提取的参数 */
  params?: Record<string, string>;
}

/**
 * 意图检测配置
 */
export interface IntentDetectorConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 检测模式 */
  mode: 'auto' | 'suggest' | 'manual';
  /** 自定义触发词映射 */
  customTriggers?: Record<string, string[]>;
}

/**
 * 股票代码检测结果
 */
export interface TickerDetection {
  /** 原始代码 */
  code: string;
  /** 市场类型 */
  market: 'A-share' | 'HK' | 'US' | 'Fund' | 'Unknown';
  /** 标准化的代码 */
  normalized: string;
}

// ============================================================================
// A股股票代码检测
// ============================================================================

/**
 * A股股票代码模式
 * - 6位数字: 上交所/深交所主板
 * - 002/003/300: 深交所
 * - 688: 科创板
 * - 430/830/870: 北交所
 */
const A_SHARE_PATTERN = /\b(\d{6})\b/g;

/**
 * 港股代码模式
 * - 4-5位数字前面加 0.
 */
const HK_PATTERN = /\b(0\d{4,5})\b/g;

/**
 * 美股代码模式
 * - 1-5个大写字母
 * - 常见指数: ^GSPC, ^DJI, ^IXIC
 */
const US_PATTERN = /\b([A-Z]{1,5})\b/g;

/**
 * 基金代码模式
 * - 6位数字 (与A股类似但通常以1/5/6开头)
 */
const FUND_PATTERN = /\b(1\d{5}|5\d{5}|6\d{5})\b/g;

// ============================================================================
// 意图关键词映射
// ============================================================================

/**
 * 意图触发词映射
 */
const INTENT_TRIGGERS: Record<IntentType, string[]> = {
  'valuation': [
    '估值', '价值', '内在价值', '合理价格', '公允价值',
    'DCF', 'dcf', '市盈率', 'PE', 'PB', '市净率',
    '估值分析', '值多少钱', '值不值得买',
    'fair value', 'intrinsic', 'valuation', 'worth'
  ],
  'technical': [
    '技术分析', 'K线', '均线', '趋势', 'MACD', 'KDJ',
    '技术面', '走势', '技术指标', '买入信号', '卖出信号',
    'technical', 'chart', 'trend', 'indicator'
  ],
  'fundamental': [
    '基本面', '财务', '利润', '营收', '毛利率',
    'ROE', '资产负债', '现金流', '财务分析',
    'fundamental', 'financial', 'earnings', 'revenue'
  ],
  'risk': [
    '风险', '回撤', 'VaR', '波动率', '最大回撤',
    '风险评估', '风险分析', '止损',
    'risk', 'drawdown', 'volatility', 'stop loss'
  ],
  'news': [
    '新闻', '公告', '舆情', '最新消息', '发生了什么',
    '突发', '财报季', '业绩',
    'news', 'announcement', 'sentiment', 'earnings'
  ],
  'fund': [
    '基金', 'ETF', '净值', '基金经理', '申购', '赎回',
    '基金分析', '选基金', '基金排名',
    'fund', 'ETF', 'NAV', 'selector'
  ],
  'macro': [
    '宏观', 'GDP', 'CPI', 'PPI', 'PMI', '利率',
    '货币政策', '经济数据', '降息', '加息',
    'macro', 'economy', 'interest rate', 'inflation'
  ],
  'portfolio': [
    '持仓', '组合', '仓位', '分散', '资产配置',
    '持仓分析', '组合优化', '再平衡',
    'portfolio', 'position', 'allocation', 'rebalance'
  ],
  'alert': [
    '告警', '提醒', '通知', '监控', '价格提醒',
    '设置告警', '提醒我',
    'alert', 'notify', 'watch', 'remind'
  ],
  'research': [
    '研究报告', '分析', '研究', '深度报告',
    '行业分析', '公司研究', '调研',
    'research', 'analysis', 'report', 'deep dive'
  ],
  'command': [],  // 斜杠命令在外部处理
  'ticker': [],   // 股票代码单独检测
};

// ============================================================================
// 技能触发建议映射
// ============================================================================

/**
 * 意图到技能的映射
 */
const INTENT_TO_SKILLS: Record<IntentType, string[]> = {
  'valuation': ['dcf-valuation', 'pe-ratio', 'pb-ratio', 'valuation-comparison'],
  'technical': ['technical-analysis', 'momentum-investing'],
  'fundamental': ['a-share-analysis', 'financial-report'],
  'risk': ['risk-assessment', 'risk-evaluation'],
  'news': ['sentiment-analysis', 'earnings-season'],
  'fund': ['fund-analysis', 'fund-screening', 'fund-comparison'],
  'macro': ['macro-analysis', 'multi-market-analysis'],
  'portfolio': ['portfolio-management', 'portfolio-rebalancing'],
  'alert': ['alert-management', 'valuation-alert'],
  'research': ['research-report', 'institution-research'],
  'command': [],
  'ticker': [],
};

// ============================================================================
// 意图检测器
// ============================================================================

/**
 * 提取股票代码
 */
export function extractTickers(input: string): TickerDetection[] {
  const tickerSet = new Map<string, TickerDetection>(); // 使用 Map 去重

  // A股检测 - 优先检测A股代码
  let match;
  while ((match = A_SHARE_PATTERN.exec(input)) !== null) {
    const code = match[1];
    if (isValidAShare(code)) {
      tickerSet.set(code, {
        code,
        market: 'A-share',
        normalized: code,
      });
    }
  }

  // 美股检测 - 与A股互斥
  while ((match = US_PATTERN.exec(input)) !== null) {
    const code = match[1];
    if (isValidUSTicker(code) && !tickerSet.has(code)) {
      tickerSet.set(code, {
        code,
        market: 'US',
        normalized: code,
      });
    }
  }

  // 港股检测
  while ((match = HK_PATTERN.exec(input)) !== null) {
    const code = match[1];
    if (!tickerSet.has(code)) {
      tickerSet.set(code, {
        code,
        market: 'HK',
        normalized: code,
      });
    }
  }

  // 基金检测 - 最后检测，只处理未匹配的代码
  while ((match = FUND_PATTERN.exec(input)) !== null) {
    const code = match[1];
    if (isValidFundCode(code) && !tickerSet.has(code)) {
      tickerSet.set(code, {
        code,
        market: 'Fund',
        normalized: code,
      });
    }
  }

  return Array.from(tickerSet.values());
}

/**
 * 验证A股代码
 */
function isValidAShare(code: string): boolean {
  // A股代码验证规则:
  // - 6开头: 上交所主板 (如600519贵州茅台, 600036招商银行)
  // - 000/001开头: 深交所主板
  // - 002/003开头: 深交所中小板
  // - 300开头: 创业板 (深交所)
  // - 688开头: 科创板 (上交所)
  // - 430/830/870开头: 北交所
  // 
  // 基金代码也以1/5/6开头，但通常与股票代码共存
  // 简化处理: 6位数字代码都视为可能的A股，进一步通过上下文判断
  const prefix = code.substring(0, 3);
  
  // 明确是A股代码的模式
  if (/^6\d{5}$/.test(code)) return true;  // 6开头 (600/601/603/605/688)
  if (/^00[0-3]\d{3}$/.test(code)) return true;  // 000/001/002/003开头
  if (/^30\d{3}$/.test(code)) return true;  // 300/301开头
  
  // 北交所: 430/830/870开头
  if (/^4[38]\d{3}$/.test(code)) return true;
  
  return false;
}

/**
 * 验证美股代码
 */
function isValidUSTicker(ticker: string): boolean {
  // 排除常见英文单词
  const commonWords = ['I', 'A', 'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT'];
  if (commonWords.includes(ticker)) {
    return false;
  }
  return true;
}

/**
 * 验证基金代码
 */
function isValidFundCode(code: string): boolean {
  const prefix = code[0];
  // 基金代码通常以1/5/6开头
  return prefix === '1' || prefix === '5' || prefix === '6';
}

/**
 * 检测意图
 */
export function detectIntents(input: string): Intent[] {
  const intents: Intent[] = [];
  const lowerInput = input.toLowerCase();
  const upperInput = input.toUpperCase();

  // 1. 检测股票代码
  const tickers = extractTickers(input);
  if (tickers.length > 0) {
    intents.push({
      type: 'ticker',
      trigger: 'ticker-detected',
      value: tickers.map(t => t.normalized).join(','),
      confidence: 0.9,
      suggestedSkills: [],
      params: { tickers: JSON.stringify(tickers) },
    });
  }

  // 2. 检测意图关键词
  for (const [intentType, triggers] of Object.entries(INTENT_TRIGGERS)) {
    if (intentType === 'command' || intentType === 'ticker') continue;

    for (const trigger of triggers) {
      const triggerLower = trigger.toLowerCase();
      if (lowerInput.includes(triggerLower) || upperInput.includes(trigger.toUpperCase())) {
        const skillNames = INTENT_TO_SKILLS[intentType as IntentType] || [];
        
        // 计算置信度 (基于触发词位置和匹配度)
        const confidence = calculateConfidence(input, trigger);

        intents.push({
          type: intentType as IntentType,
          trigger,
          confidence,
          suggestedSkills: skillNames,
        });
      }
    }
  }

  // 3. 检测斜杠命令
  if (input.trim().startsWith('/')) {
    const commandMatch = input.match(/^\/([\w-]+)/);
    if (commandMatch) {
      intents.push({
        type: 'command',
        trigger: 'slash-command',
        value: commandMatch[1],
        confidence: 1.0,
        suggestedSkills: [],
      });
    }
  }

  // 4. 去重并排序 (按置信度)
  return deduplicateAndSort(intents);
}

/**
 * 计算置信度
 */
function calculateConfidence(input: string, trigger: string): number {
  let confidence = 0.5; // 基础置信度

  // 触发词在输入中出现的次数
  const occurrences = (input.toLowerCase().match(new RegExp(trigger.toLowerCase(), 'g')) || []).length;
  confidence += Math.min(occurrences * 0.1, 0.3);

  // 触发词长度越长置信度越高
  confidence += Math.min(trigger.length * 0.02, 0.2);

  return Math.min(confidence, 1.0);
}

/**
 * 去重并排序
 */
function deduplicateAndSort(intents: Intent[]): Intent[] {
  const seen = new Map<string, Intent>();

  for (const intent of intents) {
    const key = `${intent.type}-${intent.trigger}`;
    const existing = seen.get(key);
    if (!existing || intent.confidence > existing.confidence) {
      seen.set(key, intent);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * 从意图生成建议消息
 */
export function generateSuggestionMessage(intents: Intent[]): string | null {
  if (intents.length === 0) return null;

  const suggestions: string[] = [];

  for (const intent of intents) {
    if (intent.suggestedSkills.length > 0) {
      const skills = intent.suggestedSkills.map(s => `/${s}`).join(', ');
      suggestions.push(`检测到 ${intent.type} 意图，建议运行: ${skills}`);
    }
  }

  return suggestions.length > 0 ? suggestions.join('\n') : null;
}

// ============================================================================
// Intent Detector Class
// ============================================================================

export class IntentDetector {
  private config: IntentDetectorConfig;

  constructor(config: Partial<IntentDetectorConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      mode: config.mode ?? 'suggest',
      customTriggers: config.customTriggers ?? {},
    };
  }

  /**
   * 检测用户输入中的所有意图
   */
  detect(input: string): Intent[] {
    if (!this.config.enabled) return [];
    return detectIntents(input);
  }

  /**
   * 检测并返回建议
   */
  detectWithSuggestions(input: string): { intents: Intent[]; suggestion?: string } {
    const intents = this.detect(input);
    const suggestion = this.config.mode !== 'manual' 
      ? generateSuggestionMessage(intents) 
      : undefined;
    return { intents, suggestion: suggestion ?? undefined };
  }

  /**
   * 获取配置
   */
  getConfig(): IntentDetectorConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<IntentDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalDetector: IntentDetector | null = null;

export function getIntentDetector(): IntentDetector {
  if (!globalDetector) {
    globalDetector = new IntentDetector();
  }
  return globalDetector;
}

export function resetIntentDetector(): void {
  globalDetector = null;
}
