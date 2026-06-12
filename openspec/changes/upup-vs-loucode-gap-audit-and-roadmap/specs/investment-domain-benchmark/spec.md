## ADDED Requirements

### Requirement: 6 层能力模型
变更 MUST 在 `docs/comparison-with-competitors.md` 中沿用 archived `top-tier-investment-assistant` 的 6 层模型(L1 数据 / L2 分析 / L3 决策 / L4 执行 / L5 监控 / L6 体验)对 upup 评分。

#### Scenario: 6 层每层独立章节
- **WHEN** 读者读 `docs/comparison-with-competitors.md`
- **THEN** L1 / L2 / L3 / L4 / L5 / L6 各自一节,每节包含 upup / 国际顶级 / 国内顶级 / 大模型助手 4 家对比

#### Scenario: 与 archived 一致
- **WHEN** 引用"6 层能力模型"
- **THEN** 注明出处 `openspec/changes/archive/top-tier-investment-assistant/proposal.md §A.5`

### Requirement: 国际顶级 4 家对标
文档 MUST 覆盖 4 家国际顶级投资助手:AlphaSense(企业文档搜索)、Hebbia(金融 AI 工作流)、FinChat(LLM 投研助手)、BlackRock Aladdin(资管平台)。

#### Scenario: 4 家国际产品
- **WHEN** 读者读 §国际顶级
- **THEN** 4 家产品名 + 核心能力 + 与 upup 差距 3 列

### Requirement: 国内顶级 4 家对标
文档 MUST 覆盖 4 家国内顶级投研:同花顺 i 问财(自然语言选股)、东方财富 Choice(数据 + AI)、招商 MindGo(智能投顾)、Wind 资讯(数据基础设施)。

#### Scenario: 4 家国内产品
- **WHEN** 读者读 §国内顶级
- **THEN** 4 家产品名 + 核心能力 + 与 upup 差距 3 列

### Requirement: 大模型投资助手 3 家对标
文档 MUST 覆盖 3 家大模型原生投资助手:GPT-4o Investing(OpenAI 投研插件)、Anthropic Claude Finance(Anthropic API 投研调用)、智增增(国内大模型 + 投研)。

#### Scenario: 3 家大模型助手
- **WHEN** 读者读 §大模型投资助手
- **THEN** 3 家产品名 + 能力边界 + 与 upup 对比 3 列

### Requirement: 6 层能力评分表
文档 MUST 在末尾提供一张 6 层能力评分表(upup / 4 家国际 / 4 家国内 / 3 家大模型 = 12 行 × 6 层 = 72 单元格),每格 0-5 分。

#### Scenario: 12 × 6 评分表
- **WHEN** 读者读 §评分表
- **THEN** 12 行(产品) × 6 列(L1-L6)评分表,无空格

#### Scenario: upup 总分
- **WHEN** 读者求 upup 6 层评分总和
- **THEN** 总分与"upup 现状"摘要中数字一致
