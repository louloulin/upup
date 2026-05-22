# 授权系统问题分析与修复计划

## 问题描述

用户反馈：选择 "Yes, allow all this session" 后，第二次创建文件仍然弹出授权页面。

## 问题根源分析

### 现状：存在三个独立的权限系统

#### 1. Tool Executor Approval（工具执行器授权）
**位置**: `src/agent/tool-executor.ts`

```typescript
const TOOLS_REQUIRING_APPROVAL = ['write_file', 'edit_file'] as const;
```

- **覆盖范围**: 仅 `write_file` 和 `edit_file`
- **会话级别批准**: 使用 `sessionApprovedTools: Set<string>` 跟踪
- **"allow-session" 行为**: 将 `write_file` 和 `edit_file` 添加到 `sessionApprovedTools`

#### 2. Hook Permission Gate（钩子权限门控）
**位置**: `src/hooks/permission-hooks.ts`

```typescript
requiresPermission(toolName: string): boolean {
  return ['write_file', 'edit_file', 'bash', 'delete_file'].includes(toolName);
}
```

- **覆盖范围**: `write_file`, `edit_file`, `bash`, `delete_file`
- **默认行为**: 无显式规则时返回 `allowed: true`
- **与会话批准的关系**: 独立系统，未连接

#### 3. Bash Permission Mode（Bash 权限模式）
**位置**: `src/tools/bash/permission-mode.ts`

```typescript
// 命令分类的默认权限
export const DEFAULT_PERMISSION_MODES: Record<CommandClassification, PermissionMode> = {
  read: 'bypass',   // 只读命令默认允许
  write: 'ask',      // 写命令需要确认
  unknown: 'ask',    // 未知命令需要确认
};
```

- **覆盖范围**: Bash 命令，基于命令分类
- **"ask" 模式**: 写类命令 (`touch`, `mkdir`, `cp` 等) 需要用户确认
- **与 sessionApprovedTools 的关系**: 完全独立，未连接

### 问题场景

1. **第一次操作**: `创建1111.md` → `write_file` → 弹出授权对话框 → 用户选择 "allow-session"
2. **会话批准存储**: `write_file` 和 `edit_file` 被添加到 `sessionApprovedTools`
3. **第二次操作**: `创建xxx13.md` → `Bash(touch xxx13.md)` → 再次弹出授权！

**根本原因**: 第二次是 Bash 命令，它的权限检查使用 Bash Permission Mode 系统，与 session 批准系统完全独立！

### 验证代码流程

```typescript
// tool-executor.ts:170-172
if (this.requiresApproval(toolName) && !this.sessionApprovedTools.has(toolName)) {
  // 只有 write_file/edit_file 会进入这里
}

// Bash 命令的权限检查在 bash-tool.ts 内部
// 与 tool-executor 的 sessionApprovedTools 完全无关
```

## 修复方案

### 方案 A：统一权限系统（推荐）

**核心思想**: 让所有写操作共享同一个会话批准状态

1. **扩展 `TOOLS_REQUIRING_APPROVAL`**:
   ```typescript
   const TOOLS_REQUIRING_APPROVAL = ['write_file', 'edit_file', 'bash', 'delete_file'] as const;
   ```

2. **修改 `requiresApproval` 逻辑**:
   - 不仅检查工具名称
   - 还要检查 Bash 命令的分类（如果是 `write` 分类）

3. **Bash 工具集成**:
   - 当 Bash 命令执行前，调用 `requestToolApproval`
   - 将结果存储到 `sessionApprovedTools`

### 方案 B：独立批准 Bash 写命令

**核心思想**: 保持系统分离，但让 Bash 写命令也支持 "allow-session"

1. **扩展 `TOOLS_REQUIRING_APPROVAL`** 包括所有写类 Bash 命令模式
2. **在 `tool-executor` 中处理 Bash 命令的特殊情况**

### 方案 C：创建统一的权限管理层

**核心思想**: 创建一个中央权限管理器，所有权限决策通过它

```typescript
class PermissionManager {
  private sessionApproved: Set<string> = new Set();

  requestApproval(toolName: string, args?: Record<string, unknown>): Promise<ApprovalDecision>;
  isApproved(toolName: string): boolean;
  approveForSession(toolName: string): void;
}
```

## 推荐方案

**方案 A**：扩展 `TOOLS_REQUIRING_APPROVAL` 并在 `tool-executor` 中处理 Bash 命令

### 实现步骤

1. **修改 `tool-executor.ts`**:
   - 将 `bash` 添加到需要批准的工具有效列表
   - 在批准流程中检查 Bash 命令是否是写操作

2. **修改 `agent-runner.ts`**:
   - 确保 `sessionApprovedTools` 同步到所有相关系统

3. **修改 `session-tracker.ts`**:
   - 支持按命令模式批准（如 `bash:write:*`）

4. **测试验证**:
   - write_file → allow-session → write_file 应该不再提示
   - Bash touch → allow-session → Bash touch 应该不再提示
   - 混合操作：write_file allow-session → Bash touch 应该不再提示

## 涉及文件

- `src/agent/tool-executor.ts` - 核心批准逻辑
- `src/controllers/agent-runner.ts` - 会话工具批准跟踪
- `src/session/session-tracker.ts` - 持久化批准状态
- `src/tools/bash/bash-tool.ts` - Bash 工具权限检查
- `src/tools/bash/permission-mode.ts` - Bash 权限模式
- `src/hooks/permission-hooks.ts` - 钩子权限系统
- `src/cli.ts` - UI 授权流程
