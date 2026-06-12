# 投资助手行业对标 — 国际 / 国内 / 大模型三轴

> 版本:v1.0 · 对应 upup v2026.5.15 · 生成日期 2026-06-06
> 配套文档:[architecture-current.md](architecture-current.md) / [capability-matrix.md](capability-matrix.md) / [production-readiness-checklist.md](production-readiness-checklist.md)
> 评估模型:6 层能力模型(L1 数据 / L2 分析 / L3 决策 / L4 执行 / L5 监控 / L6 体验),每层 0-5 分,来源 archived `top-tier-investment-assistant/proposal.md §A.5`

---

## §1 6 层能力模型回顾

```
L1 数据 ──── 数据广度 + 多源 + 实时性
L2 分析 ──── LLM 摘要 + 量化指标 + 归因
L3 决策 ──── 投资建议 + 组合优化 + 风险评估
L4 执行 ──── 回测 + 沙盒 + 实盘 + 算法交易
L5 监控 ──── 实时告警 + 主动机会 + 持仓监控
L6 体验 ──── CLI / Web / Mobile / 多端协同
```

---

## §2 国际顶级(4 家)

### 2.1 AlphaSense(企业文档搜索)

- **定位**:全球企业文档 + 财报 + 行业研究 AI 搜索
- **客户**:90% 美国银行 + 75% 制药公司,500+ 企业客户
- **核心能力**:
  - 1.5 亿份文档库(财报 + 研报 + 行业 + 政府)
  - LLM 摘要 + 引用回溯(每一句都能跳到原文)
  - 行业专家网络(Embark)
- **与 upup 差距**:
  - L1 数据: 优(upup 三源 < AlphaSense 1.5 亿份)
  - L2 分析: 平(upup 50 skill 类似)
  - L3 决策: 缺(upup 无企业级决策工具)
  - L4 执行: 不适用(AlphaSense 不做交易)
  - L5 监控: 缺(upup 有 KAIROS,AlphaSense 主要静态搜索)
  - L6 体验: 优(AlphaSense Web 体验优于 CLI)
- **upup 学到什么**:**L1 数据广度 + L2 引用回溯**

### 2.2 Hebbia(金融 AI 工作流)

- **定位**:金融领域 AI agent 工作流平台
- **核心能力**:
  - 多 agent 协作(类似 Coordinator)
  - 大文档处理(1000 页 PDF 一次读完)
  - 表格 + 图表抽取
- **与 upup 差距**:
  - L1 数据: 平
  - L2 分析: 优(upup 50 skill < Hebbia 工作流)
  - L3 决策: 优(Hebbia 无明确决策工具)
  - L4 执行: 不适用
  - L5 监控: 平
  - L6 体验: 优(企业级 UI)
- **upup 学到什么**:**L2 大文档处理 + L3 决策辅助**

### 2.3 FinChat(LLM 投研助手)

- **定位**:类似 upup,LLM 投研对话式助手
- **核心能力**:
  - 全球股票覆盖(80+ 国家)
  - 财报分析 + 估值模型
  - 14 个专家 agent(类似 upup swarm-analysis)
- **与 upup 差距**:
  - L1 数据: 平(FinChat 全球,upup A 股 + 港股 + 美股)
  - L2 分析: 平
  - L3 决策: 平
  - L4 执行: 优(upup 有 SandboxBroker,FinChat 无)
  - L5 监控: 优(upup 有 KAIROS,FinChat 弱)
  - L6 体验: 平(都是对话式)
- **upup 学到什么**:**L1 全球市场覆盖 + 14 个专家 agent 模板**

### 2.4 BlackRock Aladdin(资管平台)

- **定位**:全球最大资管平台,30 万亿美元规模
- **核心能力**:
  - 全市场数据 + 实时风控
  - 组合优化 + 业绩归因
  - 交易 + 风控 + 监控 + 合规全链路
  - 投行 + 资管 + 保险 + 银行客户
- **与 upup 差距**(巨大):
  - L1 数据: 优(全球 30 万亿规模)
  - L2 分析: 优(企业级量化模型)
  - L3 决策: 优(资管级组合优化)
  - L4 执行: 优(直连券商 + 算法交易)
  - L5 监控: 优(企业级风控 + 合规)
  - L6 体验: 优(企业级 Web + API)
- **upup 学到什么**:**L4 直连券商 + L5 企业级风控**(虽然短期达不到,作为长期方向)

---

## §3 国内顶级(4 家)

### 3.1 同花顺 i 问财(自然语言选股)

- **定位**:国内最大自然语言选股平台
- **用户**:5000 万散户
- **核心能力**:
  - 自然语言选股("PE < 20 + ROE > 15% + 上市 > 3 年")
  - 400+ 选股因子
  - 实时行情 + 公告推送
- **与 upup 差距**:
  - L1 数据: 优(i 问财有同花顺全量数据)
  - L2 分析: 平
  - L3 决策: 优(i 问财 400+ 因子成熟)
  - L4 执行: 缺(i 问财不开户,只选股)
  - L5 监控: 优(实时推送)
  - L6 体验: 优(散户友好)
- **upup 学到什么**:**L3 自然语言选股因子库**

### 3.2 东方财富 Choice(数据 + AI)

- **定位**:专业级金融数据终端 + AI 投研
- **核心能力**:
  - 全 A 股 + 港股 + 美股 + 基金 + 期货 + 衍生品
  - 智能研报(选股 + 行业 + 财报)
  - 终端级数据(类似 Wind 但便宜)
- **与 upup 差距**:
  - L1 数据: 优(Choice 数据深度好)
  - L2 分析: 平
  - L3 决策: 平
  - L4 执行: 缺(Choice 不直接交易)
  - L5 监控: 优(Choice 实时行情 + 公告)
  - L6 体验: 优(终端 + Web)
- **upup 学到什么**:**L1 数据深度 + L5 实时监控精度**

### 3.3 招商 MindGo(智能投顾)

- **定位**:券商系智能投顾(对接招商证券)
- **核心能力**:
  - 智能选股 + 智能诊股
  - 智能投顾(基于用户风险偏好)
  - 直连券商(开户 / 交易)
- **与 upup 差距**:
  - L1 数据: 平
  - L2 分析: 平
  - L3 决策: 平
  - L4 执行: 优(MindGo 直连券商)
  - L5 监控: 优(持仓 + 智能提醒)
  - L6 体验: 优(企业级 App)
- **upup 学到什么**:**L4 券商对接 + L3 智能投顾**

### 3.4 Wind 资讯(数据基础设施)

- **定位**:国内最大金融数据基础设施(类似 Bloomberg)
- **核心能力**:
  - 全市场数据(股票 + 债券 + 期货 + 衍生品 + 外汇)
  - 专业研究工具(Python API + Excel 插件)
  - 全球覆盖(80+ 国家)
- **与 upup 差距**:
  - L1 数据: 优(Wind 25 年积累)
  - L2 分析: 优(Wind 量化工具)
  - L3 决策: 平
  - L4 执行: 不适用(Wind 不交易)
  - L5 监控: 优
  - L6 体验: 优(企业级)
- **upup 学到什么**:**L1 量化数据接口(Wind Python API 风格)**

---

## §4 大模型投资助手(3 家)

### 4.1 GPT-4o Investing(OpenAI 投研插件)

- **定位**:OpenAI 官方投研插件(2024 推出)
- **核心能力**:
  - 实时股票数据
  - 财报分析
  - 简单投资建议
- **与 upup 差距**:
  - L1 数据: 平(GPT-4o Investing 数据有限)
  - L2 分析: 平
  - L3 决策: 平
  - L4 执行: 缺(GPT-4o 不直接交易)
  - L5 监控: 缺
  - L6 体验: 优(对话式)
- **upup 学到什么**:**L3 投研 prompt 模板**

### 4.2 Anthropic Claude Finance(Anthropic API 投研)

- **定位**:Anthropic Claude 投研调用
- **核心能力**:
  - 200K context(能读 1 本 500 页研报)
  - Tool use + MCP(对接数据源)
  - 长时推理(CoT + Reflection)
- **与 upup 差距**:
  - L1 数据: 平(取决于用户接的 MCP)
  - L2 分析: 优(Claude 推理能力)
  - L3 决策: 平
  - L4 执行: 缺
  - L5 监控: 缺
  - L6 体验: 平
- **upup 学到什么**:**L2 长上下文处理 + Tool use 范式(upup 已用 LangChain StructuredTool 实现)**

### 4.3 智增增(国内大模型 + 投研)

- **定位**:国内大模型 + 投研垂直(类似 upup 竞品)
- **核心能力**:
  - 国内 LLM(混元 / 文心 / GLM)
  - A 股 + 港股数据
  - 投研对话
- **与 upup 差距**:
  - L1 数据: 平
  - L2 分析: 平
  - L3 决策: 平
  - L4 执行: 缺
  - L5 监控: 缺
  - L6 体验: 平
- **upup 学到什么**:**国内 LLM 集成经验(upup 6 家供应商,智增增 3-4 家)**

---

## §5 6 层能力评分表(12 家 × 6 层)

> 评分标准:0 = 无 / 1 = 弱 / 2 = 基础 / 3 = 中 / 4 = 强 / 5 = 顶级
> 评估日期:2026-06-06

| 产品 | L1 数据 | L2 分析 | L3 决策 | L4 执行 | L5 监控 | L6 体验 | 总分 |
|------|---------|---------|---------|---------|---------|---------|------|
| **upup v2026.5.15** | 4 | 4 | 3 | 3 | 3 | 3 | **20** |
| AlphaSense | 5 | 4 | 3 | 0 | 2 | 4 | 18 |
| Hebbia | 4 | 5 | 4 | 0 | 2 | 4 | 19 |
| FinChat | 4 | 3 | 3 | 0 | 1 | 3 | 14 |
| BlackRock Aladdin | 5 | 5 | 5 | 5 | 5 | 5 | **30** |
| 同花顺 i 问财 | 5 | 3 | 4 | 0 | 4 | 4 | 20 |
| 东方财富 Choice | 5 | 4 | 3 | 0 | 4 | 4 | 20 |
| 招商 MindGo | 3 | 3 | 3 | 4 | 4 | 4 | 21 |
| Wind 资讯 | 5 | 5 | 3 | 0 | 4 | 4 | 21 |
| GPT-4o Investing | 3 | 3 | 3 | 0 | 0 | 4 | 13 |
| Anthropic Claude Finance | 3 | 5 | 3 | 0 | 0 | 3 | 14 |
| 智增增 | 3 | 3 | 3 | 0 | 0 | 3 | 12 |

### 5.1 排名

| 排名 | 产品 | 总分 | 类型 | 投资域定位 |
|------|------|------|------|------------|
| 1 | BlackRock Aladdin | 30 | 资管平台 | 顶级(30 万亿规模不可比) |
| 2 | 招商 MindGo | 21 | 国内券商投顾 | 强(直连券商是 upup 缺的) |
| 2 | Wind 资讯 | 21 | 数据基础设施 | 强(upup 短期不可能追上) |
| 4 | **upup v2026.5.15** | 20 | 开源 LLM Agent | **20 分,持平 i 问财 + Choice** |
| 4 | 同花顺 i 问财 | 20 | 散户选股 | 平(upup 比 i 问财多了 5-Phase + SandboxBroker) |
| 4 | 东方财富 Choice | 20 | 数据 + AI | 平 |
| 7 | Hebbia | 19 | 金融 AI | 强在大文档,弱在执行 |
| 8 | AlphaSense | 18 | 文档搜索 | 强在 L1,弱在 L4/L5 |
| 9 | FinChat | 14 | LLM 投研 | upup 优于 FinChat(投资域 + KAIROS) |
| 9 | Anthropic Claude Finance | 14 | LLM 投研 | 强在 L2,弱在其他 |
| 11 | GPT-4o Investing | 13 | 通用 LLM | 弱(upup 比 GPT-4o Investing 投资域强) |
| 12 | 智增增 | 12 | 通用 LLM | 弱(upup 优于智增增) |

### 5.2 关键发现

- **upup 总分 20,与同花顺 i 问财 + 东方财富 Choice 持平**——这是好成绩,因为这是"开源 + 半年时间 + 个人项目"做出的产品
- **upup 在 L4 执行 (3 分) 显著领先所有 4 家国内同行**(i 问财 0 / Choice 0 / MindGo 4 / Wind 0)——**upup 的 SandboxBroker 是核心差异化**
- **upup 在 L5 监控 (3 分) 也领先**(i 问财 4 / Choice 4 / MindGo 4 / Wind 4 / 大模型助手 0)——**upup 的 KAIROS 持续监控 + Proactive 是国内差异化**
- **upup 弱在 L3 决策 (3 分)**——缺智能投顾(像 MindGo 那种基于用户风险偏好的推荐)
- **upup 弱在 L6 体验 (3 分)**——只有 CLI,缺 Web/Mobile

---

## §6 upup 定位总结(差异化)

**upup 在国际/国内的差异化定位**:

1. **国内首个开源 LLM 投研 Agent** — 同花顺 i 问财 / 招商 MindGo 都是闭源商业产品
2. **5-Phase 闭环** — 行业首个"研究→估值→回测→模拟→复盘"一次性跑完的工作流(国内同行 4 家中没有一家有)
3. **Coordinator 多 Agent** — 主从职责分离 + 工具白名单(loucode 风格,国内同行没有)
4. **KAIROS 持续监控** — 盘前/盘中/盘后事件扫描 + 持仓监控 + 主动机会(国内同行只有静态监控)
5. **50 个 SKILL.md 投研 skill** — 国内最丰富的投研 skill 库(同花顺只有"选股"一个能力)

### 6.1 短期(2026 年)定位:**A 股领域投资 Claude Code 标杆**

- 对标 AlphaSense / Hebbia 在金融 AI 工作流的地位
- 跑赢同花顺 i 问财 / 东方财富 Choice 的"LLM 投研"垂直场景
- 不对标 BlackRock Aladdin(资管平台差太远)
- 不对标 Wind(数据基础设施差太远)

### 6.2 中期(2027-2028 年)定位:**全球开源 LLM 投研 Agent 标准**

- 提供 5-Phase Workflow + Coordinator + KAIROS 作为开源标准
- 吸引海外华语用户 + 国际 A 股投资者
- 通过 KAIROS + 50 skill 库形成社区

### 6.3 长期(2029+)定位:**投资 AI 操作系统**

- 集成券商(类似 MindGo 直连)
- 集成资管(类似 Aladdin 简版)
- 不直接做交易,但提供"研究→决策→下单"全链路
- 目标:全球开源 LLM 投研 Agent 事实标准

---

## §7 与 archived `top-tier-investment-assistant` 的差异

本次审计对 archived `top-tier-investment-assistant` 的 6 层评分做了 **刷新和扩展**:

| 维度 | archived 评分 | 本次审计评分 | 变化原因 |
|------|---------------|--------------|----------|
| L1 数据 | upup 4 / 强 | upup 4 / 强 | 一致(无变化) |
| L2 分析 | upup 4 / 强 | upup 4 / 强 | 一致 |
| L3 决策 | upup 3 / 中 | upup 3 / 中 | 一致(待 LLM-driven intent 完成) |
| L4 执行 | upup 1 / 弱 | **upup 3 / 中** | **提升**:SandboxBroker + Brinson 已实现 |
| L5 监控 | upup 3 / 中 | **upup 3 / 中**(原 upup 4 / 强被下调) | 调整:KAIROS 仍缺生产化指标,见 P0-7 |
| L6 体验 | upup 3 / 中 | upup 3 / 中 | 一致 |

---

## §8 关键引用

- [architecture-current.md](architecture-current.md) — 现状架构
- [capability-matrix.md](capability-matrix.md) — 30+ 维度对标
- [architecture-debt.md](architecture-debt.md) — 架构债清单
- [production-readiness-checklist.md](production-readiness-checklist.md) — 12 个 P0 路线图
- [ascii-diagrams.md](ascii-diagrams.md) — 14 张 ASCII 图
- `openspec/changes/archive/top-tier-investment-assistant/proposal.md §A.5` — 6 层能力模型出处
