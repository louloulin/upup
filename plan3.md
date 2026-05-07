# Dexter vs Loucode UI 差距分析与发展规划

**日期**: 2026-05-07
**版本**: 3.0
**重点**: UI 功能对比

---

## 1. 概述

本文档深入分析 **Dexter** 与 **Loucode** (Claude Code) 之间的 UI 架构差距，重点关注用户体验和交互功能。

### 核心发现

| 维度 | Loucode (Claude Code) | Dexter | 差距 |
|------|---------------------|--------|------|
| **UI框架** | Ink + React (自定义) | @mariozechner/pi-tui | 🔴 高 |
| **组件数量** | 148+ 组件 | ~12 组件 | 🔴 高 |
| **渲染器大小** | 251KB (Ink.tsx) | 未知 (pi-tui) | 🟡 中 |
| **主屏幕** | 900KB (REPL.tsx) | cli.ts (分散) | 🔴 高 |
| **键盘处理** | Kitty协议 + CSI u | 基础按键 | 🟡 中 |
| **焦点管理** | FocusManager 完整实现 | ❌ 无 | 🔴 高 |
| **文本选择** | Shift+方向键 + 剪贴板 | ❌ 无 | 🔴 高 |
| **输入历史** | ArrowKeyHistory Hook | 基础 | 🟡 中 |
| **模糊搜索** | FuzzyPicker 组件 | ❌ 无 | 🟡 中 |
| **自定义选择** | CustomSelect 115KB | ❌ 无 | 🔴 高 |
| **终端能力** | DEC 2026 + 鼠标 + 超链接 | 基础 | 🟡 中 |
| **虚拟列表** | 支持 | ❌ 无 | 🟡 中 |

---

## 2. 架构对比

### 2.1 Loucode UI 完整架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Loucode UI 架构                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         main.tsx (812KB)                                  │   │
│  │                    入口点 & 初始化                                       │   │
│  └────────────────────────────────┬────────────────────────────────────────┘   │
│                                   │                                              │
│  ┌────────────────────────────────▼────────────────────────────────────────┐   │
│  │                           App.tsx                                         │   │
│  │   AppStateProvider + StatsProvider + FpsMetricsProvider + MailboxProvider  │   │
│  └────────────────────────────────┬────────────────────────────────────────┘   │
│                                   │                                              │
│  ┌────────────────────────────────▼────────────────────────────────────────┐   │
│  │                         REPL.tsx (900KB)                                 │   │
│  │                     主交互终端界面                                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │  MessageList (虚拟列表) │ TaskPanel │ StatusBar │ InputArea    │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────┬────────────────────────────────────────┘   │
│                                   │                                              │
│            ┌──────────────────────┼──────────────────────┐                       │
│            ▼                      ▼                      ▼                       │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐      │
│  │ PromptInput.tsx  │  │      Dialogs         │  │    Design System     │      │
│  │     (355KB)     │  │   (多种对话框)       │  │   (18个组件)         │      │
│  │                 │  │                     │  │                     │      │
│  │ - 输入管理      │  │ - FuzzyPicker       │  │ - ThemeProvider     │      │
│  │ - 历史导航      │  │ - CustomSelect      │  │ - ThemedBox/Text    │      │
│  │ - Vim模式      │  │ - Select            │  │ - ListItem/Dialog   │      │
│  │ - 粘贴处理     │  │ - Confirm           │  │ - Tabs/Pane         │      │
│  │ - Shimmer高亮  │  │                     │  │                     │      │
│  └──────────────────┘  └──────────────────────┘  └──────────────────────┘      │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Ink.tsx (251KB)                                   │   │
│  │               React 渲染器 + ThemeProvider                               │   │
│  └────────────────────────────────┬────────────────────────────────────────┘   │
│                                   │                                              │
│  ┌────────────────────────────────▼────────────────────────────────────────┐   │
│  │                         /src/ink/ (自定义Ink)                            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ screen.ts  │  │ output.ts  │  │ log-update │  │ focus.ts   │       │   │
│  │  │ (49KB)    │  │ (输出)     │  │ (Diff更新) │  │ (焦点管理) │       │   │
│  │  │ 字符网格   │  │            │  │            │  │            │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ selection  │  │parse-keypress│ │ terminal.ts│  │  hooks/    │       │   │
│  │  │ (34KB)    │  │  (23KB)    │  │ (终端能力) │  │ (自定义)   │       │   │
│  │  │ 文本选择   │  │ 键盘解析   │  │            │  │            │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        终端能力 (Terminal Capabilities)                   │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ DEC 2026   │  │ SGR 鼠标   │  │  OSC 超链接 │  │  CSI u    │       │   │
│  │  │ 同步输出   │  │ 支持       │  │ (OSC 8)    │  │ 键盘协议  │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                       │   │
│  │  │ BIDI 文本  │  │ 进度报告   │  │ 颜色主题  │                       │   │
│  │  │ 重排序     │  │ (OSC 9;4) │  │ (256色)   │                       │   │
│  │  └────────────┘  └────────────┘  └────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         状态管理 (State Management)                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                     AppStateStore                                 │  │   │
│  │  │  Settings │ ExpandedView │ ToolPermission │ ModelSelection │     │  │   │
│  │  │  Speculation │ UI Mode (verbose/brief) │                      │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                       │   │
│  │  │  Store.ts  │  │  Context  │  │  Listener │                       │   │
│  │  │ (订阅模式) │  │ Provider  │  │  模式    │                       │   │
│  │  └────────────┘  └────────────┘  └────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         键盘绑定 (Keybindings)                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ parser.ts  │  │ resolver.ts│  │  default   │  │  Keybind- │       │   │
│  │  │ 解析 "ctrl│  │  匹配按键  │  │ Bindings   │  │  Context   │       │   │
│  │  │ +shift+k" │  │  到动作    │  │  默认绑定  │  │  React上下文│       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  │                                                                        │   │
│  │  默认绑定示例:                                                          │   │
│  │  'ctrl+c' → app:interrupt    'ctrl+d' → app:exit                     │   │
│  │  'ctrl+l' → app:redraw       'ctrl+t' → app:toggleTodos               │   │
│  │  'ctrl+o' → app:toggleTranscript  'ctrl+r' → history:search           │   │
│  │  'up' → history:previous     'down' → history:next                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Dexter 当前 UI 架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Dexter UI 架构                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         cli.ts (主入口)                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │               AgentRunnerController                                │  │   │
│  │  │  模型选择 │ 历史管理 │ 增量渲染 (~30fps) │ 事件处理              │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                   runCli() AsyncGenerator                          │  │   │
│  │  │  createScreen │ renderEvent │ throttledRender │ onSubmit        │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────┬────────────────────────────────────────┘   │
│                                   │                                              │
│  ┌────────────────────────────────▼────────────────────────────────────────┐   │
│  │                      /src/components/ (~12组件)                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ chat-log   │  │  working-  │  │  answer-   │  │   tool-    │       │   │
│  │  │            │  │ indicator  │  │   box      │  │   event    │       │   │
│  │  │ 消息显示   │  │  工作状态  │  │  回答显示  │  │  工具事件  │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ user-query │  │  hint-bar  │  │  approval- │  │   select-   │       │   │
│  │  │            │  │            │  │   prompt   │  │    list    │       │   │
│  │  │ 用户输入   │  │  提示栏   │  │  审批提示  │  │  选择列表  │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                       │   │
│  │  │  intro     │  │   debug-   │  │   custom-  │                       │   │
│  │  │            │  │   panel    │  │   editor   │                       │   │
│  │  └────────────┘  └────────────┘  └────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    pi-tui (@mariozechner/pi-tui)                         │   │
│  │                     基础终端UI组件库                                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │ Container   │  │   Text     │  │  Spacer   │  │   Screen   │       │   │
│  │  │ (容器)     │  │   (文本)   │  │  (空白)   │  │  (屏幕)    │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                       │   │
│  │  │   Box      │  │  Button    │  │  Input    │                       │   │
│  │  │  (方框)   │  │   (按钮)   │  │  (输入)   │                       │   │
│  │  └────────────┘  └────────────┘  └────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         主题系统 (theme.ts)                               │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │  colors: { text, muted, success, warning, error, border }        │  │   │
│  │  │  基础颜色支持，ANSI 代码                                          │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         输入处理 (cli.ts)                                 │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                       │   │
│  │  │ onCtrlC    │  │ onEscape   │  │ onSlash*  │                       │   │
│  │  │  (中断)    │  │  (取消/清空)│  │ (命令)    │                       │   │
│  │  └────────────┘  └────────────┘  └────────────┘                       │   │
│  │  基础按键处理，无复杂键盘协议支持                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. UI 功能对比矩阵

### 3.1 组件系统对比

| 功能 | Loucode | Dexter | 差距 | 优先级 |
|------|---------|--------|------|--------|
| **组件数量** | 148+ | ~12 | 🔴 高 | P0 |
| **设计系统** | 18个基础组件 | 基础颜色 | 🔴 高 | P0 |
| **主题系统** | ThemeProvider + 暗/亮/自动 | 固定颜色 | 🟡 中 | P1 |
| **FuzzyPicker** | ✅ 模糊搜索选择器 | ❌ | 🔴 高 | P1 |
| **CustomSelect** | ✅ 115KB完整选择器 | ❌ | 🔴 高 | P1 |
| **虚拟列表** | ✅ MessageList支持 | ❌ | 🟡 中 | P1 |
| **输入组件** | 355KB PromptInput | 基础 | 🔴 高 | P0 |

### 3.2 输入处理对比

| 功能 | Loucode | Dexter | 差距 | 优先级 |
|------|---------|--------|------|--------|
| **键盘协议** | CSI u (Kitty) + xterm | 基础按键 | 🔴 高 | P2 |
| **历史导航** | ArrowKeyHistory Hook | 基础 | 🟡 中 | P1 |
| **Vim模式** | ✅ 支持 | ❌ | 🟡 中 | P2 |
| **剪贴板** | ✅ 粘贴处理 | 基础 | 🟡 中 | P1 |
| **多行输入** | ✅ 支持 | 基础 | 🟡 中 | P1 |
| **快捷键** | 完整keybinding系统 | 基础 | 🟡 中 | P1 |
| **自动补全** | ✅ 菜单/建议 | ❌ | 🔴 高 | P0 |

### 3.3 渲染系统对比

| 功能 | Loucode | Dexter | 差距 | 优先级 |
|------|---------|--------|------|--------|
| **同步输出** | DEC 2026 | ❌ | 🟡 中 | P1 |
| **鼠标支持** | SGR 鼠标协议 | ❌ | 🟡 中 | P1 |
| **超链接** | OSC 8 | ❌ | 🟡 中 | P1 |
| **Diff更新** | log-update.ts | 增量渲染 | 🟢 低 | P2 |
| **BIDI文本** | ✅ 支持 | ❌ | 🟡 中 | P2 |
| **进度报告** | OSC 9;4 | ❌ | 🟡 中 | P2 |

### 3.4 焦点/选择系统对比

| 功能 | Loucode | Dexter | 差距 | 优先级 |
|------|---------|--------|------|--------|
| **焦点管理** | FocusManager | ❌ | 🔴 高 | P0 |
| **文本选择** | Shift+方向键 | ❌ | 🔴 高 | P1 |
| **复制选择** | ✅ 支持 | ❌ | 🔴 高 | P1 |
| **焦点导航** | Tab/FocusNext/Prev | ❌ | 🔴 高 | P0 |

---

## 4. 详细差距分析

### 4.1 核心组件差距

#### Loucode PromptInput (355KB) vs Dexter 用户输入

**Loucode PromptInput 特性**:
```typescript
// 文件: /src/components/PromptInput/PromptInput.tsx
interface PromptInputFeatures {
  // 文本输入
  text: string;
  cursorPosition: number;
  
  // 历史导航
  history: string[];
  historyIndex: number;
  
  // Vim 模式
  vimMode: 'normal' | 'insert' | 'visual';
  
  // 粘贴处理
  pasteHandler: (text: string) => void;
  
  // Shimmer/建议高亮
  suggestions: Suggestion[];
  highlightedRanges: Range[];
  
  // Token 预算可视化
  tokenBudget: number;
  usedTokens: number;
  
  // 命令检测
  slashCommands: SlashCommand[];
  agentMentions: string[];
}
```

**Dexter 当前实现**:
```typescript
// 文件: cli.ts
interface InputState {
  input: string;
  // 基础输入，无复杂功能
}
```

#### Loucode CustomSelect (115KB) vs Dexter select-list

**Loucode CustomSelect 特性**:
```typescript
// 文件: /src/components/CustomSelect/select.tsx
interface SelectState<T> {
  // 状态
  focusedValue: T | undefined;
  focusedIndex: number;
  visibleFromIndex: number;
  visibleToIndex: number;
  value: T | undefined;
  
  // 虚拟可见选项
  visibleOptions: Array<OptionWithDescription<T> & { index: number }>;
  
  // 导航方法
  focusNextOption: () => void;
  focusPreviousOption: () => void;
  focusNextPage: () => void;
  focusPreviousPage: () => void;
  selectFocusedOption: () => void;
}
```

**Dexter select-list**:
```typescript
// 文件: src/components/select-list.ts
// 基础列表实现，无虚拟化，无键盘导航
```

### 4.2 焦点管理差距

**Loucode FocusManager**:
```typescript
// 文件: /src/ink/focus.ts
export class FocusManager {
  activeElement: DOMElement | null = null;
  private focusStack: DOMElement[] = [];
  
  // 焦点控制
  focus(node: DOMElement): void;
  blur(): void;
  
  // 焦点导航
  focusNext(root: DOMElement): void;
  focusPrevious(root: DOMElement): void;
  
  // 堆栈管理
  pushFocus(node: DOMElement): void;
  popFocus(): DOMElement | undefined;
}
```

**Dexter**: 无焦点管理组件

### 4.3 键盘处理差距

**Loucode 键盘协议支持**:
```typescript
// 文件: /src/ink/parse-keypress.ts
// 支持的格式:
// - CSI u (Kitty键盘协议): ESC [ codepoint [; modifier] u
// - xterm modifyOtherKeys: ESC [ 27 ; modifier ; keycode ~
// - Meta keys: ESC + letter
// - Function keys: ESC O N/P, ESC [ rows ; cols R

interface KeyPress {
  type: 'key' | 'mouse' | 'paste';
  name?: string;           // e.g., 'up', 'down', 'ctrl+c'
  key?: string;            // e.g., 'a', 'A', 'Space'
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  mouse?: {
    action: 'press' | 'drag' | 'release';
    button: number;
    x: number;
    y: number;
  };
}
```

**Dexter 基础按键处理**:
```typescript
// cli.ts - 基础按键
switch (key) {
  case 'ctrl+c': // 中断
  case 'ctrl+d': // 退出
  case 'ctrl+l': // 清屏
  case 'escape': // 取消
}
```

### 4.4 状态管理差距

**Loucode AppStateStore**:
```typescript
// 文件: /src/state/AppStateStore.ts
interface AppState {
  // 设置持久化
  settings: Settings;
  
  // 展开视图状态
  expandedView: {
    tasks: boolean;
    teammates: boolean;
  };
  
  // 工具权限上下文
  toolPermissionContext: ToolPermissionContext;
  
  // 推测/补全状态
  speculation: SpeculationState;
  
  // 模型选择
  modelSelection: ModelSelection;
  
  // UI 模式
  uiMode: 'verbose' | 'brief';
}

// Store 实现
export type Store<T> = {
  getState: () => T;
  setState: (updater: (prev: T) => T) => void;
  subscribe: (listener: Listener) => () => void;
};
```

**Dexter 状态管理**: 通过 cli.ts 中的变量和 AgentRunnerController 管理

---

## 5. UI 增强计划

### 5.1 优先级矩阵

```
           功能完整性
               ▲
               │
          高   │  设计系统      自动补全
               │   P0           P0
               │
          中   │  焦点管理      输入增强
               │   P0           P1
               │
          低   │  键盘协议      虚拟列表
               │   P2           P1
               │
               └────────────────────────►
                      低    中    高
                          工作量
```

### 5.2 分阶段实施计划

#### Phase 0: 基础增强 (立即可做)

| 任务 | 工作量 | 优先级 | 文件 |
|------|--------|--------|------|
| 增强 select-list 组件 | 4h | P0 | `src/components/select-list.ts` |
| 添加键盘导航 | 4h | P0 | `src/components/select-list.ts` |
| 增强 user-query 组件 | 4h | P0 | `src/components/user-query.ts` |
| 添加历史导航 | 4h | P1 | `cli.ts` |

#### Phase 1: 设计系统 (2周)

| 任务 | 工作量 | 优先级 | 文件 |
|------|--------|--------|------|
| ThemeProvider 实现 | 8h | P0 | `src/components/theme-provider.ts` |
| ThemedBox/Text 组件 | 4h | P0 | `src/components/themed-box.ts` |
| Dialog 组件 | 6h | P1 | `src/components/dialog.ts` |
| ListItem/Tabs 组件 | 4h | P1 | `src/components/list-item.ts` |

#### Phase 2: 输入增强 (2周)

| 任务 | 工作量 | 优先级 | 文件 |
|------|--------|--------|------|
| PromptInput 重写 | 16h | P0 | `src/components/prompt-input.ts` |
| 自动补全菜单 | 8h | P0 | `src/components/autocomplete.ts` |
| FuzzyPicker 组件 | 8h | P1 | `src/components/fuzzy-picker.ts` |
| 历史搜索 | 4h | P1 | `cli.ts` |

#### Phase 3: CustomSelect 增强 (2周)

| 任务 | 工作量 | 优先级 | 文件 |
|------|--------|--------|------|
| 虚拟化列表实现 | 12h | P1 | `src/components/virtual-list.ts` |
| CustomSelect 重写 | 16h | P0 | `src/components/custom-select.ts` |
| 键盘导航 Hook | 4h | P0 | `src/hooks/use-select-nav.ts` |

#### Phase 4: 高级功能 (2周)

| 任务 | 工作量 | 优先级 | 文件 |
|------|--------|--------|------|
| FocusManager | 8h | P0 | `src/focus/manager.ts` |
| 文本选择系统 | 8h | P1 | `src/selection/manager.ts` |
| 键盘协议支持 | 12h | P2 | `src/input/keypress.ts` |
| 鼠标支持 | 8h | P2 | `src/input/mouse.ts` |

### 5.3 时间路线图

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              UI 增强时间线 (8周)                               │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│ Phase 0: 基础增强 (第1周)                                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ 增强 select-list │ 键盘导航 │ user-query │ 历史导航                      │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 1: 设计系统 (第2-3周)                                                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ ThemeProvider │ ThemedBox │ Dialog │ ListItem │ Tabs                    │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 2: 输入增强 (第4-5周)                                                   │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ PromptInput重写 │ 自动补全菜单 │ FuzzyPicker │ 历史搜索                  │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 3: CustomSelect增强 (第6-7周)                                           │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ 虚拟化列表 │ CustomSelect重写 │ 键盘导航Hook                               │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 4: 高级功能 (第8周)                                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ FocusManager │ 文本选择 │ 键盘协议 │ 鼠标支持                              │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 详细实施规格

### 6.1 PromptInput 增强规格

**目标**: 创建类似 Loucode 355KB PromptInput 的功能

```typescript
// src/components/prompt-input.ts

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  
  // 建议/补全
  suggestions?: Suggestion[];
  onSuggestionSelect?: (suggestion: Suggestion) => void;
  
  // 历史
  history?: string[];
  historySearch?: boolean;
  
  // Vim 模式 (可选)
  vimMode?: boolean;
  
  // Token 预算
  tokenBudget?: number;
  usedTokens?: number;
  
  // 占位符
  placeholder?: string;
}

class PromptInputComponent {
  // 状态
  private cursorPosition: number;
  private mode: 'insert' | 'normal' | 'visual';
  private historyIndex: number;
  private visibleSuggestions: Suggestion[];
  private highlightedRanges: Range[];
  
  // 方法
  setValue(value: string): void;
  getValue(): string;
  setCursor(position: number): void;
  
  // 键盘处理
  handleKeyPress(key: KeyPress): void;
  handleArrowUp(): void;     // 历史上一条
  handleArrowDown(): void;   // 历史下一条
  handleTab(): void;         // 自动补全
  handleEscape(): void;      // 取消/退出
  handleEnter(): void;       // 提交
  
  // 建议
  showSuggestions(suggestions: Suggestion[]): void;
  hideSuggestions(): void;
  selectSuggestion(index: number): void;
  
  // Vim 模式
  setMode(mode: 'insert' | 'normal' | 'visual'): void;
  
  // 渲染
  render(): Container;
}
```

### 6.2 CustomSelect 增强规格

```typescript
// src/components/custom-select.ts

interface SelectOption<T> {
  value: T;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

interface CustomSelectProps<T> {
  options: SelectOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  
  // 虚拟化
  virtualized?: boolean;
  itemHeight?: number;
  visibleItems?: number;
  
  // 搜索
  searchable?: boolean;
  filterFn?: (option: SelectOption<T>, query: string) => boolean;
  
  // 键盘导航
  loop?: boolean;
  pageSize?: number;
}

class CustomSelectComponent<T> {
  // 状态
  private focusedIndex: number;
  private visibleFromIndex: number;
  private visibleToIndex: number;
  private filterQuery: string;
  
  // 虚拟列表
  private virtualList: VirtualList;
  
  // 方法
  focusNext(): void;
  focusPrevious(): void;
  focusNextPage(): void;
  focusPreviousPage(): void;
  selectFocused(): void;
  search(query: string): void;
  
  // 渲染
  render(): Container;
}
```

### 6.3 FocusManager 设计

```typescript
// src/focus/manager.ts

class FocusManager {
  private static instance: FocusManager;
  private activeElement: FocusableElement | null = null;
  private focusStack: FocusableElement[] = [];
  
  static getInstance(): FocusManager {
    if (!FocusManager.instance) {
      FocusManager.instance = new FocusManager();
    }
    return FocusManager.instance;
  }
  
  focus(element: FocusableElement): void;
  blur(): void;
  pushFocus(element: FocusableElement): void;
  popFocus(): FocusableElement | undefined;
  focusNext(): void;
  focusPrevious(): void;
  
  getActiveElement(): FocusableElement | null;
  isFocused(element: FocusableElement): boolean;
}

// 焦点可元素接口
interface FocusableElement {
  focus(): void;
  blur(): void;
  focusNext(): FocusableElement | null;
  focusPrevious(): FocusableElement | null;
  tabIndex: number;
}

// React Hook
function useFocusManagement(): FocusManager;
function useFocusable(): { ref: RefObject<FocusableElement> };
```

---

## 7. 快速实现建议

### 7.1 最小可行 UI 增强 (Week 1)

**目标**: 在不改变核心架构的情况下增强现有组件

1. **增强 select-list.ts**
```typescript
// 添加键盘导航
class SelectListComponent {
  handleKeyPress(key: string) {
    switch (key) {
      case 'up':
        this.focusPrevious();
        break;
      case 'down':
        this.focusNext();
        break;
      case 'enter':
        this.selectFocused();
        break;
      case 'escape':
        this.cancel();
        break;
    }
  }
}
```

2. **增强 user-query.ts**
```typescript
// 添加历史导航
class UserQueryComponent {
  private history: string[] = [];
  private historyIndex = -1;
  
  handleArrowUp() {
    if (this.history.length > 0) {
      this.historyIndex = Math.min(
        this.historyIndex + 1,
        this.history.length - 1
      );
      this.setValue(this.history[this.historyIndex]);
    }
  }
}
```

### 7.2 主题系统实现

```typescript
// src/components/theme-provider.ts

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Theme {
  mode: ThemeMode;
  colors: {
    background: string;
    foreground: string;
    primary: string;
    secondary: string;
    muted: string;
    success: string;
    warning: string;
    error: string;
    border: string;
    accent: string;
  };
}

const lightTheme: Theme = { /* ... */ };
const darkTheme: Theme = { /* ... */ };

export function useTheme(): Theme;
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element;
```

---

## 8. 成功指标

| 指标 | 当前 | Phase 1后 | Phase 2后 | 最终目标 |
|------|------|-----------|-----------|---------|
| 组件数量 | 12 | 20 | 35 | 50+ |
| 输入功能 | 基础 | 增强 | 完整 | 类Loucode |
| 键盘导航 | 基础 | 完整 | 完整 | 完整 |
| 主题系统 | 固定颜色 | 支持切换 | 支持自定义 | 支持 |
| 虚拟列表 | ❌ | ✅ | ✅ | ✅ |
| 焦点管理 | ❌ | 基础 | 完整 | 完整 |

---

## 9. 附录

### A. Loucode UI 参考文件

| 组件 | 文件路径 |
|------|---------|
| Ink 渲染器 | `/src/ink.tsx` (251KB) |
| REPL 主屏幕 | `/src/screens/REPL.tsx` (900KB) |
| PromptInput | `/src/components/PromptInput/PromptInput.tsx` (355KB) |
| CustomSelect | `/src/components/CustomSelect/select.tsx` (115KB) |
| FocusManager | `/src/ink/focus.ts` |
| 键盘解析 | `/src/ink/parse-keypress.ts` (23KB) |
| 文本选择 | `/src/ink/selection.ts` (34KB) |
| 屏幕管理 | `/src/ink/screen.ts` (49KB) |
| AppState | `/src/state/AppStateStore.ts` |
| Keybindings | `/src/keybindings/` (完整目录) |
| Design System | `/src/components/design-system/` (18文件) |

### B. Dexter UI 当前文件

| 组件 | 文件路径 |
|------|---------|
| CLI 入口 | `src/cli.ts` |
| Chat Log | `src/components/chat-log.ts` |
| Working Indicator | `src/components/working-indicator.ts` |
| Answer Box | `src/components/answer-box.ts` |
| Tool Event | `src/components/tool-event.ts` |
| User Query | `src/components/user-query.ts` |
| Hint Bar | `src/components/hint-bar.ts` |
| Approval Prompt | `src/components/approval-prompt.ts` |
| Select List | `src/components/select-list.ts` |
| Intro | `src/components/intro.ts` |
| Debug Panel | `src/components/debug-panel.ts` |
| Custom Editor | `src/components/custom-editor.ts` |
| Theme | `src/theme.ts` |

---

*文档结束*
