# Plan7.md — UpUp 投资 Agent 功能完善计划

> 创建日期: 2026-05-11 | 目标: 完善投资版 Claude Code 功能 | 对标: Claude Code + OpenClaw
> 版本: 2.0 | 状态: **规划中**

---

## 0. 执行摘要

基于对 UpUp 代码库的全面分析，发现现有系统已经具备强大的 Skills/Workflow 基础，但部分高级功能仍需完善：

| 优先级 | 功能领域 | 当前状态 | 目标状态 | 影响 |
|--------|----------|----------|----------|------|
| ~~P1~~ | **配置层级系统** | **仅项目级** | **全局+项目** | **高 (已完成)** |
| ~~P1~~ | **持仓管理系统** | **已有** | **完整管理** | **高 (已完成)** |
| ~~P2~~ | **文件变更追踪** | **无** | **完整追踪** | **中 (已完成)** |
| ~~P2~~ | **Hook 参数修改** | **无** | **PreToolModify** | **中 (已完成)** |
| P3 | 语义记忆搜索 | BM25 | BM25+向量 | 中 |

---

## 1. 现有 Skills/Workflow 系统分析

### 1.1 系统架构

```
src/skills/                    # Skills 系统
├── registry.ts               # 技能发现 (project > user > builtin)
├── loader.ts                 # 技能加载器
├── scheduler.ts              # 定时调度器
├── types.ts                 # 类型定义
├── investment/               # 投资技能
│   ├── portfolio-review/    # 持仓复盘
│   ├── risk-assessment/     # 风险评估
│   ├── stock-analysis/      # 股票分析
│   ├── market-brief/       # 市场简报
│   ├── decision-dashboard/  # 决策仪表盘
│   └── stock-screening/     # 选股
├── dcf/                     # DCF 估值
├── a-share-analysis/        # A股分析
└── x-research/              # X 研究

src/cron/                     # Cron 系统
├── runner.ts                # Cron 运行器
├── executor.ts              # 任务执行器
├── store.ts                 # 任务存储
└── schedule.ts              # 调度计算
```

### 1.2 已实现的 Skills (9个)

| Skill | 功能 | 触发词 |
|-------|------|--------|
| `dcf-valuation` | DCF 估值分析 | DCF, 内在价值, 估值 |
| `investment-portfolio-review` | 持仓复盘 | 持仓, 复盘, 仓位分析 |
| `investment-risk-assessment` | 风险评估 | 风险, VaR, 止损 |
| `investment-stock-analysis` | 股票分析 | 股票分析, 基本面 |
| `investment-market-brief` | 市场简报 | 市场, 简报 |
| `investment-decision-dashboard` | 决策仪表盘 | 决策, 仪表盘 |
| `investment-stock-screening` | 选股 | 选股, 筛选 |
| `a-share-analysis` | A股分析 | A股, 沪深 |
| `x-research` | 研究 | 研究, 分析 |

### 1.3 Skill 文件格式

```markdown
---
name: skill-name
description: |
  技能描述。当用户询问相关内容时自动触发。
  触发词包括：xxx, yyy, zzz。
version: 1.0.0
---

# 技能标题

## 使用场景
当用户需要 xxx 时使用此技能。

## 工作流程

### Step 1: xxx
调用工具获取数据。

### Step 2: yyy
分析计算。

### Step 3: zzz
生成报告。

## 输出格式
提供结构化的输出模板。

## 工具说明
### tool_name
工具使用说明。
```

### 1.4 Scheduler 系统

```typescript
// 已实现的定时调度器
class SkillScheduler {
  schedule(skillName: string, intervalMs: number, args?: string): ScheduledSkill;
  unschedule(id: string): boolean;
  enable(id: string): boolean;
  disable(id: string): boolean;
  list(): ScheduledSkill[];
}
```

### 1.5 Cron Runner

```typescript
// 已实现的后台任务运行器
startCronRunner(params: { configPath?: string }): CronRunner;
// 从 .upup/cron/jobs.json 加载任务
// 支持 cron 表达式调度
// 任务执行后自动计算下次运行时间
```

---

## 2. Skills/Workflow 使用指南

### 2.1 如何触发 Skill

Skills 会根据触发词自动触发。Agent 在收到用户请求时会分析触发词并调用对应的 Skill。

**示例**:

```bash
# 用户输入
"帮我分析一下茅台的 DCF 估值"

# Agent 自动识别触发词: DCF, 估值
# 调用 dcf-valuation skill
# 执行 SKILL.md 中定义的工作流程
```

### 2.2 如何创建自定义 Skill

在 `.upup/skills/` 目录下创建新技能：

```bash
mkdir -p .upup/skills/my-strategy
```

创建 `SKILL.md`:

```markdown
---
name: my-investment-strategy
description: |
  我的投资策略描述。触发词包括：我的策略, 自定义策略。
version: 1.0.0
---

# 我的投资策略

## 工作流程

### Step 1: 收集信息
调用 `get_financials` 获取财务数据。

### Step 2: 执行分析
按照我的策略逻辑进行分析。

### Step 3: 输出结果
生成策略报告。

## 输出格式
提供结构化报告。
```

### 2.3 如何调度 Skill

使用 cron 工具调度 Skill 定期执行：

```bash
# 在 UpUp 中输入
/schedule investment-portfolio-review every day at 9:00
```

或使用 cron 工具直接调度：

```bash
# 创建 cron 任务
/cron add "0 9 * * *" "upup run skill --name investment-portfolio-review"
```

### 2.4 投资 Workflow 示例

#### 示例 1: 每日持仓复盘

```
触发: 每天早上 9:00 自动执行
流程:
1. 获取当前持仓数据
2. 计算盈亏情况
3. 评估风险指标
4. 生成复盘报告
5. 发送桌面通知
```

#### 示例 2: 财报季监控

```
触发: 财报发布前 3 天提醒
流程:
1. 查询持仓股票的财报日历
2. 获取分析师预期
3. 检查与预期的差异
4. 生成预警报告
5. 发送邮件通知
```

#### 示例 3: 风险检查

```
触发: 每周一开盘前
流程:
1. 计算组合 VaR
2. 检查行业集中度
3. 评估流动性风险
4. 生成风险报告
5. 建议调仓
```

---

## 3. 与 Claude Code/OpenClaw 对标

### 3.1 功能对比

| 功能 | Claude Code | OpenClaw | UpUp | 状态 |
|------|-------------|----------|------|------|
| Skill 系统 | Agent skill | Plugin skill | Markdown skill | ✅ |
| 定时调度 | Schedule | Cron | Cron | ✅ |
| 后台任务 | Background tasks | Workers | Cron runner | ✅ |
| 工作流 | 隐式 | 显式 | 显式 (SKILL.md) | ✅ |
| 通知 | Terminal | Desktop | Terminal | ✅ |
| 配置层级 | Global + Project | Config file | Global + Project | ✅ (plan6) |
| 持仓管理 | Portfolio tools | Holdings | Portfolio tools | ✅ (plan7) |
| 文件追踪 | Full diff | Git-based | Tool call only | ❌ |

### 3.2 UpUp 优势

1. **Markdown-based Skills** - 易读易写，用户可自定义
2. **中文支持** - 投资术语本地化
3. **投资专用** - 预设 9 个专业投资技能
4. **Cron 集成** - 后台定时执行
5. **持仓管理** - 完整的钱包和交易记录

### 3.3 UpUp 差距

1. ~~无全局配置~~ ✅ (已实现 plan6)
2. ~~无文件变更追踪~~ - 仅有 scratchpad
3. ~~无桌面通知~~ ✅ (已实现 notify tool)
4. **无 Hook 参数修改** - 不能修改工具参数

---

## 4. 实现计划

### Phase 1: 配置层级系统 (P1) ✅ (plan6.md) — 已完成

**目标**: 支持全局 (`~/.upup/`) + 项目 (`.upup/`) 配置

**状态**: ✅ 已完成

**实现文件**:
- `src/utils/paths.ts` - globalUpupPath()
- `src/agent/investment-config.ts` - loadMergedInvestmentConfig()
- `src/agent/prompts.ts` - 全局 SOUL.md 加载
- `src/hooks/user-hooks.ts` - 全局 hooks 加载

### Phase 2: 持仓管理系统 (P1) ✅ (plan7.md)

**目标**: 完整的持仓管理工具集

**状态**: ✅ 已完成

**实现文件**:
- `src/tools/portfolio/portfolio-tools.ts` - 持仓管理工具
- `src/tools/notify/notify-tool.ts` - 通知工具

**可用工具**:
- `get_portfolio` - 获取全部持仓
- `add_position` - 添加持仓
- `update_position` - 更新持仓
- `remove_position` - 删除持仓
- `set_cash` - 设置现金
- `get_transactions` - 获取交易历史
- `notify` - 发送通知

**验证**:
- 27 个持仓测试通过
- 60 个通知测试通过
- osascript 交互测试通过

#### 4.1.1 目录结构

```
~/.upup/                    # 全局配置 (新建)
├── SOUL.md                # 全局身份
├── GOALS.md               # 全局目标
├── RULES.md               # 全局规则
├── GOVERN.md              # 全局治理
├── skills/                # 全局技能
│   └── my-strategy/
│       └── SKILL.md
├── memory/                # 全局记忆
└── hooks/                # 全局 hooks

<project>/                  # 项目配置 (已有)
├── .upup/                  # 项目特定配置
│   ├── SOUL.md            # 覆盖全局
│   ├── skills/            # 项目技能 (覆盖全局)
```

#### 4.1.2 实现

```typescript
// src/utils/paths.ts
export function globalUpupPath(...segments: string[]): string {
  return join(homedir(), '.upup', ...segments);
}

// src/agent/prompts.ts
async function loadMergedSoul(): Promise<string | null> {
  // 1. 项目配置优先
  const projectSoul = await loadSoulDocument();
  if (projectSoul) return projectSoul;
  // 2. 回退到全局
  const globalPath = globalUpupPath('SOUL.md');
  try { return await readFile(globalPath, 'utf-8'); } catch { return null; }
}
```

---

### Phase 2: 持仓管理系统 (P1)

**目标**: 完整的持仓管理工具集

#### 4.2.1 新增工具

| 工具 | 功能 | 数据存储 |
|------|------|----------|
| `get_portfolio` | 获取全部持仓 | `.upup/portfolio.json` |
| `add_position` | 添加持仓 | `.upup/portfolio.json` |
| `update_position` | 更新持仓 | `.upup/portfolio.json` |
| `remove_position` | 删除持仓 | `.upup/portfolio.json` |
| `calculate_returns` | 计算收益率 | - |
| `get_watchlist` | 获取自选股 | `.upup/watchlist.json` |
| `add_watchlist` | 添加自选股 | `.upup/watchlist.json` |

#### 4.2.2 数据文件

```json
// .upup/portfolio.json
{
  "positions": [
    {
      "ticker": "600519.SH",
      "name": "贵州茅台",
      "quantity": 100,
      "costPrice": 1800.00,
      "entryDate": "2024-01-15",
      "notes": "长期持有"
    }
  ],
  "lastUpdated": "2026-05-11T09:00:00Z"
}
```

---

### Phase 3: 文件变更追踪 (P2) ✅ 已完成

**目标**: 记录实际文件变更

**状态**: ✅ 已完成 (2026-05-11)

**实现文件**:
- `src/tools/filesystem/file-state.ts` - FileStateTracker 实现
- `src/tools/filesystem/file-state.test.ts` - 10 个测试用例
- `src/tools/filesystem/read-file.ts` - trackRead() 集成
- `src/tools/filesystem/edit-file.ts` - checkStaleness() + updateAfterWrite() 集成

#### 4.3.1 FileStateTracker

```typescript
// src/tools/filesystem/file-state.ts

interface FileState {
  path: string;
  content: string;
  mtime: number;
  digest: string;  // 内容哈希
}

class FileStateTracker {
  trackRead(path: string, content: string): void;
  trackWrite(path: string, newContent: string): void;
  checkStaleness(path: string): { stale: boolean; reason?: string };
  getChanges(): FileChange[];
}
```

---

### Phase 4: 通知系统 (P2)

**目标**: 支持桌面通知和邮件通知

#### 4.4.1 实现

```typescript
// src/tools/notify.ts

export async function sendDesktopNotification(
  title: string,
  body: string,
  icon?: string
): Promise<void>;

export async function sendEmailNotification(
  to: string,
  subject: string,
  body: string
): Promise<void>;
```

---

### Phase 5: Hook 参数修改 (P3) ✅ 已完成

**目标**: 支持 PreToolModify hook

**状态**: ✅ 已完成 (2026-05-11)

**实现文件**:
- `src/hooks/tool-hooks.ts` - 添加 PreToolModify 事件类型和执行方法
- `src/agent/tool-executor.ts` - PreToolModify hooks 在 PreToolUse 之前执行

**接口**:
```typescript
// PreToolModifyParams
interface PreToolModifyParams {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string;
}

// PreToolModifyResult
interface PreToolModifyResult {
  modified: boolean;
  newArgs?: Record<string, unknown>;
  blocked?: boolean;
  reason?: string;
}
```

**执行流程**:
1. PreToolModify hooks 执行 (可修改 args)
2. 如 blocked=true，停止执行
3. PreToolUse hooks 执行 (只读通知)
4. 工具实际执行

---

## 5. 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/utils/paths.ts` (修改) | 添加 globalUpupPath() |
| `src/agent/prompts.ts` (修改) | 支持全局配置加载 |
| `src/tools/portfolio-tools.ts` | 持仓管理工具 |
| `src/tools/filesystem/file-state.ts` | 文件状态追踪 |
| `src/tools/notify.ts` | 通知工具 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/agent/investment-knowledge.ts` | 添加持仓数据结构 |
| `src/agent/investment-knowledge-tools.ts` | 添加持仓工具 |
| `src/skills/registry.ts` | 支持全局技能目录 |

---

## 6. Skills 自定义指南

### 6.1 创建投资策略 Skill

```bash
mkdir -p .upup/skills/my-dividend-strategy
```

```markdown
---
name: my-dividend-strategy
description: |
  高股息策略分析。当用户想要分析高股息股票、获取分红信息时触发。
  触发词：高股息，分红，股息率，现金奶牛。
version: 1.0.0
---

# 高股息投资策略

## 策略规则
- 股息率 > 3%
- 连续分红 >= 5 年
- 净利润增长率 > 0%

## 工作流程

### Step 1: 筛选高股息股票
使用 `stock_screener` 筛选股息率 > 3% 的股票。

### Step 2: 检查分红历史
对每只股票调用 `get_financials` 检查分红历史。

### Step 3: 验证财务健康
检查现金流、负债率等指标。

### Step 4: 生成推荐
根据综合评分生成推荐列表。

## 输出格式
| 股票 | 股息率 | 分红年数 | 综合评分 |
|------|--------|----------|----------|
| XXX | X% | X年 | XX分 |
```

### 6.2 创建风险管理 Skill

```bash
mkdir -p .upup/skills/daily-risk-check
```

```markdown
---
name: daily-risk-check
description: |
  每日风险检查。自动检查持仓风险并发送预警。
  触发词：风险检查，VaR，风险预警。
version: 1.0.0
---

# 每日风险检查

## 触发
建议使用 cron 每天开盘前执行：
```
0 8 * * * upup run skill --name daily-risk-check
```

## 工作流程

### Step 1: 获取持仓
读取 `.upup/portfolio.json` 获取当前持仓。

### Step 2: 计算风险指标
- VaR (95%, 1日)
- 行业集中度
- 单一仓位上限

### Step 3: 风险分级
| 等级 | 说明 |
|------|------|
| 🟢 低风险 | 无需处理 |
| 🟡 中风险 | 关注 |
| 🔴 高风险 | 立即处理 |

### Step 4: 发送预警
如发现高风险，发送桌面通知。

## 通知格式
```
🛡️ 风险预警 - {日期}

⚠️ 高风险持仓:
- {股票} ({原因})

📊 建议操作:
1. {建议}
```
```

---

## 7. 验证计划

```bash
# 1. 配置层级测试
mkdir -p ~/.upup
echo "# Global SOUL" > ~/.upup/SOUL.md
echo "# Project SOUL" > .upup/SOUL.md
# 验证项目配置优先

# 2. 持仓管理测试
bun test src/tools/portfolio-tools.test.ts

# 3. 技能系统测试
/upup skills list  # 列出所有可用技能
/upup skills run dcf-valuation --ticker AAPL

# 4. Cron 调度测试
/cron add "0 9 * * *" "skill:investment-portfolio-review"

# 5. 完整测试
bun run build
bun test
```

---

**Next Steps**:
1. ~~Phase 1: 配置层级系统 (global ~/.upup/)~~ ✅ (plan6.md)
2. ~~Phase 2: 持仓管理系统~~ ✅ (已有)
3. ~~Phase 3: 文件变更追踪~~ ✅ (file-state.ts)
4. ~~Phase 4: 通知系统~~ ✅ (已有)
5. ~~Phase 5: Hook 参数修改~~ ✅ (PreToolModify)
6. ~~配置: 默认模型修改~~ ✅ (deepseek-v4-flash)
7. **Phase 6: 语义记忆搜索** - BM25 + 向量搜索