# TUI 架构深度对比分析报告

> **UpUp (Dexter)** vs **Loucode Claude Code**
>
> 分析日期: 2026/05/28
> 分析师: Claude Code Agent

---

## 目录

1. [架构概览](#1-架构概览)
2. [状态管理模式对比](#2-状态管理模式对比)
3. [事件处理流程对比](#3-事件处理流程对比)
4. [授权流程实现对比](#4-授权流程实现对比)
5. [流式渲染实现对比](#5-流式渲染实现对比)
6. [组件通信模式对比](#6-组件通信模式对比)
7. [问题清单与优先级](#7-问题清单与优先级)
8. [统一架构设计方案](#8-统一架构设计方案)
9. [改造步骤](#9-改造步骤)

---

## 1. 架构概览

### 1.1 UpUp (Dexter) TUI 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      TUI (pi-tui)                           │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │  Container  │   Editor    │    Text     │    TUI      │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    cli.ts (主控制器)                         │
│  • 初始化 TUI                                              │
│  • 管理组件生命周期                                         │
│  • 处理用户输入路由                                         │
│  • 回调函数驱动状态更新                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AgentRunnerController                       │
│  • Agent 执行控制                                           │
│  • 历史事件管理                                             │
│  • 权限决策                                                 │
└─────────────────────────────────────────────────────────────┘
```

**技术栈**: `@mariozechner/pi-tui` (命令式 TUI 框架)

### 1.2 Loucode Claude Code TUI 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    React + Ink                              │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │   Button    │     Box     │    Text     │  useInput   │ │
│  │  useAppState│ useSelection │ useStdin    │  useFocus   │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   AppStateProvider                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │          useSyncExternalStore 订阅状态                    │ │
│  │          React Context 依赖注入                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AppStateStore                            │
│  • createStore: 状态存储                                   │
│  • subscribe: 订阅机制                                      │
│  • getState: 状态读取                                       │
│  • setState: 状态更新                                       │
└─────────────────────────────────────────────────────────────┘
```

**技术栈**: React + Ink (声明式 TUI 框架)

### 1.3 核心差异总结

| 维度 | UpUp (Dexter) | Loucode Claude Code |
|------|---------------|---------------------|
| 框架类型 | 命令式 (pi-tui) | 声明式 (React + Ink) |
| 状态管理 | 回调函数 + 全局变量 | useSyncExternalStore |
| 组件通信 | 直接方法调用 | React Context + Hooks |
| 渲染模型 | 命令式 DOM 操作 | 虚拟 DOM + Reconciliation |
| 学习曲线 | 较低，但扩展性受限 | 较高，但扩展性强 |

---

## 2. 状态管理模式对比

### 2.1 UpUp 的回调驱动模式

**文件**: `src/cli.ts`

```typescript
// 回调模式示例
const modelSelection = new ModelSelectionController(onError, () => {
  if (intro) intro.setModel(modelSelection.model);
  agentRunner?.updateAgentConfig({
    model: modelSelection.model,
    modelProvider: modelSelection.provider,
  });
  needsRenderOverlay = true;
  renderSelectionOverlay();
  tui.requestRender();
});
```

**特点**:
- 使用回调函数处理状态变更
- 全局变量存储中间状态 (`pendingApprovalDecisionGlobal`, `_approvalCursor`)
- `tui.requestRender()` 手动触发渲染
- 组件直接操作 TUI 元素

**问题**:
1. **回调地狱**: 深层嵌套的回调函数
2. **状态同步困难**: 多个回调之间状态不一致风险
3. **难以测试**: 依赖全局状态

### 2.2 Loucode 的 useSyncExternalStore 模式

**文件**: `src/state/AppState.tsx`

```typescript
// useSyncExternalStore 模式
export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore();
  const get = () => {
    const state = store.getState();
    const selected = selector(state);
    return selected;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

// 使用示例
const verbose = useAppState(s => s.verbose);
const model = useAppState(s => s.mainLoopModel);
```

**特点**:
- 单一状态存储 (`AppStateStore`)
- 选择器模式 (Selector Pattern) 优化重渲染
- 跨组件状态共享
- 自动订阅/取消订阅

**优势**:
1. **声明式**: 组件声明需要什么状态
2. **自动优化**: `useSyncExternalStore` 只在选择值变化时重渲染
3. **可预测**: 单一数据源，状态变更可追溯

### 2.3 状态模式对比图

```
UpUp 回调模式:                    Loucode Store 模式:
                                 
  Component A                     AppState
       │                              │
       ▼                              │
  Callback ─────┐                    ┌──┼──┐
       │        │                    │  │  │
       ▼        │                    ▼  ▼  ▼
  Callback ─────┼──► Global      useApp useApp useApp
       │        │    State           │   │   │
       ▼        │                    └───┼───┘
  Callback ─────┘                       │
       │                              Re-render
       ▼                                 │
  Render() ◄─────────────────────────────┘
```

---

## 3. 事件处理流程对比

### 3.1 UpUp 事件处理流程

**文件**: `src/components/custom-editor.ts`

```typescript
export class CustomEditor extends Editor {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onSlashChange?: (text: string) => void;
  onApprovalKey?: (key: string) => boolean;

  handleInput(data: string): void {
    // 1. 批准模式路由
    if (this.onApprovalKey) {
      const consumed = this.onApprovalKey(data);
      if (consumed) return;
    }

    // 2. 会话列表路由
    if (this.onSessionListKey) {
      const consumed = this.onSessionListKey(data);
      if (consumed) return;
    }

    // 3. Esc 处理
    if (matchesKey(data, Key.escape)) {
      if (showingSuggestions) {
        this.slashActive = false;
        this.onSlashDismiss?.();
        return;
      }
      if (this.onEscape) {
        this.onEscape();
        return;
      }
    }

    // 4. 默认处理
    super.handleInput(data);
  }
}
```

**流程图**:
```
用户输入
    │
    ▼
CustomEditor.handleInput()
    │
    ├─► onApprovalKey? ──┐
    │                    ▼
    │              cli.ts 处理
    │
    ├─► onSessionListKey? ──┐
    │                       ▼
    │                 cli.ts 处理
    │
    ├─► onEscape? ──────────┐
    │                      ▼
    │                cli.ts 处理
    │
    └─► super.handleInput()
              │
              ▼
         pi-tui Editor
```

### 3.2 Loucode 事件处理流程

**文件**: `src/ink/hooks/use-input.ts`

```typescript
const useInput = (inputHandler: Handler, options: Options = {}) => {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin();

  useLayoutEffect(() => {
    if (options.isActive === false) return;
    setRawMode(true);
    return () => setRawMode(false);
  }, [options.isActive, setRawMode]);

  const handleData = useEventCallback((event: InputEvent) => {
    if (options.isActive === false) return;
    const { input, key } = event;
    if (!(input === 'c' && key.ctrl) || !internal_exitOnCtrlC) {
      inputHandler(input, key, event);
    }
  });

  useEffect(() => {
    internal_eventEmitter?.on('input', handleData);
    return () => {
      internal_eventEmitter?.removeListener('input', handleData);
    };
  }, [internal_eventEmitter, handleData]);
};
```

**流程图**:
```
用户输入
    │
    ▼
StdinContext (useStdin)
    │
    ▼
EventEmitter 'input' 事件
    │
    ▼
useInput hook
    │
    ├─► 选项1: isActive === false → 忽略
    │
    └─► inputHandler(input, key, event)
              │
              ▼
         React Component
              │
              ▼
         useAppState 订阅状态
              │
              ▼
         Re-render
```

### 3.3 事件处理对比

| 维度 | UpUp | Loucode |
|------|------|---------|
| 输入捕获 | pi-tui Editor 内部 | useStdin hook |
| 事件分发 | 回调函数链 | React Event System |
| 焦点管理 | tui.setFocus() | FocusManager |
| 路由逻辑 | if-else 链 | React 组件树 |
| 解绑处理 | 回调覆盖 | useEffect cleanup |

---

## 4. 授权流程实现对比

### 4.1 UpUp 授权流程

**文件**: `src/components/tool-event.ts`

```typescript
export class ToolEventComponent extends Container {
  setApprovalPending(
    onSelect: (decision: ApprovalDecision) => void,
    preStoredDecision?: ApprovalDecision | null
  ) {
    // 模块级游标
    _approvalCursor = 0;

    // 显示选项
    const options = [
      { index: 0, label: 'Yes' },
      { index: 1, label: 'Yes, allow all this session' },
      { index: 2, label: 'No' },
    ];

    // 存储回调
    (this as any)._approvalCallback = onSelect;

    // 检查预存决策
    const pending = preStoredDecision ?? consumePendingApprovalDecision();
    if (pending !== null) {
      onSelect(pending);
    }
  }
}
```

**cli.ts 中的处理**:
```typescript
editor.onApprovalKey = (data: string) => {
  if (!hasPendingApproval) return false;

  if (key === '1') {
    setApprovalCursor(0);
    editor.onApprovalSelect?.();
    return true;
  }
  // ...
};

editor.onApprovalSelect = () => {
  const sel = getApprovalCursor();
  const decision: ApprovalDecision = sel === 0 ? 'allow-once' : ...;
  agentRunner.respondToApproval(decision);
};
```

**问题**:
1. **模块级状态**: `_approvalCursor` 是全局变量
2. **回调注册时机**: 可能在用户按键后才注册
3. **复杂的状态同步**: `pendingApprovalDecisionGlobal` 和回调同时存在

### 4.2 Loucode 授权流程

Loucode 使用 AppState 存储授权状态:

```typescript
// AppState 中定义
export interface AppState {
  toolPermissionContext: ToolPermissionContext;
  // ...
}

// 授权处理
function handleToolApproval(decision: ApprovalDecision) {
  setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      pendingApproval: null,
      // 保存决策历史
    }
  }));
}

// UI 组件使用
function ApprovalComponent() {
  const pending = useAppState(s => s.toolPermissionContext.pendingApproval);
  // ...
}
```

**优势**:
1. **状态可追溯**: 所有决策存储在 AppState
2. **自动 UI 更新**: 状态变更自动触发重渲染
3. **无竞态条件**: 状态单一来源

---

## 5. 流式渲染实现对比

### 5.1 UpUp 流式渲染

**文件**: `src/agent/index.ts` 或 `src/cli.ts`

```typescript
// cli.ts 中的增量更新
agentRunner = new AgentRunnerController(
  { model, maxIterations: 50 },
  chatHistory,
  () => {
    // onChange 回调 - 每次事件触发
    const history = agentRunner.history;
    const lastItem = history[history.length - 1];

    if (lastItem.id !== lastRenderedQueryId) {
      chatLog.addQuery(lastItem.query);
      lastRenderedQueryId = lastItem.id;
    }

    // 增量渲染新事件
    for (let i = lastRenderedEventCount; i < lastItem.events.length; i++) {
      renderEvent(chatLog, lastItem.events[i], lastItem.status, agentRunner);
    }
    lastRenderedEventCount = lastItem.events.length;

    // 更新已完成工具
    for (const display of lastItem.events) {
      if (display.event.type === 'tool_start' && display.completed && ...) {
        const component = chatLog.getToolById(display.id);
        component?.setComplete(...);
      }
    }

    throttledRender();
  }
);
```

**渲染节流**:
```typescript
let renderPending = false;
const RENDER_THROTTLE_MS = 32;
function throttledRender(): void {
  if (renderPending) return;
  renderPending = true;
  setTimeout(() => {
    renderPending = false;
    tui.requestRender();
  }, RENDER_THROTTLE_MS);
}
```

### 5.2 Loucode 流式渲染

Loucode 使用 React 的自然流式更新:

```typescript
// 查询引擎生成事件流
async function* query(params: QueryParams): AsyncGenerator<StreamEvent> {
  for await (const message of deps.callModel({...})) {
    yield message; // 每个流事件都是 yield
  }
}

// 组件自动订阅
function ChatLog() {
  const messages = useAppState(s => s.messages);
  const toolEvents = useAppState(s => s.toolEvents);

  return (
    <>
      {messages.map(msg => <Message key={msg.id} {...msg} />)}
      {toolEvents.map(event => <ToolEvent key={event.id} {...event} />)}
    </>
  );
}
```

**优势**:
1. **声明式**: 组件只声明需要什么数据
2. **自动批处理**: React 18 自动批处理更新
3. **选择性订阅**: 只订阅需要的状态切片

### 5.3 流式渲染对比

| 维度 | UpUp | Loucode |
|------|------|---------|
| 更新触发 | 手动 `requestRender()` | React 自动重渲染 |
| 增量更新 | 手动比较 `lastRenderedEventCount` | 虚拟 DOM diff |
| 批处理 | 手动脉冲节流 | React 18 自动批处理 |
| 选择性更新 | Map 查找 | Selector 函数 |

---

## 6. 组件通信模式对比

### 6.1 UpUp 组件通信

**模式**: 直接方法调用 + 回调函数

```typescript
// ChatLogComponent 公开方法
export class ChatLogComponent extends Container {
  startTool(toolCallId: string, toolName: string, args: Record<string, unknown>) {
    // ...
  }

  completeTool(toolCallId: string, summary: string, duration: number) {
    const existing = this.toolById.get(toolCallId);
    existing?.setComplete(summary, duration);
  }
}

// cli.ts 直接调用
chatLog.startTool(display.id, toolStart.tool, toolStart.args);
chatLog.finalizeAnswer(lastItem.answer);
```

**模块级共享状态**:
```typescript
// tool-event.ts
let _approvalCursor: number = 0;
export function getApprovalCursor(): number { return _approvalCursor; }
export function setApprovalCursor(index: number): void { _approvalCursor = ...; }
```

### 6.2 Loucode 组件通信

**模式**: React Context + Hooks

```typescript
// Context 提供者
export function AppStateProvider({ children, initialState, onChangeAppState }) {
  const [store] = useState(() => createStore(initialState, onChangeAppState));

  return (
    <AppStoreContext.Provider value={store}>
      {children}
    </AppStoreContext.Provider>
  );
}

// 组件消费
function ToolEvent({ toolId }) {
  const tool = useAppState(s => s.toolEvents.find(t => t.id === toolId));

  const handleComplete = useCallback((summary, duration) => {
    setAppState(prev => ({
      ...prev,
      toolEvents: prev.toolEvents.map(t =>
        t.id === toolId ? { ...t, status: 'complete', summary, duration } : t
      )
    }));
  }, [toolId]);

  return <div>...</div>;
}
```

### 6.3 组件通信对比

```
UpUp 通信模式:                  Loucode 通信模式:

┌─────────────────┐            ┌─────────────────┐
│    cli.ts       │            │  AppStateProvider│
│   (控制器)      │            │   (Context)     │
└────────┬────────┘            └────────┬────────┘
         │                           │
    方法调用                      React Context
         │                           │
         ▼                           ▼
┌─────────────────┐            ┌─────────────────┐
│   ChatLog       │            │  ToolEvent      │
│  startTool()    │            │  useAppState()  │
└────────┬────────┘            └────────┬────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐            ┌─────────────────┐
│ ToolEventComponent│           │ ToolEventComponent│
│  setComplete()   │            │  直接更新状态    │
└─────────────────┘            └─────────────────┘
```

---

## 7. 问题清单与优先级

### P0 - 阻塞性问题 (必须立即修复)

| ID | 问题描述 | 位置 | 影响 |
|----|---------|------|------|
| P0-1 | 授权回调竞态条件 - 用户可能在回调注册前按键 | `tool-event.ts`, `cli.ts` | 用户输入丢失 |
| P0-2 | 模块级游标状态 `_approvalCursor` 导致多实例冲突 | `tool-event.ts` | 状态混乱 |
| P0-3 | 增量渲染状态追踪复杂 - `lastRenderedEventCount`, `lastRenderedQueryId` | `cli.ts` | 渲染不一致 |

### P1 - 高优先级问题 (应尽快修复)

| ID | 问题描述 | 位置 | 影响 |
|----|---------|------|------|
| P1-1 | 回调地狱 - `renderSelectionOverlay` 函数过长 (150+ 行) | `cli.ts:960-1153` | 难以维护 |
| P1-2 | 全局状态 `pendingApprovalDecisionGlobal` 难以追踪 | `cli.ts:92` | 调试困难 |
| P1-3 | 渲染节流 `throttledRender` 手动管理 | `cli.ts:536-543` | 可能丢渲染 |
| P1-4 | 组件树重建 - `root.clear()` + `root.addChild()` 频繁调用 | `cli.ts:936-958` | 性能问题 |

### P2 - 中优先级问题 (计划修复)

| ID | 问题描述 | 位置 | 影响 |
|----|---------|------|------|
| P2-1 | 硬编码魔法数字 - 32ms 节流, 600ms 脉冲 | `cli.ts`, `tool-event.ts` | 可配置性差 |
| P2-2 | 缺少组件接口抽象 - ToolDisplayComponent 用 any 类型 | `chat-log.ts:52` | 类型不安全 |
| P2-3 | 权限指示器与状态分离 - PermissionModeIndicator 单独传递 | `hint-bar.ts` | 数据流复杂 |
| P2-4 | 回调函数未清理 - onChange 回调链未管理生命周期 | `cli.ts` | 内存泄漏风险 |

### P2 - 低优先级问题 (改进建议)

| ID | 问题描述 | 位置 | 影响 |
|----|---------|------|------|
| P2-5 | 未使用装饰器模式 - 组件扩展性差 | 组件文件 | 扩展困难 |
| P2-6 | 缺少组件测试 - 覆盖率为 0 | `*.test.ts` | 质量风险 |
| P2-7 | 主题硬编码 - theme 对象耦合 | `theme.ts` | 定制困难 |

---

## 8. 统一架构设计方案

### 8.1 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                     目标架构 (React + Ink)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   AppStateStore                      │   │
│  │  ┌─────────────┬─────────────┬─────────────────┐    │   │
│  │  │  uiState    │ agentState  │  sessionState   │    │   │
│  │  └─────────────┴─────────────┴─────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  React Components                     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐│   │
│  │  │ ChatLog│ │ Editor │ │ HintBar│ │ ApprovalDialog  ││   │
│  │  └────────┘ └────────┘ └────────┘ └────────────────┘│   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Ink (渲染层)                        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐│   │
│  │  │  Box   │ │  Text  │ │ Button │ │ Spacer         ││   │
│  │  └────────┘ └────────┘ └────────┘ └────────────────┘│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 状态结构设计

```typescript
// src/state/AppState.ts

export interface UIState {
  // 视图状态
  view: 'main' | 'model-selection' | 'session-selection' | 'approval';
  isProcessing: boolean;
  pendingApproval: PendingApproval | null;

  // 编辑器状态
  editor: {
    text: string;
    slashActive: boolean;
    slashSuggestions: SlashCommand[];
    selectedSuggestionIndex: number;
  };

  // Hint Bar 状态
  hintBar: {
    hints: string[];
    permissionMode: string;
  };
}

export interface AgentState {
  // 消息历史
  messages: Message[];
  toolEvents: ToolEvent[];

  // 当前任务
  currentQuery: string | null;
  currentAnswer: string | null;

  // 状态
  status: 'idle' | 'processing' | 'complete' | 'interrupted';
  tokenUsage?: TokenUsage;
}

export interface AppState {
  ui: UIState;
  agent: AgentState;
  session: SessionState;
}

export interface Actions {
  // UI Actions
  setView(view: UIState['view']): void;
  setProcessing(processing: boolean): void;

  // Editor Actions
  setEditorText(text: string): void;
  setSlashSuggestions(suggestions: SlashCommand[]): void;

  // Agent Actions
  addMessage(message: Message): void;
  addToolEvent(event: ToolEvent): void;
  completeToolEvent(id: string, result: ToolResult): void;

  // Approval Actions
  requestApproval(tool: string, args: Record<string, unknown>): void;
  respondToApproval(decision: ApprovalDecision): void;
}
```

### 8.3 组件设计

```typescript
// src/components/ChatLog.tsx
import { Box, Text } from 'ink';
import { useAppState, useSetAppState } from '../state/AppState.tsx';
import { ToolEvent } from './ToolEvent.tsx';

export function ChatLog() {
  const messages = useAppState(s => s.agent.messages);
  const toolEvents = useAppState(s => s.agent.toolEvents);
  const currentQuery = useAppState(s => s.agent.currentQuery);

  return (
    <Box flexDirection="column">
      {currentQuery && (
        <Box>
          <Text color="cyan">❯ {currentQuery}</Text>
        </Box>
      )}

      {toolEvents.map(event => (
        <ToolEvent key={event.id} {...event} />
      ))}

      {messages.map((msg, i) => (
        <Message key={msg.id || i} {...msg} />
      ))}
    </Box>
  );
}

// src/components/Editor.tsx
export function Editor() {
  const text = useAppState(s => s.ui.editor.text);
  const slashActive = useAppState(s => s.ui.editor.slashActive);
  const suggestions = useAppState(s => s.ui.editor.slashSuggestions);
  const selectedIndex = useAppState(s => s.ui.editor.selectedSuggestionIndex);
  const setAppState = useSetAppState();

  useInput((input, key) => {
    if (input === '\r' || input === '\n') {
      if (slashActive) {
        // 选择建议
        const cmd = suggestions[selectedIndex];
        if (cmd) handleSlashCommand(cmd.name);
      } else {
        // 提交查询
        setAppState(prev => ({
          ...prev,
          agent: { ...prev.agent, currentQuery: text },
          ui: { ...prev.ui, editor: { ...prev.ui.editor, text: '' } }
        }));
      }
    }
    // ...
  });

  return (
    <Box>
      <Text color="gray">❯ </Text>
      <Text>{text}</Text>
      {slashActive && <SlashSuggestions suggestions={suggestions} selectedIndex={selectedIndex} />}
    </Box>
  );
}
```

### 8.4 授权流程设计

```typescript
// src/components/ApprovalDialog.tsx
export function ApprovalDialog() {
  const pending = useAppState(s => s.ui.pendingApproval);
  const setAppState = useSetAppState();
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setSelected(prev => (prev - 1 + 3) % 3);
    if (key.downArrow) setSelected(prev => (prev + 1) % 3);
    if (input === '1' || input === '2' || input === '3') {
      setSelected(parseInt(input) - 1);
    }
    if (input === '\r') {
      const decisions: ApprovalDecision[] = ['allow-once', 'allow-session', 'deny'];
      setAppState(prev => ({
        ...prev,
        ui: { ...prev.ui, pendingApproval: null }
      }));
      // 通知 agent
    }
  });

  if (!pending) return null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow">
      <Text color="yellow">⚠️  Permission Required</Text>
      <Text>Tool: {pending.tool}</Text>
      <Box flexDirection="column" marginTop={1}>
        {['Yes', 'Yes, allow all this session', 'No'].map((label, i) => (
          <Text key={i} color={selected === i ? 'cyan' : 'gray'}>
            {selected === i ? '> ' : '  '}{label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
```

---

## 9. 改造步骤

### Phase 1: 状态管理重构 (1-2 周)

**目标**: 移除全局变量，建立状态存储

1. **创建状态存储**
   ```typescript
   // src/state/createStore.ts
   export function createStore<T>(initialState: T) {
     type Listener = () => void;
     let state = initialState;
     const listeners = new Set<Listener>();

     return {
       getState: () => state,
       setState: (updater: Partial<T> | ((prev: T) => Partial<T>)) => {
         const update = typeof updater === 'function' ? updater(state) : updater;
         state = { ...state, ...update };
         listeners.forEach(listener => listener());
       },
       subscribe: (listener: Listener) => {
         listeners.add(listener);
         return () => listeners.delete(listener);
       }
     };
   }
   ```

2. **迁移组件状态**
   - `_approvalCursor` → `store.getState().ui.approvalCursor`
   - `pendingApprovalDecisionGlobal` → `store.getState().ui.pendingApproval`

3. **创建 useAppState hook**
   ```typescript
   export function useAppState<T>(selector: (state: AppState) => T): T {
     return useSyncExternalStore(
       store.subscribe,
       () => selector(store.getState()),
       () => selector(initialState)
     );
   }
   ```

### Phase 2: 组件迁移 (2-3 周)

**目标**: 将 pi-tui 组件迁移到 React + Ink

1. **逐个迁移组件**
   - `ChatLogComponent` → `ChatLog.tsx`
   - `ToolEventComponent` → `ToolEvent.tsx`
   - `CustomEditor` → `Editor.tsx`
   - `HintBarComponent` → `HintBar.tsx`

2. **创建组件测试**
   ```typescript
   import { render } from 'ink';
   import { ChatLog } from './ChatLog';

   test('renders messages', () => {
     const { lastFrame } = render(<ChatLog />);
     expect(lastFrame()).toContain('❯');
   });
   ```

### Phase 3: 事件处理重构 (1 周)

**目标**: 使用 useInput hook 统一事件处理

1. **迁移事件处理**
   ```typescript
   // 从
   editor.onApprovalKey = (data) => { ... };

   // 到
   useInput((input, key) => {
     if (input === '1' || input === '2' || input === '3') {
       setAppState(prev => ({ ...prev, ui: { ...prev.ui, approvalSelected: parseInt(input) - 1 } }));
     }
   });
   ```

2. **移除回调模式**
   - 替换 `onSlashChange`, `onApprovalKey` 等回调
   - 使用 `useAppState` 订阅状态变化

### Phase 4: 授权流程重构 (1 周)

**目标**: 解决授权竞态条件

1. **统一授权状态**
   ```typescript
   // 授权状态存储
   pendingApproval: {
     tool: string;
     args: Record<string, unknown>;
     selectedIndex: number;
     preStoredDecision?: ApprovalDecision; // 预存决策
   }

   // 键盘监听器优先处理授权
   useInput((input, key) => {
     const pending = useAppState(s => s.ui.pendingApproval);
     if (pending) {
       handleApprovalKey(input, key);
       return;
     }
     // 正常输入处理
   });
   ```

### Phase 5: 性能优化 (1 周)

**目标**: 优化渲染性能

1. **添加 Selector 优化**
   ```typescript
   // 组件只订阅需要的状态
   const editorText = useAppState(s => s.ui.editor.text);
   const isProcessing = useAppState(s => s.ui.isProcessing);
   ```

2. **添加 React.memo**
   ```typescript
   const ToolEvent = React.memo(({ id, tool, args }: ToolEventProps) => {
     // ...
   });
   ```

3. **移除手动节流**
   - 使用 React 18 自动批处理
   - 或使用 `startTransition` 处理非紧急更新

### Phase 6: 测试与文档 (1 周)

**目标**: 确保迁移质量

1. **组件测试覆盖**
2. **集成测试**
3. **更新文档**

---

## 附录

### A. 关键文件索引

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/cli.ts` | 1614 | TUI 主控制器 |
| `src/components/chat-log.ts` | 426 | 聊天日志组件 |
| `src/components/tool-event.ts` | 374 | 工具事件组件 |
| `src/components/custom-editor.ts` | 211 | 自定义编辑器 |
| `src/components/hint-bar.ts` | 415 | 提示栏组件 |
| `src/stdio/server.ts` | 548 | Stdio 服务器 |

### B. Loucode 参考文件

| 文件 | 功能 |
|------|------|
| `src/state/AppState.tsx` | 状态提供者 |
| `src/state/store.ts` | 状态存储实现 |
| `src/ink/hooks/use-input.ts` | 输入处理 Hook |
| `src/ink/hooks/use-app.ts` | App Context Hook |
| `src/query.ts` | 查询引擎 (1730 行) |

### C. 术语表

| 术语 | UpUp 实现 | Loucode 实现 |
|------|----------|--------------|
| 状态存储 | 全局变量 + 回调 | AppStateStore |
| 状态订阅 | requestRender() | useSyncExternalStore |
| 事件处理 | 回调链 | useInput hook |
| 组件通信 | 直接方法调用 | React Context |
| 渲染触发 | 手动 requestRender | React 自动重渲染 |

---

**报告生成时间**: 2026/05/28
**分析工具**: Claude Code
**版本**: 1.0
