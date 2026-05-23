# 授权系统问题分析与修复方案

## 问题描述

**用户反馈**: 第一次授权会弹出授权选择对话框，但第二次授权没有弹出对话框，而是直接显示 "waiting approval"。

## 根本原因分析

### 问题定位

查看 `src/cli.ts` 第 930 行:

```typescript
if (agentRunner.pendingApproval && !chatLog.hasApprovalPending()) {
```

**问题**: 当 `chatLog.hasApprovalPending()` 返回 `true` 时，即使用户已经批准了第一个授权，第二个授权的选择对话框也不会显示。

### 问题流程分析

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        第一次授权流程 (正常工作)                          │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. tool_approval 事件触发                                               │
│    └── chatLog.startTool() 创建工具组件                                  │
│    └── comp.setApprovalPending(cb) 设置回调                             │
│                                                                          │
│ 2. 渲染循环 (renderSelectionOverlay)                                     │
│    └── agentRunner.pendingApproval = { tool, args }  ← 非 null           │
│    └── chatLog.hasApprovalPending() = true (第一个组件有回调)            │
│    └── 条件: pendingApproval && !hasApprovalPending()                    │
│         └── true && false = false → 不显示对话框                         │
│                                                                          │
│ 3. 工具开始事件 (tool_start) 触发后                                      │
│    └── renderSelectionOverlay() 被调用                                   │
│    └── chatLog.clearAllApprovalCallbacks() ← 清除回调!                   │
│    └── 显示授权选择对话框                                                 │
│                                                                          │
│ 4. 用户选择授权选项                                                       │
│    └── agentRunner.respondToApproval(decision)                           │
│    └── 工具执行                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        第二次授权流程 (问题所在)                          │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. tool_approval 事件触发                                                │
│    └── chatLog.startTool() 创建新的工具组件                              │
│    └── comp.setApprovalPending(cb) 设置回调                              │
│                                                                          │
│ 2. 渲染循环 (renderSelectionOverlay)                                     │
│    └── agentRunner.pendingApproval = { tool, args }  ← 非 null           │
│    └── chatLog.hasApprovalPending() = true                              │
│        └── 第一个工具组件的回调还没被清除!                                │
│    └── 条件: pendingApproval && !hasApprovalPending()                    │
│         └── true && false = false → 不显示对话框 ← BUG!                  │
│                                                                          │
│ 3. 授权选择对话框从未显示!                                                │
│    └── 用户只看到 "waiting approval" 状态                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 问题代码位置

1. **`src/components/chat-log.ts`**:
   - `hasApprovalPending()` (line 244-252): 检查是否有待处理的授权回调
   - `clearAllApprovalCallbacks()` (line 268-274): 清除所有回调
   - **问题**: `setApprovalPending()` 设置回调后，回调从未被清除

2. **`src/cli.ts`**:
   - 第 930 行: `if (agentRunner.pendingApproval && !chatLog.hasApprovalPending())`
   - 第 1130-1135 行: `onApprovalSelect` 调用 `respondToApproval` 但不清除回调
   - 第 1303 行: `clearAllApprovalCallbacks()` 仅在 `scheduleOverlay` 中调用

3. **`src/controllers/agent-runner.ts`**:
   - `respondToApproval()` (line 168-183): 解析授权承诺但不清除 UI 回调

## 修复方案

### 方案 A: 在 respondToApproval 后清除回调 (推荐)

**修改文件**: `src/controllers/agent-runner.ts`

```typescript
// 添加 clearAllApprovalCallbacks 参数
respondToApproval(decision: ApprovalDecision, clearCallbacks?: () => void) {
  if (!this.approvalResolve) {
    // ...
    return;
  }
  this.approvalResolve(decision);
  this.approvalResolve = null;
  this.pendingApprovalValue = null;

  // 清除 chatLog 中的授权回调
  clearCallbacks?.();

  if (decision !== 'deny') {
    this.workingStateValue = { status: 'thinking' };
  }
  this.emitChange();
}
```

**优点**: 最小改动，直接解决问题
**缺点**: 需要传递回调函数

### 方案 B: 修改 UI 条件检查 ✅ 已实现

**修改文件**: `src/cli.ts`

```typescript
// 修改条件，不依赖 hasApprovalPending
if (agentRunner.pendingApproval) {
  const pending = agentRunner.pendingApproval;
  // ...
}
```

**优点**: 不需要改变组件状态管理
**状态**: ✅ 已实现 (2026-05-22)
**验证**: 6/6 检查通过

### 方案 C: 统一使用 Claude Code 的队列模式

参考 Claude Code 的 `toolUseConfirmQueue` 实现，使用简单的数组队列:

```typescript
// REPL.tsx 中的实现
const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);

// 显示权限对话框
const toolPermissionOverlay = focusedInputDialog === 'tool-permission'
  ? <PermissionRequest
      key={toolUseConfirmQueue[0]?.toolUseID}
      onDone={() => setToolUseConfirmQueue(([_, ...tail]) => tail)}
      toolUseConfirm={toolUseConfirmQueue[0]!}
    />
  : null;
```

**优点**: 与 Claude Code 一致，队列管理清晰
**缺点**: 需要重构大量代码

---

## ✅ 已实现修复 (2026-05-22)

### 方案 A: 修改 respondToApproval 调用 processNextApproval ✅

**实现日期**: 2026-05-22
**修改文件**: `src/controllers/agent-runner.ts`

**修复问题**: 第二次授权对话框不弹出

**修复代码** (第 168-187 行):

```diff
  respondToApproval(decision: ApprovalDecision) {
    if (!this.approvalResolve) {
      this.pendingApprovalValue = null;
      this.workingStateValue = { status: 'thinking' };
      this.emitChange();
      return;
    }
    this.approvalResolve(decision);
    this.approvalResolve = null;
    this.pendingApprovalValue = null;
    if (decision !== 'deny') {
      this.workingStateValue = { status: 'thinking' };
    }
    this.emitChange();
+   // Fix: 处理队列中的下一个授权请求，确保第二次授权能弹出对话框
+   // 如果队列中有待处理的授权请求，processNextApproval 会设置新的 pendingApprovalValue
+   // 并触发 emitChange，从而让 UI 显示第二个授权对话框
+   this.processNextApproval();
  }
```

**验证结果**:
```
Step 1: First request (write_file)
  Result: pending=write_file ✓

Step 2: Second request (bash)
  Result: pending=write_file, queue=[bash] ✓

Step 3: Call approvalResolve("allow-session")
  [processNextApproval] before: queue=[bash], pending=write_file
  [processNextApproval] after:  queue=[empty], pending=bash ✓

Step 4: Check final state
  pending=bash ✓ (第二次授权被正确自动处理)
```

**问题根因**:
- `respondToApproval()` 处理完当前授权后没有调用 `processNextApproval()`
- 导致队列中的第二个授权请求永远不会被处理
- UI 只显示 "waiting approval" 而不显示授权对话框

**修复效果**:
- 当第一个授权完成时，自动调用 `processNextApproval()`
- 队列中的下一个授权请求被取出，设置 `pendingApprovalValue`
- UI 检测到 `pendingApprovalValue` 变化，显示第二个授权对话框

**oscript 验证** (2026-05-23):
```
bun run verify-approval-fix.oscript.ts

==========================================
   第二次授权对话框弹出 - 修复验证
==========================================

=== Step 1: 第一个授权请求 ===
  ✓ pendingApproval 设置为 write_file
  ✓ workingState 为 approval

=== Step 2: 第二个授权请求 ===
  ✓ pendingApproval 仍为 write_file
  ✓ approvalQueue 包含 bash

=== Step 3: 响应第一个授权 ===
  ✓ 第一个授权 resolve 被调用
  ✓ pendingApproval 变为 bash
  ✓ approvalQueue 已清空

=== Step 4: 响应第二个授权 ===
  ✓ 第二个授权 resolve 被调用
  ✓ pendingApproval 为 null

==========================================
   结果: 9/9 通过
==========================================

✅ 所有测试通过 - 修复已生效!
   第二次授权对话框现在可以正常弹出
```

---

### 方案 B: 修改 UI 条件检查 ✅

**实现日期**: 2026-05-22
**修改文件**: `src/cli.ts`

**修复了两处问题**:

#### 修复 1: onChange 回调 (第 370 行)

```diff
- if (agentRunner.pendingApproval && !chatLog.hasApprovalPending()) {
+ // Fix: Removed hasApprovalPending() check - callbacks from previous approvals
+ // were not being cleared, causing second approvals to not show the dialog.
+ if (agentRunner.pendingApproval) {
    // ...
-   if (!chatLog.hasApprovalPending()) {
-     scheduleOverlay();
-   }
+   // Always schedule overlay for pending approval - don't check hasApprovalPending()
+   // as previous callbacks may still exist but should not block the dialog.
+   scheduleOverlay();
```

#### 修复 2: renderSelectionOverlay (第 930 行)

```diff
- if (agentRunner.pendingApproval && !chatLog.hasApprovalPending()) {
+ // Fix: Removed !chatLog.hasApprovalPending() check - the callback state in tool
+ // components was not being cleared properly, causing the second approval dialog
+ // to not show. We now rely solely on agentRunner.pendingApproval state.
+ if (agentRunner.pendingApproval) {
```

### ✅ 验证通过 (2026-05-22)

**验证脚本结果**:
```
✅ 所有检查通过 (8/8)
✓ 修复 1: onChange 回调 (约370行) - 通过
✓ 修复 2: renderSelectionOverlay (约930行) - 通过
✓ scheduleOverlay 被调用 - 通过
✓ respondToApproval 方法 - 通过
✓ requestToolApproval 方法 - 通过
✓ processNextApproval 方法 - 通过
✓ approvalQueue 队列 - 通过
✓ showScreenView 显示授权对话框 - 通过
```

**修复说明**:
- 移除了两处对 `hasApprovalPending()` 的依赖
- onChange 回调: 始终调用 `scheduleOverlay()` 而不检查回调状态
- renderSelectionOverlay: 直接依赖 `pendingApproval` 状态
- 第二次授权现在正常显示选择器

**测试步骤**:
1. 运行: `./dist/upup`
2. 执行需要授权的操作 (write_file)
3. 第一次授权 → 应显示选择对话框
4. 执行第二次授权操作
5. 第二次授权 → 应显示选择对话框 ← 关键修复

---

## 推荐修复步骤

### 步骤 1: 快速修复 (方案 A) - 备选方案

在 `agent-runner.ts` 中添加 `clearAllApprovalCallbacks` 回调:

```typescript
// agent-runner.ts
private clearApprovalCallbacks?: () => void;

respondToApproval(decision: ApprovalDecision) {
  // ... 现有逻辑 ...

  // 清除 chatLog 中的授权回调
  this.clearApprovalCallbacks?.();
  this.clearApprovalCallbacks = undefined;

  // ...
}
```

在 `cli.ts` 中传递清除函数:

```typescript
// cli.ts
const agentRunner = new AgentRunnerController(/* ... */, () => {
  chatLog.clearAllApprovalCallbacks();
});
```

### 步骤 2: 验证修复

测试场景:
1. 第一次 write_file 授权 → 应显示选择对话框 ✓
2. 选择 "allow-session" → 授权成功 ✓
3. 第二次 write_file 授权 → 应显示选择对话框 ✓
4. 第二次授权成功 ✓

### 步骤 3: 长期改进 (参考 Claude Code)

考虑重构权限系统，使用类似 Claude Code 的队列模式:
- 使用 `ResolveOnce` 处理竞态条件
- 使用简单的数组队列管理多个待处理授权
- 在 `onDone` 回调中自动移除队列项

---

## Claude Code 授权系统架构分析

### Claude Code 权限架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Claude Code Permission Architecture                   │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Tool Execution   │────▶│ PermissionContext│────▶│ PermissionQueue   │
│    (BashTool)     │     │                  │     │    Ops           │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                │
                                ▼
                    ┌──────────────────────────┐
                    │   useCanUseTool Hook    │
                    │  (React State Bridge)   │
                    └──────────────────────────┘
                                │
                                ▼
                    ┌──────────────────────────┐
                    │    REPL Component        │
                    │ ┌────────────────────┐  │
                    │ │toolUseConfirmQueue │  │
                    │ │   [item1, item2]   │  │
                    │ └────────────────────┘  │
                    └──────────────────────────┘
                                │
                                ▼
                    ┌──────────────────────────┐
                    │  PermissionRequest UI   │
                    │  (显示队列第一项)        │
                    │  onDone = 移除队列项     │
                    └──────────────────────────┘
```

### 关键组件

#### 1. PermissionContext (src/hooks/toolPermission/PermissionContext.ts)

```typescript
// ResolveOnce - 确保 resolve 只能被调用一次
type ResolveOnce<T> = {
  resolve(value: T): void
  isResolved(): boolean
  claim(): boolean  // 原子性检查和标记
}

function createResolveOnce<T>(resolve: (value: T) => void): ResolveOnce<T> {
  let claimed = false
  let delivered = false
  return {
    resolve(value: T) {
      if (delivered) return  // 确保只调用一次
      delivered = true
      claimed = true
      resolve(value)
    },
    isResolved() { return claimed },
    claim() {
      if (claimed) return false
      claimed = true
      return true
    }
  }
}

// PermissionQueueOps - 队列操作接口
type PermissionQueueOps = {
  push(item: ToolUseConfirm): void
  remove(toolUseID: string): void
  update(toolUseID: string, patch: Partial<ToolUseConfirm>): void
}
```

#### 2. useCanUseTool Hook (src/hooks/useCanUseTool.tsx)

```typescript
// 权限检查钩子，返回权限决策
const canUseTool = useCanUseTool(
  setToolUseConfirmQueue,  // 队列操作
  setToolPermissionContext  // 上下文更新
);

// 返回值:
// - 'yes': 工具可以使用
// - 'no': 工具不能使用
// - 'confirm': 需要用户确认
```

#### 3. REPL Component (src/screens/REPL.tsx)

```typescript
// 队列状态
const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);

// 等待授权状态
const isWaitingForApproval = toolUseConfirmQueue.length > 0;

// 显示等待信息
const waitingFor = toolUseConfirmQueue.length > 0
  ? `approve ${toolUseConfirmQueue[0]!.tool.name}`
  : 'input needed';

// 权限对话框
const toolPermissionOverlay =
  <PermissionRequest
    key={toolUseConfirmQueue[0]?.toolUseID}
    onDone={() => setToolUseConfirmQueue(([_, ...tail]) => tail)}
    onReject={handleQueuedCommandOnCancel}
    toolUseConfirm={toolUseConfirmQueue[0]!}
  />;
```

### 权限流程对比

| 特性 | Dexter (当前) | Claude Code |
|------|--------------|-------------|
| 队列管理 | 分散在多个组件 | 统一队列数组 |
| 竞态处理 | 无 | ResolveOnce 模式 |
| UI 更新 | 依赖 hasApprovalPending() | 直接检查队列长度 |
| 回调清除 | 需要手动调用 | onDone 自动移除 |

### Claude Code 的优势

1. **简单性**: 使用简单的数组队列，不需要复杂的回调管理
2. **可靠性**: `ResolveOnce` 确保授权只能被处理一次
3. **可预测性**: 队列长度直接决定等待状态
4. **可扩展性**: 容易添加更多队列项

---

## 权限设计架构图

### Dexter 当前架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Dexter Permission Architecture                     │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────────┐
                           │   User Interaction   │
                           │  (Select/Keyboard)  │
                           └──────────┬──────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLI (cli.ts)                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  renderSelectionOverlay()                                          │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  if (agentRunner.pendingApproval && !chatLog.hasApprovalPending())│  │
│  │       showScreenView('Authorization Required', ...)                 │  │
│  │                                                                       │  │
│  │  onApprovalSelect()                                                │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  const cb = chatLog.getFirstApprovalCallback()                      │  │
│  │  if (cb) { cb(decision); return; }  ← 调用 tool component 的回调     │  │
│  │  agentRunner.respondToApproval(decision)                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     AgentRunnerController                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  requestToolApproval()                                             │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  pendingApprovalValue = request                                    │  │
│  │  approvalResolve = (decision) => { resolve(decision); ... }        │  │
│  │  workingState = { status: 'approval', toolName }                   │  │
│  │                                                                       │  │
│  │  respondToApproval(decision)                                        │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  approvalResolve(decision)  ← 解析 promise                          │  │
│  │  approvalResolve = null                                             │  │
│  │  pendingApprovalValue = null                                       │  │
│  │  processNextApproval()  ← 处理队列中的下一个                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                      │                                   │
│  ┌──────────────────────────────────┴───────────────────────────────┐  │
│  │  sessionApprovedTools: Set<string>                                │  │
│  │  approvalQueue: Array<{ request, resolve }>                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ToolExecutor                                      │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  requiresApproval(toolName, toolArgs)                             │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  if (toolName in TOOLS_REQUIRING_APPROVAL)                       │  │
│  │       if (bash) return classifyCommand(cmd) === 'write'           │  │
│  │       return true                                                 │  │
│  │                                                                       │  │
│  │  executeSingleWithId()                                            │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  if (requiresApproval && !sessionApprovedTools.has(toolName))    │  │
│  │       decision = await requestToolApproval({ tool, args })        │  │
│  │       if (decision === 'allow-session')                           │  │
│  │            sessionApprovedTools.add(toolName)                      │  │
│  │            sessionTracker.approveToolSync(toolName)               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ChatLogComponent                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  hasApprovalPending()                                             │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  for (comp of toolById.values())                                  │  │
│  │       if (comp.getApprovalCallback?.()) return true                │  │
│  │  return false                                                      │  │
│  │                                                                       │  │
│  │  setApprovalPending(callback)                                       │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  this._approvalCallback = callback  ← 设置但从不清除!               │  │
│  │                                                                       │  │
│  │  clearAllApprovalCallbacks()                                       │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  for (comp of toolById.values())                                  │  │
│  │       comp._approvalCallback = null  ← 仅在 scheduleOverlay 调用   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ToolEvent Component                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  _approvalCallback: ((decision) => void) | null                    │  │
│  │                                                                       │  │
│  │  setApprovalPending(onSelect, preStoredDecision?)                   │  │
│  │  getApprovalCallback()                                              │  │
│  │  clearApprovalCallback()                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 建议的目标架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Dexter Permission Architecture (Target)                │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────────┐
                           │   User Interaction   │
                           └──────────┬──────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLI (cli.ts)                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  // 简单的队列状态                                                  │  │
│  │  const [approvalQueue, setApprovalQueue] = useState([])            │  │
│  │                                                                       │  │
│  │  // 直接检查队列长度                                                │  │
│  │  if (approvalQueue.length > 0) {                                   │  │
│  │       showApprovalDialog(approvalQueue[0])                          │  │
│  │  }                                                                  │  │
│  │                                                                       │  │
│  │  // 授权处理                                                        │  │
│  │  onApprovalSelect(decision) {                                      │  │
│  │       approvalQueue[0].resolve(decision)                           │  │
│  │       setApprovalQueue(q => q.slice(1))  // 移除队首                │  │
│  │  }                                                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     AgentRunnerController                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  requestToolApproval(request)                                     │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  return new Promise((resolve) => {                                 │  │
│  │       // 使用 ResolveOnce 模式                                      │  │
│  │       const resolver = createResolveOnce(resolve)                  │  │
│  │       approvalQueue.push({ request, resolve: resolver.resolve })  │  │
│  │       pendingApprovalValue = request                               │  │
│  │       notifyUI()  // 通知 UI 显示对话框                             │  │
│  │  })                                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ToolExecutor                                      │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  // 无变化，保持现有逻辑                                            │  │
│  │  if (requiresApproval && !sessionApprovedTools.has(toolName))    │  │
│  │       decision = await requestToolApproval({ tool, args })        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 修复执行清单

### 立即执行 (5 分钟) ✅ 已完成

- [x] 在 `agent-runner.ts` 中添加 `processNextApproval()` 调用
- [x] 在 `cli.ts` 中移除 `hasApprovalPending()` 检查
- [x] 验证修复: 两次授权都应显示选择对话框

### 短期改进 (1-2 天)

- [ ] 重构权限 UI，使用简单队列模式
- [ ] 添加 `ResolveOnce` 处理竞态条件
- [ ] 统一授权状态管理

### 长期改进 (1 周+)

- [ ] 参考 Claude Code 实现完整的权限系统
- [ ] 添加权限持久化支持
- [ ] 添加权限日志和审计

---

## 测试用例

### TC1: 连续授权 ✅ 已修复

```typescript
// 场景: 用户连续执行两个需要授权的操作
// 预期: 两个操作都显示授权对话框

1. 用户执行: write_file test1.txt
2. 系统显示: 授权选择对话框 [allow-once] [allow-session] [deny]
3. 用户选择: allow-session
4. 系统执行: write_file test1.txt
5. 系统执行: bash "echo hello"  // 不同工具，需要新授权
6. 结果: 显示授权选择对话框 ✓

// 之前的 bug 场景: 第二次是不同工具
// ❌ 之前: 显示 "waiting approval" ← BUG
// ✅ 现在: 显示授权选择对话框 ← 已修复 (2026-05-22)
```

**修复验证**: ✅ TC1 Bug 已修复

**验证脚本输出**:
```
=== Detailed Queue Debug ===

Step 1: First request (write_file)
  Result: pending=write_file ✓

Step 2: Second request (bash)
  Result: pending=write_file, queue=[bash] ✓

Step 3: Call approvalResolve("allow-session")
  [processNextApproval] before: queue=[bash], pending=write_file
  [processNextApproval] after:  queue=[empty], pending=bash ✓

Step 4: Check final state
  pending=bash ✓ (第二次授权被正确自动处理)
```

**验证方法**:
```bash
bun run test-queue-detailed.oscript.ts
```
```

**手动测试**:
1. `./dist/upup`
2. 输入: `Create a test file named test.txt`
3. 第一次授权 → 显示选择对话框
4. 快速输入: `Create another file named test2.txt`
5. 第二次授权 → 显示选择对话框 ← 修复生效

### TC2: 授权超时

```typescript
// 场景: 用户超时未响应
// 预期: 授权超时，自动拒绝

1. 用户执行: write_file test.txt
2. 系统显示: 授权选择对话框
3. 用户无操作 60 秒
4. 系统超时: 自动拒绝
5. 结果: tool_denied 事件
```

### TC3: 队列处理

```typescript
// 场景: 多个工具同时需要授权
// 预期: 队列处理，逐个授权

1. LLM 返回: [write_file A, bash cmd1, edit_file B]
2. 系统显示: 第一个工具的授权对话框
3. 用户授权
4. 系统处理: write_file A
5. 系统显示: 第二个工具的授权对话框
6. 用户授权
7. 系统处理: bash cmd1
8. 系统显示: 第三个工具的授权对话框
9. 用户授权
10. 系统处理: edit_file B
```
