# 投资工作台使用指南

本文说明 DeepSeek GUI 内置的**投资工作台**（Investment Workbench）：它由 UpUp（涨涨）Agent 引擎驱动，把行情、持仓、自选、风险、研报、Skill 启动器和 `/invest` 工作流整合到同一个桌面窗口内。

## 概述

**投资工作台**是 DeepSeek GUI 在聊天/写作工作台之外，为中文投资场景专门设计的"一屏式投研桌面"。它把原本要打开多个终端、浏览器、券商 App 才能完成的事情——盯盘、看持仓、查研报、跑估值、跟踪策略执行——集中到一个 Electron 窗口内。

**为什么要有它：**

1. **实时感知** — 行情条每 15s 自动刷新，徽章上能直接看到引擎、API 是否就绪
2. **多维视角** — 行情、持仓、风险、研报同屏对照，避免在多个 App 之间来回切
3. **Skill 化** — 50 个投资分析 Skill（估值/筛选/简报/复盘/风险/财报/研报/其他）按分类组织，一键启动
4. **工作流可追踪** — 5 阶段 `/invest` 流程（dossier → strategy → earnings-preview → morning-brief → portfolio-review）的进度可视
5. **复用 UpUp 引擎** — 投资工作台直接通过 `@upup/sdk` 跑 UpUp CLI Agent loop，token 效率与 CLI 完全一致

**适用人群：**

- A 股 / 港股 / 美股的散户与机构初级研究员
- 需要对持仓做风险敞口监控的主动型投资者
- 想用 AI 跑估值、复盘、研报速读但不想写 prompt 工程的人

## 快速开始

### 1. 启动

打开 DeepSeek GUI 后，工作台入口在**顶部 Tab 栏**——默认显示"代码"或"写作"工作台；切到 **"投资工作台"** Tab 即可。

### 2. 配置 API Key

投资工作台依赖 UpUp 引擎，**必须**先配置 LLM API Key：

1. 打开 `设置 → 智能体 → UpUp`
2. 选择 `provider`（DeepSeek / OpenAI / Anthropic / Google / xAI / OpenRouter / Ollama）
3. 填入对应 `apiKey`（`设置 → 智能体 → UpUp → 显示` 切换可见性）
4. 选择 `model`（provider 不同可选模型不同）
5. 可选：填入 `baseUrl`（OpenAI 兼容自定义端点，例如本地 Ollama）
6. 可选：开启 `Tushare`（A 股数据）+ 填 `tushareToken`
7. 可选：开启 `ExaSearch`（研报检索）+ 填 `exaSearchKey`
8. 保存设置

> 获取 API Key：
> - DeepSeek: <https://platform.deepseek.com/api_keys>
> - Anthropic: <https://console.anthropic.com/>
> - OpenAI: <https://platform.openai.com/api-keys>

设置保存后引擎会自动重启（无需手动重启应用），刷新投资工作台即可生效。

### 3. 切换到"投资工作台" Tab

点击顶部 Tab 栏的"投资工作台"，InvestmentLayout 会先调用 `useUpupHealth()`：

- **🟢 upup-sdk · v0.2.1** — 引擎就绪，显示 7 个面板
- **🔴 引擎未启动** — 显示错误占位（按上方"故障排查"修复）

### 4. 验收

引擎就绪后，应该看到 7 个面板按以下布局排布：

```
┌─────────────────────────────────────────────────────┐
│  顶部：标题 + 引擎徽章 + 刷新                        │
├─────────────────────────────────────────────────────┤
│  [MarketTicker  行情条]（横跨三列）                  │
├──────────────────────────┬──────────────────────────┤
│  [PortfolioSummary 持仓]  │  [WatchlistPanel 自选]   │
│  [ResearchPanel   研报]   │  [RiskDashboard  风险]   │
│                           │  [WorkflowTracker 工作流]│
├──────────────────────────┴──────────────────────────┤
│  [SkillLauncher  技能启动器]（横跨三列）            │
└─────────────────────────────────────────────────────┘
```

## 7 个面板详解

### 1. MarketTicker 行情条

**位置**：顶部横跨三列。

**功能**：实时显示 5 个主要指数 + 自选股报价，**红涨绿跌**（中文惯例）。

**默认指数**：

| 代码 | 名称 |
|------|------|
| `000001.SH` | 上证综指 |
| `399001.SZ` | 深证成指 |
| `399006.SZ` | 创业板指 |
| `HSI` | 恒生指数 |
| `IXIC` | 纳斯达克 |

**特性**：

- 每 15 秒自动轮询（`POLL_INTERVAL_MS = 15_000`）
- 右上角 `↻ 刷新` 按钮可手动触发
- 数值字体 monospace，便于纵向对比
- 涨跌幅保留两位小数，正值带 `+` 号

**数据源**：通过 `useUpupQuery` 调 agent 取 JSON 报价（`{quotes: [{symbol, name, price, change, changePct, limit}]}`）。`parseQuotes` 容错解析——即使 agent 文本里夹了说明文字，也能抽出 JSON 段。

`[Screenshot: MarketTicker]`

### 2. PortfolioSummary 持仓概览

**位置**：左侧主区上方。

**功能**：展示当前组合的总资产、当日盈亏、累计盈亏、Top 5 持仓。

**指标卡片**（3 列）：

| 字段 | 含义 |
|------|------|
| **总资产** | 组合当前总市值 |
| **当日盈亏** | 今日浮动盈亏（红涨绿跌） |
| **累计盈亏** | 持有期累计盈亏 |

**Top 5 持仓**：按权重降序展示前 5 大持仓，列：名称、权重（%）、盈亏（%）。

**数据源**：`useUpupQuery` 调 agent 取 JSON（`{totalAssets, dailyPnl, totalPnl, holdings: [{symbol, name, weight, pnl, pnlPct}]}`）。同样容错解析。

`[Screenshot: PortfolioSummary]`

### 3. WatchlistPanel 自选股

**位置**：右侧主区上方。

**功能**：自选股增删改查，编辑后立即拉取报价。

**特性**：

- 顶部输入框 + 添加按钮：填入 symbol（如 `600519` / `AAPL` / `0700.HK`）回车即可
- 添加后自动调 agent 拉股票名称，**乐观更新**——先插入条目，再异步回填 name
- 列表项 hover 显示 `✕` 按钮，点击删除
- 自选股列表持久化到 `localStorage.upup.investment.watchlist`

**数据源**：

- 本地：自选股 symbol/name 列表
- 远程：`useUpupQuery` 拉取名称

`[Screenshot: WatchlistPanel]`

### 4. RiskDashboard 风险仪表盘

**位置**：右侧主区中部。

**功能**：组合层面的风险敞口——贝塔（β）、最大回撤、行业暴露。

**指标**：

| 字段 | 说明 | 风险分级 |
|------|------|---------|
| **贝塔（β）** | 组合相对市场的波动性 | < 0.8 低（绿） / 0.8-1.2 中（黄） / > 1.2 高（红） |
| **最大回撤** | 历史最大亏损幅度 | 显示百分比 |
| **行业暴露** | 行业分布 Top 4 | 占比 + 百分比 |

**风险标签**：`riskLevel()` 函数把 β 数值映射为中文风险标签（低/中/高）。

**数据源**：`useUpupQuery` 调 agent 取 JSON（`{beta, maxDrawdown, sectors: [{sector, weight}]}`）。

`[Screenshot: RiskDashboard]`

### 5. ResearchPanel 研报速读

**位置**：左侧主区下方。

**功能**：研报列表 + 详情抽屉。点列表项弹出 modal 显示完整摘要。

**列表项**：标题、作者、发布日期（左边蓝色 border 标识）。

**详情抽屉**：

- 半透明黑色 backdrop + 居中卡片
- 点击卡片外区域关闭
- 内容：完整标题、作者/日期、Markdown 摘要
- 右下角"关闭"按钮

**数据源**：`useUpupQuery` 调 agent 取 JSON 列表（`reports: [{id, title, author, publishedAt, summary}]`）。

`[Screenshot: ResearchPanel]`

### 6. SkillLauncher 技能启动器

**位置**：底部横跨三列。

**功能**：把 UpUp 的 50 个 SKILL.md 渲染为分组快捷启动按钮，**8 个分类**（按 Skill 名称中英文关键词归类）：

| 分类 | 关键词 | 典型 Skill |
|------|--------|-----------|
| **valuation**（估值） | `dcf` / `估值` / `valuation` | `dcf`, `valuation-comparison`, `valuation-alert`, `earnings-forecast` |
| **screening**（筛选） | `screen` / `筛选` | `stock-screen`, `a-share-screening` |
| **brief**（简报） | `brief` / `简报` / `morning` | `morning-brief`, `daily-brief` |
| **review**（复盘） | `review` / `复盘` / `portfolio` | `portfolio-review`, `portfolio-rebalancing` |
| **risk**（风险） | `risk` / `风险` | `risk-assessment`, `risk-dashboard`, `risk-management` |
| **earnings**（财报） | `earnings` / `财报` | `earnings-preview`, `earnings-call-summary` |
| **research**（研报） | `research` / `研报` / `filing` | `filing-analysis`, `a-share-filings`, `company-research` |
| **other**（其他） | 其余 | `fund-analysis`, `sector-analysis`, `macro-analysis` 等 |

**启动 Skill**：

- 点击按钮 → `useUpupStream.start(\`运行 ${skill.name}：${skill.description}\`)`
- 启动后按钮下方出现运行区，显示 turnId + 实时事件（assistant 文本 / 工具调用 / 完成结果）
- 可点击"取消"调用 `stream.cancel()` 终止
- "最近使用"展示最近 5 个启动过的 Skill（state 持久化在组件内）

**数据源**：`useUpupListSkills()` 拉 SKILL 列表（`@upup/skills.discoverSkills()` 扫描 SKILL.md frontmatter）。

`[Screenshot: SkillLauncher]`

### 7. WorkflowTracker 工作流追踪

**位置**：右侧主区下方。

**功能**：5 阶段 `/invest` 工作流进度追踪，每个阶段可独立启动。

**5 个阶段**：

| 阶段 | 中文 | 提示 |
|------|------|------|
| `dossier` | 个股档案 | 梳理个股基本面 |
| `strategy` | 策略生成 | 形成投资策略 |
| `earningsPreview` | 财报前瞻 | 跟踪业绩预期 |
| `morningBrief` | 早间简报 | 每日市场快讯 |
| `portfolioReview` | 组合复盘 | 周度组合评估 |

**状态显示**（来自 `useUpupListSessions()`）：

- **todo**（灰色） — 该阶段未启动
- **inProgress**（蓝色脉动） — 阶段正在执行
- **done**（绿色） — 阶段已完成

**启动阶段**：

- 点击每行右侧"启动"按钮 → `stream.start(\`/invest ${stageId}：${label}（${hint}）\`)`
- 启动后状态变 "进行中"，按钮禁用
- 下方出现运行区显示实时事件

**数据源**：`useUpupListSessions()`（当前 SDK 暂未提供 listAllSessions API，**所有阶段都显示 todo 状态**；待 SDK 接入后状态自动可用）。

`[Screenshot: WorkflowTracker]`

## 设置切换

投资工作台的所有配置在 `设置 → 智能体 → UpUp`（即 `settings-section-upup.tsx`）。修改后引擎会自动重启：

| 变更 | 重启行为 |
|------|---------|
| 改 `provider` | `syncUpupSdkHost` → stop + start |
| 改 `model` | 同上 |
| 改 `apiKey` | 同上（下次请求立即生效） |
| 改 `baseUrl` | 同上 |
| 开关 Tushare | 同上（启用后需重启 SDK 才生效） |
| 开关 ExaSearch | 同上 |

主进程控制台会打印 `[upup-sdk] host restarted after settings change`。

## 常见问题

### Q1: 投资工作台显示"引擎未就绪"

**原因**：`upupSdkHost` 启动失败。最常见是没填 API Key。

**解决**：

1. 打开 `设置 → 智能体 → UpUp`
2. 确认 `provider` / `model` / `apiKey` 都填了
3. 保存设置（设置页会触发引擎重启）
4. 切回投资工作台

**进阶排查**：

- 主进程日志搜 `[upup-sdk] host start failed:`
- DevTools 控制台跑 `await window.dsGui.upup.health()` 看 `error` 字段

### Q2: API key 错误 / 401 Unauthorized

**原因**：API Key 拼写错误、失效或额度耗尽。

**解决**：

1. 重新到对应平台复制 Key：
   - DeepSeek: <https://platform.deepseek.com/api_keys>
   - Anthropic: <https://console.anthropic.com/>
   - OpenAI: <https://platform.openai.com/api-keys>
2. 粘贴到 `设置 → 智能体 → UpUp → apiKey`（点击"显示"确认完整复制）
3. 保存设置

### Q3: 行情条 / 持仓 / 风险面板没数据

**原因**：`useUpupQuery` 调 agent 时返回的文本不含合法 JSON。

**解决**：

- 切换到 DeepSeek / Anthropic / OpenAI 等高质量模型
- 检查 agent 是否在合理 prompt 下生成了 JSON（`parseQuotes` / `tryParse` 已做容错）
- DevTools 看 `useUpupQuery` 返回的 `result` 字段，确认 agent 文本里是否包含 `{...}`

### Q4: 技能按钮点了没反应

**原因**：

1. `useUpupListSkills()` 返回空（SKILL.md 扫描失败）
2. `useUpupStream.start()` 失败（引擎未就绪）

**解决**：

1. 主进程日志搜 `[upup-ipc] list-skills failed`
2. 确认 SKILL.md 文件存在（参见仓库 `src/skills/*/SKILL.md`）
3. 确认引擎徽章是绿色

### Q5: 流式输出卡住 / 不刷新

**原因**：`upup:stream` 事件的 `turnId` 与本地 `currentTurnIdRef` 不匹配。

**解决**：

- 取消当前流（`stream.cancel()`）
- 重新启动
- DevTools 看 `window.dsGui.upup.onStream` 回调是否触发

### Q6: WorkflowTracker 所有阶段都显示"未启动"

**原因**：`useUpupListSessions()` 当前 SDK 暂未提供 listAllSessions API，返回 `[]`。

**解决**：

- 这是已知状态，**不影响**手动启动功能
- 点击"启动"按钮仍会调 `stream.start('/invest dossier: 个股档案（梳理个股基本面）')`
- 等待 UpUp SDK 后续版本提供 listAllSessions 后状态自动显示

### Q7: 切到投资工作台后页面空白

**原因**：InvestmentLayout 等待 `useUpupHealth()` 返回，且 `health?.ok === false`。

**解决**：

- 等待 5s（启动超时降级）
- 检查设置 → 智能体 → UpUp 配置
- 重启 DeepSeek GUI

### Q8: 怎么调试 API 调用？

```js
// DevTools 控制台
await window.dsGui.upup.health()
await window.dsGui.upup.listTools()
await window.dsGui.upup.listSkills()
await window.dsGui.upup.query('贵州茅台 2026Q1 业绩前瞻')
const { turnId } = await window.dsGui.upup.stream('AAPL 估值分析')
// 监听流
const off = window.dsGui.upup.onStream((ev) => console.log(ev))
// 取消
await window.dsGui.upup.cancel(turnId)
off()
```

## 相关文档

- `app/docs/upup-engine-integration.md` — UpUp SDK 引擎集成（in-process 架构、7 个 IPC 通道）
- `app/docs/kun-architecture.md` — Kun 单运行时方案（聊天工作台架构基线）
- `packages/sdk/README.md` — `@upup/sdk` 公开 API
- 仓库根 `CLAUDE.md` — 项目总览与开发约定
