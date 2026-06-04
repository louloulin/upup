/**
 * Competitive Matrix — 13 竞品 × 7 维度评分 (REQ-1).
 *
 * 13 个竞品覆盖 5 个 tier:
 *   - generic-llm     (3): ChatGPT / Claude.ai / Gemini
 *   - research-platform (4): AlphaSense / Hebbia / FinChat / 妙想 AI
 *   - quant-platform   (2): 聚宽 JoinQuant / 优矿 uqer
 *   - news-terminal    (2): Bloomberg Terminal / Wind 万得
 *   - open-source-llm  (1): Aider / Cursor (CLI-first AI coding for traders 自建)
 *   - self             (1): UpUp 自身(放最后,方便对比)
 *
 * 7 维度见 types.ts:CompetitorDims。
 *
 * 评分原则:
 *   - 严格可验证:有官方文档/截图证明得 2,有非官方证据得 1,无任何证据 = 0。
 *   - price 维度用 -2/-1/0,无正数(投研类工具不靠"贵"得 2)。
 *   - openSource 二值:0 闭源 / 2 开源(MIT/Apache-2.0/GPL)。
 */

import type { CompetitorMatrix, Competitor } from './types.js';

/** 13 竞品完整数据(只读) */
export const COMPETITORS: CompetitorMatrix = [
  // ---- 3 generic-llm ----
  {
    id: 'chatgpt',
    name: 'ChatGPT (OpenAI)',
    region: 'us',
    tier: 'generic-llm',
    dims: { cli: 0, coverage: 1, trading: 0, push: 0, collab: 0, openSource: 0, price: -1 },
    positioning: '通用对话 LLM,无投研专用工具,无法下单,需手动复制数据。',
  },
  {
    id: 'claude-ai',
    name: 'Claude.ai (Anthropic)',
    region: 'us',
    tier: 'generic-llm',
    dims: { cli: 0, coverage: 1, trading: 0, push: 0, collab: 0, openSource: 0, price: -1 },
    positioning: '通用对话 LLM,Artifacts 适合写作但无投研数据/交易接入。',
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    region: 'us',
    tier: 'generic-llm',
    dims: { cli: 0, coverage: 1, trading: 0, push: 0, collab: 0, openSource: 0, price: -1 },
    positioning: '通用对话 LLM,Deep Research 模式可读网页但仍无交易/推送。',
  },

  // ---- 4 research-platform ----
  {
    id: 'alpha-sense',
    name: 'AlphaSense',
    region: 'us',
    tier: 'research-platform',
    dims: { cli: 0, coverage: 2, trading: 0, push: 1, collab: 2, openSource: 0, price: -2 },
    positioning: '企业级研报全文搜索 + 财报 + 业绩电话,年费约 $10K+,无 CLI。',
  },
  {
    id: 'hebbia',
    name: 'Hebbia',
    region: 'us',
    tier: 'research-platform',
    dims: { cli: 0, coverage: 2, trading: 0, push: 1, collab: 2, openSource: 0, price: -2 },
    positioning: 'Matrix 投研工作流,长文档解析强,企业级定价,无 CLI/无开源。',
  },
  {
    id: 'finchat',
    name: 'FinChat',
    region: 'us',
    tier: 'research-platform',
    dims: { cli: 0, coverage: 2, trading: 0, push: 0, collab: 1, openSource: 0, price: -1 },
    positioning: '投资人聊天 + 财报数据库,无 CLI、无推送、无交易。',
  },
  {
    id: 'miaoxiang-ai',
    name: '妙想 AI (同花顺)',
    region: 'cn',
    tier: 'research-platform',
    dims: { cli: 0, coverage: 1, trading: 0, push: 0, collab: 0, openSource: 0, price: 0 },
    positioning: '同花顺 i 问财升级,绑 iFinD 数据,A 股问句强,无 CLI/无开源。',
  },

  // ---- 2 quant-platform ----
  {
    id: 'joinquant',
    name: '聚宽 JoinQuant',
    region: 'cn',
    tier: 'quant-platform',
    dims: { cli: 1, coverage: 1, trading: 1, push: 0, collab: 1, openSource: 0, price: -1 },
    positioning: 'Python 回测 + 模拟盘,A 股为主,无多 Agent,无 5 路推送。',
  },
  {
    id: 'uqer',
    name: '优矿 uqer',
    region: 'cn',
    tier: 'quant-platform',
    dims: { cli: 1, coverage: 1, trading: 1, push: 0, collab: 1, openSource: 0, price: -1 },
    positioning: '通联数据旗下,Python 回测,机构版门槛高,无 CLI-first 体验。',
  },

  // ---- 2 news-terminal ----
  {
    id: 'bloomberg',
    name: 'Bloomberg Terminal',
    region: 'global',
    tier: 'news-terminal',
    dims: { cli: 1, coverage: 2, trading: 2, push: 1, collab: 2, openSource: 0, price: -2 },
    positioning: '黄金标准终端,$2.4 万/年/席位,IB/Excel 集成,无 LLM Agent 编排。',
  },
  {
    id: 'wind',
    name: 'Wind 万得',
    region: 'cn',
    tier: 'news-terminal',
    dims: { cli: 1, coverage: 2, trading: 1, push: 0, collab: 1, openSource: 0, price: -2 },
    positioning: '国内机构标配终端,数据全,无 CLI-first,无 LLM Agent 编排。',
  },

  // ---- 1 open-source-llm (CLI-first AI coding 范式) ----
  {
    id: 'aider',
    name: 'Aider (CLI AI coding)',
    region: 'open-source',
    tier: 'open-source-llm',
    dims: { cli: 2, coverage: 0, trading: 0, push: 0, collab: 0, openSource: 2, price: 0 },
    positioning: '开源 CLI-first AI 编程范式参考,但只用于 coding,无投研/交易。',
  },

  // ---- 1 self (UpUp 自身) ----
  {
    id: 'upup',
    name: 'UpUp (我们)',
    region: 'cn',
    tier: 'self',
    dims: { cli: 2, coverage: 2, trading: 2, push: 2, collab: 2, openSource: 2, price: 0 },
    positioning: 'CLI-first + 全市场 + 自动交易 + 5 路推送 + 团队协作 + MIT 开源 + 0 元。',
  },
];

// ---------------------------------------------------------------------------
// Validation (REQ-1: 13 entries + dim values within bounds)
// ---------------------------------------------------------------------------

export interface MatrixValidationResult {
  ok: boolean;
  totalEntries: number;
  errors: string[];
}

/** 验证 13 竞品完整 + 7 维度值在合法集合内。 */
export function validateMatrix(): MatrixValidationResult {
  const errors: string[] = [];
  if (COMPETITORS.length !== 13) {
    errors.push(`expected 13 entries, got ${COMPETITORS.length}`);
  }
  const ids = new Set<string>();
  for (const c of COMPETITORS) {
    if (ids.has(c.id)) errors.push(`duplicate id: ${c.id}`);
    ids.add(c.id);
    const d = c.dims;
    if (![0, 1, 2].includes(d.cli)) errors.push(`${c.id}.cli=${d.cli} not in {0,1,2}`);
    if (![0, 1, 2].includes(d.coverage)) errors.push(`${c.id}.coverage=${d.coverage} not in {0,1,2}`);
    if (![0, 1, 2].includes(d.trading)) errors.push(`${c.id}.trading=${d.trading} not in {0,1,2}`);
    if (![0, 1, 2].includes(d.push)) errors.push(`${c.id}.push=${d.push} not in {0,1,2}`);
    if (![0, 1, 2].includes(d.collab)) errors.push(`${c.id}.collab=${d.collab} not in {0,1,2}`);
    if (![0, 2].includes(d.openSource)) errors.push(`${c.id}.openSource=${d.openSource} not in {0,2}`);
    if (![-2, -1, 0].includes(d.price)) errors.push(`${c.id}.price=${d.price} not in {-2,-1,0}`);
  }
  return { ok: errors.length === 0, totalEntries: COMPETITORS.length, errors };
}

/** 按 tier 分组(用于 docs/COMPETITIVE.md 表格渲染) */
export function groupByTier(matrix: CompetitorMatrix = COMPETITORS): Record<string, Competitor[]> {
  const groups: Record<string, Competitor[]> = {};
  for (const c of matrix) {
    if (!groups[c.tier]) groups[c.tier] = [];
    groups[c.tier]!.push(c);
  }
  return groups;
}

/** UpUp 自身在每个维度上的领先竞品数(用于 4 唯一 D1 论证) */
export function leadCountByDim(matrix: CompetitorMatrix = COMPETITORS): Record<string, number> {
  const self = matrix.find((c) => c.id === 'upup');
  if (!self) return {};
  const others = matrix.filter((c) => c.id !== 'upup');
  const dims: (keyof Competitor['dims'])[] = ['cli', 'coverage', 'trading', 'push', 'collab', 'openSource', 'price'];
  const out: Record<string, number> = {};
  for (const d of dims) {
    let count = 0;
    for (const o of others) {
      // price 反向(越小越便宜=越好),openSource 二值
      if (d === 'price') {
        if (self.dims[d] < o.dims[d]) count++;
      } else if (d === 'openSource') {
        if (self.dims[d] > o.dims[d]) count++;
      } else if (self.dims[d] > o.dims[d]) {
        count++;
      }
    }
    out[d] = count;
  }
  return out;
}
