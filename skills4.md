# Skills 执行问题分析与修复计划

> 日期: 2026-05-27
> 状态: ✅ 已完成

---

## 问题分析

### 1. 当前症状

用户执行 `/a-share-fund 搜索基金` 时：
1. 命令被识别并执行
2. Skill prompt 被生成
3. **Shell 命令未执行** - 仍保留 ` ```bash ` 代码块标记
4. 最终返回给 Agent 的是未执行的代码块

### 2. 根本原因

**promptShellExecution.ts 中的代码块匹配模式问题**

| 当前支持的模式 | 描述 |
|---------------|------|
| ` ```! ` | Loucode 风格 shell 块 |
| `!`command`` | Loucode 风格内联 |
| ` ```!ps ` | PowerShell 块 |
| `!ps`command`` | PowerShell 内联 |

| 缺失的模式 | 描述 |
|------------|------|
| ` ```bash ` | **标准 markdown bash 块** |
| ` ```shell ` | 其他 shell 变体 |

**正则表达式**:
```typescript
// 当前只匹配 ```! 语法
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g;

// 缺失 ```bash 语法支持
```

### 3. Loucode 的实现方式

Loucode Claude Code 使用 ` ```! ` 作为 shell 命令标记：
- ` ```! command ``` ` - 代码块形式
- `!`command`` - 内联形式

这与标准 markdown 的 ` ```bash ` 不同。

---

## 修复方案

### 方案: 添加 ```bash 兼容模式

**修改文件**: `src/skills/promptShellExecution.ts`

**修改内容**:

1. **添加新的正则模式**:
```typescript
// 标准 markdown bash 代码块
const BASH_BLOCK_PATTERN = /```bash\s*\n?([\s\S]*?)\n?```/gi;

// 标准 markdown shell 代码块
const SHELL_BLOCK_PATTERN = /```shell\s*\n?([\s\S]*?)\n?```/gi;
```

2. **更新 executeShellCommandsInPrompt 函数**:
```typescript
// 添加 bash 代码块匹配
const bashBlockRegex = new RegExp(BASH_BLOCK_PATTERN.source, 'gi');
while ((match = bashBlockRegex.exec(text)) !== null) {
  const command = match[1]?.trim();
  if (command) {
    matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
  }
}

// 添加 shell 代码块匹配
const shellBlockRegex = new RegExp(SHELL_BLOCK_PATTERN.source, 'gi');
while ((match = shellBlockRegex.exec(text)) !== null) {
  const command = match[1]?.trim();
  if (command) {
    matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
  }
}
```

3. **更新 containsShellCommands 函数**:
```typescript
export function containsShellCommands(text: string): boolean {
  return text.includes('!`') ||
         text.includes('```!') ||
         text.includes('```bash') ||
         text.includes('```shell') ||
         text.includes('!ps`') ||
         text.includes('```!ps');
}
```

---

## 实施步骤

### Step 1: 添加正则模式 (P0)

在 `promptShellExecution.ts` 顶部添加新的模式常量：

```typescript
// 标准 markdown bash 代码块 (兼容模式)
const BASH_BLOCK_PATTERN = /```bash\s*\n?([\s\S]*?)\n?```/gi;

// 标准 markdown shell 代码块 (兼容模式)
const SHELL_BLOCK_PATTERN = /```shell\s*\n?([\s\S]*?)\n?```/gi;
```

### Step 2: 更新匹配逻辑 (P0)

在 `executeShellCommandsInPrompt` 函数中添加新的匹配逻辑：

```typescript
// 找到 "Find bash block matches" 部分
// 添加:
if (text.includes('```bash')) {
  const bashBlockRegex = new RegExp(BASH_BLOCK_PATTERN.source, 'gi');
  while ((match = bashBlockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
    }
  }
}

if (text.includes('```shell')) {
  const shellBlockRegex = new RegExp(SHELL_BLOCK_PATTERN.source, 'gi');
  while ((match = shellBlockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
    }
  }
}
```

### Step 3: 更新检测函数 (P0)

修改 `containsShellCommands`:

```typescript
export function containsShellCommands(text: string): boolean {
  return text.includes('!`') ||
         text.includes('```!') ||
         text.includes('```bash') ||
         text.includes('```shell') ||
         text.includes('!ps`') ||
         text.includes('```!ps');
}
```

### Step 4: 更新提取函数 (P0)

修改 `extractShellCommands` 函数，添加相同的匹配逻辑。

### Step 5: 测试验证 (P1)

创建测试脚本验证：
- ` ```bash ` 代码块正确执行
- ` ```! ` 代码块继续工作
- 内联命令 `!`command`` 继续工作
- 权限检查正常工作

---

## 架构对比

### Loucode 风格

```
 ```! command ```  → 执行
!`command`        → 执行
```bash command ``` → 不执行 (不识别)
```

### UpUp 当前

```
 ```! command ```  → 执行
!`command`        → 执行
```bash command ``` → 不执行 (不识别) ← 问题
```

### UpUp 修复后

```
 ```! command ```  → 执行
!`command`        → 执行
```bash command ``` → 执行 ← 新增
```shell command ``` → 执行 ← 新增
```

---

## 验证清单

- [x] ` ```bash ` 代码块被正确识别
- [x] ` ```shell ` 代码块被正确识别
- [x] ` ```! ` 代码块继续工作
- [x] 权限检查正常工作
- [x] Shell 命令输出正确替换
- [x] 错误信息正确显示
- [x] 与现有 skill 兼容

## 实施状态

✅ **已完成** (2026-05-27)

### 修改文件
- `src/skills/promptShellExecution.ts`

### 新增模式
```typescript
// 标准 markdown bash 代码块 (兼容模式)
const BASH_BLOCK_PATTERN = /```bash\s*\n?([\s\S]*?)\n?```/gi;

// 标准 markdown shell 代码块 (兼容模式)
const SHELL_BLOCK_PATTERN = /```shell\s*\n?([\s\S]*?)\n?```/gi;
```

### 测试结果
```
✅ Standard bash block: detected=true, extracted=1 commands
✅ Standard shell block: detected=true, extracted=1 commands
✅ Loucode bash block: detected=true, extracted=1 commands
✅ Inline bash: detected=true, extracted=1 commands
✅ No shell commands: detected=false, extracted=0 commands
5 passed, 0 failed
```

---

## 相关文件

| 文件 | 修改 |
|------|------|
| `src/skills/promptShellExecution.ts` | 添加 ```bash/```shell 模式支持 |

---

## 参考

- Loucode Claude Code: `/Users/louloulin/Documents/linchong/claw/loucode/src/utils/promptShellExecution.ts`
- UpUp 当前实现: `src/skills/promptShellExecution.ts`
