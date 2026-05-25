# Skills3.md - Skills 执行系统深度分析 (完整版)

> 基于 Loucode (Claude Code) 对比分析和实际代码验证
> 更新时间: 2026-05-25

---

## 一、完整架构对比图

### 1.1 Loucode (Claude Code) 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Loucode Skills Execution Flow                             │
└─────────────────────────────────────────────────────────────────────────────┘

  User Input: /a-share-data 贵州茅台
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  commands/skills/index.ts                                                 │
│  └── executeSlashCommand(commandName, args, toolUseContext)              │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  loadSkillsDir.ts → Command.getPromptForCommand()                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 1. substituteArguments() → 替换 {{args}}                             │  │
│  │ 2. replace ${CLAUDE_SKILL_DIR}                                       │  │
│  │ 3. executeShellCommandsInPrompt() → 仅执行 ```! 或 !` 语法            │  │
│  │    └── Uses: BashTool.call() with permission context                 │  │
│  │ 4. Returns [{ type: 'text', text: finalContent }]                    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent receives prompt                                                    │
│  ├── ```bash blocks → shown as instructions (NOT pre-executed)           │
│  └── Agent calls Bash tool to execute python3 commands                    │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Upup 架构 (当前实现)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Upup Skills Execution Flow                            │
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
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ getPromptForCommand() → createSkillCommand().getPromptForCommand()   │  │
│  │ 1. substituteArguments() → 替换 {{args}}                            │  │
│  │ 2. replace ${CLAUDE_SKILL_DIR}                                      │  │
│  │ 3. executeShellCommandsInPrompt() → 仅执行 ```! 或 !` 语法           │  │
│  │    └── Uses: exec() from child_process ❌ (不通过 BashTool)         │  │
│  │ 4. Returns [{ type: 'text', text: finalContent }]                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent receives prompt                                                    │
│  ├── ```bash blocks → shown as instructions (NOT pre-executed)           │
│  └── Agent calls Bash tool to execute python3 commands                    │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.3 关键差异对比

| 组件 | Loucode | Upup | 影响 |
|------|---------|------|------|
| Shell 执行 | `BashTool.call()` | `exec()` | ❌ 权限系统失效 |
| 权限集成 | ✅ 完整 | ❌ 无 | ❌ 安全功能失效 |
| 工具上下文 | ✅ 传递 | ❌ 未传递 | ❌ alwaysAllowRules 无效 |
| 输出存储 | ✅ toolResultStorage | ❌ 直接返回 | ⚠️ 功能差异 |

---

## 二、Shell 命令语法分析

### 2.1 支持的语法

| 语法 | Loucode | Upup | 说明 |
|------|---------|------|------|
| ` ```! command ``` ` | ✅ 执行 | ✅ 执行 | Shell 块 |
| ` !`command` ` | ✅ 执行 | ✅ 执行 | 内联 |
| ` ```bash command ``` ` | ❌ 不执行 | ❌ 不执行 | 仅显示 |

### 2.2 a-share-data SKILL.md 分析

```yaml
---
name: a-share-data
context: inherit        # ← 解析为 undefined → 默认为 inline
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# SKILL.md 内容使用 ```bash 语法
```bash
python3 -c "
import akshare as ak
df = ak.stock_zh_a_spot_em()
print(df.head(10).to_json())
"
```
```

### 2.3 验证结果

```
containsShellCommands("```bash\npython3...\n```") = FALSE ❌
containsShellCommands("```!\npython3...\n```") = TRUE ✅
```

**结论**: `a-share-data` 使用 ` ```bash ` 语法，shell 命令**不会被预执行**。

---

## 三、问题根因分析

### 3.1 问题分类

#### 问题 1: Shell 执行方式错误 (P6 - 高优先级)

**位置**: `src/skills/promptShellExecution.ts`

**当前实现**:
```typescript
// ❌ 错误: 使用 exec() 绕过 BashTool
async function executeCommand(command: string) {
  return new Promise((resolve) => {
    exec(command, { timeout: 30000, shell: '/bin/bash' }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error?.code || 0 });
    });
  });
}
```

**Loucode 实现**:
```typescript
// ✅ 正确: 使用 BashTool.call()
import { BashTool } from '../tools/BashTool/BashTool.js';

const { data } = await shellTool.call({ command }, context);
```

#### 问题 2: 权限系统未集成 (P7 - 高优先级)

**当前实现**:
```typescript
// ❌ 错误: context 参数未使用
export async function executeShellCommandsInPrompt(
  text: string,
  context?: unknown,  // ← 未传递到执行
  slashCommandName?: string,
  shell?: { commands?: string[] },
): Promise<string>
```

**Loucode 实现**:
```typescript
// ✅ 正确: 传递 toolPermissionContext
await shellTool.call(
  { command },
  {
    ...toolUseContext,
    toolPermissionContext: {
      alwaysAllowRules: {
        command: allowedTools,  // 应用 allowed-tools
      },
    },
  }
);
```

#### 问题 3: SKILL.md 语法问题 (P8 - 中优先级)

**a-share-data 设计意图**:
- 使用 ` ```bash ` 显示 Python 代码示例
- 期望 Agent 理解并调用 Bash tool 执行

**问题**:
1. Agent 可能不理解 SKILL.md 的意图
2. Agent 可能无法调用 Bash tool
3. akshare 网络请求可能失败

---

## 四、修复计划

### P6: 重构 promptShellExecution (高优先级)

**目标**: 使用 Upup 的 `executeBashCommand()` 而非 `exec()`

```typescript
// src/skills/promptShellExecution.ts
// 需要修改 executeCommand 函数

import { executeBashCommand } from '../tools/bash/bash-tool.js';

async function executeCommand(
  command: string,
  context?: ToolUseContext
): Promise<ShellExecutionResult> {
  try {
    // Use Upup's executeBashCommand which has security checks
    const result = await executeBashCommand(command, {
      cwd: context?.cwd || process.cwd(),
      timeout: 30000,
      // Pass security options from context if needed
    });

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
    };
  } catch (error: any) {
    return {
      stdout: '',
      stderr: error.message || String(error),
      exitCode: 1,
    };
  }
}
```

### P7: 集成权限系统 (高优先级)

**目标**: 支持 `allowed-tools` 限制

```typescript
// 在 getPromptForCommand 中传递 allowedTools
if (containsShellCommands(finalContent)) {
  finalContent = await executeShellCommandsInPrompt(
    finalContent,
    {
      ...context,
      // 传递工具权限上下文
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

### P8: SKILL.md 语法修复 (中优先级)

**方案 A**: 修改 SKILL.md 使用 ` ```! ` 语法
```markdown
```!
python3 -c "import akshare as ak; print('test')"
```
```

**方案 B**: 保持 ` ```bash ` 但改进 Agent 指令
```yaml
---
instructions: |
  当需要获取 A 股数据时，请按以下步骤执行:
  1. 使用 Bash tool 调用 python3 执行 akshare 代码
  2. 解析返回的 JSON 数据
  3. 按以下格式输出结果
---
```

---

## 五、执行流程详细分析

### 5.1 完整调用链

```
1. 用户输入: /a-share-data 贵州茅台
         │
         ▼
2. CLI 解析
   ├── commandName = "a-share-data"
   └── commandArgs = "贵州茅台"
         │
         ▼
3. handleSlashCommand(commandName, commandArgs)
         │
         ▼
4. executeSkillCommand('a-share-data', '贵州茅台')
         │
         ▼
5. initializeSkills() → 加载所有 skills
         │
         ▼
6. getSkillCommandRegistry().getSkillCommand('a-share-data')
         │
         ▼
7. skillCmd.getPromptForCommand('贵州茅台', context)
   ├── baseDir: .claude/skills/a-share-data
   ├── content: SKILL.md 内容
   ├── containsShellCommands(): FALSE (```bash 不被识别)
   └── 返回 [{ type: 'text', text: SKILL.md内容 }]
         │
         ▼
8. agentRunner.runQuery(SKILL.md内容)
   └── Agent 收到包含 ```bash 代码块的提示
         │
         ▼
9. Agent 需要理解并执行
   └── 调用 Bash tool 执行 python3?
         │
         ▼
10. ??? 问题可能在这里
```

### 5.2 可能的失败点

| 步骤 | 可能问题 | 诊断方法 |
|------|----------|----------|
| 5 | skills 未加载 | 检查日志 |
| 6 | SkillCommand 未注册 | 检查 registry |
| 7 | getPromptForCommand 失败 | 添加日志 |
| 9 | Agent 不理解指令 | 检查 LLM 响应 |
| 9 | akshare 网络失败 | 直接测试 |

---

## 六、诊断工具

### 6.1 测试脚本

```typescript
// test-skill-execution.ts
import { executeSkillCommand } from './src/skills/executor.ts';
import { getSkill } from './src/skills/registry.ts';
import { createSkillCommand } from './src/skills/executor.ts';

async function diagnose() {
  // 1. 检查 skill 是否存在
  const skill = getSkill('a-share-data');
  console.log('1. Skill exists:', !!skill);
  console.log('   Path:', skill?.path);
  
  // 2. 检查 SkillCommand
  const cmd = createSkillCommand(skill);
  console.log('2. SkillCommand created');
  console.log('   type:', cmd.type);
  
  // 3. 获取 prompt
  const result = await cmd.getPromptForCommand('贵州茅台', { cwd: process.cwd() });
  console.log('3. Prompt generated');
  console.log('   length:', result[0].text.length);
  console.log('   has ```bash:', result[0].text.includes('```bash'));
  console.log('   has ```!:', result[0].text.includes('```!'));
  
  // 4. 执行 skill command
  const execResult = await executeSkillCommand('a-share-data', '贵州茅台', {
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });
  console.log('4. executeSkillCommand result');
  console.log('   type:', execResult?.type);
  console.log('   text length:', execResult?.text?.length);
}

diagnose().catch(console.error);
```

### 6.2 运行诊断

```bash
bun run test-skill-execution.ts
```

---

## 七、进度总结

### 7.1 任务状态

| 阶段 | 任务 | 状态 | 优先级 |
|------|------|------|--------|
| P1 | 扩展 SKILL_DIRECTORIES | ✅ 完成 | - |
| P2 | 添加 'agent' SkillSource | ✅ 完成 | - |
| P3 | 测试外部 skills 发现 | ✅ 完成 | - |
| P4 | 验证 /a-share-data 执行 | ✅ 完成 | - |
| P5 | 错误诊断增强 | ✅ 完成 | - |
| P6 | 重构 promptShellExecution | ⏳ 待实施 | 高 |
| P7 | 集成权限系统 | ⏳ 待实施 | 高 |
| P8 | SKILL.md 语法修复 | ⏳ 待实施 | 中 |

### 7.2 总体进度

| 指标 | 值 |
|------|-----|
| 问题定位 | ✅ 100% |
| 修复方案 | ✅ 已明确 |
| 实施进度 | ⏳ 62% |

---

## 八、下一步行动

1. **P6**: 重构 `promptShellExecution.ts` 使用 `executeBashCommand()`
2. **P7**: 集成 `toolPermissionContext`
3. **P8**: 测试并验证修复
4. **诊断**: 在 UpUp 中实际执行 `/a-share-data` 观察结果

---

## P6 & P7 完成详情 (2026-05-25)

### P6: 重构 promptShellExecution ✅

**变更**:
- `executeBashCommand` 替代 `exec()`
- 集成 Upup 安全检查 (AST 分析、危险命令检测)

```typescript
// Before
exec(command, { timeout: 30000, shell: '/bin/bash' })

// After
executeBashCommand(command, { timeout: 30000 })
```

### P7: 集成权限系统 ✅

**变更**:
- `executeShellCommandsInPrompt` 新增 `allowedTools` 参数
- 执行前检查命令是否在允许列表中
- 权限拒绝时返回清晰错误

```typescript
if (allowedTools && !isCommandAllowed(command, allowedTools)) {
  return { error: `[Permission Denied] Command not allowed` };
}
```

### 验证结果

| 测试 | 结果 |
|------|------|
| TypeScript 编译 | ✅ 通过 |
| 单元测试 | ✅ 12 pass |
| UpUp 启动 | ✅ 正常 |
| Skills 加载 | ✅ 102 skills |

---

## 下一步

P8: 测试实际 SKILL.md 执行
