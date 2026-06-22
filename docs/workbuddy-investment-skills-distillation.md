# WorkBuddy 投资 Skills 蒸馏总表

> 配套《WorkBuddy 顶级投资助手白皮书 v1.0》使用 ｜ 审计日期：2026-06-13

## 一、现有 Skill 价值评级

| Skill | 一句话 | 工具 | 市场 | 评级 | 分类 |
|---|---|---|---|---|---|
| **S 级（4 个，明星）** ||||||
| `dcf` | FCF/WACC/敏感性三维 DCF，EV 30% 一致性校验 | `get_financials`、`get_market_data` | 通用（美股口径） | **S** | 估值 |
| `investment-stock-analysis` | 个股深度分析（行情+技术+财务+舆情+决策） | `get_astock_*` | A/港/美 | **S** | 综合 |
| `investment-decision-dashboard` | 四维（技术30+基本面30+资金20+情绪20）综合评分+买卖信号 | `get_decision_score` | A | **S** | 综合 |
| `x-research` | X/Twitter 卖方/买方舆情研究 | `x_search` | 港/美/加密 | **S** | 另类数据 |
| **A 级（18 个，能跑通）** ||||||
| `investment-portfolio-review` | 持仓复盘+业绩归因+调仓建议 | `assess_portfolio_risk` | A | A | 组合 |
| `investment-market-brief` | 每日盘面+指数+北向+热点+复盘 | 多接口 | A | A | 早报 |
| `investment-risk-assessment` | VaR/CVaR+止损+优化建议 | `calculate_portfolio_risk` | A | A | 风险 |
| `investment-stock-screening` | 自然语言选股 | `screen_astocks` | A | A | 选股 |
| `financial-report` | A 股三表指标清单+重要性星级 | `get_astock_financials` | A | A | 财报 |
| `technical-analysis` | K线/均线/MACD/KDJ/RSI/布林 | `get_technical_data` | A | A | 技术 |
| `a-share-analysis` | A 股/港股综合入口 | 多接口 | A/港 | A | 综合 |
| `sector-analysis` | 板块涨跌/资金/驱动事件 | `get_sector_data` | A | A | 行业 |
| `sector-rotation` | 风格切换/强弱对比 | 模板+板块数据 | A | A | 行业 |
| `multi-market-analysis` | A/港/美三市场对照 | 多市场接口 | A/港/美 | A | 综合 |
| `risk-assessment` | 五维（市场/公司/财务/估值/外部）风险打分 | 模板 | A 通用 | A | 风险 |
| `portfolio-management` | 持仓盈亏+再平衡建议 | `portfolio_optimize` | A 通用 | A | 组合 |
| `portfolio-rebalancing` | 优化算法+调仓 | `portfolio_optimize` | A 通用 | A | 组合 |
| `money-flow` | 主力/超大单/大单/中单/小单资金 | 模板+资金流 | A | A | 资金 |
| `sentiment-analysis` | 新闻/公告/社媒/研报四源打分 | `get_sentiment`+`get_astock_news` | A | A | 情绪 |
| `fund-analysis` | 基金研究 | 多接口 | A | A | 基金 |
| `fund-comparison` | 基金对比 | 多接口 | A | A | 基金 |
| `api-integration` | API 集成文档 | — | 通用 | A | 工具 |
| **B 级（22 个，模板价值有限）** ||||||
| `valuation-comparison` | 历史/同业 PE/PB 分位数 | `financial_search` | A 通用 | B | 估值 |
| `financial-interpretation` | 三表 healthy range 模板 | 模板 | A | B | 财报 |
| `cash-flow-analysis` | 三流分类模板 | 模板 | A 通用 | B | 财报 |
| `earnings-forecast` | 营收/EPS 预测 | `financial_forecast` | A | B | 财报 |
| `earnings-season` | 业绩超预期/季报日历 | 模板+新闻 | A 通用 | B | 财报 |
| `momentum-investing` | ROC/RSI/ADX 动量打分 | 模板+技术 | A | B | 选股 |
| `value-investing` | 价值投资清单 | 模板 | A 通用 | B | 选股 |
| `growth-investing` | 成长股筛选 | 模板 | A 通用 | B | 选股 |
| `dividend-analysis` | 高股息策略 | 模板+财务 | A | B | 选股 |
| `performance-prediction` | 目标价/支撑压力 | 模板 | A 通用 | B | 估值 |
| `backtest-dca` | 定投回测 | `backtest` | 基金 | B | 回测 |
| `dca-strategy` | 定投策略参数 | 模板 | 基金 | B | 策略 |
| `macro-analysis` | GDP/CPI/利率/货币政策 | 模板+财经 | 通用 | B | 宏观 |
| `institutional-holding` | 机构持仓+北向+外资 | 模板+北向 | A | B | 资金 |
| `institution-research` | 机构调研记录 | 模板 | A | B | 资金 |
| `shareholder-analysis` | 股东户数/前十大/筹码分布 | 模板 | A | B | 资金 |
| `earnings-calendar` | 财报日历 | 模板 | A 通用 | B | 财报 |
| `fund-holdings` | 基金持仓 | 多接口 | A | B | 基金 |
| `fund-management` | 基金管理 | 多接口 | A | B | 基金 |
| `manager-analysis` | 基金经理分析 | 多接口 | A | B | 基金 |
| `research-report` | 综合研究报告生成 | 模板 | A | B | 综合 |
| `stock-comparison` | 股票对比 | 模板 | A | B | 综合 |
| `market-monitor` | 价格监控+提醒 | 模板 | A | B | 跟踪 |
| **C 级（6 个，重复/低价值）** ||||||
| `valuation-alert` | PE 阈值提醒 | `market_data` | A | C | 跟踪 |
| `alert-management` | 价格提醒 | 模板 | A | C | 跟踪 |
| `personalized-recommendation` | 个性化推荐 | 模板 | A | C | 综合 |
| `market-overview` | 盘面概览（与 investment-market-brief 重叠） | 模板 | A | C | 早报 |
| `swarm-analysis` | 多 agent 协作（理论多于实践） | subagent | A | C | 高级 |
| `dossier` | 一页尽调（与 investment-stock-analysis 重叠） | 多接口 | A | C | 综合 |

## 二、20 个新增 Skill 详细规格

### 2.1 量化基础设施（5 个 P0）

#### ① `factor-model` ⭐⭐⭐⭐⭐
- **定位**：Fama-French 5 因子 + 动量/质量/低波因子暴露与归因
- **数据源**：Barra / 聚宽因子库 / Tushare `stk_factor` / 自建因子计算
- **工具依赖**：`financial_metrics`、`get_astock_financials`
- **输出**：每只股票在 6 大类因子的 Z-Score + 因子收益率时序
- **价值**：**S** - 量化研究的"基础设施"，没有它谈不上"组合诊断"
- **实现成本**：高（需要历史因子收益率 + 横截面回归）
- **优先级**：**P0（Week 3-4）**

#### ② `backtest-engine` ⭐⭐⭐⭐⭐
- **定位**：通用事件驱动回测引擎
- **数据源**：Tushare `daily` / `pro_bar` + Financial Datasets
- **工具依赖**：`get_astock_price`、`get_market_data`
- **输出**：年化/夏普/卡玛/索提诺/最大回撤/胜率/换手/年化 α/β/IR
- **支持**：事件驱动、滚动窗口、Walk-forward、分层回测
- **价值**：**S** - 没有回测引擎，策略无以验证
- **实现成本**：高（事件循环 + 复权 + 摩擦成本）
- **优先级**：**P0（Week 4-6）**

#### ③ `performance-attribution` ⭐⭐⭐⭐⭐
- **定位**：Brinson/HB/Fama-French 三层业绩归因
- **数据源**：组合持仓 + 基准权重 + 因子收益率
- **工具依赖**：`factor-model`、`portfolio_holdings`
- **输出**：配置效应 + 选择效应 + 交互效应（行业归因）+ 因子贡献（风格归因）
- **价值**：**S** - "赚的是 β 钱还是 α 钱" 的唯一解法
- **实现成本**：中（数学模型明确）
- **优先级**：**P0（Week 5-6）**

#### ④ `portfolio-optimizer` ⭐⭐⭐⭐
- **定位**：MPT / Black-Litterman / Risk Parity / 最大分散度 4 种优化
- **数据源**：协方差矩阵 + 预期收益 + 约束（行业/因子/持仓上限）
- **工具依赖**：因子模型 + 历史价格
- **输出**：最优权重 + 预期收益 + 预期风险 + 集中度
- **价值**：**A** - 让"组合再平衡"从模板升级为算法
- **实现成本**：中
- **优先级**：**P0（Week 6）**

#### ⑤ `scenario-stress-test` ⭐⭐⭐⭐
- **定位**：历史情景（2008/2015/2020/2022/2024）+ 假设冲击测试
- **数据源**：历史回放 + 蒙特卡洛模拟
- **工具依赖**：组合持仓 + 历史协方差
- **输出**：每种情景下组合回撤 + 流动性冲击 + 跨资产相关性变化
- **价值**：**A** - "如果再发生一次 2015 股灾" 的回答
- **实现成本**：中
- **优先级**：**P0（Week 6）**

### 2.2 A 股本土 alpha（5 个 P1）

#### ⑥ `convertible-bond` ⭐⭐⭐⭐⭐
- **定位**：可转债转股溢价率/强赎/下修/回售博弈分析
- **数据源**：Tushare `cb_basic` + `cb_daily` + 集思录/宁稳网 API
- **工具依赖**：`get_astock_price`（正股联动）
- **输出**：低溢价率轮动池 + 强赎博弈日历 + 下修博弈候选 + 回售博弈候选
- **价值**：**S** - A 股/港股 400+ 可转债是独立 alpha 源
- **实现成本**：中（Tushare 有现成数据）
- **优先级**：**P1（Week 7-8）**

#### ⑦ `dragon-tiger-list` ⭐⭐⭐⭐
- **定位**：龙虎榜解读 + 游资席位画像 + 连板策略
- **数据源**：Tushare `top_list` + `top_inst` + 游资 DB
- **工具依赖**：历史游资席位 → 风格标签
- **输出**：游资接力梯队 + 炸板率 + 风格匹配度
- **价值**：**A** - A 股最本土的 alpha
- **实现成本**：中（需要游资 DB 建设）
- **优先级**：**P1（Week 8-9）**

#### ⑧ `margin-financing` ⭐⭐⭐⭐
- **定位**：两融余额变化 + 融资买入比 + 杠杆资金画像
- **数据源**：Tushare `margin` + `margin_detail`
- **输出**：杠杆资金净流入 Top N + 融资余额/流通市值比 + 板块杠杆率
- **价值**：**A** - 杠杆资金 = 聪明钱代理
- **实现成本**：低（包装已有 `marginDetail`）
- **优先级**：**P1（Week 9）**

#### ⑨ `etf-arbitrage` ⭐⭐⭐⭐
- **定位**：ETF 折溢价 / 申赎套利 / 事件套利
- **数据源**：基金公司公告 + 实时 IOPV + 折溢价率
- **输出**：折溢价 > 1% 套利机会 + 申赎清单 + 调仓事件
- **价值**：**A** - 低风险 alpha，适合机构
- **实现成本**：中
- **优先级**：**P1（Week 9-10）**

#### ⑩ `event-driven-calendar` ⭐⭐⭐⭐
- **定位**：分红/送转/解禁/增减持/业绩预告/股东大会日历
- **数据源**：Tushare `dividend` + `share_float` + 巨潮/东财事件库
- **输出**：未来 30 天事件清单 + 事件驱动策略建议
- **价值**：**A** - 事件驱动策略必备
- **实现成本**：低
- **优先级**：**P1（Week 10）**

### 2.3 行业与护城河（4 个 P2）

#### ⑪ `moat-scorecard` ⭐⭐⭐⭐
- **定位**：5 维护城河打分（品牌/网络/成本/转换/规模）
- **数据源**：财务 + 行业 + 管理层访谈
- **输出**：5 维 0-10 分 + 加权总分 + 同业对比
- **价值**：**A** - 替代套话式"竞争优势分析"
- **实现成本**：高（需要打分规则 + 行业对标）
- **优先级**：**P2（Week 15-16）**

#### ⑫ `value-chain-graph` ⭐⭐⭐⭐
- **定位**：产业链图谱自动生成（上游→中游→下游+议价力）
- **数据源**：行业分类 + 公司主营 + 财报附注 + 招股书
- **输出**：产业链节点 + 价值占比 + 议价力雷达
- **价值**：**A** - 行业研究基础设施
- **实现成本**：高（需要产业链知识图谱）
- **优先级**：**P2（Week 16-17）**

#### ⑬ `industry-life-cycle` ⭐⭐⭐
- **定位**：行业生命周期（导入/成长/成熟/衰退）+ S-Curve
- **数据源**：行业增速 + 市占率变化 + R&D 强度 + 渗透率
- **输出**：行业生命周期阶段 + 关键拐点信号
- **价值**：**A**
- **实现成本**：中
- **优先级**：**P2（Week 17-18）**

#### ⑭ `porter-five-forces` ⭐⭐⭐
- **定位**：波特五力打分（供应商议价/买方议价/替代品/新进入/现有竞争）
- **数据源**：财报 + 行业 + 政策
- **输出**：五力 0-10 分 + 加权总分
- **价值**：**A** - 经典框架电子化
- **实现成本**：中
- **优先级**：**P2（Week 18）**

### 2.4 估值与质量（3 个 P2）

#### ⑮ `multi-model-valuation` ⭐⭐⭐⭐
- **定位**：DDM / EVA / SOTP / PEG / 反向 DCF 多模型估值
- **数据源**：财务 + 股权结构 + 行业可比
- **输出**：5 模型估值区间 + 加权公允价
- **价值**：**A** - 补齐估值方法论
- **实现成本**：中
- **优先级**：**P2（Week 19）**

#### ⑯ `fundamental-quality` ⭐⭐⭐⭐
- **定位**：杜邦 5 因子 + 盈利质量（Accruals/FCF/NI）+ 收入粉饰识别
- **数据源**：财务三表
- **输出**：质量得分 + 粉饰风险标签
- **价值**：**A** - 排雷专用
- **实现成本**：中
- **优先级**：**P2（Week 19-20）**

#### ⑰ `earnings-call-mining` ⭐⭐⭐⭐
- **定位**：财报电话会全文 NLP 抽取（前瞻指引/管理层信心/超预期信号）
- **数据源**：Seeking Alpha / SEC 8-K / 业绩说明会
- **输出**：电话会情绪打分 + 关键语句高亮 + 前后对比
- **价值**：**A** - 电话会内容比财报数字更有前瞻性
- **实现成本**：高（NLP 模型）
- **优先级**：**P2（Week 20）**

### 2.5 宏观与衍生品（3 个 P2）

#### ⑱ `macro-timing` ⭐⭐⭐⭐
- **定位**：美林时钟 / 普林格周期 / PMI-M2-社融三维择时
- **数据源**：国家统计局 + 央行 + 中债登
- **输出**：当前周期象限 + 历史回测胜率
- **价值**：**A** - 替代"看新闻"择时
- **实现成本**：中
- **优先级**：**P2（Week 21）**

#### ⑲ `options-greeks` ⭐⭐⭐
- **定位**：期权 Greeks + PCR/IV/最大痛点 + 对冲建议
- **数据源**：中金所/上交所期权行情
- **输出**：Delta/Gamma/Vega/Theta/IV + PCR + 最大痛点 + 对冲比率
- **价值**：**A** - 衍生品对冲必备
- **实现成本**：中
- **优先级**：**P2（Week 22）**

#### ⑳ `fx-commodity-monitor` ⭐⭐⭐
- **定位**：美元指数 / 黄金 / 原油 / 铜 / 农产品 + 跨资产联动
- **数据源**：期货行情 + 宏观数据
- **输出**：跨资产相关性矩阵 + 联动信号
- **价值**：**A** - 跨资产配置必备
- **实现成本**：中
- **优先级**：**P2（Week 23）**

## 三、20 个 Skill 实施优先级总表

| 序号 | Skill | 优先级 | 周次 | 价值 | 实施成本 | 关键数据源 | 工具依赖 |
|---|---|---|---|---|---|---|---|
| 1 | `factor-model` | P0 | 3-4 | S | 高 | Barra/Tushare | financial_metrics |
| 2 | `backtest-engine` | P0 | 4-6 | S | 高 | Tushare daily | get_astock_price |
| 3 | `performance-attribution` | P0 | 5-6 | S | 中 | 组合+因子 | factor-model |
| 4 | `portfolio-optimizer` | P0 | 6 | A | 中 | 协方差 | factor-model |
| 5 | `scenario-stress-test` | P0 | 6 | A | 中 | 历史回放 | portfolio-optimizer |
| 6 | `convertible-bond` | P1 | 7-8 | S | 中 | Tushare cb_ | get_astock_price |
| 7 | `dragon-tiger-list` | P1 | 8-9 | A | 中 | Tushare top_list | 游资 DB |
| 8 | `margin-financing` | P1 | 9 | A | 低 | Tushare margin | — |
| 9 | `etf-arbitrage` | P1 | 9-10 | A | 中 | IOPV | — |
| 10 | `event-driven-calendar` | P1 | 10 | A | 低 | Tushare 事件 | — |
| 11 | `moat-scorecard` | P2 | 15-16 | A | 高 | 财务+行业 | — |
| 12 | `value-chain-graph` | P2 | 16-17 | A | 高 | 行业分类 | — |
| 13 | `industry-life-cycle` | P2 | 17-18 | A | 中 | 行业数据 | — |
| 14 | `porter-five-forces` | P2 | 18 | A | 中 | 财报+行业 | — |
| 15 | `multi-model-valuation` | P2 | 19 | A | 中 | 财务+股权 | financial_metrics |
| 16 | `fundamental-quality` | P2 | 19-20 | A | 中 | 财务三表 | financial_metrics |
| 17 | `earnings-call-mining` | P2 | 20 | A | 高 | SEC 8-K | read_filings |
| 18 | `macro-timing` | P2 | 21 | A | 中 | 国家统计局 | — |
| 19 | `options-greeks` | P2 | 22 | A | 中 | 期权行情 | — |
| 20 | `fx-commodity-monitor` | P2 | 23 | A | 中 | 期货行情 | — |

## 四、必备数据源扩展清单

| # | 数据源 | 接入方式 | 优先级 | 价值 |
|---|---|---|---|---|
| 1 | Tushare `cn_gdp` / `cn_cpi` / `cn_pmi` / `cn_m` / `cn_sf` / `cn_money_supply` | Tushare Pro API | P0 | 宏观必填 |
| 2 | Tushare `index_daily`（上证/沪深300/中证500/创业板/科创50/恒生） | Tushare Pro API | P0 | 指数 |
| 3 | Tushare `daily_basic`（PE/PB/换手率） | Tushare Pro API | P0 | 估值时序 |
| 4 | Tushare `margin` / `margin_detail`（两融） | Tushare Pro API | P1 | 杠杆资金 |
| 5 | Tushare `top_list` / `top_inst`（龙虎榜） | Tushare Pro API | P1 | 游资 |
| 6 | Tushare `cb_basic` / `cb_daily`（可转债） | Tushare Pro API | P1 | 可转债 |
| 7 | Tushare `stk_factor`（因子） | Tushare Pro API | P0 | 因子 |
| 8 | Tushare `hk_basic` / `hk_daily`（港股） | Tushare Pro API | P0 | 港股 |
| 9 | 集思录/宁稳网 API（可转债增强） | HTTP API | P1 | 可转债 |
| 10 | 巨潮资讯网（公告/事件） | 爬虫 / 第三方 API | P1 | 事件 |
| 11 | 朝阳永续（一致预期/PE/PB 分位） | 付费 API | P1 | 一致预期 |
| 12 | Wind 行业分类 | 付费 | P2 | 行业 |
| 13 | Wind 宏观数据 | 付费 | P2 | 宏观 |
| 14 | SEC EDGAR 13F | 公开 | P1 | 13F |
| 15 | Financial Datasets analyst estimates（美股） | 已有 | P0 | 分析师 |
| 16 | Yahoo Finance（港股 fallback） | 已有 | P1 | 港股 fallback |
| 17 | AKShare（开源 A 股补充） | 开源 | P0 | 补全 |
| 18 | 期货行情（中金所/上期所/大商所/郑商所） | 第三方 API | P2 | 衍生品 |

## 五、关键工具升级清单

| # | 工具 | 类型 | 优先级 | 说明 |
|---|---|---|---|---|
| 1 | `get_macro_data` | NEW | P0 | GDP/CPI/PMI/M2/利率/汇率 |
| 2 | `get_index_quote` | NEW | P0 | 指数行情 |
| 3 | `get_astock_valuation_history` | NEW | P0 | A 股 PE/PB/换手率时序 |
| 4 | `screen_stocks`（升级 placeholder） | MODIFY | P0 | 真实筛选 |
| 5 | `backtest_strategy` | NEW | P0 | 通用回测 |
| 6 | `get_factor_exposures` | NEW | P0 | 因子暴露 |
| 7 | `calculate_attribution` | MODIFY | P0 | 业绩归因（去占位） |
| 8 | `optimize_portfolio` | NEW | P0 | 组合优化 |
| 9 | `get_convertible_bond` | NEW | P1 | 可转债 |
| 10 | `get_dragon_tiger` | NEW | P1 | 龙虎榜 |
| 11 | `get_margin_data` | NEW | P1 | 两融 |
| 12 | `get_etf_arb` | NEW | P1 | ETF 套利 |
| 13 | `get_event_calendar` | NEW | P1 | 事件日历 |
| 14 | `get_hk_quote` | NEW | P0 | 港股 |
| 15 | `get_13f_holdings` | NEW | P1 | 13F 机构持仓 |
| 16 | `get_research_report` | NEW | P1 | 研报 |
| 17 | `get_earnings_call` | NEW | P2 | 电话会 |
| 18 | `get_options_chain` | NEW | P2 | 期权 |
| 19 | `get_commodity_quote` | NEW | P2 | 商品 |

## 六、关键命令升级清单

| # | 命令 | 类型 | 优先级 | 说明 |
|---|---|---|---|---|
| 1 | `/invest` | MODIFY | P0 | 集成 Coordinator + Bear Case + 真实估值 |
| 2 | `/dossier` | MODIFY | P0 | 集成护城河 + 5 模型估值 + 反方观点 |
| 3 | `/backtest` | NEW | P0 | 通用回测 |
| 4 | `/factor` | NEW | P0 | 因子暴露查询 |
| 5 | `/attribution` | NEW | P0 | 业绩归因 |
| 6 | `/optimize` | NEW | P0 | 组合优化 |
| 7 | `/stress` | NEW | P0 | 压力测试 |
| 8 | `/cb-screen` | NEW | P1 | 可转债筛选 |
| 9 | `/dragon-tiger` | NEW | P1 | 龙虎榜 |
| 10 | `/margin` | NEW | P1 | 两融 |
| 11 | `/etf-arb` | NEW | P1 | ETF 套利 |
| 12 | `/event` | NEW | P1 | 事件日历 |
| 13 | `/post-mortem` | NEW | P1 | 事后复盘 |
| 14 | `/project` | NEW | P1 | 研究项目容器 |
| 15 | `/macro` | NEW | P0 | 宏观仪表盘 |
| 16 | `/index` | NEW | P0 | 指数对比 |
| 17 | `/13f` | NEW | P1 | 美股 13F |
| 18 | `/derivative` | NEW | P2 | 衍生品 |

---

*总计：现有 50 + 新增 20 = 70 个 skill，覆盖 A 股/港股/美股/加密/商品 5 大市场，估值/财报/行业/选股/策略/风险/宏观/情绪/量化/另类数据 10 大维度，构成 WorkBuddy 作为中文 AI 投研 OS 的完整能力底座。*
