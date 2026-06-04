/**
 * 投研 Claude 主对话人设系统 (Sprint 1.1 of top-tier-investment-claude-code).
 *
 * 顶层设计(来自 design.md § 3.1):
 *   - 把 upup 主对话从"通用 LLM 工具"升级为"投研 Claude"——人格化、引用源、
 *     风险提示、不直接给买卖建议、用户分层感知。
 *   - 跨层协议: L1 ↔ Coach 通过 system prompt 注入(`buildCoachSystemPrompt`),
 *     所有 subagent 继承人设。
 *   - 软降级: `UPUP_COACH_MODE=0` 关闭,不抛错,主对话正常运行。
 *
 * 编译开关:
 *   - 编译时 DCE: `BUN_CONFIG_FEATURE_COACH_MODE=0` 排除整段代码
 *   - 启动时:    `UPUP_COACH_MODE=0` 软关闭(不抛错)
 *   - 默认:      off(需主动启用,避免污染主对话)
 */
import { isFeatureCompiledIn } from './feature-gates.js';
import { recordFeatureGate } from '../telemetry/integration.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 用户分层(影响话术与详略程度) */
export type UserPersona = 'retail' | 'active' | 'private-fund' | 'enterprise';

/** 风险偏好(影响推荐强度) */
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive';

/** 投资风格偏好 */
export type InvestingStyle = 'value' | 'growth' | 'momentum' | 'quant' | 'mixed';

/**
 * 注入到主对话的 Coach 上下文。
 *
 * 全部字段可选——空上下文 = 全新用户,Coach 用通用人设。
 * 非空字段越多,Coach 个性化越强(可由 KAIROS Dream 整合从 `.upup/coach/memory.json` 加载)。
 */
export interface CoachPromptContext {
  /** 用户分层 */
  persona?: UserPersona;
  /** 风险偏好 */
  riskAppetite?: RiskAppetite;
  /** 投资风格 */
  style?: InvestingStyle;
  /** 关注行业(中文,逗号分隔) */
  watchedSectors?: string[];
  /** 关注标的(代码 + 名称) */
  watchlist?: Array<{ symbol: string; name?: string }>;
  /** 上次咨询的标的(用于主动引用) */
  recentTickers?: string[];
  /** 当前是否为交易日 + 时段,影响主动推送触达 */
  marketSession?: 'pre-market' | 'intraday' | 'after-hours' | 'closed';
}

// ---------------------------------------------------------------------------
// Persona content (中文,200 字人设 / 100 字准则 / 50 字触发)
// ---------------------------------------------------------------------------

const COACH_SELF_INTRO = `你是"投研 Claude"——UpUp 投研版 Claude Code 的主对话人格。
你不是通用 LLM 工具,你是中文圈投资者的专属投研助手。
你熟悉 A 股、美股、港股、加密四市场,熟悉 Brinson 归因、组合再平衡、行业轮动、
财报分析、风险预算。你引用数据必带来源 URL 与时间戳,涉及投资建议必带风险提示。`;

const COACH_CORE_PRINCIPLES = `四条核心准则(违反任何一条都算 prompt 失败):

1. **引用源**:每个数据点必须可追溯——带 source URL + 时间戳,或明确说明"估算 / 经验值"。
   不接受"大概是"、"差不多是"这种模糊表达。

2. **风险提示**:涉及投资建议时,回复末尾必须包含"本工具不构成投资建议,
   投资有风险,决策需谨慎"。

3. **不直接买卖**:你只给"分析 + 候选 + 风险",不给"买 X 卖 Y"。
   即使用户问"该不该买",你也只说"基于当前信息,候选标的 A/B/C,各自风险点是..."。

4. **用户分层**:散户偏白话、活跃偏策略、私募偏深度、企业偏合规与审计。
   同一问题,不同用户给不同详略。`;

const COACH_PUSH_TRIGGERS = `主动推送触发条件:仅在 Coach 主动模式下生效
(由 KAIROS 调度,非主对话触发):
- 晨会:每个交易日 9:00 前(用户配置)
- 盘后:每个交易日 15:30 后
- 财报日:持仓 / 关注股 T-1 / T+0
- 政策日:从 alt-data 订阅的政策事件触发`;

// ---------------------------------------------------------------------------
// 辅助:把 context 渲染成可读的中文片段
// ---------------------------------------------------------------------------

function renderContextSection(ctx: CoachPromptContext | undefined): string {
  if (!ctx) return '';
  const lines: string[] = [];
  if (ctx.persona) {
    const personaLabel: Record<UserPersona, string> = {
      'retail': '散户(白话,基础概念解释)',
      'active': '活跃(策略 + 工具用法)',
      'private-fund': '私募(深度 + 多维度对比)',
      'enterprise': '企业(合规 + 审计 + 风控)',
    };
    lines.push(`- 用户分层:${personaLabel[ctx.persona]}`);
  }
  if (ctx.riskAppetite) {
    const r = { conservative: '保守', balanced: '平衡', aggressive: '激进' }[ctx.riskAppetite];
    lines.push(`- 风险偏好:${r}`);
  }
  if (ctx.style) {
    const s = { value: '价值', growth: '成长', momentum: '动量', quant: '量化', mixed: '混合' }[ctx.style];
    lines.push(`- 投资风格:${s}`);
  }
  if (ctx.watchedSectors?.length) {
    lines.push(`- 关注行业:${ctx.watchedSectors.join('、')}`);
  }
  if (ctx.watchlist?.length) {
    const items = ctx.watchlist.slice(0, 20).map(w => w.name ? `${w.symbol}(${w.name})` : w.symbol);
    lines.push(`- 关注标的:${items.join('、')}`);
  }
  if (ctx.recentTickers?.length) {
    lines.push(`- 上次咨询:${ctx.recentTickers.slice(0, 5).join('、')}`);
  }
  if (ctx.marketSession) {
    const s = {
      'pre-market': '盘前',
      'intraday': '盘中',
      'after-hours': '盘后',
      'closed': '休市',
    }[ctx.marketSession];
    lines.push(`- 当前时段:${s}`);
  }
  return lines.length > 0 ? `\n## 用户上下文(基于 KAIROS 持久记忆)\n${lines.join('\n')}\n` : '';
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/** Coach 是否在编译期启用(用于 DCE / 静默跳过) */
export function isCoachCompiledIn(): boolean {
  return isFeatureCompiledIn('COACH_MODE');
}

/**
 * Coach 是否在运行期启用。软降级: 编译期 off → false(无注入);
 * 编译期 on + 启动期 off → false(无注入,不抛错);
 * 编译期 on + 启动期 on → true(注入)。
 */
export function isCoachEnabled(): boolean {
  if (!isCoachCompiledIn()) return false;
  const env = process.env.UPUP_COACH_MODE;
  if (env === '0' || env === 'false' || env === 'off' || env === 'no') return false;
  return true;
}

/**
 * 构建"投研 Claude"系统提示词片段——可被拼到主对话 system prompt 之前。
 *
 * 行为:
 *   - 若 Coach 未启用,返回空字符串(不污染主对话)
 *   - 若启用,返回完整人设(自介 + 准则 + 触发 + 上下文)
 *
 * 不抛错:所有失败路径(编译期 off / 启动期 off / context 渲染失败)都安全降级。
 */
export function buildCoachSystemPrompt(ctx?: CoachPromptContext): string {
  if (!isCoachEnabled()) {
    recordFeatureGate('COACH_MODE', false, 'env');
    return '';
  }
  const ctxSection = renderContextSection(ctx);
  const out = [
    '## 投研 Claude 人设',
    '',
    COACH_SELF_INTRO,
    '',
    COACH_CORE_PRINCIPLES,
    '',
    COACH_PUSH_TRIGGERS,
    ctxSection,
  ].filter(Boolean).join('\n');
  recordFeatureGate('COACH_MODE', true, 'env');
  return out;
}
