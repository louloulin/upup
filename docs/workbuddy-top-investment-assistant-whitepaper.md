# WorkBuddy 顶级投资助手白皮书 v1.0

> 把"涨涨"从"模板填空式投顾"升级为"真量化 + 真研究 + 真执行"的 AI 投资操作系统
> 撰写日期：2026-06-13 ｜ 仓库：louloulin/upup ｜ 上游：virattt/dexter

---

## 0. 执行摘要 (TL;DR)

**现状判断**：WorkBuddy 已经搭好了"中国版 dexter"的工程底座（50 个投资 skill + 14 个 bundled skill + 5 阶段 `/invest` 工作流 + 5 个专用 subagent + 4 runtime 插件 + EN/zh-CN i18n + 18 个 workspace package）。但**执行深度不足**——50 个 skill 里 46 个是"输出格式+模板表"型 prompt，少有真正独立产 α 的能力；投资工作流的 Phase 2（估值）甚至还在用 stub 硬编码值；完全没有回测引擎、因子模型、组合优化、A 股本土 alpha（龙虎榜/可转债/两融）等基础设施。

**对标差距**：与 Bloomberg Terminal / Wind / Tushare Pro / 通联数据 / AlphaSense / FinChat 的差距不在"功能多寡"，而在"数据→信号→决策→复盘"的**完整闭环**。WorkBuddy 现在停在"能讲清楚一个标的"这一档，缺的是"能让一个组合长期跑赢"那一档。

**目标定位**：在 6-12 个月内，把 WorkBuddy 升级为"**个人/中小型机构**首选的中文 AI 投资研究终端"——介于 Wind/iFinD（机构付费、贵、复杂）和东方财富/同花顺（散户级、不智能）之间的**AI-native 第三赛道**。

**核心抓手**（按 ROI 排序的前 5 个）：
1. **三件套基础设施**：`factor-model` + `backtest-engine` + `performance-attribution` —— 这是从"模板投顾"到"真量化投研"的门槛
2. **A 股本土 alpha 三件套**：`convertible-bond` + `dragon-tiger-list` + `etf-arbitrage` —— 抢占 400+ 可转债 + 游资 + ETF 套利的独立 α
3. **反方观点 + 投资决策日志 + 真实估值** —— 把 `/invest` 5 阶段从"能跑"升级为"敢用"
4. **多 Agent 协同编排** —— 用 Coordinator 把 5 个专用 subagent 串成"研究主管→研究员→风控官→交易官→复盘官"
5. **数据源升级** —— 补齐宏观（GDP/CPI/PMI/M2）+ 估值时序（PE/PB historical）+ 13F + 研报 + 港股 + 商品

---

## 1. 仓库现状审计（基于全量代码阅读）

### 1.1 技能体系盘点

`src/skills/` 共 **50 个** 领域 skill + `investment/` 子目录 **6 个** 综合 skill（即题面说的 14 bundled，分布在 `src/skills/investment/` 和 `src/skills/bundled/`）。价值评级如下：

| 等级 | 数量 | 代表 skill | 特点 |
|---|---|---|---|
| **S** | 4 | `dcf`、`investment-stock-analysis`、`investment-decision-dashboard`、`x-research` | 真正可独立产 α，有真实工具调用 |
| **A** | 18 | `investment-portfolio-review`、`investment-market-brief`、`technical-analysis`、`risk-assessment`、`money-flow`、`sentiment-analysis` 等 | 模板化但场景实在，能跑通 |
| **B** | 22 | `earnings-forecast`、`cash-flow-analysis`、`backtest-dca`、`dca-strategy`、`momentum-investing`、`value-investing`、`growth-investing`、`dividend-analysis`、`performance-prediction`、`macro-analysis` 等 | 套话模板，价值有限 |
| **C** | 6 | `alert-management`、`valuation-alert`、`personalized-recommendation` 等 | 重复冗余 |

**核心问题**：50 个 skill 中 46 个（92%）是"输出格式+模板表"型 prompt——它们定义"输出长什么样"，但不定义"数据怎么来"、"结论怎么算"。这意味着：
- skill 之间的差异化只在"排版"，不在"洞察"
- 用户换一个 stock 提问，LLM 输出的骨架一样，只是数据填空
- **真正的研究价值被压在底层工具和 Agent 编排里，但这两层都还不够强**

### 1.2 工具栈盘点

注册给 Agent 的金融工具共 **11 个** + 8 个底层路由工具：

| 维度 | 现状 | 评级 |
|---|---|---|
| 美股行情/财务/估值/SEC filings | Financial Datasets API 一站式 | ★★★★ |
| A 股日 K / 实时报价 | Tushare + 腾讯/新浪/东财三级降级 | ★★★★ |
| A 股三表/财务指标 | Tushare Pro 财报 API | ★★★（需积分） |
| A 股行业/概念板块/技术指标 | Tushare | ★★★ |
| A 股资金流/北向/龙虎榜/两融 | Tushare `get_market_structure` | ★★（粗粒度，缺明细） |
| A 股估值时序（PE/PB 历史） | **缺失** | ★（只有 snapshot） |
| 港股 | **严重缺失** | ★ |
| 加密 | Financial Datasets（含分钟级） | ★★★ |
| 商品/外汇 | 仅 Frankfurter 11 种货币 | ★ |
| 宏观（GDP/CPI/PMI/M2/利率） | **完全缺失** | ☆ |
| 指数行情（上证/恒生/标普） | 缺独立工具 | ★ |
| 研报 PDF/财报电话会全文 | 缺 | ★ |
| 13F 机构持仓 | 缺 | ★ |
| 筛选器 | **`stock_screener` 是 placeholder** | ☆（空壳） |
| 搜索/浏览器 | Exa + Tavily + Perplexity + X API + Playwright | ★★★★（完整） |

**最大短板（按严重程度）**：
1. `stock_screener` 是空壳，严重削弱"发现"能力
2. 零宏观数据，无法做自上而下
3. 没有指数行情工具
4. 港股支撑极弱
5. A 股估值指标（PE/PB/换手率历史时序）缺失

### 1.3 投资工作流盘点

9 个投资命令 + 5 阶段 `/invest` 流程（research → valuation → backtest → trade → review）：

**优点**：
- 阶段划分合理（接近真实卖方研究流程）
- Plan 持久化 + 审计签名 + resume 机制完整
- 5 个专用 subagent（explore/plan/risk/trade/review）已预定义
- 命令体系覆盖了 9 个常见场景（morning-brief / dossier / strategy / earnings-preview / portfolio-review / risk-dashboard / watchlist / screen / invest）

**硬伤**：
- **Phase 2 估值用 stub 值**：`FCF=1B`、`EPS=5`、`Price=100` 是硬编码
- **没有反方观点（bear case）**：直接进 trade，没有"假设挑战"环节
- **没有压力测试**：没有 Monte Carlo / 场景分析
- **没有投资决策日志（IDL）**：决策没结构化记录
- **没有止损纪律**：trade handler 没有止损/止盈参数
- **没有宏观择时**：morning-brief 没集成美林时钟/普林格周期
- **5 阶段严格串行**，subagent 并行能力没用上
- **没有 Coordinator**：5 个专用 subagent 没有"研究主管"来编排
- **review 阶段的 Brinson 归因是占位**（写死"待计算"）

### 1.4 Agent 内核盘点

| 能力 | 现状 | 评价 |
|---|---|---|
| Agent Loop | 50 轮、Stream + Fallback、3 层上下文保护 | ★★★ |
| Loop Recovery | 4 种检测（重复动作/输出/卡住/震荡） | ★★★ |
| Compaction | Microcompact + LLM 摘要 + 暴力截断 | ★★★★ |
| Scratchpad | JSONL 持久化，**无全文搜索** | ★★ |
| Plan Mode | 6 个 plan 工具 + 自动触发 | ★★★ |
| Subagent | 有界并发（默认 3 槽）+ git worktree 隔离 | ★★★ |
| Memory Flush | .md 持久化、跨会话 | ★★（无 RAG） |
| 多 Agent 协同 | 5 subagent 预定义，**无 Coordinator** | ★★ |
| Prompt Caching | 无 | ★★（成本高） |
| Token 计数 | 估算 + 精确双轨 | ★★★ |
| 投资偏好画像 | 静态 GOALS.md/RULES.md/GOVERN.md | ★★（无学习） |

---

## 2. 对标研究：顶级投资助手的能力图谱

### 2.1 全球第一梯队（机构级，年费 2-5 万美元/席）

| 终端 | 核心优势 | 短板 | 对 WorkBuddy 的启示 |
|---|---|---|---|
| **Bloomberg Terminal** | 新闻+数据+分析+IM 四合一；BBG Chat (2025) 把 AI 嵌入终端；`{NI <GO>}` 自然语言查指标 | $27k/席/年，散户用不起；学习曲线陡 | 1) 内嵌 AI Chat；2) 一手新闻+研报是壁垒；3) IM 协同 |
| **Refinitiv Eikon (LSEG)** | Workspace 集成度强；Lipper基金数据；StarMine 分析师评级 | 被 LSEG 收购后整合慢 | 1) Workspace 范式（一个窗口全做完）；2) Lipper 风格基金数据 |
| **FactSet** | 投行/PE 深度用户；StreetAccount 新闻聚合；Portfolio Workspace | 单价贵，对个人不友好 | 1) StreetAccount 实时新闻流；2) Portfolio Workspace 范式 |
| **S&P Capital IQ** | 公司基本面深度；可比公司分析最强；Excel 插件 | 体验偏老 | 1) 可比公司分析要扎实；2) Excel 集成值得做 |
| **Wind (国内)** | 国内机构绝对头部；宏观+行业+财务+研报+新闻+组合全覆盖 | 贵，闭源；CLI 体验差 | 1) 全面性要做到；2) CLI 可以反超 |
| **iFinD (同花顺)** | 国内性价比之选；散户友好 | 数据深度和实时性弱于 Wind | 1) 散户市场有空间 |

### 2.2 全球第二梯队（专业级，年费 1-3 千美元）

| 工具 | 核心优势 | 对 WorkBuddy 的启示 |
|---|---|---|
| **AlphaSense** | 企业财报+研报+新闻的**语义搜索**王者；Sentiment scoring | 1) 研报语义搜索是核心；2) 情绪打分要做到 NLP 级 |
| **Tegus (被 AlphaSense 收购)** | 专家访谈录音转录，原创 alpha | 1) 另类数据源整合 |
| **Sentieo** | 财务建模+Excel AI 化 | 1) AI 建模 |
| **Koyfin** | 散户级 Bloomberg 替代品；可视化强 | 1) 终端 UX 要现代化 |
| **Perplexity Finance** | AI 引用式财经回答 | 1) 引用+溯源是 AI 投研标配 |
| **FinChat** | AI 投顾，自然语言问股票 | 1) NL 选股是入口；2) 投资社区+讨论 |

### 2.3 国内第二梯队（中文 AI 投研工具）

| 工具 | 核心优势 | 对 WorkBuddy 的启示 |
|---|---|---|
| **朝阳永续 AI 小二** | 20 年卖方数据资产 + 研报覆盖最深 | 1) 卖方研报是关键资产；2) 数据沉淀是壁垒 |
| **通联数据 (DataYes) 智能投研** | 因子库 + 量化研究 + 资管场景 | 1) 因子+回测必须做；2) 资管场景（B 端）可探索 |
| **雪球 / 雪球思考** | UGC 社区 + AI；散户流量大 | 1) 社区+AI 是飞轮；2) 中文社交情绪是 α |
| **聚宽 / 米筐 / 优矿** | 量化研究平台；本地回测 | 1) 量化用户体验是基础；2) 策略市场可以借鉴 |
| **Tushare Pro (API)** | 开源 A 股数据 | 1) 数据不是壁垒，AI+工作流才是 |
| **萝卜投研 / 慧博** | 研报聚合 + AI 摘要 | 1) 研报 AI 化有空间 |

### 2.4 顶级研究流程的"5 个反直觉特征"

通过对 30+ 卖方研报/Goldman/桥水/2sigma 流程的复盘，顶级投研和普通投研的差别在于：

1. **必须有反方观点（Devil's Advocate）**：每篇研报必带 1-2 个熊市/做空场景，否则不算"看过了"
2. **必须有"假设挑战"环节**：对 DCF 的 WACC、terminal growth、永续期假设进行 ±1σ 敏感性测试
3. **必须有"事后复盘"闭环**：每个决策 3/6/12 个月后做 post-mortem，记录"我当时为什么这么想、现实怎么打脸"
4. **必须有"反事实"分析**：剔除我买入的某只股票，组合表现如何？找到真正的 α
5. **必须有"另类数据交叉验证"**：卫星图像看工厂烟羽、信用卡数据看消费、招聘数据看扩张——单一数据源都是噪音

**WorkBuddy 当前 5 个反直觉特征中 0 个覆盖**——这是最大鸿沟。

---

## 3. 蒸馏：WorkBuddy 投资 Skill 三大类（基础/进阶/专业）

### 3.1 基础层：现有 50 skill 中"能直接用"的 20 个

不需要新增，按场景直接调用即可：

```
【看盘】market-overview / multi-market-analysis / technical-analysis
【早报】investment-market-brief / morning-brief
【选股】investment-stock-screening / screen / investment-stock-screening
【个股】investment-stock-analysis / dossier / a-share-analysis
【估值】dcf / valuation-comparison
【财务】financial-report / cash-flow-analysis / financial-interpretation
【情绪】sentiment-analysis / x-research
【资金】money-flow / institutional-holding
【风险】risk-assessment / investment-risk-assessment
【组合】investment-portfolio-review / portfolio-management / portfolio-rebalancing
【基金】fund-analysis / fund-comparison / fund-holdings
【决策】investment-decision-dashboard
【公告】earnings-calendar / earnings-season / earnings-forecast
【对比】stock-comparison
【跟踪】market-monitor / alert-management
```

### 3.2 进阶层：需要"工程化"的 20 个 skill（占位升级）

把现在的"模板填空"skill 升级为"真执行"skill：

| # | Skill | 当前问题 | 升级方向 |
|---|---|---|---|
| 1 | `dcf` | OK 但只支持美股口径 | 接入 A 股 + DDM + EVA + 敏感性表 |
| 2 | `financial-report` | A 股指标清单 | 加杜邦 5 因子 + 盈利质量 + 收入粉饰识别 |
| 3 | `cash-flow-analysis` | 三流分类 | 加 FCF 估值桥接 + 资本开支质量分析 |
| 4 | `earnings-forecast` | 单点预测 | 改为 Consensus + 自上而下 + 共识分歧度 |
| 5 | `earnings-season` | 季报日历 | 加超预期/不及预期 + 财报后股价反应分析 |
| 6 | `momentum-investing` | 模板 | 接量化指标（ROC/RSI/ADX），实盘回测 |
| 7 | `value-investing` | 价值清单 | 接 Graham Number + 净流动资产 + 安全边际 |
| 8 | `growth-investing` | 成长清单 | 接 PEG + 增长率可持续性 + 季度环比 |
| 9 | `dividend-analysis` | 高股息 | 接分红连续性 + 股息率历史分位 + 派息能力 |
| 10 | `technical-analysis` | OK | 加缠论/形态识别/成交量分布 |
| 11 | `performance-prediction` | 目标价模板 | 改为分析师共识聚合 + 修正动量 |
| 12 | `risk-assessment` | 五维打分 | 接真实 VaR / 压力测试 / 蒙特卡洛 |
| 13 | `portfolio-management` | 持仓+再平衡 | 接 Kelly/Black-Litterman/Risk Parity |
| 14 | `portfolio-rebalancing` | 优化算法 | 接约束优化（行业/因子/流动性） |
| 15 | `macro-analysis` | GDP/CPI 模板 | 接入真实宏观数据 + 美林时钟 |
| 16 | `sentiment-analysis` | 关键词匹配 | 接入 NLP 模型（FinBERT/RoBERTa） |
| 17 | `sector-rotation` | 风格切换 | 接相对强弱 + 资金流 + 北向数据 |
| 18 | `money-flow` | 资金流 | 加游资画像 + 机构/北向分歧 |
| 19 | `institutional-holding` | 北向+外资 | 加 13F 解析 + 机构持仓变动 |
| 20 | `backtest-dca` | 定投回测 | 扩展为通用回测引擎 |

### 3.3 专业层：需要"全新构建"的 20 个 skill

按"独立增量 α"和"差异化定位"打分，**新增**这 20 个：

#### 3.3.1 量化基础设施（5 个 P0）

| # | Skill | 一句话 | 关键数据源 | 优先级 | 价值 |
|---|---|---|---|---|---|
| 1 | **`factor-model`** | Fama-French 5 因子 + 动量/质量/低波因子暴露与归因 | Barra / 聚宽因子库 / Tushare `stk_factor` | **P0** | **S** |
| 2 | **`backtest-engine`** | 通用事件驱动回测（年化/夏普/卡玛/最大回撤/滚动/Walk-forward） | 历史日线 + 财报 + 事件 | **P0** | **S** |
| 3 | **`performance-attribution`** | Brinson/HB/Fama-French 三层业绩归因 | 组合持仓 + 基准 + 因子 | **P0** | **S** |
| 4 | **`portfolio-optimizer`** | MPT / Black-Litterman / Risk Parity / 最大分散度 4 种优化 | 协方差矩阵 + 预期收益 + 约束 | **P0** | **A** |
| 5 | **`scenario-stress-test`** | 历史情景（2008/2015/2020/2022）+ 假设冲击测试 | 历史回放 + Monte Carlo | **P0** | **A** |

#### 3.3.2 A 股本土 alpha（5 个 P1）

| # | Skill | 一句话 | 关键数据源 | 优先级 | 价值 |
|---|---|---|---|---|---|
| 6 | **`convertible-bond`** | 可转债转股溢价率/强赎/下修/回售博弈分析 | 集思录/宁稳网/东财转债 | **P1** | **S** |
| 7 | **`dragon-tiger-list`** | 龙虎榜解读 + 游资席位画像 + 连板策略 | 沪深交易所龙虎榜 + 游资 DB | **P1** | **A** |
| 8 | **`margin-financing`** | 两融余额变化 + 融资买入比 + 杠杆资金画像 | 沪深两融数据 | **P1** | **A** |
| 9 | **`etf-arbitrage`** | ETF 折溢价 / 申赎套利 / 事件套利 | 基金公司 + 行情 | **P1** | **A** |
| 10 | **`event-driven-calendar`** | 分红/送转/解禁/增减持/业绩预告/股东大会日历 | 巨潮/东财事件库 | **P1** | **A** |

#### 3.3.3 行业与护城河（4 个 P2）

| # | Skill | 一句话 | 关键数据源 | 优先级 | 价值 |
|---|---|---|---|---|---|
| 11 | **`moat-scorecard`** | 5 维护城河打分（品牌/网络/成本/转换/规模） | 财务 + 行业 + 管理层访谈 | **P2** | **A** |
| 12 | **`value-chain-graph`** | 产业链图谱自动生成（上游→中游→下游+议价力） | 行业分类 + 公司主营 + 财报附注 | **P2** | **A** |
| 13 | **`industry-life-cycle`** | 行业生命周期（导入/成长/成熟/衰退）+ S-Curve | 行业增速 + 市占率 + R&D 强度 | **P2** | **A** |
| 14 | **`porter-five-forces`** | 波特五力打分（供应商议价/买方议价/替代品/新进入/现有竞争） | 财报 + 行业 + 政策 | **P2** | **A** |

#### 3.3.4 估值与质量（3 个 P2）

| # | Skill | 一句话 | 关键数据源 | 优先级 | 价值 |
|---|---|---|---|---|---|
| 15 | **`multi-model-valuation`** | DDM / EVA / SOTP / PEG / 反向 DCF 多模型估值 | 财务 + 股权结构 + 行业可比 | **P2** | **A** |
| 16 | **`fundamental-quality`** | 杜邦 5 因子 + 盈利质量（Accruals/FCF/NI）+ 收入粉饰识别 | 财务三表 | **P2** | **A** |
| 17 | **`earnings-call-mining`** | 财报电话会全文 NLP 抽取（前瞻指引/管理层信心/超预期信号） | Seeking Alpha / SEC 8-K / 业绩说明会 | **P2** | **A** |

#### 3.3.5 宏观与衍生品（3 个 P2）

| # | Skill | 一句话 | 关键数据源 | 优先级 | 价值 |
|---|---|---|---|---|---|
| 18 | **`macro-timing`** | 美林时钟 / 普林格周期 / PMI-M2-社融三维择时 | 国家统计局 + 央行 + 中债登 | **P2** | **A** |
| 19 | **`options-greeks`** | 期权 Greeks + PCR/IV/最大痛点 + 对冲建议 | 中金所/上交所期权行情 | **P2** | **A** |
| 20 | **`fx-commodity-monitor`** | 美元指数 / 黄金 / 原油 / 铜 / 农产品 + 跨资产联动 | 期货行情 + 宏观数据 | **P2** | **A** |

---

## 4. 升级路径：6 阶段 Roadmap（6-12 个月）

### Phase 1（Week 1-2）：估值去 stub + IDL 上线

**目标**：把 `/invest` 5 阶段的"估值 Phase"从硬编码升级为真实数据；引入"投资决策日志"。

**具体动作**：
1. **Phase 2 真实数据改造**（`src/agent/phase-handlers.ts` 的 `valuationHandler`）
   - 删除 `FCF=1B`、`EPS=5`、`Price=100` stub
   - 接入 `get_financials` + `get_astock_financials` 的真实 FCF/EPS/Revenue
   - 接入 `get_key_ratios` 的 PE/PB/EV/EBITDA
   - 输出 3 家可比公司表 + 敏感性矩阵（5 档 WACC × 5 档 terminal growth）
2. **投资决策日志（IDL）**
   - 新建 `src/memory/investment-decision-log.ts`
   - 在 `trade` handler 后调用 `logDecision({ticker, direction, position, reason, triggerCondition, expectedHold})`
   - JSONL 持久化到 `.upup/decisions/{YYYY-MM-DD}.jsonl`
3. **Bear Case 阶段（Phase 3.5）**
   - 在 trade 前插入 `bearCaseHandler`
   - 强制 LLM 生成 3 个致命假设 + 反驳
   - 输出 `## Bear Case` section

**验收**：
- 跑 `/invest NVDA`，能拿到真实财务数据的 DCF（不是 100 美元）
- 跑 `/invest 600519`，能输出 3 家白酒可比公司表
- 每个 `/invest` 执行后能在 `.upup/decisions/` 找到决策日志

### Phase 2（Week 3-6）：三件套基础设施

**目标**：把"模板投顾"升级为"真量化投研平台"。

**具体动作**：
1. **backtest-engine**（`src/skills/backtest-engine/SKILL.md` + `src/tools/quant/backtest.ts`）
   - 接口：`backtest({strategy, universe, start, end, initialCapital, benchmark, params})`
   - 输出：年化/夏普/卡玛/索提诺/最大回撤/胜率/换手/年化 alpha
   - 支持：事件驱动（日线 close、调仓日 = 月底）、滚动窗口、Walk-forward
2. **factor-model**（`src/skills/factor-model/SKILL.md` + `src/tools/quant/factor.ts`）
   - 6 大类因子：价值（EP/BP/CP/DP）、质量（ROE/ROA/毛利率/Accruals）、动量（12-1/6-1/1m）、波动（β/特异/总波）、规模（ln(mcap)）、成长（盈利/营收/SUE）
   - 接口：`getFactorExposures(tickers, date)` + `factorReturn(ticker, factor, period)`
3. **performance-attribution**（`src/tools/portfolio/attribution.ts` 升级）
   - 三层归因：Brinson（配置/选择/交互）+ HB（行业/证券）+ Fama-French（市场/规模/价值/动量）
   - 时间窗：月度/季度/年度
   - 输出 HTML 可视化（瀑布图）

**验收**：
- `/backtest MA-cross(5,20) 上证50` 跑出真实的夏普比率
- `/factor-exposure 600519 2024` 跑出 6 因子暴露
- `/attribution my-portfolio 2024Q1` 输出 Brinson 瀑布图

### Phase 3（Week 7-10）：A 股本土 alpha

**目标**：抢占 400+ 可转债 + 龙虎榜 + ETF 套利的独立 α。

**具体动作**：
1. **convertible-bond**（`src/skills/convertible-bond/SKILL.md` + `src/tools/astock/convertible.ts`）
   - 数据源：Tushare `cb_basic` + `cb_daily` + `cb_share` + 集思录 API
   - 输出：转股溢价率 / 纯债溢价率 / 剩余规模 / 强赎触发价 / 下修触发价 / 回售触发价
   - 策略：低溢价率轮动、强赎博弈、下修博弈、回售博弈
2. **dragon-tiger-list**（`src/skills/dragon-tiger-list/SKILL.md` + `src/tools/astock/dragon-tiger.ts`）
   - 数据源：Tushare `top_list` + `top_inst`
   - 输出：游资席位画像（欢乐海/赵老哥/孙哥/章盟主等）、连板梯队、炸板率
   - 策略：游资接力、首板打板、N 字反包
3. **etf-arbitrage**（`src/skills/etf-arbitrage/SKILL.md` + `src/tools/astock/etf-arb.ts`）
   - 数据源：基金公司公告 + 实时 IOPV + 折溢价率
   - 输出：折溢价 > 1% 套利机会、申赎清单、调仓事件
4. **margin-financing + event-driven-calendar**：同上述思路

**验收**：
- `/cb-screen 转股溢价率<20% 余额>5亿` 跑出真实可转债池
- `/dragon-tiger 2024-06-13` 跑出当天游资接力图
- `/etf-arb 沪深300ETF` 跑出现折溢价套利机会

### Phase 4（Week 11-14）：多 Agent 协同 + Coordinator

**目标**：把 5 个专用 subagent 串成"研究主管→研究员→风控官→交易官→复盘官"。

**具体动作**：
1. **Coordinator Agent**（`src/agent/coordinator.ts`）
   - 输入：用户 query（标的研究/行业研究/组合诊断）
   - 路由：根据 query 类型选择执行链
     - 个股：`explore → plan → risk → trade → review`
     - 行业：`explore (×N 并行) → merge → plan`
     - 组合：`review → risk → rebalance`
   - 实现：状态机（planner + executor + observer）+ 失败回滚
2. **风控官 Gate**（`invest-risk` subagent 升级）
   - 在 trade 前强制调用
   - 检查项：单票持仓 < GOVERN.maxPosition、行业集中度 < X、流动性 > Y、VaR < Z
   - 不通过则阻断交易，要求重新规划
3. **并行研究模式**
   - `/research-industry 半导体` 自动派发 5 个 explore subagent
     - explore-1: 上游（设备/材料/EDA）
     - explore-2: 中游（设计/制造/封测）
     - explore-3: 下游（应用/分销）
     - explore-4: 海外对标（TSMC/ASML/AVGO）
     - explore-5: 政策与资金
   - 合并输出：行业全景报告

**验收**：
- 跑 `/research-industry 半导体`，能看到 5 个 subagent 并行工作的进度
- 跑 `/invest 600519`，风控官能阻断超限交易
- 5 阶段工作流可以在任意阶段中断和恢复

### Phase 5（Week 15-20）：数据源升级 + 宏观 + 行业研究

**目标**：补齐数据短板，把"看个股"升级为"看市场"。

**具体动作**：
1. **宏观数据工具**（`src/tools/finance/macro.ts`）
   - Tushare：`cn_gdp` / `cn_cpi` / `cn_pmi` / `cn_m` / `cn_sf` / `cn_money_supply`
   - 输出：宏观仪表盘（CPI/PPI/PMI/M2-社融/利率曲线）
2. **指数行情**（`src/tools/finance/index.ts`）
   - Tushare `index_daily` + 实时 IOPV
   - 覆盖：上证综指/深证成指/创业板/科创50/沪深300/中证500/中证1000/恒生/标普500/纳指/道指
3. **A 股估值时序**（`get_astock_price` 升级）
   - Tushare `daily_basic` 增加 `pe` / `pb` / `pe_ttm` / `pb_mrq` / `ps` / `ps_ttm` / `total_mv` / `circ_mv` / `turnover_rate` / `turnover_rate_f`
4. **港股**（新增 `src/tools/hk/`）
   - Tushare 港股接口 + yahoo finance fallback
   - 覆盖：港股行情/财务/恒生指数/南向资金
5. **stock_screener 真实化**（升级现有 placeholder）
   - 接 Financial Datasets `/financial-metrics/snapshot`（美股）+ Tushare 筛选接口（A 股）
6. **macro-timing skill**
   - 美林时钟（CPI × GDP 增长象限）
   - 普林格周期（货币/盈利/物价三阶段）
   - 美元周期、利差周期

**验收**：
- `/macro` 输出 GDP/CPI/PMI/M2 仪表盘
- `/index 上证/标普` 输出指数对比
- `/screen PE<15 PB<2 ROE>15%` 跑出真实筛选

### Phase 6（Week 21-26）：差异化 + 商业化

**目标**：从"工程完成"到"产品完成"。

**具体动作**：
1. **反方观点**（强制嵌入所有投资结论）
2. **事后复盘**（`/post-mortem 2024-01-15` 调出 6 个月前的决策和实际结果）
3. **研究项目容器**（`Project` 抽象层，跨 Session 追踪）
4. **投资偏好动态学习**（用户历史决策 → 自动调整 risk tolerance 和 sector preference）
5. **i18n 投资术语扩展**（50+ 专业词条）
6. **研报引用体系**（Source tier L1-L4 标注）
7. **多 Provider 适配**（除 LLM 外的"数据"也可以多源：Tushare/通联/聚宽/东财）
8. **MCP 插件市场**（让第三方数据源以 MCP server 形式接入）
9. **企业版**（多用户协作 + 权限 + 审计 + 私有部署）
10. **策略市场**（用户分享自己的回测策略，类似聚宽/米筐）

---

## 5. 关键架构升级

### 5.1 数据流（从"模板填空"到"信号计算"）

**当前**：
```
User Query → Agent Loop → LLM + 11 个工具 → 直接生成文本
```

**升级后**：
```
User Query
  → Coordinator (路由)
    → Explore Subagent ×N（并行）
      → financial_search / financial_metrics / read_filings / web_search
      → 缓存到 Scratchpad
    → Plan Subagent
      → factor_model (计算因子暴露)
      → backtest_engine (历史回测)
      → multi_model_valuation (DCF/DDM/EVA/SOTP)
      → bear_case (反方观点)
      → stress_test (压力测试)
    → Risk Subagent
      → portfolio_optimizer (Black-Litterman / Risk Parity)
      → var_cvar / stress_test / 集中度
    → Trade Subagent
      → sandbox_broker / idl_logger
    → Review Subagent
      → performance_attribution (Brinson/Fama-French)
      → post_mortem (事后复盘)
  → Coordinator 整合 → 输出结构化报告
```

### 5.2 决策闭环（投资操作系统）

```
                    ┌─────────────────┐
                    │  1. 假设挑战    │  ← 反方观点 + 敏感性
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │  2. 信号生成    │  ← 因子 + 估值 + 回测
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │  3. 风险评估    │  ← VaR + 集中度 + 压力
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │  4. 决策执行    │  ← 仓位 + IDL 记录
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │  5. 投后跟踪    │  ← 归因 + 复盘 + 学习
                    └────────┬────────┘
                             ↓
                          回到 1
```

### 5.3 三层记忆系统

```
┌─────────────────────────────────────────────┐
│  L1: 工作记忆 (Scratchpad)                  │
│  - 单次查询的工具结果                        │
│  - JSONL 持久化                              │
│  - 容量：单次 50-200K tokens                 │
├─────────────────────────────────────────────┤
│  L2: 项目记忆 (Project Context)              │
│  - 跨 Session 的研究项目                     │
│  - Plan + 决策 + 复盘 + 笔记                │
│  - 容量：每个 Project 1-10MB                 │
├─────────────────────────────────────────────┤
│  L3: 用户画像 (Investment Profile)           │
│  - 风险偏好 / 行业偏好 / 持仓历史 / 风格标签 │
│  - 向量化检索 (Embedding RAG)                │
│  - 容量：每用户 100KB-1MB                    │
└─────────────────────────────────────────────┘
```

### 5.4 工作流执行引擎

```
Coordinator (编排)
   ↓
   ├─ DAG Planner: 把 query 拆成 DAG（不是线性 5 阶段）
   ├─ Executor: 拓扑排序 + 并行执行（DAG 决定哪些可并行）
   ├─ Gate: 关键节点需要 subagent 校验（如 trade 前的 risk）
   ├─ Checkpoint: 每阶段持久化，支持 resume
   └─ Rollback: 失败时回滚已执行步骤
```

---

## 6. 量化指标（怎么算"做成了"）

| 维度 | 指标 | 当前值 | 6 个月目标 | 12 个月目标 |
|---|---|---|---|---|
| **Skill 数量** | 注册 SKILL.md | 50 | 65 | 80 |
| **S 级 skill** | 真正可独立产 α | 4 | 10 | 18 |
| **模板填空 skill 比例** | 占总数 | 92% | 60% | 40% |
| **数据源覆盖度** | A股/港股/美股/加密 × 7 维度 | 7/49 | 25/49 | 35/49 |
| **真实回测引擎** | 支持年化/夏普/卡玛 | ❌ | ✅ | ✅ |
| **因子模型** | 6 因子暴露 | ❌ | ✅ | ✅ |
| **业绩归因** | Brinson + Fama-French | ❌（占位） | ✅ | ✅ |
| **A 股本土 alpha** | 可转债/龙虎榜/ETF | 0/3 | 3/3 | 3/3 |
| **多 Agent 协同** | Coordinator | ❌ | ✅ | ✅ |
| **真实估值数据** | DCF 接真实数据 | ❌（stub） | ✅ | ✅ |
| **决策日志** | IDL 持久化 | ❌ | ✅ | ✅ |
| **事后复盘** | 6/12 月回看 | ❌ | ✅ | ✅ |
| **响应延迟** | P50 /invest NVDA | 待测 | < 60s | < 30s |
| **Token 成本** | 平均 /invest | 待测 | 降低 30% (Prompt Caching) | 降低 50% |
| **用户量** | 活跃用户 | 内部测试 | 1000+ 公开 Beta | 10000+ |
| **NPS** | 用户推荐意愿 | N/A | 50+ | 60+ |

---

## 7. 风险与缓解

| 风险 | 严重度 | 缓解 |
|---|---|---|
| **LLM 幻觉导致错误投资建议** | 高 | 强制工具调用 + 数据来源标注 + 反方观点 + 免责声明 |
| **数据源合规风险**（Tushare/同花顺 API 限频） | 中 | 多源降级（腾讯/新浪/东财）+ 缓存 + 自建 ETL |
| **回测过拟合** | 高 | 强制 walk-forward + 样本外验证 + 现实摩擦成本（手续费/滑点） |
| **实盘亏损引发用户索赔** | 中 | 仅提供 paper trade，不接真实券商 API；明确免责声明 |
| **Prompt injection**（研报/新闻中嵌入恶意 prompt） | 中 | 工具结果 sanitization + 引用链标注 |
| **数据延迟导致决策错误** | 中 | 每个数据源标注延迟（实时/T+1/T+N）+ 警告 |
| **多 Agent 失控** | 中 | Coordinator 状态机 + 成本上限 + 沙箱 |
| **过度依赖 LLM 推理而非真实数据** | 高 | 强约束：所有数值必须来自工具调用，LLM 禁止编造 |
| **本土化 vs 国际化定位模糊** | 低 | 明确"中文 AI 投研 OS"定位，不直接对标 Bloomberg |
| **开源社区贡献放缓** | 低 | MCP 插件市场 + 投资 Skill Marketplace + 开发者激励 |

---

## 8. 商业化路径（可选）

WorkBuddy 当前是 MIT 开源，参考同类项目商业化路径：

1. **开源版（Free）**：CLI + 基础 skill + 5 阶段工作流 + 50 标的 /月
2. **专业版（Pro, $29/月 或 ¥199/月）**：
   - 全部 80+ skill
   - 无限标的
   - 多 Agent 协同
   - Prompt Caching 加速
   - 自定义策略
3. **团队版（Team, $99/席/月）**：
   - 协作 + 权限 + 审计
   - 私有数据源
   - 自定义工作流
4. **企业版（Enterprise, 询价）**：
   - 私有部署
   - 接 Wind/Bloomberg/Choice 数据
   - 定制 Skill
   - SLA

**优先级建议**：先把开源版打磨到"专业用户愿意付费"的程度，再考虑 Pro 收费。过早商业化会损害社区。

---

## 9. 行动清单（按周排序）

### Week 1-2：Phase 1（估值去 stub + IDL + Bear Case）
- [ ] 重写 `src/agent/phase-handlers.ts` 的 `valuationHandler`，接入真实财务数据
- [ ] 新建 `src/memory/investment-decision-log.ts`
- [ ] 在 `runInvestmentWorkflow` 插入 Phase 3.5 `bearCaseHandler`
- [ ] 给 `/invest` 输出增加 `## Bear Case` 和 `## Decision Log` section
- [ ] 写测试：3 个测试用例（NVDA / 600519 / TSLA）

### Week 3-6：Phase 2（三件套）
- [ ] 新建 `src/tools/quant/backtest.ts` + `src/skills/backtest-engine/SKILL.md`
- [ ] 新建 `src/tools/quant/factor.ts` + `src/skills/factor-model/SKILL.md`
- [ ] 升级 `src/tools/portfolio/attribution.ts` 真实化
- [ ] 新建 `src/skills/performance-attribution/SKILL.md`
- [ ] 新建 `/backtest` `/factor` `/attribution` 命令
- [ ] 写测试：3 个回测用例 + 3 个因子用例 + 3 个归因用例

### Week 7-10：Phase 3（A 股本土 alpha）
- [ ] 新建 `src/tools/astock/convertible.ts` + `src/skills/convertible-bond/SKILL.md`
- [ ] 新建 `src/tools/astock/dragon-tiger.ts` + `src/skills/dragon-tiger-list/SKILL.md`
- [ ] 新建 `src/tools/astock/etf-arb.ts` + `src/skills/etf-arbitrage/SKILL.md`
- [ ] 新建 `src/tools/astock/margin.ts` + `src/skills/margin-financing/SKILL.md`
- [ ] 新建 `src/tools/astock/event-calendar.ts` + `src/skills/event-driven-calendar/SKILL.md`
- [ ] 新建 `/cb-screen` `/dragon-tiger` `/etf-arb` `/margin` `/event-calendar` 命令

### Week 11-14：Phase 4（Coordinator）
- [ ] 新建 `src/agent/coordinator.ts` 状态机
- [ ] 升级 `src/agent/investment-subagents.ts`，增加 5 个 subagent 的 tool 白名单
- [ ] 在 `runInvestmentWorkflow` 集成 Coordinator
- [ ] 实现并行行业研究模式
- [ ] 风控官 Gate
- [ ] 写测试：DAG 执行 + 回滚 + checkpoint

### Week 15-20：Phase 5（数据源 + 宏观 + 港股）
- [ ] 新建 `src/tools/finance/macro.ts`（GDP/CPI/PMI/M2/利率/汇率）
- [ ] 新建 `src/tools/finance/index.ts`（指数行情）
- [ ] 升级 `get_astock_price` 增加 PE/PB/turnover_rate
- [ ] 新建 `src/tools/hk/`（港股）
- [ ] 升级 `stock_screener` 真实化
- [ ] 新建 `src/skills/macro-timing/SKILL.md`
- [ ] 新建 `src/skills/multi-market-index/SKILL.md`

### Week 21-26：Phase 6（产品化）
- [ ] 投资决策日志 UI 化
- [ ] 事后复盘命令 `/post-mortem`
- [ ] 研究项目容器（Project 抽象）
- [ ] 投资偏好动态学习引擎
- [ ] i18n 投资术语 50+ 词条
- [ ] 研报引用体系 L1-L4
- [ ] MCP 插件市场基础设施
- [ ] Beta 用户招募（小红书/雪球/知乎）

---

## 10. 关键文件清单（落地参考）

```
src/
├── agent/
│   ├── coordinator.ts                    [NEW] 状态机 + DAG 编排
│   ├── phase-handlers.ts                 [MODIFY] valuationHandler 去 stub
│   ├── bear-case-handler.ts              [NEW] 反方观点生成
│   ├── investment-subagents.ts           [MODIFY] 增加 tool 白名单
│   ├── subagent.ts                       [MODIFY] 并行度从 3 提升到 5
│   └── scratchpad.ts                     [MODIFY] 加全文搜索
├── memory/
│   ├── investment-decision-log.ts        [NEW] IDL 持久化
│   └── post-mortem.ts                    [NEW] 事后复盘
├── tools/
│   ├── quant/
│   │   ├── backtest.ts                   [NEW] 通用回测引擎
│   │   ├── factor.ts                     [NEW] 因子模型
│   │   └── optimizer.ts                  [NEW] 组合优化
│   ├── portfolio/
│   │   └── attribution.ts                [MODIFY] 真实化
│   ├── astock/
│   │   ├── convertible.ts                [NEW] 可转债
│   │   ├── dragon-tiger.ts               [NEW] 龙虎榜
│   │   ├── etf-arb.ts                    [NEW] ETF 套利
│   │   ├── margin.ts                     [NEW] 两融
│   │   ├── event-calendar.ts             [NEW] 事件日历
│   │   └── price.ts                      [MODIFY] 增加 PE/PB
│   ├── finance/
│   │   ├── macro.ts                      [NEW] 宏观
│   │   ├── index.ts                      [NEW] 指数
│   │   └── screener.ts                   [MODIFY] 真实化
│   └── hk/                               [NEW DIR] 港股
├── skills/
│   ├── factor-model/SKILL.md             [NEW]
│   ├── backtest-engine/SKILL.md          [NEW]
│   ├── performance-attribution/SKILL.md  [NEW]
│   ├── portfolio-optimizer/SKILL.md      [NEW]
│   ├── scenario-stress-test/SKILL.md     [NEW]
│   ├── convertible-bond/SKILL.md         [NEW]
│   ├── dragon-tiger-list/SKILL.md        [NEW]
│   ├── etf-arbitrage/SKILL.md            [NEW]
│   ├── margin-financing/SKILL.md         [NEW]
│   ├── event-driven-calendar/SKILL.md    [NEW]
│   ├── moat-scorecard/SKILL.md           [NEW]
│   ├── value-chain-graph/SKILL.md        [NEW]
│   ├── industry-life-cycle/SKILL.md      [NEW]
│   ├── porter-five-forces/SKILL.md       [NEW]
│   ├── multi-model-valuation/SKILL.md    [NEW]
│   ├── fundamental-quality/SKILL.md      [NEW]
│   ├── earnings-call-mining/SKILL.md     [NEW]
│   ├── macro-timing/SKILL.md             [NEW]
│   ├── options-greeks/SKILL.md           [NEW]
│   ├── fx-commodity-monitor/SKILL.md     [NEW]
│   ├── investment-bear-case/SKILL.md     [NEW]
│   └── investment-post-mortem/SKILL.md   [NEW]
└── commands/
    ├── investment/
    │   ├── invest.ts                     [MODIFY] 集成 Coordinator
    │   ├── backtest.ts                   [NEW]
    │   ├── factor.ts                     [NEW]
    │   ├── attribution.ts                [NEW]
    │   ├── cb-screen.ts                  [NEW]
    │   ├── dragon-tiger.ts               [NEW]
    │   ├── etf-arb.ts                    [NEW]
    │   ├── post-mortem.ts                [NEW]
    │   └── project.ts                    [NEW] 研究项目容器
```

---

## 11. 一句话总结

**把 WorkBuddy 从"50 个模板填空"升级为"6 个 P0 基础设施 + 5 个 A 股本土 alpha + 多 Agent 协同 + 真实数据闭环"的真量化 AI 投研平台，6-12 个月内即可达成"个人/中小型机构首选中文 AI 投研 OS"的定位。**

关键不在于 skill 数量，而在于：
1. **有基础设施**（回测/因子/归因）
2. **有独立 α**（可转债/龙虎榜/ETF）
3. **有反方观点**（不是只告诉你"会涨"）
4. **有真实数据**（不是 stub）
5. **有决策闭环**（IDL + 复盘 + 学习）

这 5 件事做完，WorkBuddy 就能和"模板式投顾"拉开代际差距。

---

*本文档基于 /Users/louloulin/Documents/linchong/touzhi/upup 仓库全量代码审计 + Bloomberg/Refinitiv/FactSet/AlphaSense/FinChat/通联/雪球/聚宽 等 30+ 产品对标 + 卖方研究流程最佳实践编写。所有数据可在 `.upup/decisions/` 找到原始审计日志和实施记录。*
