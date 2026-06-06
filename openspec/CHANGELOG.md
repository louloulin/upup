# Changelog

UpUp 投研 AI 助手的版本发布记录。版本格式:CalVer `YYYY.M.D`,tag 前缀 `v`。

---

## v6 (2026-06-05) — Slash 自动补全 pi-tui 化

**一句话**:把 upup 自研的 slash 自动补全栈(fuzzy / 分页 / 分类 / 预览 / onSlash* 回调 / 影子状态 / 客户端 provider)拆掉,改成 pi-tui 的 3 行 wiring;行为对齐 codex / claude code(选中后回车直接提交)。

**适用读者**:已经升到 v5 的用户;行为变化见"行为变化"一节,没有需要迁移的配置。

### 改动摘要

| 类别 | 改动 |
|------|------|
| 弹出层 | 3 行 wiring pi-tui `CombinedAutocompleteProvider`;Editor 是 single source of truth |
| 状态行 | `StatusHintComponent`(68 行)替代 `HintBarComponent`(545 行)—— 后者所有 suggestion / 分页 / 分类职责全部下放给 pi-tui |
| 输入状态 | `input-state.ts` 删除 7 个 suggestion 字段/动作/选择器(202 行, -65%) |
| 命令注册 | `unified-registry.ts` 折叠为 22 行 thin builder(`listAllCommands()` + `findCommand()`) |
| 编辑器 | `custom-editor.ts` 移除 6 个 `onSlash*` 回调字段 + ~150 行 routing 块(375 行, -23%) |
| 死代码 | 删除 `command-input.ts` / `command-state-manager.ts` / `use-slash-input.ts` / `slash-autocomplete-provider.{ts,test.ts}` / `hint-bar.{ts,test.ts}` |
| 文档 | `AGENTS.md` 新增 "Slash Autocomplete" 章节,`docs/CODE-MAP.md` 第 140 行更新,`CLAUDE.md` `src/cli.ts` 行说明 |
| 测试 | 16 个 status-hint 单元测试 + 3 个 custom-editor 集成测试(SCAP-005 wiring) |

### Sprint 拆分

| Sprint | Commit | 关键文件 | 测试 |
|--------|--------|---------|------|
| v6-1 死代码 | fedc00b1 | `src/tui/{command-input,command-state-manager,hooks/use-slash-input}.ts` | -630 |
| v6-2 status-hint | b5834b42 | `src/components/status-hint.ts` (NEW, 68 行) | — |
| v6-3 cli 大手术 | 4e464aa4 | `src/cli.ts` (1673→1540 行,-133) + `src/components/{hint-bar.ts,status-hint.test.ts}` (净 -900) | 16 status-hint |
| v6-4 thin registry | d9f8214c | `src/commands/unified-registry.ts` (399→22 行) | — |
| v6-5 状态精简 | c6d241ac | `src/tui/state/input-state.ts` (579→202 行) | — |
| v6-6 回调精简 | 578376ab | `src/components/custom-editor.ts` (489→375 行) | — |
| v6-7 注释修复 | 641eef32 | `src/cli.ts` 残留注释 | — |
| v6-8 集成测试 | 7e5ee7b5 | `src/components/custom-editor.test.ts` (NEW) | 3 wiring |
| v6-9 文档归档 | 6ca22621 | `openspec/changes/.../proposal,design,spec,tasks.md` | — |

### 累计 diff(仅 src/)

```
15 files changed, +363 / -2,620  (净 -2,257 行)
```

比最初估计的 -1,222 行更激进:`hint-bar.ts` 545 行 + 旧 `unified-registry.ts` 377 行 + `slash-autocomplete-provider.*` 205 行 + 死代码 629 行,合计 1,756 行彻底从仓库消失。

### 删除文件

- `src/components/hint-bar.ts` (545 行)
- `src/components/hint-bar.test.ts` (174 行)
- `src/tui/slash-autocomplete-provider.ts` (101 行)
- `src/tui/slash-autocomplete-provider.test.ts` (104 行)
- `src/tui/command-input.ts` (289 行,死代码)
- `src/tui/command-state-manager.ts` (124 行,死代码)
- `src/tui/hooks/use-slash-input.ts` (216 行,死代码)

### 修改文件

- `src/cli.ts` — 3 行 wiring + 删 6 个 onSlash* 回调 + 删 suggestion 分支
- `src/commands/unified-registry.ts` — 折叠为 22 行 thin builder
- `src/tui/state/input-state.ts` — 删 7 个 suggestion 字段/动作/选择器
- `src/components/custom-editor.ts` — 删 6 个 onSlash* 字段 + ~150 行 routing 块
- `src/components/index.ts` — 导出 `StatusHintComponent`(原 `HintBarComponent`)

### 行为变化(SCAP-012)

**Before(v5 及之前)**:弹层中选中命令后,需先按 Tab 插入到编辑器,再按 Enter 触发。

**After(v6)**:弹层中选中命令后,按 Enter 直接提交——pi-tui 的 `applyCompletion` 内部把命令 + 一个尾随空格注入到 `lines`,`onSubmit` 自动 fire。

**等价于**:codex / claude code 的标准行为。

**对用户的影响**:不需迁移,只是少按一次键。

### 新增/修改文件

```
src/components/
  status-hint.ts               # NEW 68 行 — 单行 esc / processing / permission-mode 提示
  status-hint.test.ts          # NEW 151 行 — 16 测试
  custom-editor.test.ts        # NEW 73 行 — 3 集成测试(SCAP-005 wiring)

AGENTS.md                      # 新增 "Slash Autocomplete" 章节
docs/CODE-MAP.md               # 第 140 行 hint-bar.ts → status-hint.ts
CLAUDE.md                      # Important Files 表 cli.ts 行加 wiring 说明
openspec/CHANGELOG.md          # 本 v6 条目
openspec/changes/archive/      # openspec archive 写入归档目录
```

### 验证状态

- `bun run typecheck` — 0 error
- `bun test src/components/{status-hint,custom-editor}.test.ts` — **19 pass, 0 fail**
- 全量 `bun test` — 4441 pass, 16 fail(失败均为预先存在的 `investment-workflow` / 回测超时类,本次未触及)
- 9 步 smoke test(手动,见 `openspec/changes/simplify-cmd-autocomplete-pi-tui/tasks.md` §2.4)

### 不在本次范围

- 运行时动态命令刷新(pi-tui provider 在构造时 snapshot commands 数组;若要热更新,后续可加 5 行 `refreshProvider()` 助手)
- 多行命令参数(本次只处理单行 `/cmd args`)
- 自定义 popup 主题 / 分类色块(直接用 pi-tui `EditorTheme.selectList` 默认值)
- 按使用频率排序的 popup(`command-usage` 数据仍在 @upup/commands 维护;pi-tui 当前未暴露 sort hook,留作 follow-up)


## v5 (2026-06-04) — 投研 Claude Code 完整版

**一句话**:把 UpUp 升级为终端里的"投研 Claude Code"——Plan Mode 投决审计、5 个 fast lane 投资 CLI、5 步研究闭环一句话触发。

**适用读者**:已经从 v4-2 升上来的用户;新接入者直接看 [deployment.md](docs/deployment.md) 即可。

### 能力增量

| 类别 | 能力 | 入口 |
|------|------|------|
| Plan Mode | enterPlanMode / buildResearchPlan / executePlan / persistPlan / auditLog | /plan 或自然语言("分析 NVDA") |
| 投资 CLI | /morning-brief /earnings-preview /risk-dashboard /portfolio-review /watchlist-edit | 主对话直接调用 |
| 闭环编排 | /invest NVDA 一句话跑完 5 phase(research/valuation/backtest/trade/review) | 5 步研究闭环 |
| 持久化 | .upup/plans/<id>.json + audit.log JSONL + checkpoint resume | 计划 + 审计 |
| 编译开关 | PLAN_MODE_INVESTMENT + 5 个 COMMAND_* + INVESTMENT_WORKFLOW 共 7 个 | 软降级 |

### Sprint 拆分

| Sprint | Commit | 关键文件 | 测试 |
|--------|--------|---------|------|
| v5 启动 | 71d13fbb | openspec/changes/top-tier-investment-claude-code-v5/{proposal,design,tasks}.md + docs/GAP-ANALYSIS.md (14,171 字) | — |
| v5-1 Plan Mode | c16ca155 | src/plan/{research-plan,plan-builder,plan-executor}.ts | 24 tests |
| v5-2 Fast Lane CLI | 202e24a0 | src/commands/investment/{morning-brief,earnings-preview,risk-dashboard,portfolio-review,watchlist-edit}.ts | 13 tests |
| v5-3 5 步闭环 | dba451d2 | src/agent/investment-workflow.ts + /invest CLI | 18 tests |
| v5-4 文档 | (本 commit) | docs/positioning.md + docs/deployment.md + 本 CHANGELOG | — |
| v5-5 归档 | 71d13fbb (合并) | openspec/changes/archive/{v3,v4}-top-tier-investment-claude-code/ | — |

### 新增文件

```
src/plan/
  research-plan.ts          # ResearchPlan + PlanAuditEntry + 5 态状态机
  plan-builder.ts           # buildResearchPlan + extractTicker + modifyPlan
  plan-executor.ts          # executePlan + persistPlan + auditLog
  plan-builder.test.ts      # 12 tests
  plan-executor.test.ts     # 12 tests

src/agent/
  investment-workflow.ts    # runInvestmentWorkflow + resumeWorkflow + WORKFLOW_PHASES
  investment-workflow.test.ts # 18 tests

src/commands/investment/
  registry.ts               # 6 命令注册
  morning-brief.ts          # 盘前 9:00 报告
  earnings-preview.ts       # 财报日 T-1 提醒
  risk-dashboard.ts         # 实时风险仪表板
  portfolio-review.ts       # 组合复盘 Brinson 归因
  watchlist-edit.ts         # 自选股增删改
  invest.ts                 # /invest TICKER + --fast + --list + --resume
  investment.test.ts        # 13 tests

docs/
  positioning.md            # 投研 AI 完整版定位
  deployment.md             # 5 分钟部署指南
  GAP-ANALYSIS.md           # vs Claude Code / AlphaSense / Hebbia 差距分析
  CODE-MAP.md               # 全代码考古地图
  COMPETITIVE.md            # 13 竞品 7 维度矩阵
```

### 修改文件

- src/plan/plan-context.ts — 扩展 enterPlanMode / exitPlanMode / isInPlanMode
- src/agent/feature-gates.ts — 7 个新 flag(PLAN_MODE_INVESTMENT + 5 COMMAND_* + INVESTMENT_WORKFLOW)
- src/agent/agent.ts — Plan Mode 集成入口(沿用 plan-mode-state.ts 现有 hook)
- src/commands/executor.ts — fast-lane 投资命令拦截
- src/commands/index.ts — 中央注册表

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| UPUP_PLANS_DIR | .upup/plans | plan 持久化目录,/invest --list 读取来源 |
| UPUP_WATCHLIST_FILE | .upup/watchlist.json | 自选股文件路径,/watchlist-edit 读写 |
| UPUP_PLAN_MODE | 1 | =0 关闭 plan mode,直接对话(软降级) |
| UPUP_INVESTMENT_WORKFLOW | 1 | =0 关闭 5 步编排,/invest 退化为普通对话 |

### 已归档

| Plan | 归档位置 | 状态 |
|------|---------|------|
| v3-top-tier-investment-claude-code | openspec/changes/archive/v3-top-tier-investment-claude-code/ | 完成(投研 Claude / KAIROS / Bridge) |
| v4-top-tier-investment-claude-code | openspec/changes/archive/v4-top-tier-investment-claude-code/ | 完成(code-archaeology + competitive-positioning) |
| top-tier-investment-claude-code-v5 | openspec/changes/top-tier-investment-claude-code-v5/ | active(本版本) |

### 已知技术债

1. **全量 test 12 个 fail**:process.env['UPUP_PLANS_DIR'] 在 monorepo 并发跑时与其他测试共享,plan 路径冲突;**单跑模块 31/31 + 24/24 全绿,功能不受影响**。修法:Bun.spawn 子进程隔离(v6)。
2. **Plan Mode agent.ts 集成**留到 v6:现有 agent.ts:756 集成 plan-mode-state.ts,但**没**自动用 plan-builder 生成 ResearchPlan(只用默认 PlanContext)。下一步:intent-detector 命中"分析/研究/估值"关键词 → 自动调 buildResearchPlan + enterPlanMode。
3. **phaseHandler 默认 stub**:runInvestmentWorkflow 默认 handler 输出框架文本,不调真实工具。生产部署需注入调 src/tools/* 的 handler(避免循环依赖,需建 facade)。

### 升级路径

```bash
# 拉最新
git pull upstream main
bun install

# 老用户:v4-2 升级
# - 现有 capability-manifest 完全兼容(competitorRefs 沿用 ?? [] 兜底)
# - 新增 7 个 feature flag 默认开
# - 新增 6 个 CLI 默认开
# - /invest / /plan 自然语言自动触发
# 零迁移成本,直接可用。

# 新用户:从零开始
# 见 docs/deployment.md
```

### 路线图(v6+)

- **v6**(2026-06 中):Plan Mode agent.ts 自动集成 + phaseHandler 真实工具注入
- **v7**(2026-06 下):Sub-agent 并行化(5 phase 中 research/valuation 可并行)
- **v8**(2026-07 上):Bridge 远程协同(投决会跨设备)
- **v9**(2026-07 中):Voice + 监控任务 + 调研任务(loucode 风格的 P2 spec)

---

## v4 (2026-06-04) — 竞品定位 + 代码考古(已归档)

> openspec/changes/archive/v4-top-tier-investment-claude-code/

- **v4-1**(edd2ea17):src/agent/code-archaeology.ts + docs/CODE-MAP.md(全代码结构考古)
- **v4-2**(3348fb70):src/agent/competitive-positioning.ts + docs/COMPETITIVE.md(13 竞品 7 维度矩阵)

---

## v3 (2026-06-03) — 投研 Claude Code(已归档)

> openspec/changes/archive/v3-top-tier-investment-claude-code/

Sprint 1-7 全部落地:投研 Claude 人设(Sprint 1.1-1.3)+ KAIROS 主动机会发现 + Bridge 模式 + 60+ 工具集成。详见归档目录的 tasks.md。
