# Plan 36: UpUp 基金功能完整版 - 实时行情与高级功能

> **版本**: v1.0
> **创建日期**: 2026-05-24
> **核心定位**: 基金功能完整版 + 实时行情 + 可视化报告

---

## 一、项目概述

### 1.1 背景

基于 Plan33/34/35 已完成的工作：

| Plan | 完成度 | 主要成果 |
|------|--------|----------|
| Plan33 | 100% | 14个基金工具 + 6个技能 |
| Plan34 | 95% | 回测引擎 + 类型修复 |
| Plan35 | 100% | 基金筛选 + 智能推荐 |

### 1.2 本次目标

```
┌─────────────────────────────────────────────────────────────────┐
│ UpUp 基金功能完整版 (Plan 36)                                    │
├─────────────────────────────────────────────────────────────────┤
│ 实时行情:                                                       │
│ ├── 实时净值估算                                                │
│ ├── 实时涨跌提醒                                                │
│ └── 历史净值查询                                                │
│                                                                 │
│ 可视化报告:                                                     │
│ ├── 业绩图表生成                                                │
│ ├── 对比图表                                                    │
│ └── 回测曲线图                                                  │
│                                                                 │
│ 高级功能:                                                       │
│ ├── 组合优化                                                    │
│ ├── 智能调仓                                                    │
│ └── 风险控制                                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、当前状态

| 模块 | 状态 | 详情 |
|------|------|------|
| 基金工具 | ✅ 14个 | 搜索/详情/业绩/持仓/经理/筛选/回测 |
| 基金技能 | ✅ 7个 | 分析/对比/推荐/回测 |
| 回测引擎 | ✅ 3种 | DCA/一次性/条件触发 |
| Build | ✅ 通过 | dist/upup |
| Test | ✅ 通过 | 2695 pass |

---

## 三、功能扩展

### 3.1 实时行情 API

```typescript
// 实时净值估算
export async function getFundRealtimeNav(fundCode: string): Promise<{
  estimatedNav: number;
  estimatedRate: number;
  estimatedTime: string;
}>;

// 实时涨跌提醒
export async function watchFundPrice(
  fundCode: string,
  callback: (nav: number, rate: number) => void
): Promise<void>;
```

### 3.2 可视化报告

```typescript
// 业绩图表
interface PerformanceChart {
  fundCode: string;
  periods: {
    '1M': number;
    '3M': number;
    '6M': number;
    '1Y': number;
    '3Y': number;
  };
  benchmark?: string;
  chartUrl?: string;
}

// 回测曲线图
interface BacktestChart {
  dates: string[];
  values: number[];
  invested: number[];
  benchmark?: number[];
}
```

### 3.3 组合优化

```typescript
interface PortfolioOptimizer {
  targetReturn: number;
  maxRisk: number;
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
}

export async function optimizePortfolio(
  funds: string[],
  config: PortfolioOptimizer
): Promise<{
  allocations: { fundCode: string; weight: number }[];
  expectedReturn: number;
  expectedRisk: number;
}>;
```

---

## 四、实现计划

### Phase 1: 实时行情 (P0)

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 实时净值API | fund-realtime.ts | P0 |
| 涨跌提醒 | fund-alert.ts | P0 |
| 历史净值 | fund-history.ts | P1 |

### Phase 2: 可视化 (P1)

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 业绩图表 | fund-chart.ts | P1 |
| 对比图表 | fund-chart.ts | P1 |
| 回测曲线 | fund-chart.ts | P1 |

### Phase 3: 高级功能 (P2)

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 组合优化 | fund-optimizer.ts | P2 |
| 智能调仓 | fund-rebalance.ts | P2 |
| 风险控制 | fund-risk.ts | P2 |

---

## 五、验证计划

### 5.1 单元测试

```bash
bun test test/fund-realtime.test.ts
bun test test/fund-chart.test.ts
bun test test/fund-optimizer.test.ts
```

### 5.2 集成测试

```bash
bun test test/fund-integration.test.ts
```

---

## 六、预期成果

### 6.1 工具清单 (更新后)

| 工具名称 | 功能 | 状态 |
|----------|------|------|
| fund_realtime | 实时净值 | 🚧 新增 |
| fund_watch | 涨跌提醒 | 🚧 新增 |
| fund_chart | 业绩图表 | 🚧 新增 |
| fund_optimize | 组合优化 | 🚧 新增 |
| fund_rebalance | 智能调仓 | 🚧 新增 |

### 6.2 Skills清单 (更新后)

| 技能名称 | 功能 | 状态 |
|----------|------|------|
| fund-analysis | 综合分析 | ✅ |
| fund-realtime | 实时行情 | 🚧 新增 |
| fund-visualization | 可视化报告 | 🚧 新增 |
| portfolio-optimize | 组合优化 | 🚧 新增 |

---

## 七、风险与注意事项

1. **数据延迟**: 实时数据可能有15分钟延迟
2. **API限制**: 天天基金API可能有访问限制
3. **缓存策略**: 合理设置缓存避免频繁请求

---

## 八、后续计划 (Plan 37+)

- 用户自定义策略
- 多市场基金支持
- 移动端UI
- 云同步功能

---

**Plan36.md v1.0**: 2026-05-24
**状态**: 🚧 计划中
**下一步**: 实时行情API实现
