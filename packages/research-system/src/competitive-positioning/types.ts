/**
 * Competitive Positioning — 类型定义 (Sprint v4-2 of top-tier-investment-claude-code-v4).
 *
 * 目标:把"投研 AI Agent"赛道的 13 个竞品量化为 7 维度矩阵,
 * 量化 UpUp 自身 4 唯一差异化的证据,产出 docs/COMPETITIVE.md
 * 投资者故事。
 *
 * 数据驱动:matrix 是静态可验证;four-uniques 是从 repo 真实文件
 * 系统扫描得出(dynamic load + fs);decision-path 是 persona → 命令
 * 列表; sologan 是 30 字 sologan + 3 反驳。
 */

// ---------------------------------------------------------------------------
// 7 维度评分 (REQ-1)
// ---------------------------------------------------------------------------

/**
 * 能力维度(0/1/2 三档;0 = 无,1 = 基础,2 = 顶级)。
 *
 * - cli:        CLI 形态(0 = 仅 GUI/网页,1 = 有 CLI,2 = CLI-first)
 * - coverage:   投研覆盖(0 = 不覆盖,1 = 单市场,2 = 全市场)
 * - trading:    自动交易(0 = 不可,1 = 仅建议,2 = 可下单/可回测)
 * - push:       推送渠道(0 = 无,1 = 1-2 渠道,2 = ≥3 渠道)
 * - collab:     团队协作(0 = 个人,1 = 共享 watchlist,2 = 完整协作 + 审计)
 * - openSource: 开源(0 = 闭源,2 = 开源)
 * - price:      价格档(-2 = 极贵,Bloomberg 级;-1 = 贵,Wind/同花顺;0 = 免费)
 */
export interface CompetitorDims {
  cli: 0 | 1 | 2;
  coverage: 0 | 1 | 2;
  trading: 0 | 1 | 2;
  push: 0 | 1 | 2;
  collab: 0 | 1 | 2;
  openSource: 0 | 2;
  price: -2 | -1 | 0;
}

/**
 * 13 竞品之一。id 是稳定 slug(sort/匹配用);name 是显示名;
 * region 是主要覆盖地域;tier 是定位(generic / 投研 / 量化 / 资讯)。
 */
export interface Competitor {
  id: string;
  name: string;
  region: 'cn' | 'us' | 'global' | 'open-source';
  tier: 'generic-llm' | 'research-platform' | 'quant-platform' | 'news-terminal' | 'open-source-llm' | 'self';
  dims: CompetitorDims;
  /** 1-2 句定位(用作 docs/COMPETITIVE.md 表格脚注) */
  positioning: string;
}

/** 完整 13 竞品矩阵 */
export type CompetitorMatrix = Competitor[];

// ---------------------------------------------------------------------------
// 4 唯一差异化的证据 (REQ-2)
// ---------------------------------------------------------------------------

/** 一项 evidence 的基础结构 */
export interface UniqueEvidence {
  /** 唯一 ID:D1/D2/D3/D4 */
  id: 'D1' | 'D2' | 'D3' | 'D4';
  /** 中文标题 */
  title: string;
  /** 英文/拼音短名 */
  slug: string;
  /** 量化证据(数字/布尔/路径) */
  metrics: Record<string, string | number | boolean>;
  /** 是否全部达标(soft-pass) */
  passed: boolean;
  /** 失败原因(若 passed = false) */
  notes?: string;
}

/** 4 唯一完整收集结果 */
export interface FourUniquesReport {
  generatedAt: string;
  repoRoot: string;
  uniques: UniqueEvidence[];
  passedCount: number;
  total: 4;
}

// ---------------------------------------------------------------------------
// 4 类投资者决策路径 (REQ-3)
// ---------------------------------------------------------------------------

export type InvestorPersona = 'retail' | 'active' | 'private-fund' | 'enterprise';

/** 一条决策路径:1 类 persona + N 个命令入口 + 1 个推送渠道 + 一段说明 */
export interface DecisionPath {
  persona: InvestorPersona;
  title: string;
  /** 推荐命令(对应 src/commands/* 或 /xxx CLI 命令) */
  commands: string[];
  /** 主推送渠道(对应 src/coach/channels/*) */
  pushChannel: 'wechat' | 'feishu' | 'dingtalk' | 'email' | 'cli';
  /** 中文叙述 */
  narrative: string;
  /** 触达节奏(每日 / 每周 / 实时) */
  cadence: 'daily' | 'weekly' | 'realtime';
}

export type DecisionPaths = DecisionPath[];

// ---------------------------------------------------------------------------
// Sologan + 反驳 (REQ-5)
// ---------------------------------------------------------------------------

/** 一段常见质疑 + UpUp 反驳(为什么不用 X) */
export interface CounterArgument {
  /** 被质疑的替代品 */
  target: string;
  /** 中文:目标产品定位 */
  targetPositioning: string;
  /** 中文:UpUp 反驳(50-100 字) */
  rebuttal: string;
  /** 1 个真实可验证证据(如 "5 路推送" / "MIT 开源" / "本地私有化") */
  evidence: string;
}

/** Sologan + 反驳组合 */
export interface SologanBundle {
  /** 30 字 sologan(精确 28-32 字) */
  sologan: string;
  /** 字数(应 28-32) */
  charCount: number;
  /** 3 条反驳(为什么不用 X) */
  counterArgs: CounterArgument[];
}
