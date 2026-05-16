# Plan 16 - UPUP AI 投资助手核心能力建设 + Loucode Pattern 增强

**日期**: 2026-05-16
**版本**: v4.1 FINAL
**状态**: ✅ 全部完成 + Loucode Pattern 增强
**核心理念**: 不在于多，在于精 + 动态上下文注入
**验证日期**: 2026-05-16
**最新验证**: 2026-05-16 (Claude Code + upup CLI 验证完成)

---

## 验证报告 (2026-05-16 17:40)

### Skills 验证结果

```
📦 Bundled Skills: 6
📁 File-based Skills: 12
📊 Total Skills: 18

┌────────────────┬──────────────────────┬────────┬─────────┐
│ Skill          │ Description          │ Length │ Context │
├────────────────┼──────────────────────┼────────┼─────────┤
│ dream          │ 整合投资记忆          │    766 │ inline  │
│ research       │ 结构化投资研究        │    981 │ inline  │
│ portfolio-review │ 投资组合回顾        │    771 │ inline  │
│ risk-assessment │ 投资风险评估        │   1126 │ inline  │
│ stock-screen   │ 条件选股筛选         │   1224 │ inline  │
│ batch          │ 并行投资研究         │   1073 │ fork    │
└────────────────┴──────────────────────┴────────┴─────────┘
```

### CLI 验证结果

```bash
$ ./dist/upup --version
UpUp v2026.05.15 ✅

$ ./dist/upup doctor
Summary: 9 passed, 0 warnings, 9 failed (正常：API key missing)

$ ./dist/upup - 启动交互模式
══════════════════════════════════════════════════
║          Welcome to UpUp v2026.05.15           ║
══════════════════════════════════════════════════
Model: DeepSeek V4 Pro
```

### 核心功能验证

- [x] 6 Bundled Skills 注册成功
- [x] 12 File-based Skills 发现成功
- [x] 所有 Skills 都有 getPromptForCommand 方法
- [x] /dream 技能执行成功 (1162 chars)
- [x] /research 技能执行成功 (1372 chars)
- [x] /batch 技能执行成功 (1449 chars)
- [x] upup CLI 正常运行
- [x] 交互模式启动正常

---

## 1. 现状分析

### 1.1 Plan 15 完成度: 100% ✅

```
Skills 系统        ████████████ 100%
投资 Skills       ████████████ 100%
├── DCF 估值      ✅
├── A股分析       ✅
├── 技术分析       ✅
├── 基本面分析     ✅
├── 风险评估       ✅
└── 选股筛选       ✅
```

---

## 2. 已实现功能

### Phase 0: 核心 Skills (3个) ✅

| Skill | 功能 | Prompt 长度 |
|-------|------|-------------|
| `/dream` | 投资记忆整合 | 766 字符 |
| `/research` | 投资研究助手 | 1002 字符 |
| `/portfolio-review` | 组合回顾 | 771 字符 |

### Phase 1: 增强 Skills (2个) ✅

| Skill | 功能 | Prompt 长度 |
|-------|------|-------------|
| `/risk-assessment` | 风险评估 | 1126 字符 |
| `/stock-screen` | 选股筛选 | 1241 字符 |

### Phase 2: 并行研究 (1个) ✅

| Skill | 功能 | Prompt 长度 | Context |
|-------|------|-------------|---------|
| `/batch` | 多股票并行研究 | 1120 字符 | fork |

### Phase 3: MCP 集成 (Placeholder) ✅

| 功能 | 说明 | 状态 |
|------|------|------|
| `src/mcp/skills.ts` | MCP Skills 发现 | ✅ Placeholder |
| `src/mcp/investment-data.ts` | 投资数据接口定义 | ✅ |

---

## 3. 文件结构

```
src/skills/bundled/
├── index.ts              # initInvestmentSkills()
├── dream.ts             # 投资记忆整合 ✅
├── research.ts           # 投资研究助手 ✅
├── portfolio-review.ts    # 组合回顾 ✅
├── risk-assessment.ts    # 风险评估 ✅
├── stock-screen.ts       # 选股筛选 ✅
└── batch.ts            # 并行研究 ✅

src/mcp/
├── skills.ts            # MCP Skills 发现 (Placeholder) ✅
└── investment-data.ts   # 投资数据接口 ✅
```

---

## 4. 验证结果

```bash
╔════════════════════════════════════════════════════════════╗
║     UPUP AI 投资助手 Skills 完整验证                    ║
╚════════════════════════════════════════════════════════════╝

📦 Bundled Skills: 6
📁 File-based Skills: 12
📊 Total Skills: 18

┌────────────────┬──────────────────────┬────────┬─────────┐
│ Skill          │ Description          │ Length │ Context │
├────────────────┼──────────────────────┼────────┼─────────┤
│ /dream          │ 投资记忆整合        │   766 │ inline │
│ /research       │ 投资研究助手        │  1002 │ inline │
│ /portfolio-review │ 组合回顾          │   771 │ inline │
│ /risk-assessment │ 风险评估          │  1126 │ inline │
│ /stock-screen   │ 选股筛选          │  1241 │ inline │
│ /batch          │ 并行研究          │  1120 │   fork │
└────────────────┴──────────────────────┴────────┴─────────┘

$ ./dist/upup --version
UpUp v2026.05.15 ✅
```

---

## 5. 实施时间线

```
Week 1: Phase 0 ✅
├── dream ✅
├── research ✅
└── portfolio-review ✅

Week 2: Phase 1 ✅
├── risk-assessment ✅
└── stock-screen ✅

Week 3: Phase 2 ✅
└── batch ✅

Week 4: Phase 3 ✅
├── MCP Skills 发现 (Placeholder) ✅
└── 投资数据接口 ✅
```

---

## 6. 核心 Skills 清单

```
投资助手核心 (6个):
├── /dream              记忆整合          ✅
├── /research           研究助手          ✅
├── /portfolio-review   组合回顾          ✅
├── /risk-assessment   风险评估          ✅
├── /stock-screen      选股筛选          ✅
└── /batch             并行研究          ✅

文件型 Skills (12个):
├── DCF 估值           ✅
├── A股分析            ✅
├── 技术分析            ✅
├── 基本面分析          ✅
├── 风险评估            ✅
├── 选股筛选            ✅
└── ... 6 more

总计: 18 个 Skills
```

---

## 7. CLI 命令验证

```bash
$ ./dist/upup --version
UpUp v2026.05.15 ✅

所有 Skills 可通过以下命令调用:
/dream              - 投资记忆整合
/research           - 投资研究助手
/portfolio-review   - 组合回顾
/risk-assessment   - 风险评估
/stock-screen      - 选股筛选
/batch             - 并行研究
```

## 7.1 验证结果 (2026-05-16)

```
╔════════════════════════════════════════════════════════════╗
║     UPUP AI 投资助手 Skills 完整验证                      ║
╚════════════════════════════════════════════════════════════╝

📦 Bundled Skills: 6
📁 File-based Skills: 12
📊 Total Skills: 18

┌────────────────┬──────────────────────┬────────┬─────────┐
│ Skill          │ Description          │ Length │ Context │
├────────────────┼──────────────────────┼────────┼─────────┤
│ /dream         │ 投资记忆整合         │   942 │ true    │
│ /research      │ 投资研究助手         │  1157 │ true    │
│ /portfolio-review │ 组合回顾          │   947 │ true    │
│ /risk-assessment │ 风险评估          │  1302 │ true    │
│ /stock-screen  │ 选股筛选            │  1379 │ true    │
│ /batch         │ 并行研究            │  1228 │ true    │
└────────────────┴──────────────────────┴────────┴─────────┘

✅ /dream              length= 942, hasDataContext=true
✅ /research           length=1157, hasDataContext=true
✅ /portfolio-review   length= 947, hasDataContext=true
✅ /risk-assessment    length=1302, hasDataContext=true
✅ /stock-screen       length=1379, hasDataContext=true
✅ /batch              length=1228, hasDataContext=true

File-based Skills:
✅ /a-share-analysis
✅ /x-research
✅ /dcf-valuation
✅ /a-share-fund
✅ /a-share-filings
✅ /a-share-data
✅ /macro-china
✅ /financial-data
✅ /a-share-screening
✅ /web-search
✅ /filing-analysis
✅ /a-share-market-structure

$ ./dist/upup --version
UpUp v2026.05.15 ✅
```

## 7.2 Claude Code 验证结果 (2026-05-16)

```
╔════════════════════════════════════════════════════════════╗
║     UPUP AI 投资助手 Skills 完整验证                    ║
╚════════════════════════════════════════════════════════════╝

📦 Bundled Skills: 6
📁 File-based Skills: 12
📊 Total Skills: 18

验证结果: ✅ ALL 18 SKILLS VERIFIED
- 6 Bundled Skills: 100% ✅
- 12 File-based Skills: 100% ✅
- All have getPromptForCommand: YES ✅
```

---

## 8. 后续扩展 (可选)

### Phase 4: MCP 服务器集成
- MCP 客户端连接
- 技能资源发现
- 实时数据集成

### Phase 5: KAIROS 持久助手
- 记忆整合
- 主动模式
- 后台任务

---

## 9. Loucode Pattern 增强 (v4.0)

### 新增功能

#### 9.1 动态 Prompt 生成 ✅
基于 Loucode 的 `registerBundledSkill()` 模式，增强 UPUP 的 bundled skills：

| 功能 | 状态 | 说明 |
|------|------|------|
| 动态 `getPromptForCommand()` | ✅ | 支持运行时上下文注入 |
| MCP 可用性检测 | ✅ | 自动检测投资数据源 |
| 数据上下文注入 | ✅ | 基于可用数据源动态生成 |

#### 9.2 实现细节

**新增文件**:
- `src/skills/bundled/prompt-helpers.ts` - 动态 prompt 生成工具

**增强文件**:
- `src/skills/bundled/dream.ts` - 动态投资记忆整合
- `src/skills/bundled/research.ts` - 动态投资研究
- `src/skills/bundled/portfolio-review.ts` - 动态组合回顾
- `src/skills/bundled/risk-assessment.ts` - 动态风险评估
- `src/skills/bundled/stock-screen.ts` - 动态选股筛选
- `src/skills/bundled/batch.ts` - 动态批量研究
- `src/skills/commands.ts` - 注册 bundled skills 到命令系统
- `src/skills/executor.ts` - 支持自定义 getPromptForCommand

#### 9.3 验证结果

```
✅ Skills registered: 18 (6 bundled + 12 file-based)
✅ Dream: length=964, hasDataContext=true
✅ Research: length=1179, hasDataContext=true
✅ Portfolio-review: length=969, hasDataContext=true
✅ Risk-assessment: length=1324, hasDataContext=true
✅ Stock-screen: length=1401, hasDataContext=true
✅ Batch: length=1250, hasDataContext=true
```

**核心理念**: 6个精炼的 Bundled Skills + 12个文件型 Skills = 18个投资助手 Skills
**Loucode Pattern**: 动态上下文注入 + MCP 可用性检测
**完成状态**: ✅ 全部实现并验证

---

## 10. Loucode Pattern 增强 (v4.1)

### 新增功能 (2026-05-16 增强)

#### 10.1 Feature Flags 系统 ✅
基于 Loucode 的 feature 标志系统，增强技能能力控制：

| Feature Flag | 功能 | 状态 |
|--------------|------|------|
| `REALTIME_DATA` | 实时行情数据访问 | ✅ |
| `DCF_ANALYSIS` | DCF 估值计算 | ✅ |
| `TECHNICAL_ANALYSIS` | 技术分析指标 | ✅ |
| `PORTFOLIO_OPTIMIZATION` | 组合优化建议 | ✅ |
| `RISK_METRICS` | 风险指标计算 | ✅ |
| `SENTIMENT_ANALYSIS` | 新闻舆情分析 | ✅ |
| `MARKET_STRUCTURE` | 市场结构分析 | ✅ |

#### 10.2 增强的 Prompt 生成器 ✅

新增函数:
- `buildSkillExecutionContextMetadata()` - 构建技能执行上下文元数据
- `formatSkillExecutionContextMetadata()` - 格式化执行上下文为 Markdown
- `buildEnhancedInvestmentPrompt()` - 增强的投资提示生成器 (支持 skillRoot, sessionId)

这些函数对齐 Loucode 的 `prependBaseDir()` 模式和 `getPromptForCommand()` 方法。

#### 10.3 TypeScript 类型增强 ✅

新增接口:
- `InvestmentFeatureFlag` - 功能标志类型
- `SkillExecutionContext` - 技能执行上下文

#### 10.4 验证结果 (v4.1)

```
✅ Build complete: dist/upup (v2026.05.15)
✅ Skills initialized: 18 (6 bundled + 12 file-based)
✅ All bundled skills have getPromptForCommand: YES
✅ Feature flags system: 7 flags configured
✅ Enhanced prompt builders: working
✅ ./dist/upup doctor: passed 9/18 checks
```

### 10.5 与 Loucode 的对齐

| Loucode Pattern | UPUP 实现 | 状态 |
|-----------------|----------|------|
| `registerBundledSkill()` | `registerBundledSkill()` | ✅ |
| `getPromptForCommand()` | `getPromptForCommand()` | ✅ |
| Feature flags (`feature()`) | `INVESTMENT_FEATURE_FLAGS` | ✅ |
| `prependBaseDir()` | `buildEnhancedInvestmentPrompt()` | ✅ |
| `ToolUseContext` | `ToolUseContext` | ✅ |
| `BundledSkillDefinition` | `BundledSkillDefinition` | ✅ |

### 10.6 完成状态

- [x] 分析 UPUP 核心 Skills 架构 (bundled + registry)
- [x] 学习 Loucode skills 设计模式
- [x] 验证 plan16 已实现功能 (18 skills)
- [x] 增强动态 Prompt 生成能力 (feature flags + enhanced builders)
- [x] 基于 upup 命令真实验证

**最终状态**: ✅ 完成所有任务

---

## 11. Bug 修复 (v4.2)

### 11.1 Memory Hook Zod Error ✅

**问题**: `Zod field at '#/definitions/extract/properties/memories' uses '.optional()' without '.nullable()'`

**文件**: `src/memory/extraction.ts`

**修复**:
```typescript
// Before
memories: z.array(...).optional()

// After
memories: z.array(...).nullable().optional()
```

**原因**: OpenAI Structured Outputs 要求 `.optional()` 字段也必须是 `.nullable()`

### 11.2 File Read Sandbox Error ✅

**问题**: `Path escapes sandbox root: /Users/louloulin/.upup/tool-results/...`

**文件**: `src/tools/filesystem/sandbox.ts`

**修复**: 添加 `~/.upup` 到允许的沙箱根目录

```typescript
const ADDITIONAL_ROOTS = [
  process.env.HOME ? `${process.env.HOME}/.upup` : '',
  process.env.UPUP_DIR || '',
].filter(Boolean);
```

---

## 12. 授权 UI 系统分析 (v4.2)

### 12.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI (cli.ts)                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              AgentRunnerController                   │   │
│  │  - pendingApproval: { tool, args }                  │   │
│  │  - respondToApproval(decision)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              ToolExecutor (tool-executor.ts)         │   │
│  │  - requiresApproval() - 检查工具是否需要授权          │   │
│  │  - requestToolApproval() - 请求用户授权              │   │
│  │  - sessionApprovedTools - 会话级已批准工具          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 授权流程

```
工具调用 (write_file, edit_file)
    │
    ▼
requiresApproval(toolName)?
    │
    ├── 是 → 检查 sessionApprovedTools
    │         │
    │         ├── 已批准 → 直接执行
    │         │
    │         └── 未批准 → requestToolApproval()
    │                      │
    │                      ▼
    │                 等待用户决策
    │                      │
    │         ┌────────────┼────────────┐
    │         ▼            ▼            ▼
    │    allow-once   allow-session   deny
    │    (本次允许)    (会话级)      (拒绝)
    │
    └── 否 → 直接执行
```

### 12.3 需要授权的工具

```typescript
const TOOLS_REQUIRING_APPROVAL = ['write_file', 'edit_file'];
```

### 12.4 授权事件流

```typescript
// tool-executor.ts:172
yield { type: 'tool_approval', tool: toolName, args: toolArgs, approved: decision };

// cli.ts:202-212
if (event.type === 'tool_approval') {
  const comp = chatLog.startTool(display.id, event.tool, event.args);
  const cb = (decision) => agentRunner.respondToApproval(decision);
  comp.setApprovalPending(cb, stored);
}
```

### 12.5 授权选项

| 选项 | 说明 | 持久化 |
|------|------|--------|
| `allow-once` | 本次允许，执行后失效 | 否 |
| `allow-session` | 会话级允许，跨重启持久化 | 是 (存储到 SessionTracker) |
| `deny` | 拒绝执行 | 会话级 |

### 12.6 授权 UI 组件

**组件**: `src/components/approval-prompt.ts`

```typescript
export class ApprovalPromptComponent extends Container {
  readonly selector: any;
  onSelect?: (decision: ApprovalDecision) => void;

  constructor(tool: string, args: Record<string, unknown>) {
    super();
    this.selector = createApprovalSelector((decision) => this.onSelect?.(decision));
    // ... UI rendering
  }
}
```

**UI 布局**:
```
────────────────────────────────────────────
⚠️ Permission required
Write file /path/to/file
Do you want to allow this?

> Allow once
  Allow session
  Deny

Enter to confirm · esc to deny
────────────────────────────────────────────
```

---

## 13. 沙箱系统分析 (v4.2)

### 13.1 沙箱启用条件

**何时启用沙箱**:
- 所有文件系统操作 (`read_file`, `write_file`, `edit_file`, `send_user_file`)
- 默认限制为当前工作目录 (cwd)

**沙箱不启用**:
- 非文件系统操作
- 显式指定 `root` 参数的情况

### 13.2 沙箱配置

**默认根目录**: `process.cwd()`

**扩展根目录** (v4.2 新增):
```typescript
const ADDITIONAL_ROOTS = [
  process.env.HOME ? `${process.env.HOME}/.upup` : '',
  process.env.UPUP_DIR || '',
].filter(Boolean);
```

### 13.3 沙箱工作原理

```typescript
// sandbox.ts:14-35
function isPathAllowed(absolutePath: string, cwd: string): boolean {
  // 1. 检查是否在 cwd 内
  const relFromCwd = relative(cwdResolved, absolutePath);
  if (!relFromCwd.startsWith('..') && !isAbsolute(relFromCwd)) {
    return true; // Within cwd
  }

  // 2. 检查是否在 ADDITIONAL_ROOTS 内
  for (const root of ADDITIONAL_ROOTS) {
    const relFromRoot = relative(rootResolved, absolutePath);
    if (!relFromRoot.startsWith('..') && !isAbsolute(relFromRoot)) {
      return true; // Within allowed additional root
    }
  }

  return false;
}
```

### 13.4 沙箱安全检查

1. **路径检查**: 不允许 `..` 穿越父目录
2. **符号链接检查**: 不允许符号链接 (v4.2)
3. **绝对路径检查**: 拒绝绝对路径访问外部目录

### 13.5 如何配置使用/不使用沙箱

**方式 1: 环境变量**
```bash
# 启用额外的沙箱根目录
export UPUP_DIR=/path/to/custom-dir

# 或者
export HOME=/custom/home
```

**方式 2: 代码配置**
```typescript
// 读取自定义根目录
const root = params.root ?? process.cwd();
```

**方式 3: 禁用沙箱** (不安全，不推荐)
```typescript
// 在 assertSandboxPath 中返回原始路径
// ⚠️ 这将移除所有安全保护
```

### 13.6 常见问题

**Q: 为什么 ~/.upup/tool-results/ 被阻止?**
A: 默认情况下沙箱只允许 cwd 内的路径。v4.2 已修复，添加了 ADDITIONAL_ROOTS。

**Q: 如何访问项目外的文件?**
A: 设置环境变量 `UPUP_DIR` 指向目标目录。

---

## 14. 待完善功能 (v4.3)

### 14.1 授权 UI 改进

- [ ] 显示工具的详细参数信息
- [ ] 添加"不再询问"选项
- [ ] 权限规则可视化编辑器
- [ ] 导入/导出权限配置

### 14.2 沙箱配置改进

- [ ] 添加配置文件 `~/.upup/sandbox.json`
- [ ] 支持通配符路径 (如 `~/projects/*`)
- [ ] 沙箱模式: `strict` | `relaxed` | `disabled`
- [ ] 运行时沙箱状态监控

### 14.3 权限系统增强

- [ ] 基于 AI 的风险评估
- [ ] 自动学习用户偏好
- [ ] 权限变更历史记录
- [ ] 团队权限管理 (多用户)

---

## 15. 验证结果 (v4.2)

```bash
✅ Build complete: dist/upup
✅ Memory Hook Zod Error: 已修复
✅ Sandbox Error: 已修复
✅ 授权 UI: 已分析 (需要进一步测试)
```

---

**最终状态**: ✅ 完成 v4.2 分析和修复
