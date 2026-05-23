# Plan 34: UpUp 基金交易与回测系统扩展

> **版本**: v1.0
> **创建日期**: 2026-05-24
> **核心定位**: 基金交易模拟 + 回测系统 + 智能推荐

---

## 一、项目概述

### 1.1 背景

基于 plan33.md 已完成的基金基础功能（14工具+6技能），本次计划重点扩展：

| 现有功能 | 本次扩展 |
|----------|----------|
| 基金搜索/详情/业绩 | ✅ 交易模拟 |
| 持仓分析/经理分析 | ✅ 回测系统 |
| 基金筛选/推荐 | ✅ 历史回测 |
| 关注列表/警报 | ✅ 智能定投 |

### 1.2 目标

```
┌─────────────────────────────────────────────────────────────────┐
│ UpUp 基金交易与回测系统 (Phase 2)                                │
├─────────────────────────────────────────────────────────────────┤
│ 交易模拟:                                                       │
│ ├── 模拟买入/卖出基金                                           │
│ ├── 组合管理 (持仓/盈亏)                                       │
│ ├── 交易记录追踪                                               │
│ └── 手续费计算                                                  │
│                                                                 │
│ 回测系统:                                                       │
│ ├── DCA定投回测 (月/周)                                        │
│ ├── 一次性投资回测                                             │
│ ├── 条件触发交易回测                                           │
│ └── 业绩对比基准                                                │
│                                                                 │
│ 智能推荐:                                                       │
│ ├── 基于风险的推荐                                             │
│ ├── 基于目标的推荐                                             │
│ └── 多策略对比                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 当前状态

| 模块 | 文件 | 状态 |
|------|------|------|
| **交易模拟** | `fund-trade.ts` | ✅ 基础完成 |
| **筛选推荐** | `fund-screening.ts` | ✅ 基础完成 |
| **持仓分析** | `fund-holdings-analysis.ts` | ✅ 完成 |
| **Tools注册** | `fund-tool.ts` | ⚠️ 待验证 |

### 1.4 差距分析

| 能力 | 现状 | 目标 | 优先级 |
|------|------|------|--------|
| 回测引擎 | ❌ 无 | ✅ DCA+条件触发 | P0 |
| 基准对比 | ❌ 无 | ✅ vs沪深300 | P0 |
| 定投模拟 | ⚠️ 基础 | ✅ 完整DCA | P1 |
| 业绩归因 | ❌ 无 | ✅ 收益分解 | P1 |
| 可视化报告 | ❌ 无 | ✅ 图表输出 | P2 |

---

## 二、现有架构分析

### 2.1 fund-trade.ts (交易模拟)

```typescript
// 已实现功能
├── SimulatedTrade     // 交易记录类型
├── PortfolioHolding    // 持仓类型
├── Portfolio           // 组合类型
├── createPortfolio()   // 创建组合
├── getPortfolio()      // 获取组合
├── buyFund()           // 买入
├── sellFund()          // 卖出
└── getTrades()         // 交易记录

// 存储位置
├── .upup/portfolio.json   // 组合数据
└── .upup/trades.json      // 交易记录
```

### 2.2 fund-screening.ts (筛选推荐)

```typescript
// 已实现功能
├── ScreeningCriteria      // 筛选条件
├── FundRecommendationScore  // 评分
├── screenFunds()           // 筛选
├── getFundRecommendations() // 智能推荐
├── compareFunds()          // 基金对比
└── getScreeningStrategies() // 策略模板
```

### 2.3 fund-holdings-analysis.ts (持仓分析)

```typescript
// 已实现功能
├── HoldingAnalysis    // 持仓分析类型
├── StockMapping       // 股票映射
├── getHoldingsAnalysis()    // 获取分析
├── mapStocksToSectors()     // 行业映射
├── calculateConcentration() // 集中度
└── generateHoldingReport()  // 生成报告
```

---

## 三、扩展功能设计

### 3.1 回测引擎 (核心)

```typescript
// 回测配置
interface BacktestConfig {
  fundCode: string;
  startDate: string;      // 开始日期
  endDate: string;        // 结束日期
  initialAmount: number;  // 初始资金
  strategy: 'dca' | 'lump_sum' | 'threshold';
  
  // DCA参数
  dca?: {
    frequency: 'weekly' | 'monthly';
    amount: number;
    dayOfWeek?: number;    // 1-5
    dayOfMonth?: number;  // 1-28
  };
  
  // 条件触发参数
  threshold?: {
    buyBelowNav: number;   // 净值低于此值买入
    sellAboveNav: number;  // 净值高于此值卖出
    buyPercent: number;    // 每次买入比例
    sellPercent: number;   // 每次卖出比例
  };
  
  // 基准对比
  benchmark?: {
    code: string;  // 对比基金代码
    enable: boolean;
  };
}

interface BacktestResult {
  config: BacktestConfig;
  
  // 基础统计
  totalInvested: number;      // 总投入
  finalValue: number;         // 最终市值
  totalReturn: number;         // 总收益
  totalReturnPercent: number;  // 总收益率
  
  // 交易统计
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  averageCost: number;         // 平均成本
  
  // 风险指标
  maxDrawdown: number;         // 最大回撤
  volatility: number;          // 波动率
  sharpeRatio: number;         // 夏普比率
  
  // 时间序列
  timeline: BacktestSnapshot[];
  
  // 对比基准
  benchmarkReturn?: number;
  alpha?: number;             // 超额收益
}

interface BacktestSnapshot {
  date: string;
  nav: number;
  shares: number;
  value: number;
  invested: number;
  return: number;
  returnPercent: number;
}
```

### 3.2 历史净值获取

```typescript
// 获取历史净值 (用于回测)
async function getFundHistory(
  fundCode: string,
  startDate: string,
  endDate: string
): Promise<FundHistoryPoint[]> {
  // 实现方案:
  // 1. 天天基金历史净值API
  // 2. 缓存历史数据
  // 3. 增量更新
}
```

### 3.3 回测执行引擎

```typescript
class BacktestEngine {
  private history: Map<string, FundHistoryPoint[]>;
  
  // 执行DCA回测
  async runDCA(config: BacktestConfig): Promise<BacktestResult> {
    const results: BacktestSnapshot[] = [];
    let shares = 0;
    let invested = config.initialAmount;
    
    // 按月/周定投
    for (const point of this.getPoints(config)) {
      const amount = config.dca!.amount;
      const fee = calculateFee(amount);
      const actualAmount = amount - fee;
      
      const newShares = actualAmount / point.nav;
      shares += newShares;
      
      results.push({
        date: point.date,
        nav: point.nav,
        shares,
        value: shares * point.nav,
        invested,
        return: shares * point.nav - invested,
        returnPercent: ((shares * point.nav - invested) / invested) * 100,
      });
    }
    
    return this.calculateResults(config, results);
  }
  
  // 执行条件触发回测
  async runThreshold(config: BacktestConfig): Promise<BacktestResult> {
    // 实现: 根据净值触发买卖
  }
  
  // 计算风险指标
  private calculateMetrics(snapshots: BacktestSnapshot[]) {
    // 最大回撤、波动率、夏普比率
  }
}
```

### 3.4 智能定投策略

```typescript
// 智能定投策略
interface SmartDCASTrategy {
  name: string;
  description: string;
  
  // 动态调整
  adjustAmount?: (context: {
    nav: number;
    ma5: number;
    ma20: number;
    recentReturn: number;
  }) => number;
  
  // 买入条件
  buyCondition?: (context: {
    nav: number;
    ma10: number;
    dropPercent: number;
  }) => boolean;
  
  // 卖出条件
  sellCondition?: (context: {
    nav: number;
    avgCost: number;
    returnPercent: number;
  }) => boolean;
}

// 预定义策略
const SMART_DCA_STRATEGIES = {
  // 均值回归策略
  meanReversion: {
    name: '均值回归',
    description: '净值低于均线时加大投入',
    adjustAmount: (ctx) => {
      if (ctx.nav < ctx.ma20) return 1.5;  // 低于均线1.5倍
      if (ctx.nav < ctx.ma10) return 1.2;
      return 1.0;
    },
  },
  
  // 趋势跟踪策略
  trendFollowing: {
    name: '趋势跟踪',
    description: '持续下跌时定投，上涨时减少',
    adjustAmount: (ctx) => {
      if (ctx.recentReturn < -10) return 1.5;  // 近1月跌超10%
      if (ctx.recentReturn < -5) return 1.2;
      if (ctx.recentReturn > 10) return 0.5;   // 大涨减少
      return 1.0;
    },
  },
  
  // 价值平均策略
  valueAveraging: {
    name: '价值平均',
    description: '保持目标市值，偏离时调整',
    adjustAmount: (ctx) => {
      const targetValue = ctx.invested;
      const currentValue = ctx.shares * ctx.nav;
      const diff = targetValue - currentValue;
      // 多买少卖
    },
  },
};
```

---

## 四、API 扩展

### 4.1 新增工具函数

```typescript
// fund-backtest.ts

/**
 * 执行回测
 */
export async function backtest(
  fundCode: string,
  config: BacktestConfig
): Promise<BacktestResult>;

/**
 * 获取历史净值
 */
export async function getFundHistory(
  fundCode: string,
  startDate: string,
  endDate: string
): Promise<FundHistoryPoint[]>;

/**
 * 对比回测
 */
export async function compareBacktests(
  configs: BacktestConfig[]
): Promise<BacktestComparison>;

/**
 * 获取定投建议
 */
export async function getDCARecommendation(
  fundCode: string,
  strategy?: 'standard' | 'smart'
): Promise<DCASTrategy>;
```

### 4.2 扩展 fund-trade.ts

```typescript
// 新增功能
├── getPortfolioSummary()   // 组合摘要
├── calculateProfitLoss()   // 盈亏计算
├── getPositionAnalysis()   // 持仓分析
├── exportTrades()          // 导出交易记录
└── resetPortfolio()        // 重置组合
```

---

## 五、实现计划

### Phase 1: 回测引擎 (P0)

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 定义回测类型 | `fund-types.ts` | P0 |
| 历史净值获取 | `fund-history.ts` | P0 |
| DCA回测执行 | `fund-backtest.ts` | P0 |
| 风险指标计算 | `fund-metrics.ts` | P0 |
| 回测工具注册 | `fund-tool.ts` | P0 |

### Phase 2: 交易功能 (P1)

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 扩展交易工具 | `fund-trade.ts` | P1 |
| 组合管理工具 | `fund-portfolio.ts` | P1 |
| 盈亏计算工具 | `fund-pnl.ts` | P1 |
| 交易记录导出 | `fund-export.ts` | P1 |

### Phase 3: 智能推荐 (P2)

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 智能定投策略 | `fund-smart-dca.ts` | P2 |
| 策略对比工具 | `fund-strategy-compare.ts` | P2 |
| 可视化报告 | `fund-report.ts` | P2 |

---

## 六、验证计划

### 6.1 单元测试

```bash
# 回测功能测试
bun test test/fund-backtest.test.ts

# 交易功能测试
bun test test/fund-trade.test.ts

# 筛选功能测试
bun test test/fund-screening.test.ts
```

### 6.2 集成测试

```bash
# 完整基金功能测试
bun test test/fund-integration.test.ts

# TUI交互测试
bun run dev
```

### 6.3 真实数据验证

| 基金 | 用途 | 验证 |
|------|------|------|
| 110022 | 易方达消费 | 回测 |
| 161725 | 招商白酒 | 条件触发 |
| 000311 | 沪深300指数 | 基准对比 |

---

## 七、数据源

### 7.1 历史净值API

```
天天基金历史净值:
https://fundgz.1234567.com/js/{fundCode}.js?rt=1716566400

或者:
https://api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=1000
```

### 7.2 数据缓存

```typescript
// 缓存策略
const CACHE_CONFIG = {
  history: {
    ttl: 7 * 24 * 60 * 60 * 1000,  // 7天
    maxSize: 100,  // 最多缓存100个基金
  },
  detail: {
    ttl: 60 * 60 * 1000,  // 1小时
  },
};
```

---

## 八、预期成果

### 8.1 工具清单

| 工具名称 | 功能 | 优先级 |
|----------|------|--------|
| `backtest_dca` | DCA定投回测 | P0 |
| `backtest_lumpsum` | 一次性投资回测 | P0 |
| `backtest_threshold` | 条件触发回测 | P0 |
| `fund_history` | 历史净值查询 | P0 |
| `portfolio_summary` | 组合收益摘要 | P1 |
| `smart_dca_recommend` | 智能定投建议 | P2 |
| `compare_strategies` | 策略对比 | P2 |

### 8.2 技能扩展

| 技能名称 | 功能 |
|----------|------|
| `backtest-dca` | DCA定投回测技能 |
| `smart-investing` | 智能投资策略技能 |
| `portfolio-management` | 组合管理技能 |

---

## 九、风险与注意事项

1. **数据延迟**: 持仓数据有3个月延迟，回测需注意
2. **费率假设**: 使用默认费率，实际可能有差异
3. **市场风险**: 过去业绩不代表未来
4. **回测偏差**: 未来可能与历史回测结果不同

---

## 十、后续计划 (Plan 35+)

- 实时行情监控
- 智能调仓建议
- 组合优化算法
- 可视化报告生成

---

**Plan34.md v1.0**: 2026-05-24
**状态**: 🚧 计划中
**下一步**: 实现回测引擎
