# 授权系统深度分析文档

> 更新日期：2026-05-22
> 分支：feature/permissions
> 状态：**问题根因已定位**

---

## 一、问题现象

```
第一次授权：✓ 正常弹出 Select 选择器
第二次授权：✗ 显示 "Waiting for approval..." 但没有弹出选择器
```

---

## 二、问题根因分析

### 2.1 问题定位

经过深入分析，发现问题出在 **UI 渲染逻辑与授权队列的时序问题**。

### 2.2 当前代码流程分析

#### 关键代码位置

**`agent-runner.ts` - 授权请求队列管理：**

```typescript
private requestToolApproval = (request) => {
  return new Promise((resolve) => {
    // 如果已有 pendingApproval，加入队列
    if (this.pendingApprovalValue !== null) {
      this.approvalQueue.push({ request, resolve });
      return;  // ← 关键：立即返回，不覆盖 pendingApprovalValue
    }
    // 处理当前授权请求
    this.approvalResolve = (decision) => {
      clearTimeout(timeout);
      resolve(decision);
      this.processNextApproval();  // ← 处理队列中的下一个
    };
    this.pendingApprovalValue = request;
    this.workingStateValue = { status: 'approval', toolName: request.tool };
    this.emitChange();
  });
};

private processNextApproval() {
  const next = this.approvalQueue.shift();
  if (next) {
    // 处理下一个请求
    this.approvalResolve = ...;
    this.pendingApprovalValue = next.request;
    this.workingStateValue = { status: 'approval', toolName: next.request.tool };
    this.emitChange();
  } else {
    // 队列为空，清空状态
    this.approvalResolve = null;
    this.pendingApprovalValue = null;  // ← 关键：队列为空时设为 null
    this.workingStateValue = { status: 'thinking' };
    this.emitChange();
  }
}
```

**`cli.ts` - UI 渲染逻辑：**

```typescript
// 第 930 行
if (agentRunner.pendingApproval && !chatLog.hasApprovalPending()) {
  // 渲染授权选择器
  showScreenView('Authorization Required', ...);
}
```

### 2.3 问题时序分析

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 时间线分析                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ T1: write_file 调用 requestToolApproval()                              │
│     → pendingApprovalValue = {tool: 'write_file'}                      │
│     → workingState = { status: 'approval' }                            │
│     → emitChange() → UI 渲染                                          │
│                                                                     │
│ T2: bash 调用 requestToolApproval()                                    │
│     → pendingApprovalValue !== null                                    │
│     → bash 加入队列 (Promise2 等待中)                                  │
│                                                                     │
│ T3: 用户响应 write_file 授权                                         │
│     → respondToApproval(decision)                                      │
│     → approvalResolve(decision) → Promise1 resolve                     │
│     → processNextApproval() 被调用                                     │
│                                                                     │
│ T4: processNextApproval() 执行                                        │
│     → 队列中有 bash 请求                                             │
│     → pendingApprovalValue = {tool: 'bash'}  ← 覆盖                   │
│     → emitChange() → UI 渲染                                         │
│                                                                     │
│ T5: UI 渲染检查                                                      │
│     → 检查: pendingApproval && !hasApprovalPending()                   │
│     → ⚠️ 问题：hasApprovalPending() 可能返回 true！                    │
│     → 原因：write_file 的 tool component 的 callback 未清除            │
│     → 结果：选择器不显示！                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 问题根因

**问题：`hasApprovalPending()` 返回 true 阻止选择器渲染**

`hasApprovalPending()` 检查 tool component 的 `_approvalCallback`：

```typescript
hasApprovalPending(): boolean {
  for (const comp of this.toolById.values()) {
    if (comp.getApprovalCallback) {
      const cb = comp.getApprovalCallback();
      if (cb) return true;  // ← 第一个工具的 callback 仍然存在
    }
  }
  return false;
}
```

当第一个工具的 `setApprovalPending(onSelect)` 被调用时，`_approvalCallback` 被设置。但 **当第二个工具的授权请求处理时，第一个工具的 callback 尚未被清除**，导致：

1. `processNextApproval()` 设置 `pendingApprovalValue = {tool: 'bash'}`
2. `emitChange()` 触发 UI 渲染
3. UI 检查 `pendingApproval && !hasApprovalPending()`
4. `hasApprovalPending()` 返回 true（因为 write_file 的 callback 还在）
5. **选择器不显示！**

---

## 三、Loucode 架构学习

### 3.1 Loucode 权限系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Loucode 权限系统架构图                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      Query Engine (query.ts)                         │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐  │ │
│  │  │ Tool Use     │→ │ Streaming    │→ │ PreToolUse Hooks       │  │ │
│  │  │ Blocks       │  │ ToolExecutor │  │ (runPreToolUseHooks)   │  │ │
│  │  └───────────────┘  └───────┬───────┘  └─────────────────────────┘  │ │
│  │                              │                                        │ │
│  │                              ↓                                        │ │
│  │  ┌───────────────────────────────────────────────────────────────┐  │ │
│  │  │           checkPermissionsAndCallTool                         │  │ │
│  │  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │  │ │
│  │  │  │ hasPermissions  │→ │ resolveHook    │→ │ Permission  │  │  │ │
│  │  │  │ ToUseTool       │  │ Permission     │  │ Decision    │  │  │ │
│  │  │  │ (规则匹配)      │  │ Decision      │  │              │  │  │ │
│  │  │  └─────────────────┘  └─────────────────┘  └──────────────┘  │  │ │
│  │  └──────────────────────────┬──────────────────────────────────┘  │ │
│  └─────────────────────────────┼──────────────────────────────────────┘ │
│                                │                                            │
│                                ↓                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │              PermissionContext (PermissionContext.ts)                 │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐  │ │
│  │  │ ResolveOnce  │  │ Permission   │  │ QueueOps (React      │  │ │
│  │  │ (Promise    │  │ QueueOps    │  │ State Bridge)        │  │ │
│  │  │ 防重复)      │  │             │  │                      │  │ │
│  │  └───────────────┘  └───────────────┘  └─────────────────────────┘  │ │
│  └──────────────────────────┬──────────────────────────────────────────┘ │
│                             │                                             │
│                             ↓                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                 useCanUseTool (useCanUseTool.tsx)                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │ │
│  │  │ allow      │  │ deny        │  │ ask (Interactive)          │ │ │
│  │  │            │  │             │  │                           │ │ │
│  │  │ 直接放行   │  │ 直接拒绝    │  │ handleInteractivePermission │ │ │
│  │  └─────────────┘  └─────────────┘  └──────────┬────────────────┘ │ │
│  │                                                   │               │ │
│  │                                                   ↓               │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │         Permission Queue (React State)                    │ │ │
│  │  │  [Tool1: pending] [Tool2: pending] [Tool3: pending]   │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                             │                                              │
│                             ↓                                              │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                 PermissionRequest (components)                     │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │ │
│  │  │ FileWrite       │  │ FileEdit        │  │ Bash          │  │ │
│  │  │ Permission      │  │ Permission      │  │ Permission    │  │ │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Loucode 的 ResolveOnce 模式

Loucode 使用 `ResolveOnce` 确保 Promise 只被 resolve 一次：

```typescript
// PermissionContext.ts
function createResolveOnce<T>(resolve: (value: T) => void): ResolveOnce<T> {
  let claimed = false;
  return {
    resolve(value: T) {
      if (delivered) return;  // 防止重复 resolve
      delivered = true;
      resolve(value);
    },
    claim() {
      if (claimed) return false;  // 原子操作
      claimed = true;
      return true;
    }
  };
}
```

### 3.3 Loucode 的 PermissionQueueOps 模式

Loucode 将 React 状态与权限逻辑解耦：

```typescript
type PermissionQueueOps = {
  push(item: ToolUseConfirm): void;
  remove(toolUseID: string): void;
  update(toolUseID: string, patch: Partial<ToolUseConfirm>): void;
};

function createPermissionQueueOps(
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
): PermissionQueueOps {
  return {
    push(item) {
      setToolUseConfirmQueue(queue => [...queue, item]);
    },
    remove(toolUseID) {
      setToolUseConfirmQueue(queue =>
        queue.filter(item => item.toolUseID !== toolUseID)
      );
    },
    update(toolUseID, patch) {
      setToolUseConfirmQueue(queue =>
        queue.map(item =>
          item.toolUseID === toolUseID ? { ...item, ...patch } : item
        )
      );
    }
  };
}
```

---

## 四、Dexter 权限系统现状

### 4.1 Dexter 权限架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Dexter 权限系统架构图（当前实现）                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      AgentRunner (agent-runner.ts)                   │ │
│  │  ┌───────────────────┐  ┌──────────────────┐  ┌───────────────┐  │ │
│  │  │ requestTool      │  │ processNext      │  │ respondTo    │  │ │
│  │  │ Approval         │  │ Approval         │  │ Approval     │  │ │
│  │  │ (Promise 工厂)   │  │ (队列处理)       │  │ (用户响应)   │  │ │
│  │  └───────────────────┘  └──────────────────┘  └───────────────┘  │ │
│  │          ↑                      ↑                     ↑            │ │
│  │          │                      │                     │            │ │
│  │          └──────────────────────┼─────────────────────┘            │ │
│  │                                 │                              │ │
│  │                                 ↓                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐  │ │
│  │  │              pendingApprovalValue: {tool, args}        │  │ │
│  │  │              approvalQueue: [{request, resolve}, ...]  │  │ │
│  │  │              approvalResolve: (decision) => void       │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                │                                         │
│                                ↓                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                 ToolExecutor (tool-executor.ts)                  │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │ │
│  │  │ executeAll     │→ │ executeSingle   │→ │ requires      │  │ │
│  │  │ (AsyncGen)     │  │ WithId         │  │ Approval      │  │ │
│  │  │                │  │                │  │               │  │ │
│  │  │ yield* batch   │  │ await request  │  │ (工具判断)     │  │ │
│  │  │                │  │ ToolApproval() │  │               │  │ │
│  │  │                │  │ ↓              │  │               │  │ │
│  │  │                │  │ yield event   │  │               │  │ │
│  │  └─────────────────┘  └─────────────────┘  └────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                │                                         │
│                                ↓                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      CLI (cli.ts)                                 │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │ │
│  │  │ Event Handler   │  │ Render Loop     │  │ SelectList    │  │ │
│  │  │                │  │                │  │               │  │ │
│  │  │ tool_approval   │  │ 检查 pending   │  │ 授权选择器    │  │ │
│  │  │ 事件处理       │  │ Approval &&    │  │               │  │ │
│  │  │                │  │ !hasApproval  │  │               │  │ │
│  │  │                │  │ Pending()      │  │               │  │ │
│  │  │                │  │ ↓              │  │               │  │ │
│  │  │                │  │ 渲染选择器    │  │               │  │ │
│  │  └─────────────────┘  └─────────────────┘  └────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                │                                         │
│                                ↓                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    ToolEventComponent (tool-event.ts)              │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │ │
│  │  │ _approval       │  │ hasApproval    │  │ setApproval   │  │ │
│  │  │ Callback       │  │ Pending()      │  │ Pending()     │  │ │
│  │  │                │  │                │  │               │  │ │
│  │  │ (工具的回调)    │  │ (检查callback) │  │ (显示UI)      │  │ │
│  │  └─────────────────┘  └─────────────────┘  └────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ⚠️ 问题点：hasApprovalPending() 检查 tool component 的 callback            │
│     当第一个工具的 callback 未清除时，阻止第二个选择器显示                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 问题流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     问题流程时序图                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Agent                  ToolExecutor           AgentRunner           UI      │
│    │                         │                     │                  │      │
│    │ executeAll()            │                     │                  │      │
│    │                         │                     │                  │      │
│    ├─→ executeSingle(write) │                     │                  │      │
│    │                        │                     │                  │      │
│    │                        │ requestToolApproval │                  │      │
│    │                        │ ──────────────────→│                  │      │
│    │                        │                     │                  │      │
│    │                        │                     │ pending=write    │      │
│    │                        │                     │ emitChange()    │      │
│    │                        │                     │ ────────────────→│      │
│    │                        │                     │                  │      │
│    │                        │                     │                  │ ←──┐ │
│    │                        │                     │                  │    │ │
│    │                        │                     │                  │    │ │
│    ├─→ executeSingle(bash)  │                     │                  │    │ │
│    │                        │                     │                  │    │ │
│    │                        │ requestToolApproval │                  │    │ │
│    │                        │ ──────────────────→│                  │    │ │
│    │                        │                     │                  │    │ │
│    │                        │                     │ queue=[bash]    │    │ │
│    │                        │                     │ (不覆盖pending)  │    │ │
│    │                        │ ←──────────────────│ (Promise 等待中)│    │ │
│    │                        │                     │                  │    │ │
│    │ 响应 write 授权       │                     │                  │    │ │
│    │ ───────────────────────┼─────────────────────→│                  │    │ │
│    │                        │                     │                  │    │ │
│    │                        │                     │ respondTo       │    │ │
│    │                        │                     │ Approval()       │    │ │
│    │                        │                     │                  │    │ │
│    │                        │                     │ processNext     │    │ │
│    │                        │                     │ Approval()       │    │ │
│    │                        │                     │                  │    │ │
│    │                        │                     │ pending=bash    │    │ │
│    │                        │                     │ emitChange()    │    │ │
│    │                        │                     │ ────────────────→│    │ │
│    │                        │                     │                  │    │ │
│    │                        │                     │                  │ ←──┼─┤
│    │                        │                     │                  │    │ │
│    │                        │                     │                  │    │ │
│    │                        │                     │                  │    │ ▼
│    │                        │                     │                  │ ←──┐
│    │                        │                     │                  │    │
│    │                        │                     │                  │ ⚠️ │
│    │                        │                     │                  │    │
│    │                        │                     │                  │ ✗  │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │

    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                     │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │    │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │
│    │                        │                  │
│    │                        │                  │
│    │                        │                  │
│    │                        │
│    │                        │
│    │
│    
│    │
│
```

---

## 五、修复方案

### 5.1 方案一：修改 UI 渲染条件（快速修复）

修改 `cli.ts` 中的授权选择器显示逻辑：

```typescript
// cli.ts 第 930 行
// 当前逻辑（有 bug）
if (agentRunner.pendingApproval && !chatLog.hasApprovalPending()) {
  // 渲染选择器
}

// 修复后的逻辑
if (agentRunner.pendingApproval) {
  // 只要有 pendingApproval 就渲染选择器
  // 不依赖 hasApprovalPending()
  const pending = agentRunner.pendingApproval;
  // ...
}
```

### 5.2 方案二：重构授权状态管理（推荐）

学习 Loucode 的 PermissionContext 模式：

```typescript
// 使用 ResolveOnce 模式
class PermissionContext {
  private resolveOnce<T>(resolve: (value: T) => void) {
    let claimed = false;
    return {
      resolve(value: T) {
        if (claimed) return;
        claimed = true;
        resolve(value);
      }
    };
  }
}
```

### 5.3 方案三：完整的 Loucode 风格重构

**文件变更计划：**

1. 创建 `src/agent/permission-context.ts`
2. 修改 `src/agent/tool-executor.ts` 使用 PermissionContext
3. 修改 `src/controllers/agent-runner.ts` 移除手动状态管理
4. 修改 `src/cli.ts` 使用 PermissionQueueOps 模式

---

## 六、涉及文件清单

| 文件 | 当前状态 | 修改建议 |
|------|----------|----------|
| `src/controllers/agent-runner.ts` | ⚠️ 手动状态管理 | 重构为 PermissionContext |
| `src/agent/tool-executor.ts` | ✓ 基础可用 | 无需大改 |
| `src/cli.ts` | ⚠️ 依赖 hasApprovalPending | 使用 pendingApproval 状态 |
| `src/components/tool-event.ts` | ⚠️ callback 管理混乱 | 清理 callback 生命周期 |
| `src/components/chat-log.ts` | ⚠️ hasApprovalPending 有问题 | 重构或移除 |

---

## 七、测试计划

### 测试用例

1. **连续两次授权**：write_file + bash 连续授权 → 两个都显示选择器
2. **快速响应**：用户快速按下 Enter → 不卡住
3. **队列场景**：5 个授权请求排队 → 依次显示

---

## 八、参考文档

- Loucode `useCanUseTool.tsx` - 权限钩子实现
- Loucode `PermissionContext.ts` - 权限上下文
- Loucode `interactiveHandler.ts` - 交互处理
- Dexter `auth2.md` - 本文档

---

---

## 九、Claude Code 完整实现分析

### 9.1 Claude Code 权限系统核心文件

```
src/
├── hooks/
│   ├── toolPermission/
│   │   ├── PermissionContext.ts      # 权限上下文核心
│   │   └── handlers/
│   │       ├── interactiveHandler.ts  # 交互式处理
│   │       └── coordinatorHandler.ts  # 协调处理
│   ├── useCanUseTool.tsx             # React 钩子
│   └── ...
├── screens/
│   └── REPL.tsx                     # 主 UI
├── components/
│   └── permissions/
│       └── PermissionRequest.tsx     # 权限请求 UI
├── tools/
│   └── BashTool/
│       └── bashPermissions.ts        # Bash 权限
└── utils/
    └── permissions/
        └── ...
```

### 9.2 Claude Code 的 ResolveOnce 实现

```typescript
// src/hooks/toolPermission/PermissionContext.ts

type ResolveOnce<T> = {
  resolve(value: T): void;
  isResolved(): boolean;
  /**
   * Atomically check-and-mark as resolved.
   * Returns true if this caller won the race.
   */
  claim(): boolean;
};

function createResolveOnce<T>(resolve: (value: T) => void): ResolveOnce<T> {
  let claimed = false;
  let delivered = false;
  return {
    resolve(value: T) {
      if (delivered) return;  // 确保只 resolve 一次
      delivered = true;
      claimed = true;
      resolve(value);
    },
    isResolved() {
      return claimed;
    },
    claim() {
      if (claimed) return false;  // 原子性检查
      claimed = true;
      return true;
    },
  };
}
```

**关键特性**:
- `delivered`: 确保 `resolve` 只被调用一次
- `claimed`: 用于竞态条件检查
- `claim()`: 在异步回调中调用，确保只有一个调用者成功

### 9.3 Claude Code 的 PermissionQueueOps

```typescript
// src/hooks/toolPermission/PermissionContext.ts

type PermissionQueueOps = {
  push(item: ToolUseConfirm): void;
  remove(toolUseID: string): void;
  update(toolUseID: string, patch: Partial<ToolUseConfirm>): void;
};

function createPermissionQueueOps(
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
): PermissionQueueOps {
  return {
    push(item: ToolUseConfirm) {
      setToolUseConfirmQueue(queue => [...queue, item]);
    },
    remove(toolUseID: string) {
      setToolUseConfirmQueue(queue =>
        queue.filter(item => item.toolUseID !== toolUseID)
      );
    },
    update(toolUseID: string, patch: Partial<ToolUseConfirm>) {
      setToolUseConfirmQueue(queue =>
        queue.map(item =>
          item.toolUseID === toolUseID ? { ...item, ...patch } : item
        )
      );
    },
  };
}
```

### 9.4 Claude Code 的 REPL 权限状态管理

```typescript
// src/screens/REPL.tsx

// 队列状态
const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);

// 等待状态判断
const isWaitingForApproval = toolUseConfirmQueue.length > 0 || promptQueue.length > 0;

// 显示等待信息
const waitingFor = sessionStatus !== 'waiting'
  ? undefined
  : toolUseConfirmQueue.length > 0
    ? `approve ${toolUseConfirmQueue[0]!.tool.name}`
    : pendingWorkerRequest
      ? 'worker request'
      : pendingSandboxRequest
        ? 'sandbox request'
        : isShowingLocalJSXCommand
          ? 'dialog open'
          : 'input needed';

// 权限对话框渲染
const toolPermissionOverlay =
  focusedInputDialog === 'tool-permission'
    ? (
      <PermissionRequest
        key={toolUseConfirmQueue[0]?.toolUseID}  // key 变化触发重新渲染
        onDone={() => setToolUseConfirmQueue(([_, ...tail]) => tail)}  // 移除队首
        onReject={handleQueuedCommandOnCancel}
        toolUseConfirm={toolUseConfirmQueue[0]!}
        toolUseContext={getToolUseContext(...)}
        verbose={verbose}
        workerBadge={toolUseConfirmQueue[0]?.workerBadge}
      />
    )
    : null;
```

**关键设计**:
1. **简单数组队列**: `toolUseConfirmQueue[0]` 始终是当前需要授权的项
2. **自动移除**: `onDone` 回调中 `shift()` 移除队首，自动显示下一个
3. **Key 变化触发重渲染**: `key={toolUseConfirmQueue[0]?.toolUseID}`

### 9.5 Claude Code 的 useCanUseTool Hook

```typescript
// src/hooks/useCanUseTool.tsx

function useCanUseTool(
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>,
  setToolPermissionContext: React.Dispatch<React.SetStateAction<ToolPermissionContext>>
) {
  return useCallback(
    async (
      tool: Tool,
      input: Record<string, unknown>,
      toolUseContext: ToolUseContext,
      assistantMessage: AssistantMessage,
      toolUseID: string
    ): Promise<PermissionDecision> => {
      // 1. 创建权限上下文
      const permissionContext = createPermissionContext(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseID,
        setToolPermissionContext,
        createPermissionQueueOps(setToolUseConfirmQueue)
      );

      // 2. 执行权限检查
      // - hasPermissionsToUseTool: 规则匹配
      // - runHooks: 钩子检查
      // - tryClassifier: Bash 命令分类器

      // 3. 如果需要用户授权，推入队列
      if (decision.behavior === 'ask') {
        permissionContext.pushToQueue({
          toolUseID,
          tool: tool.name,
          input,
          onAllow: () => permissionContext.removeFromQueue(),
          onDeny: () => permissionContext.removeFromQueue(),
        });
      }

      return decision;
    },
    [setToolUseConfirmQueue, setToolPermissionContext]
  );
}
```

### 9.6 Claude Code vs Dexter 对比

| 特性 | Claude Code | Dexter (当前) |
|------|-------------|---------------|
| **队列管理** | 简单数组 `queue[0]` | 分散在多个组件 |
| **竞态处理** | ResolveOnce 模式 | 无 |
| **状态检查** | 队列长度 `> 0` | `hasApprovalPending()` |
| **回调清理** | `onDone = shift()` | 手动 `clearApprovalCallbacks()` |
| **UI 状态** | React state | 跨组件状态 |
| **持久化** | PermissionUpdate | SessionTracker |

### 9.7 移植建议

如果要将 Claude Code 的模式移植到 Dexter:

1. **创建 PermissionContext**:
   ```typescript
   // src/agent/permission-context.ts
   export class PermissionContext {
     constructor(
       private queue: PermissionQueue,
       private sessionTracker: SessionTracker
     ) {}

     push(item: ToolUseConfirm) {
       this.queue.push(item);
     }

     resolve(toolUseID: string, decision: PermissionDecision) {
       const item = this.queue.find(t => t.toolUseID === toolUseID);
       if (item) {
         item.resolve(decision);
         this.queue.remove(toolUseID);
       }
     }
   }
   ```

2. **重构 CLI 状态**:
   ```typescript
   // cli.ts
   const [approvalQueue, setApprovalQueue] = useState<ToolUseConfirm[]>([]);

   // 显示权限对话框
   if (approvalQueue.length > 0) {
     const item = approvalQueue[0];
     // 显示 item.tool 的授权对话框
   }
   ```

3. **移除 hasApprovalPending 依赖**:
   ```typescript
   // cli.ts
   // 不要依赖 hasApprovalPending()
   if (agentRunner.pendingApproval) {
     showApprovalDialog();
   }
   ```

---

*文档生成时间：2026-05-22*
*更新：2026-05-22 - 添加 Claude Code 完整实现分析*
