/**
 * Markdown research report template.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 *      (Requirement: Research Report Template)
 *
 * Auto-fills a structured Markdown report from analysis data. Missing
 * fields render as `(未提供)` so the template never produces broken
 * sections; consumers can detect gaps rather than guessing.
 */

export interface ResearchReportInput {
  symbol: string;
  name?: string;
  asOf?: string;
  summary?: string;
  fundamentals?: {
    revenue?: string;
    earnings?: string;
    margins?: string;
    balanceSheet?: string;
    moat?: string;
  };
  technicals?: {
    trend?: string;
    support?: string;
    resistance?: string;
    momentum?: string;
  };
  valuation?: {
    pe?: string;
    pb?: string;
    evEbitda?: string;
    sectorPe?: string;
    verdict?: string;
  };
  capitalFlow?: {
    mainNet?: string;
    northbound?: string;
    institutional?: string;
  };
  sentiment?: {
    score?: string;
    catalysts?: string[];
  };
  risks?: string[];
  recommendation?: {
    action: 'BUY' | 'HOLD' | 'SELL' | 'WATCH';
    targetPrice?: string;
    positionSize?: string;
    stopLoss?: string;
    confidence?: number;
  };
}

const MISSING = '_(未提供)_';

function present(s?: string): string {
  if (s === undefined || s === null || s === '') return MISSING;
  return s;
}

export function renderResearchReport(input: ResearchReportInput): string {
  const lines: string[] = [];
  const heading = input.name ? `${input.name} (${input.symbol})` : input.symbol;
  lines.push(`# ${heading} 投资分析报告`);
  lines.push('');
  if (input.asOf) lines.push(`_As of: ${input.asOf}_`);
  lines.push('');

  lines.push('## 摘要');
  lines.push('');
  lines.push(present(input.summary));
  lines.push('');

  lines.push('## 基本面');
  lines.push('');
  const f = input.fundamentals ?? {};
  lines.push(`- **营收**: ${present(f.revenue)}`);
  lines.push(`- **盈利**: ${present(f.earnings)}`);
  lines.push(`- **利润率**: ${present(f.margins)}`);
  lines.push(`- **资产负债**: ${present(f.balanceSheet)}`);
  lines.push(`- **护城河**: ${present(f.moat)}`);
  lines.push('');

  lines.push('## 技术面');
  lines.push('');
  const t = input.technicals ?? {};
  lines.push(`- **趋势**: ${present(t.trend)}`);
  lines.push(`- **支撑**: ${present(t.support)}`);
  lines.push(`- **阻力**: ${present(t.resistance)}`);
  lines.push(`- **动量**: ${present(t.momentum)}`);
  lines.push('');

  lines.push('## 估值');
  lines.push('');
  const v = input.valuation ?? {};
  lines.push(`- **PE**: ${present(v.pe)}`);
  lines.push(`- **PB**: ${present(v.pb)}`);
  lines.push(`- **EV/EBITDA**: ${present(v.evEbitda)}`);
  lines.push(`- **行业 PE**: ${present(v.sectorPe)}`);
  lines.push(`- **估值结论**: ${present(v.verdict)}`);
  lines.push('');

  lines.push('## 资金流');
  lines.push('');
  const c = input.capitalFlow ?? {};
  lines.push(`- **主力净流入**: ${present(c.mainNet)}`);
  lines.push(`- **北向资金**: ${present(c.northbound)}`);
  lines.push(`- **机构持仓**: ${present(c.institutional)}`);
  lines.push('');

  lines.push('## 情绪');
  lines.push('');
  const s = input.sentiment ?? {};
  lines.push(`- **情绪得分**: ${present(s.score)}`);
  if (s.catalysts && s.catalysts.length > 0) {
    lines.push('- **催化因素**:');
    for (const cat of s.catalysts) lines.push(`  - ${cat}`);
  } else {
    lines.push('- **催化因素**: ' + MISSING);
  }
  lines.push('');

  lines.push('## 风险');
  lines.push('');
  if (input.risks && input.risks.length > 0) {
    for (const r of input.risks) lines.push(`- ${r}`);
  } else {
    lines.push(MISSING);
  }
  lines.push('');

  lines.push('## 建议');
  lines.push('');
  if (input.recommendation) {
    const r = input.recommendation;
    lines.push(`- **操作**: **${r.action}**`);
    lines.push(`- **目标价**: ${present(r.targetPrice)}`);
    lines.push(`- **建议仓位**: ${present(r.positionSize)}`);
    lines.push(`- **止损**: ${present(r.stopLoss)}`);
    lines.push(`- **置信度**: ${r.confidence !== undefined ? r.confidence.toFixed(2) : MISSING}`);
  } else {
    lines.push(MISSING);
  }
  lines.push('');

  return lines.join('\n');
}
