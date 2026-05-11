/**
 * Onboarding Templates
 *
 * Example prompts and templates for new users
 */

import type { ExamplePrompt } from './types.js';

export const DEFAULT_EXAMPLES: ExamplePrompt[] = [
  {
    id: 'stock-research',
    title: 'Stock Research',
    description: 'Research a stock and get investment insights',
    prompt: 'Research 贵州茅台 (600519) and provide an investment analysis including:\n- Business overview\n- Financial highlights\n- Risk factors\n- Investment recommendation',
    category: 'research',
  },
  {
    id: 'market-analysis',
    title: 'Market Analysis',
    description: 'Analyze market trends and patterns',
    prompt: 'Analyze the current market conditions for Chinese A-shares:\n- Major indices performance\n- Sector rotation patterns\n- Key economic indicators\n- Trading volume analysis',
    category: 'analysis',
  },
  {
    id: 'portfolio-review',
    title: 'Portfolio Review',
    description: 'Review and optimize your portfolio',
    prompt: 'Review my current portfolio holdings and provide recommendations:\n- Position analysis\n- Risk assessment\n- Diversification suggestions\n- Rebalancing opportunities',
    category: 'analysis',
  },
  {
    id: 'coding-assistant',
    title: 'Coding Assistant',
    description: 'Help with coding tasks',
    prompt: 'Help me write a Python script to:\n- Fetch stock data from a financial API\n- Calculate technical indicators\n- Generate trading signals\n- Create visualization charts',
    category: 'coding',
  },
  {
    id: 'news-analysis',
    title: 'News Analysis',
    description: 'Analyze latest financial news',
    prompt: 'Find and analyze the latest news about:\n- Major market movements\n- Economic policy updates\n- Corporate earnings surprises\n- Industry trends',
    category: 'research',
  },
  {
    id: 'general-chat',
    title: 'General Chat',
    description: 'Ask anything',
    prompt: 'Explain how to use financial ratios for stock valuation',
    category: 'general',
  },
];

export const QUICK_START_PROMPTS: string[] = [
  'Research a stock for me',
  'Analyze my portfolio',
  'Find latest market news',
  'Help me write a trading script',
];

export class TemplateManager {
  private templates: ExamplePrompt[];

  constructor(templates: ExamplePrompt[] = DEFAULT_EXAMPLES) {
    this.templates = templates;
  }

  getTemplates(category?: string): ExamplePrompt[] {
    if (category) {
      return this.templates.filter((t) => t.category === category);
    }
    return [...this.templates];
  }

  getTemplateById(id: string): ExamplePrompt | undefined {
    return this.templates.find((t) => t.id === id);
  }

  addTemplate(template: ExamplePrompt): void {
    const existing = this.templates.findIndex((t) => t.id === template.id);
    if (existing >= 0) {
      this.templates[existing] = template;
    } else {
      this.templates.push(template);
    }
  }

  removeTemplate(id: string): boolean {
    const index = this.templates.findIndex((t) => t.id === id);
    if (index >= 0) {
      this.templates.splice(index, 1);
      return true;
    }
    return false;
  }

  getCategories(): string[] {
    return [...new Set(this.templates.map((t) => t.category))];
  }

  getByCategory(category: string): ExamplePrompt[] {
    return this.templates.filter((t) => t.category === category);
  }

  renderMenu(): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('  ╔════════════════════════════════════════════════════════════╗');
    lines.push('  ║               Quick Start Examples                        ║');
    lines.push('  ╠════════════════════════════════════════════════════════════╣');

    const categories = this.getCategories();
    for (const cat of categories) {
      lines.push(`  ║  ${cat.toUpperCase().padEnd(54)}║`);
      const templates = this.getByCategory(cat);
      for (const t of templates) {
        const num = this.templates.indexOf(t) + 1;
        const title = t.title.slice(0, 20).padEnd(20);
        const desc = t.description.slice(0, 28).padEnd(28);
        lines.push(`  ║    ${num}. ${title} ${desc}║`);
      }
      lines.push('  ║                                                            ║');
    }

    lines.push('  ╚════════════════════════════════════════════════════════════╝');
    lines.push('');

    return lines.join('\n');
  }

  renderCategories(): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('  Available Categories:');
    lines.push('');

    const categories = this.getCategories();
    categories.forEach((cat, i) => {
      const count = this.getByCategory(cat).length;
      lines.push(`    ${i + 1}. ${cat} (${count} examples)`);
    });

    lines.push('');
    return lines.join('\n');
  }
}
