# Skills3.md - Skills 执行系统深度分析

> 基于 Loucode (Claude Code) 对比分析和实际代码验证

---

## 一、架构对比图

### Loucode (Claude Code) 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Loucode Skills Architecture                            │
└─────────────────────────────────────────────────────────────────────────────┘

  User Input: /a-share-data 贵州茅台
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  commands/skills/index.ts                                                │
│  └── executeSlashCommand(commandName, args)                               │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  loadSkillsDir.ts → getPromptForCommand()                                │
│                                                                           │
│  1. substituteArguments() → 替换 {{args}}                                │
│  2. replace ${CLAUDE_SKILL_DIR} → skillRoot                              │
│  3. executeShellCommandsInPrompt() → 仅执行 ```! 或 !` 语法               │
│  4. Returns [{ type: 'text', text: finalContent }]                       │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  promptShellExecution.ts → executeShellCommandsInPrompt()                 │
│                                                                           │
│  Uses: BashTool.call({ command }, context)                               │
│  ├── Integrates with permission system                                     │
│  ├── Uses toolPermissionContext.alwaysAllowRules                          │
│  ├── Sandboxed execution                                                  │
│  └── Output stored in toolResultStorage                                   │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent receives prompt                                                    │
│  ├── ```bash blocks → shown as instructions (NOT pre-executed)           │
│  └── Agent calls Bash tool to execute python3 commands                    │
└───────────────────────────────────────────────────────────────────────────┘
```

### Upup (当前实现) 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Upup Skills Architecture                             │
└─────────────────────────────────────────────────────────────────────────────┘

  User Input: /a-share-data 贵州茅台
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  src/cli.ts → handleSlashCommand()                                       │
│  └── executeSkillCommand(commandName, args)                              │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  src/skills/executor.ts → executeSkillCommand()                          │
│  └── getPromptForCommand() → createSkillCommand().getPromptForCommand()  │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  promptShellExecution.ts → executeShellCommandsInPrompt()                │
│                                                                           │
│  Uses: exec() from child_process ❌                                       │
│  ├── NO permission system integration                                     │
│  ├── NO toolPermissionContext                                            │
│  ├── NO sandboxing                                                        │
│  └── Bypasses BashTool entirely                                           │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent receives prompt                                                    │
│  ├── ```bash blocks → shown as instructions (NOT pre-executed)           │
│  └── Agent calls Bash tool to execute python3 commands                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、问题根因分析

### 2.1 Shell 命令执行语法

| 语法 | Loucode | Upup | 说明 |
|------|---------|------|------|
| ` ```! command ``` ` | ✅ 执行 | ✅ 执行 | Shell 块 |
| ` !`command` ` | ✅ 执行 | ✅ 执行 | 内联 |
| ` ```bash command ``` ` | ❌ 不执行 | ❌ 不执行 | 仅显示 |

**a-share-data SKILL.md 使用 ` ```bash ` 语法，不会被预执行！**

### 2.2 关键发现

```
a-share-data SKILL.md frontmatter:
─────────────────────────────────
context: inherit     ← 解析为 undefined → 默认为 inline
allowed-tools:
  - Bash(curl*)       ← 限制 Bash 工具
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
─────────────────────────────────
```

### 2.3 执行流程分析

```
1. /a-share-data 贵州茅台
       │
       ▼
2. CLI 调用 executeSkillCommand('a-share-data', '贵州茅台')
       │
       ▼
3. createSkillCommand() 创建 SkillCommand
       │
       ▼
4. getPromptForCommand() 返回 SKILL.md 内容
   - containsShellCommands() 检查 → FALSE (因为是 ```bash)
   - Shell 命令不会被预执行
   - 内容原样传递给 Agent
       │
       ▼
5. Agent 收到包含 ```bash 代码块的提示
       │
       ▼
6. Agent 需要调用 Bash tool 执行 python3 命令
       │
       ▼
7. ??? 问题可能在这里
```

---

## 三、Loucode vs Upup 关键差异

### 3.1 Shell 执行集成

| 功能 | Loucode | Upup |
|------|---------|------|
| Shell 执行方式 | BashTool.call() | exec() |
| 权限系统集成 | ✅ 完整 | ❌ 无 |
| alwaysAllowRules | ✅ 支持 | ❌ 不支持 |
| 沙箱 | ✅ 支持 | ❌ 不支持 |
| 输出存储 | ✅ toolResultStorage | ❌ 直接返回 |

### 3.2 context 字段处理

**Loucode**:
```typescript
// executeShellCommandsInPrompt 有特殊处理
if (loadedFrom !== 'mcp') {
  finalContent = await executeShellCommandsInPrompt(
    finalContent,
    { ...toolUseContext, alwaysAllowRules: allowedTools },
    `/${skillName}`,
    shell
  );
}
```

**Upup**:
```typescript
// promptShellExecution.ts 不接收 context 参数
export async function executeShellCommandsInPrompt(
  text: string,
  context?: unknown,  // ❌ 未使用
  slashCommandName?: string,
  shell?: { commands?: string[] },
): Promise<string>
```

### 3.3 执行模式选择

**Loucode**: 有 shouldUseForkMode() 自动判断
**Upup**: 有相同的 shouldUseForkMode() 实现，但未被 executeSkillCommand 使用

---

## 四、问题分类

### 4.1 架构问题 (需重构)

| 问题 | 影响 | 严重性 |
|------|------|--------|
| promptShellExecution 使用 exec() 而非 BashTool | 权限系统失效 | 高 |
| 缺少 toolPermissionContext 集成 | 工具限制失效 | 高 |
| 缺少 alwaysAllowRules 支持 | allowed-tools 无效 | 高 |

### 4.2 配置问题 (SKILL.md)

| 问题 | 说明 |
|------|------|
| `context: inherit` | 应改为 `fork` 或 `inline` |
| `allowed-tools` | 限制了工具，但执行时未应用 |

### 4.3 执行问题 (运行时)

| 可能原因 | 说明 |
|----------|------|
| akshare 网络请求失败 | 测试显示连接问题 |
| Python 环境问题 | akshare 依赖缺失 |
| Agent 未能调用 Bash | LLM 理解问题 |

---

## 五、修复计划

### P6: 重构 promptShellExecution (高优先级)

```typescript
// src/skills/promptShellExecution.ts
// 需要集成 BashTool 而非使用 exec()

import { BashTool } from '../tools/bash/bash-tool.ts';

async function executeCommand(
  command: string,
  context?: ToolUseContext
): Promise<ShellExecutionResult> {
  // Use BashTool.call() instead of exec()
  const bashTool = new BashTool();
  const result = await bashTool.call({ command }, context);
  return {
    stdout: result.data.stdout || '',
    stderr: result.data.stderr || '',
    exitCode: result.data.interrupted ? 1 : 0,
  };
}
```

### P7: 集成 toolPermissionContext

```typescript
// 在 getPromptForCommand 中传递 allowedTools
if (containsShellCommands(finalContent)) {
  finalContent = await executeShellCommandsInPrompt(
    finalContent,
    {
      ...context,
      toolPermissionContext: {
        alwaysAllowRules: {
          command: skill.allowedTools,  // 应用 allowed-tools
        },
      },
    },
    `/${skill.name}`,
    skill.shell
  );
}
```

### P8: 修复 SKILL.md 配置

```yaml
# 建议修改
context: fork  # 使用 fork 模式隔离执行
# 或
context: inline  # 使用 inline 模式
```

---

## 六、验证清单

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 检查 BashTool 是否可用 | tool exists |
| 2 | 测试 agent 能否调用 Bash | bash call succeeds |
| 3 | 测试 akshare 网络 | http request works |
| 4 | 验证 promptShellExecution 集成 | uses BashTool |

---

## 七、进度总结

| 阶段 | 任务 | 状态 |
|------|------|------|
| P1 | 扩展 SKILL_DIRECTORIES | ✅ 完成 |
| P2 | 添加 'agent' SkillSource | ✅ 完成 |
| P3 | 测试外部 skills 发现 | ✅ 完成 |
| P4 | 验证 /a-share-data 执行 | ✅ 完成 |
| P5 | 错误诊断增强 | ✅ 完成 |
| P6 | 重构 promptShellExecution | ⏳ 待实施 |
| P7 | 集成 toolPermissionContext | ⏳ 待实施 |
| P8 | 修复 SKILL.md 配置 | ⏳ 待实施 |

### 总体进度: 65%

核心问题已定位，修复方案已明确。
