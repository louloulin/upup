/**
 * 4 类投资者决策路径 (REQ-3).
 *
 * 4 类 persona(来自 role-system.ts:UserPersona):
 *   散户 retail:        白话 + 基础概念 + 微信 Server 酱推送
 *   活跃 active:        策略 + 工具 + 飞书 Lark Bot 推送
 *   私募 private-fund:  深度 + 多维 + 钉钉 DingTalk 推送
 *   企业 enterprise:    合规 + 审计 + 邮件 / 本地私有化
 *
 * 每条路径 4-5 个命令入口 + 1 个推送渠道 + 1 段叙述 + 1 个触达节奏。
 */

import type { DecisionPaths, DecisionPath, InvestorPersona } from './types.js';

const RETAIL_PATH: DecisionPath = {
  persona: 'retail',
  title: '散户路径:晨会 → 自选 → 风控 → 复盘',
  commands: [
    '/morning-brief',
    '/watchlist-edit',
    '/risk-dashboard',
    '/portfolio-review',
  ],
  pushChannel: 'wechat',
  narrative:
    '散户最缺"持续纪律",所以推送节奏为每日 9:00 晨会 + 收盘后复盘;' +
    '4 步走:先看晨会大盘与持仓异动 → 编辑自选 → 看风控仪表板 → 复盘当日盈亏。' +
    '全部白话解释,无量化公式,无期权/衍生品。',
  cadence: 'daily',
};

const ACTIVE_PATH: DecisionPath = {
  persona: 'active',
  title: '活跃路径:筛选 → 对比 → 回测 → 再平衡',
  commands: [
    '/screen',
    '/compare',
    '/backtest-run',
    '/rebalance-now',
  ],
  pushChannel: 'feishu',
  narrative:
    '活跃投资者关心"可执行",所以用 4 步量化闭环:' +
    '自然语言筛股 → 多标的横向对比 → 策略回测验证 → 即时再平衡。' +
    '飞书 Lark Bot 实时推送到工作群,带一键交易确认。',
  cadence: 'realtime',
};

const PRIVATE_FUND_PATH: DecisionPath = {
  persona: 'private-fund',
  title: '私募路径:Brinson 归因 → 风险预算 → 会话共享',
  commands: [
    '/portfolio-review',     // Brinson 归因
    '/risk-dashboard',       // VaR / 行业暴露 / 集中度
    '/session-share',        // 投研会话在团队间共享
    '/backtest-run',         // 因子有效性验证
  ],
  pushChannel: 'dingtalk',
  narrative:
    '私募团队关心"可审计、可复盘",所以核心是 Brinson 归因(选股/择时/交互三因子)+' +
    '风险预算仪表板 + 投研会话跨人共享(用于合规审查);' +
    '钉钉 DingTalk 工作群推送,带会话回放链接,方便投决会引用。',
  cadence: 'weekly',
};

const ENTERPRISE_PATH: DecisionPath = {
  persona: 'enterprise',
  title: '企业路径:Docker 部署 → Bridge 控制台 → 邮件日报',
  commands: [
    '/doctor',         // 自检
    '/session-share',  // 内部审计
    '/portfolio-review',
  ],
  pushChannel: 'email',
  narrative:
    '企业(银行/保险/上市公司)关心"私有化 + 审计 + 合规":' +
    'docker compose up 一键本地部署,Bridge Web 控制台(端口 8787)给 IT 管理;' +
    '所有 prompt / tool / trade 全链路审计日志(可导出 PDF),' +
    '每日邮件日报给合规部门。',
  cadence: 'daily',
};

/** 4 类完整决策路径(顺序固定:retail → active → private-fund → enterprise) */
export const DECISION_PATHS: DecisionPaths = [
  RETAIL_PATH,
  ACTIVE_PATH,
  PRIVATE_FUND_PATH,
  ENTERPRISE_PATH,
];

/** 按 persona 查找(找不到返回 undefined) */
export function findPathByPersona(p: InvestorPersona): DecisionPath | undefined {
  return DECISION_PATHS.find((d) => d.persona === p);
}

/** 校验 4 路径完整(每条都有 commands/pushChannel/narrative/cadence) */
export function validateDecisionPaths(paths: DecisionPaths = DECISION_PATHS): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (paths.length !== 4) errors.push(`expected 4 paths, got ${paths.length}`);
  const seen = new Set<InvestorPersona>();
  for (const p of paths) {
    if (seen.has(p.persona)) errors.push(`duplicate persona: ${p.persona}`);
    seen.add(p.persona);
    if (p.commands.length < 3) errors.push(`${p.persona}: commands.length=${p.commands.length}(<3)`);
    if (!['wechat', 'feishu', 'dingtalk', 'email', 'cli'].includes(p.pushChannel)) {
      errors.push(`${p.persona}: invalid pushChannel=${p.pushChannel}`);
    }
    if (p.narrative.length < 30) errors.push(`${p.persona}: narrative too short(${p.narrative.length})`);
    if (!['daily', 'weekly', 'realtime'].includes(p.cadence)) errors.push(`${p.persona}: invalid cadence=${p.cadence}`);
  }
  const expected: InvestorPersona[] = ['retail', 'active', 'private-fund', 'enterprise'];
  for (const e of expected) {
    if (!seen.has(e)) errors.push(`missing persona: ${e}`);
  }
  return { ok: errors.length === 0, errors };
}
