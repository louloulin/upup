# Plan42.md - UpUp 投资助手平台化改进计划 v4.1

> 更新时间: 2026-05-25
> 版本: 4.1 (实施版)
> 目标: 构建投资版 Claude Code + 平台化扩展生态

---

## 一、实施状态

### ✅ 已完成功能

| 功能 | 状态 | 验证 |
|------|------|------|
| Intent Detector | ✅ 完成 | 32 tests passed |
| Skill Trigger | ✅ 完成 | 已集成 |
| MCP Skills | ✅ 完成 | 已验证 |
| Shell 权限系统 | ✅ 完成 | 已验证 |
| PowerShell 支持 | ✅ 完成 | 已验证 |
| TypeScript 编译 | ✅ 完成 | 0 errors |

### ⬜ 待实施功能

| 功能 | 优先级 | 状态 |
|------|--------|------|
| Investment Hooks 集成 | P0 | 待实施 |
| Auto-Trigger 集成到 Agent | P0 | 待实施 |
| 多智能体协作 | P2 | 可选 |

---

## 二、核心实现

### 2.1 Intent Detector (已完成)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Intent Detector 架构                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   用户输入 ──▶ Ticker提取 ──▶ 意图匹配 ──▶ 技能建议                        │
│                            │                                                │
│                            ▼                                                │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                      支持的市场                                      │   │
│   │                                                                     │   │
│   │   A股 (600/000/002/300/688/430/830)  ✅                          │   │
│   │   港股 (0xxxx)                        ✅                          │   │
│   │   美股 (A-Z 大写字母)                 ✅                          │   │
│   │   基金 (1/5/6 开头6位)               ✅                          │   │
│   │                                                                     │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                      支持的意图类型                                 │   │
│   │                                                                     │   │
│   │   valuation (估值)      ✅  triggers: [估值, DCF, PE, PB...]      │   │
│   │   technical (技术)       ✅  triggers: [K线, 均线, MACD...]      │   │
│   │   fundamental (基本面)    ✅  triggers: [财务, 利润, ROE...]       │   │
│   │   risk (风险)            ✅  triggers: [风险, 回撤, VaR...]        │   │
│   │   fund (基金)           ✅  triggers: [基金, ETF, 净值...]        │   │
│   │   macro (宏观)          ✅  triggers: [GDP, CPI, PMI...]           │   │
│   │   portfolio (组合)      ✅  triggers: [持仓, 仓位, 分散...]       │   │
│   │   alert (告警)          ✅  triggers: [告警, 提醒, 通知...]       │   │
│   │   command (斜杠命令)    ✅  triggers: [/dcf, /fund...]          │   │
│   │                                                                     │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 测试验证

```bash
$ bun test src/skills/intent-detector.test.ts

  32 pass
  0 fail
  44 expect() calls
```

### 2.3 使用示例

```typescript
import { IntentDetector, extractTickers } from './skills/intent-detector.ts';

// 检测股票代码
const tickers = extractTickers('分析贵州茅台 600519 和 腾讯 00700');
// [{ code: '600519', market: 'A-share' }, { code: '00700', market: 'HK' }]

// 检测意图
const detector = new IntentDetector({ mode: 'suggest' });
const { intents, suggestion } = detector.detectWithSuggestions('帮我分析茅台的估值和风险');
// intents: [valuation, risk]
// suggestion: "检测到估值意图，建议运行: /dcf-valuation, /pe-ratio..."
```

---

## 三、架构设计

### 3.1 分层架构

```
L4: 用户交互层 (CLI/API/Web)
L3: 核心Agent层 (Claude Code 模式)
L2: 投资能力层 (Hooks/Memory/Alert)
L1: 扩展生态层 (Skills/MCP/Plugin)
```

### 3.2 Skills 触发流程

```
用户输入
    │
    ▼
Intent Detector ──▶ 提取 Ticker
    │                  │
    │                  ▼
    │           Skill Trigger ──▶ 匹配技能
    │                  │
    │                  ▼
    │           Skill Executor ──▶ 执行技能
    │                  │
    └──────────────────┴──▶ Agent Loop
```

---

## 四、下一步计划

### P0: Investment Hooks 集成

```typescript
// src/agent/investment-hooks.ts
export class InvestmentAgentHooks {
  async preResearch(query: string, tickers: string[]) { }
  async postResearch(query: string, findings: Finding[]) { }
  async preDecision(decision: Decision) { }
}
```

### P0: Auto-Trigger 集成

```typescript
// src/agent/agent.ts
const { intents, suggestion } = intentDetector.detectWithSuggestions(input);
if (suggestion) {
  // 显示技能建议
}
```

---

## 五、验证命令

```bash
# 构建验证
bun run build

# 单元测试
bun test src/skills/intent-detector.test.ts

# 集成测试
bun test src/skills/

# E2E 测试
echo "分析茅台的估值" | bun run dist/upup
```

---

**最后更新**: 2026-05-25
**状态**: ✅ Intent Detector 已完成并验证通过
