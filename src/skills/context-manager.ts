/**
 * 投资对话上下文管理器
 * Plan32.md M4: 对话状态优化
 */

/**
 * 股票代码上下文
 */
interface StockContext {
  code: string;
  name: string;
  mentioned: boolean;
  lastMentioned: Date;
}

/**
 * 投资术语映射
 */
const INVESTMENT_TERMS: Record<string, string> = {
  '茅台': '600519.SH',
  '五粮液': '000858.SZ',
  '比亚迪': '002594.SZ',
  '宁德时代': '300750.SZ',
  '腾讯': '00700.HK',
  '阿里': '09988.HK',
  'PE': '市盈率',
  'PB': '市净率',
  'ROE': '净资产收益率',
  'EPS': '每股收益',
};

/**
 * 对话上下文管理器
 */
export class InvestmentContextManager {
  private stockContext: Map<string, StockContext> = new Map();
  private conversationHistory: string[] = [];
  private maxHistory = 10;

  /**
   * 添加股票提及
   */
  mentionStock(code: string, name: string) {
    this.stockContext.set(code, {
      code,
      name,
      mentioned: true,
      lastMentioned: new Date(),
    });
  }

  /**
   * 解析投资术语
   */
  resolveTerm(term: string): string {
    return INVESTMENT_TERMS[term] || term;
  }

  /**
   * 添加对话历史
   */
  addToHistory(message: string) {
    this.conversationHistory.push(message);
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory.shift();
    }
  }

  /**
   * 获取最后提及的股票
   */
  getLastMentionedStock(): StockContext | null {
    let last: StockContext | null = null;
    for (const ctx of this.stockContext.values()) {
      if (!last || ctx.lastMentioned > last.lastMentioned) {
        last = ctx;
      }
    }
    return last;
  }

  /**
   * 生成上下文摘要
   */
  generateSummary(): string {
    const lastStock = this.getLastMentionedStock();
    const recentStocks = Array.from(this.stockContext.keys()).slice(0, 3);
    
    return `
当前对话上下文:
- 近期股票: ${recentStocks.join(', ') || '无'}
${lastStock ? `- 最后分析: ${lastStock.name} (${lastStock.code})` : ''}
- 对话轮次: ${this.conversationHistory.length}
    `.trim();
  }
}

/**
 * 全局上下文实例
 */
export const investmentContext = new InvestmentContextManager();
