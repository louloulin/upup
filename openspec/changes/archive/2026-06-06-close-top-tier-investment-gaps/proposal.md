## 背景与动机

UpUp 是一款面向深度投研的 CLI 形态 AI Agent,作为一个开源项目,它已经具备了异常宽广的能力面:80+ 工具、80+ 技能、多 Agent 协调器、KAIROS 主动扫描器、实时行情、MCP 集成、Memory、桥接服务、5 步投研工作流、交易适配器(IBKR / 雪球)、回测引擎、投资组合归因(Brinson)、估值决策面板等。仓库现有的 `src/competitive-positioning/matrix.ts` 已经在 7 个维度上对 13 个竞品做过打分,`four-uniques.ts` 沉淀了 4 项差异化(CLI-first、开源自托管、全市场覆盖、三件套 = Claude + KAIROS + Bridge)。

竞品矩阵显示,UpUp 是**唯一同时拿到 cli=2、openSource=2、trading=2** 的玩家。这种结构性优势要转化为产品级对位、进而形成防御性领先,还需要补齐若干具体能力差。本 change 不写代码,只做三件事:把这些差距盘清楚、按 ROI 排序、产出一份**复用现有模块、保持高内聚低耦合**的改造计划。

目标不是追平每个竞品的全部功能,而是聚焦 5 个会显著改变"零售 / 专业投研人员日常工作流"的能力差,用"组合"而非"堆叠"的方式补齐,让未来的能力补齐可以沿用同样的范式。

## 改动范围

本 change **不引入新代码**,只产出三件规划制品:

1. **差距清单** (design.md 附录 A) — 18 个候选差距,按 (impact / feasibility / reusability) 三维打分,分 3 个优先级梯队。
2. **复用映射** — 每个差距对应到一组现有 UpUp 模块。5 个 P0/P1 差距共组合 15+ 既有模块;不新建采集基础设施、不新建数据库、不新建编排框架。
3. **分阶段任务清单** (tasks.md) — 拆成 4 阶段(P0 速赢 → P1 核心差距 → P2 战略护城河 → P3 横切加固),每条任务都有具体文件路径、无依赖顺序、明确验收标准。

本 change 通过并归档后,真正的实现工作落在后续 change 中(每阶段 1 个,每任务组 1 个),每个 change 控制在 ≤ ~6 个文件改动,以仓库现有的 `bun run typecheck` + `bun test` CI 门禁收尾。

### 5 个 P0/P1 差距主题

| 编号 | 差距 | 复用锚点 | 为何优先 |
|------|------|----------|----------|
| G1 | **引用归因式回答** — 最终答案中每条断言都带可点击的引用(财报段落、新闻原文、电话会议逐句) | `search/{exa,tavily,x-search,perplexity}` + `tools/finance/{news,read-filings,earnings}` + `mcp/resource-tools` | AlphaSense 的招牌;当前 `prompts.ts` 最终答案路径中没有强制引用 |
| G2 | **持久化个股研究 dossier** — 每次分析都基于、刷新并复用一份"永不下线"的 dossier(快照、关键指标历史、过往论点、盯盘触发器) | `memory/investment-memory` + `memory/memvid-rag` + `commands/investment/portfolio-review` | 没记忆的研究等于每次重做;这是"AI 感"最关键的一项 |
| G3 | **业绩预告 + 财报电话会 diff** — 提前 7 天生成预告、电话会后 1h 内拉到底稿、QoQ 语气/情绪 diff、管理层 vs 分析师 Q&A 平衡 | `tools/earnings/estimates` + `search/x-search` + `tools/finance/read-filings`(8-K) + `commands/investment/earnings-preview` | 财报季是决策密度最高的窗口;预告是零售-专业的每日习惯 |
| G4 | **自然语言选股器** — `screen "AAPL-like 跌深质量复利 ex-金融,市值 10B–200B,RSI<35,ROE>20%"` 返回带一句话论点的排序结果 | `tools/finance/screen-stocks` + `tools/valuation/decision-dashboard` + `agent/plan/plan-builder` | 替代 15 分钟 Bloomberg / Wind DES 点击;日常效用提升巨大 |
| G5 | **策略市场 + 可分享回测** — 用户可发布、fork、版本化因子 / 策略代码;回测输出自包含 HTML / PDF 报告,带方法学披露 | `tools/backtest/*` + `tools/export/*` + `agent/subagent`(沙箱) + `memory`(版本化) | 闭环"做出来然后呢";契合 D2(开源),把工具变成社区 |

### 3 个横切主题

- **C1: 双语对齐(中文 / English)** — 当前 prompts 和 skill 描述中英混杂。需新增 `prompts/locale.ts`、SKILL frontmatter 多语言、给 30 个最高频 skill 补 zh-CN 描述。
- **C2: 交易意图审计轨迹** — 每条 BUY / SELL / COVER 建议都生成不可篡改、带签名的记录(意图、证据、Agent 链、模型版本、时间戳)。任何机构 / 持证路径的硬性要求。
- **C3: Web UI 作为 CLI 副屏(非替代)** — 一份只读 dashboard,展示 dossier、自选股、当前 workflow、桥接状态。CLI 仍是单一信源;Web 是视窗而非对等。契合 D1。

## Capabilities

### 新增 Capabilities
无。本 change 是规划制品。后续每个实现 change 都会在自己的 proposal 中声明自己的 capabilities。

### 修改 Capabilities
无。`openspec/specs/` 下的规范基线不动。

## 影响

- **本 change 文件数**: 5 个(`.comet.yaml`、`.openspec.yaml`、`proposal.md`、`design.md`、`tasks.md`),纯文档。
- **后续实现 change 预计改动文件**: 6+ 个 change 累计 30–50 个文件,每个 CI 门禁收尾。
- **外部 API**: 零变化。CLI 表面、工具注册表、MCP server、桥接服务全部不变。
- **风险**: 极低。无代码、无行为变化。
- **无依赖变更、无版本号变更。**

## 显式 Out-of-Scope

为聚焦,以下条目**不在本 change 范围**内(每一项都是潜在的未来 change 候选):

- 原生移动端 App(C3 仅 Web)。
- 音频 / 播客式早报。
- 另类数据市场(卫星、网页流量、App 下载量)。
- 公司知识图谱 / 供应链映射。
- 机构合规工作流(FINRA、MiFID II)。
- 多租户团队协作空间(仅单用户 dossier + 社区市场)。
- 语音 / 对话接口。
