# Plan 23: UpUp 投资助手完善计划

> 创建日期：2026-05-19
> 更新日期：2026-05-19
> 目标：构建顶级的 AI Agent 驱动的投资助手，对标 Claude Code investment edition

---

## 一、愿景与定位

### 1.1 产品愿景

**UpUp = Claude Code + 专业投资能力**

打造一款专门为投资者设计的 AI 助手，具备：
- Claude Code 的代码理解和生成能力
- 专业级的投资分析功能
- 深度市场数据和新闻整合
- 量化分析和回测能力

### 1.2 目标用户

| 用户类型 | 需求 | 优先级 |
|----------|------|--------|
| 个人投资者 | 快速选股、基本面分析 | P0 |
| 专业投资者 | 量化策略、回测、组合优化 | P1 |
| 机构分析师 | 研报生成、行业分析 | P2 |

### 1.3 核心价值

1. **效率提升**: 5 分钟完成原本需要 2 小时的分析
2. **数据整合**: 一站式获取所有市场数据
3. **决策支持**: 结构化的投资建议
4. **持续学习**: 从历史交易中学习改进

---

## 二、现有能力分析

### 2.1 已有工具 (src/tools/)

| 类别 | 工具 | 状态 |
|------|------|------|
| **美股数据** | get_stock_price, get_financials, get_key_ratios | ✅ |
| **A股数据** | get_astock_price, get_astock_financials | ✅ |
| **港股数据** | get_astock_price (00700.HK) | ✅ |
| **加密货币** | get_crypto_price | ✅ |
| **新闻资讯** | get_company_news, get_astock_news | ✅ |
| **技术分析** | 基础指标计算 | ✅ |
| **量化分析** | 组合优化、风险指标 | ✅ |
| **财报分析** | filings, earnings, estimates | ✅ |
| **内部交易** | insider_trades | ✅ |

### 2.2 已有技能 (src/skills/bundled/)

| 技能 | 功能 | 状态 |
|------|------|------|
| dream | 投资记忆整合 | ✅ |
| research | 投资研究框架 | ✅ |
| portfolio-review | 组合回顾分析 | ✅ |
| risk-assessment | 风险评估 | ✅ |
| stock-screen | 选股器 | ✅ |
| batch | 批量研究 | ✅ |

### 2.3 界面组件 (src/components/)

| 组件 | 功能 | 状态 |
|------|------|------|
| ChatLog | 对话显示 | ✅ |
| ToolEvent | 工具执行显示 | ✅ |
| ApprovalPrompt | 授权提示 | ✅ |
| AnswerBox | 回答显示 | ✅ |

---

## 三、差距分析

### 3.1 投资数据能力差距

| 功能 | 竞品 | UpUp | 状态 |
|------|------|------|------|
| 实时行情 | Bloomberg, Wind | ⚠️ 部分 | 需完善 |
| 衍生品定价 | Black-Scholes, Greeks | ✅ | ✅ |
| 宏观数据 | FRED, 宏观指标 | ⚠️ 有限 | 需扩展 |
| 研报整合 | 同花顺, 东方财富 | ❌ | 缺失 |
| 公墓持仓 | 季报数据 | ✅ | ✅ |
| 情绪数据 | 社交媒体, 新闻情感 | ⚠️ 基础 | 需完善 |

### 3.2 投资分析能力差距

| 功能 | 竞品 | UpUp | 状态 |
|------|------|------|------|
| DCF 估值 | 主流工具 | ✅ | ✅ |
| 技术指标 | TradingView | ⚠️ 基础 | 需扩展 |
| 量化回测 | Backtrader, QuantConnect | ⚠️ 基础 | 需完善 |
| 组合优化 | 现代投资组合理论 | ✅ | ✅ |
| 风险模型 | VaR, CVaR | ⚠️ 有限 | 需扩展 |
| 因子分析 | 多因子模型 | ❌ | 缺失 |
| ESG 评分 | ESG 数据源 | ❌ | 缺失 |

### 3.3 交互体验差距

| 功能 | 竞品 | UpUp | 状态 |
|------|------|------|------|
| 图表展示 | Matplotlib, Plotly | ❌ | 缺失 |
| 数据表格 | 交互式表格 | ❌ | 缺失 |
| 报告导出 | PDF, Excel | ❌ | 缺失 |
| 语音输入 | 语音交互 | ❌ | 缺失 |
| 快捷命令 | 快速选股命令 | ⚠️ 有限 | 需扩展 |

---

## 四、完善计划

### Phase 1: 投资数据扩展 (P0)

| 任务 | 描述 | 复杂度 | 文件 |
|------|------|--------|------|
| P1.1 | 扩展技术指标 (MACD, Bollinger, Ichimoku) | 中 | src/tools/quant/technical-indicators.ts |
| P1.2 | 添加宏观数据获取 (GDP, CPI, PMI) | 中 | src/tools/macro/ |
| P1.3 | 实现衍生品定价 (期权定价, Greeks) | 高 | src/tools/quant/options-pricing.ts |
| P1.4 | 添加情绪分析 (新闻情感, 社交媒体) | 高 | src/tools/sentiment/ |

### Phase 2: 投资分析增强 (P1)

| 任务 | 描述 | 复杂度 | 文件 |
|------|------|--------|------|
| P2.1 | 实现完整回测框架 | 高 | src/tools/backtest/ |
| P2.2 | 添加因子分析工具 | 高 | src/tools/factors/ |
| P2.3 | 实现风险模型 (VaR, CVaR, Monte Carlo) | 中 | src/tools/quant/risk-metrics.ts |
| P2.4 | 添加 ESG 评分整合 | 中 | src/tools/esg/ |

### Phase 3: 可视化与报告 (P2)

| 任务 | 描述 | 复杂度 | 文件 |
|------|------|--------|------|
| P3.1 | 实现图表生成 (K线, 技术指标) | 高 | src/components/charts/ |
| P3.2 | 实现数据表格组件 | 中 | src/components/tables/ |
| P3.3 | 添加报告导出 (PDF, Excel, HTML) | 高 | src/tools/export/ |
| P3.4 | 实现交互式 Dashboard | 高 | src/components/dashboard/ |

### Phase 4: 交互体验优化 (P3)

| 任务 | 描述 | 复杂度 | 文件 |
|------|------|--------|------|
| P4.1 | 实现语音输入 | 高 | src/voice/ |
| P4.2 | 添加快捷命令系统 | 低 | src/commands/investment.ts |
| P4.3 | 实现实时行情推送 | 高 | src/realtime/ |
| P4.4 | 添加自定义指标支持 | 中 | src/tools/custom-indicators/ |

---

## 五、新增技能清单

### 5.1 投资研究技能

| 技能名 | 描述 | 来源 |
|--------|------|------|
| macro-analysis | 宏观经济分析 | 新增 |
| industry-analysis | 行业分析 | 新增 |
| company-analysis | 公司深度分析 | 新增 |
| sector-rotation | 行业轮动分析 | 新增 |
| earnings-preview | 财报预测 | 新增 |

### 5.2 量化分析技能

| 技能名 | 描述 | 来源 |
|--------|------|------|
| backtest | 回测分析 | 扩展现有 |
| strategy-development | 策略开发 | 新增 |
| factor-analysis | 因子分析 | 新增 |
| risk-analysis | 风险分析 | 扩展现有 |
| portfolio-opt | 组合优化 | 扩展现有 |

### 5.3 交易执行技能

| 技能名 | 描述 | 来源 |
|--------|------|------|
| trade-execution | 交易执行 | 新增 |
| order-management | 订单管理 | 新增 |
| position-tracking | 持仓跟踪 | 新增 |
| pnl-analysis | 盈亏分析 | 新增 |

---

## 六、界面优化计划

### 6.1 投资专用 UI 组件

```
src/components/investment/
├── stock-chart.ts      # K线图 + 技术指标
├── data-table.ts       # 财务数据表格
├── portfolio-view.ts   # 组合可视化
├── news-feed.ts       # 新闻资讯流
├── alerts-panel.ts    # 提醒面板
└── sentiment-meter.ts # 情绪仪表盘
```

### 6.2 投资视图模式

```typescript
interface InvestmentViewMode {
  mode: 'analysis' | 'trading' | 'portfolio' | 'research';
  layout: 'single' | 'split' | 'dashboard';
  panels: {
    chat: boolean;
    chart: boolean;
    data: boolean;
    alerts: boolean;
  };
}
```

### 6.3 快捷命令

| 命令 | 功能 |
|------|------|
| `/price AAPL` | 查询股价 |
| `/ financials AAPL` | 查询财报 |
| `/screen PE<15 ROE>20` | 选股 |
| `/ compare AAPL GOOGL` | 对比股票 |
| `/portfolio` | 查看组合 |
| `/risk TSLA` | 风险分析 |

---

## 七、技术架构升级

### 7.1 新增模块

```
src/
├── macro/              # 宏观数据
│   ├── cn_gdp.ts      # 中国GDP
│   ├── cn_cpi.ts      # 中国CPI
│   ├── fed_data.ts    # 美联储数据
│   └── global_indicators.ts
├── sentiment/          # 情绪分析
│   ├── news_sentiment.ts
│   ├── social_sentiment.ts
│   └── market_sentiment.ts
├── derivatives/       # 衍生品
│   ├── options_pricing.ts
│   ├── greeks.ts
│   └── implied_vol.ts
├── factors/           # 因子分析
│   ├── value_factors.ts
│   ├── momentum_factors.ts
│   └── quality_factors.ts
├── esg/               # ESG评分
│   ├── environmental.ts
│   ├── social.ts
│   └── governance.ts
├── charts/            # 图表组件
│   ├── candlestick.ts
│   ├── volume.ts
│   └── indicators.ts
└── export/            # 报告导出
    ├── pdf_generator.ts
    ├── excel_generator.ts
    └── html_report.ts
```

### 7.2 数据库扩展

```sql
-- 投资专用表
CREATE TABLE investment_portfolios (
  id TEXT PRIMARY KEY,
  name TEXT,
  positions JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE watchlists (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  symbols JSON,
  created_at TIMESTAMP
);

CREATE TABLE price_alerts (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  condition TEXT,
  target_price REAL,
  triggered BOOLEAN,
  created_at TIMESTAMP
);
```

---

## 八、实现优先级

### 8.1 短期 (1个月) - MVP

| 任务 | 优先级 | 验收标准 |
|------|--------|----------|
| 扩展技术指标 | P0 | MACD, Bollinger, RSI |
| 添加宏观数据 | P0 | GDP, CPI, PMI |
| 快捷命令 | P0 | /price, /screen, /compare |
| 数据表格组件 | P1 | 财务数据展示 |

### 8.2 中期 (3个月) - 完整版

| 任务 | 优先级 | 验收标准 |
|------|--------|----------|
| 图表生成 | P1 | K线图, 技术指标图 |
| 报告导出 | P1 | PDF, Excel |
| 情绪分析 | P2 | 新闻情感, 市场情绪 |
| 回测框架 | P2 | 完整回测流程 |

### 8.3 长期 (6个月) - 专业版

| 任务 | 优先级 | 验收标准 |
|------|--------|----------|
| 实时行情 | P2 | WebSocket推送 |
| 语音输入 | P3 | 语音命令 |
| Dashboard | P3 | 交互式面板 |
| 策略开发 | P3 | 完整量化平台 |

---

## 九、竞品对比

### 9.1 vs Bloomberg Terminal

| 功能 | Bloomberg | UpUp | 优势 |
|------|-----------|------|------|
| 数据覆盖 | 完整 | 部分 | ✅ AI 理解 |
| 实时性 | 毫秒级 | 秒级 | 差距 |
| 技术分析 | 完整 | 基础 | 差距 |
| AI 能力 | 有限 | 强大 | ✅ |
| 成本 | $20k+/年 | 免费 | ✅ |

### 9.2 vs 同花顺

| 功能 | 同花顺 | UpUp | 优势 |
|------|---------|------|------|
| A股数据 | 完整 | 完整 | - |
| AI助手 | 有限 | 强大 | ✅ |
| 量化回测 | 有 | 基础 | 差距 |
| 中文理解 | 强 | 强 | - |
| 定制化 | 低 | 高 | ✅ |

### 9.3 vs 聚宽

| 功能 | 聚宽 | UpUp | 优势 |
|------|------|------|------|
| 量化回测 | 完整 | 基础 | 差距 |
| 数据API | 完整 | 部分 | 差距 |
| AI集成 | 无 | 有 | ✅ |
| 使用门槛 | 高 | 低 | ✅ |

---

## 十、总结

### 10.1 核心定位

**UpUp = Claude Code + 专业投资能力 + 中文优化**

不是简单的 ChatGPT 包装，而是真正为投资者设计的 AI 助手。

### 10.2 关键差异化

1. **代码能力**: 继承 Claude Code 的代码理解
2. **投资专业**: 专业级投资分析工具
3. **数据整合**: 一站式市场数据获取
4. **中文优化**: 优化的中文投资分析

### 10.3 发展路径

```
Phase 1: 投资数据工具 (1个月)
    ↓
Phase 2: 投资分析能力 (3个月)
    ↓
Phase 3: 可视化与报告 (6个月)
    ↓
Phase 4: 专业量化平台 (12个月)
```

---

## 附录 A: 技术参考

### A.1 数据源

| 数据源 | 类型 | 用途 |
|--------|------|------|
| Tushare Pro | A股 | 财务、行情 |
| Yahoo Finance | 美股 | 股价、财报 |
| Alpha Vantage | 宏观 | 经济指标 |
| News API | 新闻 | 情绪分析 |
| SEC EDGAR | 美股 | 公文公告 |

### A.2 技术栈

| 组件 | 技术 | 备注 |
|------|------|------|
| 运行时 | Bun | 高性能 |
| 框架 | TypeScript | 类型安全 |
| LLM | DeepSeek | 性价比 |
| UI | pi-tui | 终端UI |
| 数据库 | SQLite | 本地存储 |

---

*最后更新: 2026-05-19*
*状态: 草稿，待评审*
*版本: v1.0*