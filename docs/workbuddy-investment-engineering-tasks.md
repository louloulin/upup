# WorkBuddy 投资助手升级 - 工程任务卡

> 从白皮书到 PR 的 26 周实施清单

## 总览

- **总工期**：26 周（6 个月）
- **6 个 Phase**，每 Phase 2-6 周
- **目标**：把 WorkBuddy 从"50 模板填空"升级为"70 个真 skill + 5 阶段真工作流 + 多 Agent 协同 + 真实数据闭环"

---

## Phase 1：估值去 stub + IDL + Bear Case（Week 1-2）

### Task 1.1：估值 Phase 真实数据化
- **文件**：`src/agent/phase-handlers.ts`
- **改动**：删除 `valuationHandler` 中硬编码的 `FCF=1B` / `EPS=5` / `Price=100`
- **新逻辑**：
  ```typescript
  const fcf = await getFinancials(ticker, 'cashFlow', { period: 'ttm' });
  const ratios = await getKeyRatios(ticker);
  const wacc = calculateWACC(ratios); // 真实计算
  const terminalGrowth = 0.025;
  const fairValue = dcf(fcf.fcf, wacc, terminalGrowth, 5);
  ```
- **新增**：3 家可比公司 + 5 档 WACC × 5 档 terminal growth 敏感性矩阵
- **测试**：`test/phase-handlers.test.ts` 增加 3 个用例（NVDA / 600519 / TSLA）
- **PR 标题**：`feat(invest): valuation phase use real financial data, remove stub`
- **预估**：2-3 天

### Task 1.2：投资决策日志（IDL）
- **新文件**：`src/memory/investment-decision-log.ts`
- **数据模型**：
  ```typescript
  interface InvestmentDecision {
    id: string;          // ULID
    timestamp: string;   // ISO 8601
    ticker: string;
    direction: 'buy' | 'sell' | 'hold';
    position: number;    // 0-1 占比
    reason: string;      // LLM 生成的决策理由
    triggerCondition: string; // 触发条件
    expectedHold: string;     // 预期持有期
    actualOutcome?: {    // 6/12 月后填充
      return: number;
      maxDrawdown: number;
      notes: string;
    };
  }
  ```
- **持久化**：JSONL 到 `.upup/decisions/{YYYY-MM-DD}.jsonl`
- **触发位置**：`tradeHandler` 执行后立即调用
- **PR 标题**：`feat(memory): investment decision log (IDL) persistence`
- **预估**：2-3 天

### Task 1.3：Bear Case 反方观点
- **新文件**：`src/agent/bear-case-handler.ts`
- **新 Phase**：在 Phase 4 (trade) 前插入 Phase 3.5 (bear_case)
- **逻辑**：
  - 强制 LLM 生成 3 个致命假设（如"新能源车销量低于预期 20%")
  - 每个假设给出反驳（"该假设的触发条件是..."）
  - 输出 `## Bear Case` section
- **修改**：`src/agent/investment-workflow.ts` 的 phases 数组
- **PR 标题**：`feat(invest): mandatory bear case phase with 3 fatal assumptions`
- **预估**：1-2 天

### Phase 1 验收
- [ ] 跑 `/invest NVDA` 能拿到真实财务数据 DCF（不是 100 美元）
- [ ] 跑 `/invest 600519` 输出 3 家可比公司 + 敏感性矩阵
- [ ] 每个 `/invest` 执行后在 `.upup/decisions/` 找到决策日志
- [ ] 输出包含 `## Bear Case` section

---

## Phase 2：量化三件套基础设施（Week 3-6）

### Task 2.1：backtest-engine
- **新文件**：
  - `src/tools/quant/backtest.ts`（核心引擎）
  - `src/skills/backtest-engine/SKILL.md`（skill 定义）
  - `src/commands/investment/backtest.ts`（CLI 命令）
- **接口**：
  ```typescript
  async function backtest(params: {
    strategy: StrategySpec;
    universe: 'cn' | 'us' | 'hk';
    start: string; // YYYY-MM-DD
    end: string;
    initialCapital: number;
    benchmark: string; // 000300.SH / SPY
    rebalance: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    commission: number; // bp
    slippage: number;   // bp
  }): Promise<BacktestResult>
  ```
- **输出指标**：年化收益 / 年化波动 / 夏普 / 索提诺 / 卡玛 / 最大回撤 / 胜率 / 换手 / α / β / IR
- **支持策略**：
  - 均线交叉（MA5/MA20/MA60）
  - 动量（12-1 / 6-1）
  - 价值（EP / BP top 30%）
  - 反转（5 日反转）
  - 自定义（用户给规则）
- **测试**：3 个用例（CN MA cross / US momentum / HK value）
- **PR 标题**：`feat(quant): general-purpose backtest engine with standard metrics`
- **预估**：1 周

### Task 2.2：factor-model
- **新文件**：
  - `src/tools/quant/factor.ts`
  - `src/skills/factor-model/SKILL.md`
  - `src/commands/investment/factor.ts`
- **6 大类因子**：
  - 价值：EP、BP、CP、DP、SP
  - 质量：ROE、ROA、毛利率、Accruals（NI - OCF）/TA
  - 动量：12-1、6-1、1m
  - 波动：β、特异波动率、总波动率
  - 规模：ln(market_cap)
  - 成长：盈利增速、营收增速、SUE
- **输出**：每只股票在 6 类因子的 Z-Score + 因子收益率时序
- **数据源**：Tushare `stk_factor` + 自建因子计算
- **PR 标题**：`feat(quant): 6-category factor model with cross-sectional regression`
- **预估**：1 周

### Task 2.3：performance-attribution
- **新文件**：
  - `src/tools/portfolio/attribution.ts`（升级现有占位）
  - `src/skills/performance-attribution/SKILL.md`
  - `src/commands/investment/attribution.ts`
- **三层归因**：
  - **Brinson 模型**：配置效应 + 选择效应 + 交互效应
  - **HB 模型**：行业归因 + 证券选择归因
  - **Fama-French**：市场 β + SMB + HML + UMD + RMW + CMA
- **时间窗**：月度 / 季度 / 年度
- **输出**：HTML 瀑布图（用 visx 或 d3）
- **PR 标题**：`feat(portfolio): Brinson/HB/Fama-French performance attribution`
- **预估**：1 周

### Task 2.4：portfolio-optimizer（可与 2.3 并行）
- **新文件**：
  - `src/tools/quant/optimizer.ts`
  - `src/skills/portfolio-optimizer/SKILL.md`
  - `src/commands/investment/optimize.ts`
- **4 种优化**：
  - MPT（均值-方差）
  - Black-Litterman（带观点）
  - Risk Parity（等风险贡献）
  - 最大分散度
- **约束**：行业暴露 / 因子暴露 / 单票上限 / 换手率
- **PR 标题**：`feat(quant): 4-method portfolio optimizer with constraints`
- **预估**：1 周

### Task 2.5：scenario-stress-test
- **新文件**：
  - `src/tools/quant/stress-test.ts`
  - `src/skills/scenario-stress-test/SKILL.md`
  - `src/commands/investment/stress.ts`
- **历史情景**：2008 金融危机、2015 股灾、2016 熔断、2018 中美贸易战、2020 疫情、2022 熊市
- **假设冲击**：利率 +100bp、油价 +30%、汇率 -5%、GDP -2%
- **蒙特卡洛**：10K 次随机模拟
- **PR 标题**：`feat(quant): historical + hypothetical + Monte Carlo stress test`
- **预估**：1 周

### Phase 2 验收
- [ ] `/backtest MA-cross 上证50` 跑出真实夏普比率
- [ ] `/factor-exposure 600519 2024` 跑出 6 因子暴露
- [ ] `/attribution my-portfolio 2024Q1` 输出 Brinson 瀑布图
- [ ] `/optimize 4-asset risk-parity` 输出最优权重
- [ ] `/stress my-portfolio 2008` 模拟 2008 危机下回撤

---

## Phase 3：A 股本土 alpha（Week 7-10）

### Task 3.1：convertible-bond
- **新文件**：
  - `src/tools/astock/convertible.ts`
  - `src/skills/convertible-bond/SKILL.md`
  - `src/commands/investment/cb-screen.ts`
- **数据**：Tushare `cb_basic` + `cb_daily` + `cb_share` + 集思录 API（可选）
- **输出字段**：转股价值、转股溢价率、纯债价值、纯债溢价率、剩余规模、强赎触发价、下修触发价、回售触发价、剩余期限
- **策略**：
  - 低溢价率轮动（< 20%）
  - 强赎博弈（接近 130%）
  - 下修博弈（PB < 1 + 未下修）
  - 回售博弈（YTM > 0）
- **PR 标题**：`feat(astock): convertible bond screen + arbitrage analysis`
- **预估**：1 周

### Task 3.2：dragon-tiger-list
- **新文件**：
  - `src/tools/astock/dragon-tiger.ts`
  - `src/skills/dragon-tiger-list/SKILL.md`
  - `src/commands/investment/dragon-tiger.ts`
- **数据**：Tushare `top_list` + `top_inst`
- **游资 DB**（人工标注或第三方）：
  - 欢乐海、赵老哥、孙哥、章盟主、佛山系、炒股养家、Asking
  - 风格标签：连板接力 / 趋势低吸 / 题材挖掘 / 价值投机
- **输出**：游资接力梯队 + 炸板率 + 风格匹配度
- **PR 标题**：`feat(astock): dragon-tiger list with hot-money profiling`
- **预估**：1 周

### Task 3.3：margin-financing
- **新文件**：
  - `src/tools/astock/margin.ts`
  - `src/skills/margin-financing/SKILL.md`
  - `src/commands/investment/margin.ts`
- **数据**：Tushare `margin`（汇总）+ `margin_detail`（个股）
- **输出**：杠杆资金净流入 Top N + 融资余额/流通市值比 + 板块杠杆率
- **信号**：
  - 融资余额创 N 日新高
  - 融资买入占比 > 12%（情绪过热）
  - 融资余额骤降（去杠杆）
- **PR 标题**：`feat(astock): margin financing flow analysis`
- **预估**：3 天

### Task 3.4：etf-arbitrage
- **新文件**：
  - `src/tools/astock/etf-arb.ts`
  - `src/skills/etf-arbitrage/SKILL.md`
  - `src/commands/investment/etf-arb.ts`
- **数据**：基金公司公告 + 实时 IOPV + 折溢价率
- **输出**：折溢价 > 1% 套利机会 + 申赎清单 + 调仓事件
- **PR 标题**：`feat(astock): ETF arbitrage scanner (premium/discount + creation/redemption)`
- **预估**：1 周

### Task 3.5：event-driven-calendar
- **新文件**：
  - `src/tools/astock/event-calendar.ts`
  - `src/skills/event-driven-calendar/SKILL.md`
  - `src/commands/investment/event.ts`
- **数据**：Tushare `dividend` + `share_float` + 巨潮/东财事件库
- **事件类型**：分红、限售解禁、增减持、回购、业绩预告、股东大会、股权激励
- **输出**：未来 30/60/90 天事件清单 + 事件驱动策略建议
- **PR 标题**：`feat(astock): event-driven calendar (dividend/expiry/insider-trade/etc.)`
- **预估**：3 天

### Phase 3 验收
- [ ] `/cb-screen 转股溢价率<20% 余额>5亿` 跑出真实可转债池
- [ ] `/dragon-tiger 2024-06-13` 跑出当天游资接力图
- [ ] `/margin` 跑出两融余额 Top 10 板块
- [ ] `/etf-arb 沪深300ETF` 跑出现折溢价套利机会
- [ ] `/event 30d` 跑出未来 30 天事件清单

---

## Phase 4：多 Agent 协同 + Coordinator（Week 11-14）

### Task 4.1：Coordinator Agent
- **新文件**：`src/agent/coordinator.ts`
- **架构**：状态机 + DAG Planner + Executor + Observer
- **输入**：用户 query
- **路由**：
  - 个股研究 → explore → plan → risk → trade → review
  - 行业研究 → explore (×N 并行) → merge → plan
  - 组合诊断 → review → risk → rebalance
  - 因子研究 → factor → backtest → optimize
- **PR 标题**：`feat(agent): coordinator with DAG planning and parallel execution`
- **预估**：2 周

### Task 4.2：风控官 Gate
- **新文件**：`src/agent/investment-subagents.ts`（升级 `invest-risk`）
- **逻辑**：trade 前强制调用
- **检查项**：
  - 单票持仓 < `GOVERN.maxPosition`（默认 10%）
  - 行业集中度 < X
  - 流动性（流通市值） > Y
  - VaR < Z
  - 杠杆率 < 30%
- **不通过**：阻断交易 + 输出"风控不通过原因" + 要求重新规划
- **PR 标题**：`feat(agent): mandatory risk gate before trade execution`
- **预估**：1 周

### Task 4.3：并行研究模式
- **新文件**：`src/agent/swarm-research.ts`
- **场景**：
  - `/research-industry 半导体` 自动派发 5 个 explore subagent
  - `/research-comparable 600519` 并行 3 家可比公司尽调
  - `/research-factor 价值` 并行价值因子 4 子维度
- **合并**：explore ×N 完成后 merge 成结构化报告
- **PR 标题**：`feat(agent): parallel research mode with merge step`
- **预估**：1 周

### Phase 4 验收
- [ ] 跑 `/research-industry 半导体` 能看到 5 个 subagent 并行工作的进度
- [ ] 跑 `/invest 600519`，风控官能阻断超限交易
- [ ] 5 阶段工作流可以在任意阶段中断和恢复
- [ ] Coordinator 失败时正确回滚

---

## Phase 5：数据源升级 + 宏观 + 行业研究（Week 15-20）

### Task 5.1：宏观数据工具
- **新文件**：`src/tools/finance/macro.ts`
- **数据源**：Tushare `cn_gdp` / `cn_cpi` / `cn_pmi` / `cn_m` / `cn_sf` / `cn_money_supply` + AKShare 补充
- **输出**：宏观仪表盘
- **PR 标题**：`feat(finance): macroeconomic data (GDP/CPI/PMI/M2/social-finance)`
- **预估**：3 天

### Task 5.2：指数行情工具
- **新文件**：`src/tools/finance/index.ts`
- **数据源**：Tushare `index_daily` + 实时 IOPV
- **覆盖**：上证综指/深证成指/创业板/科创50/沪深300/中证500/中证1000/恒生/标普500/纳指/道指
- **PR 标题**：`feat(finance): index quotes for major global indices`
- **预估**：2 天

### Task 5.3：A 股估值时序
- **新文件**：`src/tools/astock/price.ts`（升级）
- **数据源**：Tushare `daily_basic` 增加 `pe` / `pb` / `pe_ttm` / `pb_mrq` / `ps` / `ps_ttm` / `total_mv` / `circ_mv` / `turnover_rate` / `turnover_rate_f`
- **PR 标题**：`feat(astock): valuation history (PE/PB/PS) for A-shares`
- **预估**：1 天

### Task 5.4：港股支持
- **新文件**：`src/tools/hk/`
- **数据源**：Tushare 港股接口 + Yahoo Finance fallback
- **覆盖**：港股行情/财务/恒生指数/南向资金
- **PR 标题**：`feat(hk): Hong Kong stock support (quote/financials/HSI/Southbound)`
- **预估**：1 周

### Task 5.5：stock_screener 真实化
- **新文件**：`src/tools/finance/screener.ts`（升级现有 placeholder）
- **美股**：Financial Datasets `/financial-metrics/snapshot`
- **A 股**：Tushare 筛选接口
- **PR 标题**：`feat(finance): real stock screener (US + A-share)`
- **预估**：1 周

### Task 5.6：macro-timing skill
- **新文件**：`src/skills/macro-timing/SKILL.md` + `src/commands/investment/macro.ts`（升级）
- **逻辑**：
  - 美林时钟（CPI × GDP 增长象限）
  - 普林格周期（货币/盈利/物价）
  - 美元周期
  - 利差周期（中-美利差）
- **PR 标题**：`feat(skills): macro timing clock (Merrill Lynch / Pring / Dollar / Spread)`
- **预估**：1 周

### Phase 5 验收
- [ ] `/macro` 输出 GDP/CPI/PMI/M2 仪表盘
- [ ] `/index 上证/标普` 输出指数对比
- [ ] `/screen PE<15 PB<2 ROE>15%` 跑出真实筛选
- [ ] `/hk 00700` 跑出腾讯港股数据
- [ ] `/macro-clock` 输出当前周期象限

---

## Phase 6：产品化（Week 21-26）

### Task 6.1：事后复盘
- **新文件**：`src/memory/post-mortem.ts` + `src/commands/investment/post-mortem.ts`
- **逻辑**：调出 6/12 个月前的决策，对比实际收益
- **输出**：决策质量评分（0-100）+ 偏差分析 + 学习建议
- **PR 标题**：`feat(memory): post-mortem decision quality scoring`
- **预估**：1 周

### Task 6.2：研究项目容器
- **新文件**：`src/research-project/` + `src/commands/investment/project.ts`
- **数据模型**：
  ```typescript
  interface ResearchProject {
    id: string;
    name: string;       // "NVDA 深度研究"
    tickers: string[];
    plans: string[];    // Plan IDs
    notes: string;      // Markdown
    createdAt: string;
    lastActivity: string;
  }
  ```
- **能力**：跨 Session 追踪 + Plan 归属 + 笔记
- **PR 标题**：`feat(project): research project container with cross-session tracking`
- **预估**：1 周

### Task 6.3：投资偏好动态学习
- **新文件**：`src/agent/investment-profile-engine.ts`
- **逻辑**：
  - 解析用户历史决策 JSONL
  - 推断风险偏好（最大回撤忍受度 / 持仓周期 / 行业集中度）
  - 推断行业偏好（持仓行业分布 / 主动买卖的行业）
  - 推断风格偏好（动量 / 价值 / 质量）
- **PR 标题**：`feat(agent): dynamic investment profile learning engine`
- **预估**：1 周

### Task 6.4：i18n 投资术语扩展
- **新文件**：`src/i18n/investment-glossary.ts`
- **词条**：50+ 投资术语中英对照（估值类/财务类/风险类/策略类）
- **PR 标题**：`feat(i18n): 50+ investment glossary terms (en + zh-CN)`
- **预估**：2 天

### Task 6.5：研报引用体系
- **新文件**：`src/tools/sources/tier-classifier.ts`
- **逻辑**：
  - L1: 一手财报 / SEC 文件
  - L2: 卖方研报 / 行业数据
  - L3: 媒体报道 / 财经新闻
  - L4: 社交媒体 / 论坛 / 传闻
- **PR 标题**：`feat(tools): source tier classifier (L1-L4) for citations`
- **预估**：3 天

### Task 6.6：MCP 插件市场基础设施
- **新文件**：`src/plugins/marketplace/`
- **能力**：
  - 列出已安装 MCP server
  - 一键安装/卸载
  - 评分 + 评论
  - 安全审计
- **PR 标题**：`feat(plugins): MCP marketplace infrastructure`
- **预估**：1 周

### Task 6.7：Beta 用户招募
- **动作**：
  - 准备 Beta 文档 + 视频
  - 在小红书/雪球/知乎发布
  - 收集团队 100+ 反馈
  - 修复 Top 10 反馈
- **PR 标题**：`docs: beta release with 100+ user feedback`
- **预估**：1 周

### Phase 6 验收
- [ ] `/post-mortem 2024-01-15` 调出 6 个月前的决策
- [ ] `/project create "NVDA 深度研究"` 创建一个项目
- [ ] 投资偏好文件从静态升级为动态学习
- [ ] i18n 投资术语 50+ 词条
- [ ] 工具结果带 L1-L4 来源标注
- [ ] MCP 插件市场可安装/卸载

---

## 关键风险与缓解

| 风险 | 缓解 |
|---|---|
| LLM 幻觉导致错误投资建议 | 强制工具调用 + 数据来源标注 + 反方观点 + 免责声明 |
| 数据源合规风险 | 多源降级 + 缓存 + 自建 ETL |
| 回测过拟合 | walk-forward + 样本外 + 现实摩擦 |
| 实盘亏损索赔 | paper trade only + 免责声明 |
| Prompt injection | 工具结果 sanitization |
| 多 Agent 失控 | Coordinator 状态机 + 成本上限 + 沙箱 |
| 过度依赖 LLM | 强约束：所有数值必须来自工具调用 |

---

## 关键 KPI（6 个月目标）

| 维度 | 当前 | 6 月目标 |
|---|---|---|
| S 级 skill | 4 | 10 |
| 数据源覆盖 | 7/49 | 25/49 |
| 真实回测引擎 | ❌ | ✅ |
| 因子模型 | ❌ | ✅ |
| 业绩归因 | 占位 | ✅ |
| 多 Agent 协同 | ❌ | ✅ |
| 真实估值数据 | stub | ✅ |
| 决策日志 | ❌ | ✅ |
| 事后复盘 | ❌ | ✅ |
| Beta 用户 | 0 | 100+ |
| NPS | N/A | 50+ |

---

*总 PR 数：~30 个 ｜ 代码行数预估：~15,000 行 ｜ 数据源接入：~10 个新数据源*
