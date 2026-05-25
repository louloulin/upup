# Plan42.md - UpUp 投资助手平台化改进计划 v4.6

> 更新时间: 2026-05-25
> 版本: 4.6 (测试增强版)
> 目标: 构建投资版 Claude Code + 平台化扩展生态

---

## 一、实施状态

### ✅ 已完成功能

| 功能 | 状态 | 验证 | 来源 |
|------|------|------|------|
| Intent Detector | ✅ 完成 | 36 tests passed | 自主实现 |
| Skill Trigger | ✅ 完成 | 已验证 | 自主实现 |
| Auto-Trigger 集成 | ✅ 完成 | 24 tests passed | 自主实现 |
| Agent Auto-Trigger 集成 | ✅ 完成 | 12 tests passed | 自主实现 |
| Investment Hooks 集成 | ✅ 完成 | 已集成到 Auto-Trigger | 自主实现 |
| MCP Skills | ✅ 完成 | 已验证 | 自主实现 |
| Shell 权限系统 | ✅ 完成 | 已验证 | 自主实现 |
| PowerShell 支持 | ✅ 完成 | 已验证 | 自主实现 |
| Integration 文档 | ✅ 完成 | 已创建 | 自主实现 |
| TypeScript 编译 | ✅ 完成 | 0 errors | 自主实现 |
| Build 成功 | ✅ 完成 | dist/upup | 自主实现 |

### 🐛 Bug 修复

- **300xxx代码验证bug**: 修复了创业板代码验证正则表达式 (`^30\\d{4}$`)

### 测试结果汇总

```
Intent Detector Tests:      36 pass (新增 4 个测试)
Auto-Trigger Tests:        24 pass (新增 11 个测试)
Agent Auto-Trigger Tests:  12 pass (新增 1 个测试)
─────────────────────────────
Total:                     72 pass
0 fail
```

### ⬜ 待实施功能 (可选)

| 功能 | 优先级 | 状态 | 参考 |
|------|--------|------|------|
| 工具级并发 | P2 | 可选 | LouCode 模式 |
| 分层压缩优化 | P2 | 可选 | LouCode 模式 |
| Cron 任务调度 | P2 | 可选 | LouCode 模式 |
| 多智能体协作 | P2 | 可选 | LouCode 模式 |

---

## 二、核心实现

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UpUp 投资助手架构                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用户输入                                                                   │
│      │                                                                     │
│      ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                 Intent Detector + Skill Trigger                    │       │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │       │
│  │  │ Ticker提取    │  │ 意图检测      │  │ 技能触发      │        │       │
│  │  │ A股/港股/美股 │  │ valuation    │  │ auto/suggest │        │       │
│  │  │ 基金         │  │ technical    │  │ manual       │        │       │
│  │  └───────────────┘  │ fundamental  │  └───────────────┘        │       │
│  │                     │ risk        │                            │       │
│  │                     │ fund        │                            │       │
│  │                     │ macro       │                            │       │
│  │                     └───────────────┘                            │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│      │                                                                     │
│      ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                    Investment Hooks                               │       │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │       │
│  │  │ Pre-Research  │  │ Post-Research │  │ Risk Assess   │        │       │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│      │                                                                     │
│      ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                    Agent Loop (Claude Code 模式)                  │       │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │       │
│  │  │ 工具执行      │  │ 上下文管理    │  │ 流式响应     │        │       │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、已创建文件

| 文件 | 说明 | 测试 | 状态 |
|------|------|------|------|
| `src/agent/agent-auto-trigger.ts` | Agent集成层 | 12 tests | ✅ |
| `src/agent/agent-auto-trigger.test.ts` | Agent集成测试 | 12 tests | ✅ |
| `src/agent/auto-trigger.ts` | 自动触发集成器 | 24 tests | ✅ |
| `src/agent/auto-trigger.test.ts` | 自动触发测试 | 24 tests | ✅ |
| `src/skills/intent-detector.ts` | 意图检测器 | 36 tests | ✅ |
| `src/skills/intent-detector.test.ts` | 意图检测测试 | 36 tests | ✅ |
| `src/skills/skill-trigger.ts` | 技能触发器 | - | ✅ |
| `src/agent/INTEGRATION.md` | 集成文档 | - | ✅ |

---

## 四、使用示例

### 4.1 基本使用

```typescript
import { getAutoTriggerIntegration } from './agent/auto-trigger.js';
import { detectIntents, extractTickers } from './skills/intent-detector.ts';

// 检测股票代码
const tickers = extractTickers('分析贵州茅台 600519 和 腾讯 00700');
// [{ code: '600519', market: 'A-share' }, { code: '00700', market: 'HK' }]

// Auto-Trigger
const trigger = getAutoTriggerIntegration({ 
  enabled: true, 
  mode: 'suggest',
  showSuggestions: true 
});

const result = trigger.detectAndSuggest('帮我分析茅台的估值和风险');
// result.intents: [valuation, risk, ticker]
// result.tickers: ['600519']
// result.triggers: [{ skill: 'dcf-valuation', status: 'suggested' }]
```

### 4.2 Agent 集成

```typescript
import { getAgentAutoTriggerIntegration } from './agent/agent-auto-trigger.js';

// 在 Agent.run() 中
const integration = getAgentAutoTriggerIntegration();

// 查询开始时
const triggerResult = await integration.onQueryStart(query);
if (triggerResult.suggestion) {
  // 显示技能建议 UI
}

// 查询结束时
await integration.onQueryEnd(query, triggerResult, duration);
```

---

## 五、LouCode 学习总结

### 关键架构模式 (来自 LouCode)

| 模式 | LouCode | UpUp | 状态 |
|------|---------|------|------|
| 工具级并发 | 支持(最多10) | 顺序调用 | P2 可选 |
| Cron 任务 | 支持 | 无 | P2 可选 |
| 主动模式 | 事件总线 | 无 | P2 可选 |
| 技能执行 | Forked agent | 已集成 | ✅ |

### LouCode 核心组件参考

- `QueryEngine` - 查询生命周期管理
- `toolOrchestration` - 工具并发编排
- `daemon/workers/tasks` - Cron 任务调度
- `proactive` - 主动模式事件系统

---

## 六、验证命令

```bash
# 构建验证
bun run build

# 单元测试 - Intent Detector (36 tests)
bun test src/skills/intent-detector.test.ts

# 单元测试 - Auto-Trigger (24 tests)
bun test src/agent/auto-trigger.test.ts

# 单元测试 - Agent Auto-Trigger (12 tests)
bun test src/agent/agent-auto-trigger.test.ts

# 集成测试 (72 tests)
bun test src/agent/agent-auto-trigger.test.ts src/agent/auto-trigger.test.ts src/skills/intent-detector.test.ts
```

---

## 七、新增测试用例

### Intent Detector Extended Tests
- `detects all supported intent types` - 测试所有意图类型检测
- `detects all supported market tickers` - 测试所有市场代码提取
- `handles complex investment queries` - 测试复杂投资查询
- `confidence scoring works correctly` - 测试置信度评分

### Auto-Trigger Extended Tests
- `handles Chinese investment terms` - 测试中文投资术语
- `handles English investment terms` - 测试英文投资术语
- `handles mixed Chinese-English queries` - 测试中英文混合查询
- `respects disabled mode` - 测试禁用模式
- `handles multiple tickers from same market` - 测试同市场多代码
- `handles multiple tickers from different markets` - 测试跨市场多代码
- `triggers appropriate skills for valuation` - 测试估值技能触发
- `triggers appropriate skills for technical analysis` - 测试技术分析技能触发
- `triggers appropriate skills for fund analysis` - 测试基金分析技能触发
- `singleton pattern works correctly` - 测试单例模式
- `reset clears singleton` - 测试重置功能
- `config update works` - 测试配置更新

---

**最后更新**: 2026-05-25
**状态**: ✅ P0 功能全部完成 (72 tests passed)
**版本**: v4.6
