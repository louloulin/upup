# UpUp 命令行交互改进计划 (cmd9.0.md)

> 基于 Claude Code (Loucode) 架构分析与 UpUp 代码深度分析
> 版本: 1.0 | 创建: 2026-05-30

---

## 🎯 目标

**参考 Claude Code (Loucode) 的优秀设计，重构 UpUp 命令系统架构，实现可靠的命令补全和导航功能**

---

## 📊 架构对比分析

### Claude Code (Loucode) 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Claude Code 架构                                     │
├───────────────────────────────────────────────────────────────────────┤
│  Commands (命令系统)                                                   │
│  ├── 类型分离: local / local-jsx / prompt                            │
│  ├── 多源聚合: 内置 + 技能目录 + 插件 + MCP + 工作流                   │
│  ├── Fuse.js 模糊匹配                                                 │
│  └── 懒加载: load() 延迟导入                                         │
│                                                                       │
│  Input Processing (输入处理)                                          │
│  ├── useTextInput Hook                                               │
│  ├── useKeybindings 上下文系统                                        │
│  ├── useDoublePress 双击机制                                          │
│  └── Keybindings 优先级与和弦序列                                      │
│                                                                       │
│  State Management (状态管理)                                          │
│  ├── Zustand 风格 createStore                                         │
│  ├── useSyncExternalStore 订阅模式                                   │
│  └── AppState Store (单一状态源)                                      │
│                                                                       │
│  Suggestion System (建议系统)                                          │
│  ├── commandSuggestions.ts (建议生成)                                  │
│  ├── PromptInputFooterSuggestions.tsx (渲染)                          │
│  └── 使用频率追踪 (优化排序)                                           │
└───────────────────────────────────────────────────────────────────────┘
```

### UpUp 当前架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UpUp 当前架构                                          │
├───────────────────────────────────────────────────────────────────────┤
│  Commands (命令系统)                                                   │
│  ├── @upup/commands (CLI命令)                                        │
│  ├── SkillCommandRegistry (Skill命令)                                  │
│  ├── getCliCommands() 合并                                            │
│  └── 问题: 两套系统独立维护                                             │
│                                                                       │
│  Input Processing (输入处理)                                            │
│  ├── CustomEditor (pi-tui)                                            │
│  ├── 回调模式: onSlashChange/Navigate/Select/Page                     │
│  └── 问题: slashActive 双重状态                                       │
│                                                                       │
│  State Management (状态管理)                                            │
│  ├── createStore (自定义实现)                                          │
│  ├── AppStateStore (应用统计)                                         │
│  ├── SessionState (会话状态)                                           │
│  └── 问题: 状态分散在多个模块                                          │
│                                                                       │
│  Suggestion System (建议系统)                                          │
│  ├── HintBarComponent.setSuggestions()                                │
│  ├── groupByCategory() 分类显示                                       │
│  └── 问题: 分页后选择重置                                              │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 问题诊断 (真实运行分析)

### 问题 1: slashActive 双重状态 [P0-严重]

**当前状态分布**:
```typescript
// cli.ts:585 - 全局状态
let slashActive = false;

// custom-editor.ts:28 - 本地状态
private slashActive: boolean = false;
```

**问题根源**: 两个状态独立维护，依赖回调链同步，可能不一致。

**触发链**:
```
用户输入 "/" 
  → custom-editor.handleInput() 
  → 检测 startsWith('/') 
  → this.slashActive = true  // 本地状态
  → onSlashChange(text)     // 触发回调
  → cli.onSlashChange()      // 同步全局状态
  → slashActive = true       // 全局状态
```

---

### 问题 2: 左右键完全被劫持 [P0-严重]

**当前代码** (custom-editor.ts:109-117):
```typescript
if (showingSuggestions && matchesKey(data, Key.left)) {
  this.onSlashPage?.('prev');  // 直接分页，不检查光标位置
  return;
}
if (showingSuggestions && matchesKey(data, Key.right)) {
  this.onSlashPage?.('next');
  return;
}
```

**影响**: 用户输入 `/model cla` 后，无法移动光标编辑参数。

**期望行为** (参考 Claude Code):
```typescript
if (showingSuggestions && this.cursorPosition === 0) {
  this.onSlashPage?.('prev');  // 光标在开头才分页
  return;
}
// 否则让编辑器处理光标移动
```

---

### 问题 3: 缺少 cursorPosition 属性 [P0-严重]

**问题**: `CustomEditor` 没有暴露光标位置。

**期望** (参考 Claude Code useTextInput):
```typescript
interface UseTextInputProps {
  value: string
  cursorPosition: number  // 缺失
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
}
```

---

### 问题 4: 建议更新延迟 [P1-中等]

**问题代码**:
```typescript
// cli.ts:1262-1267
editor.onSlashChange = async (text: string) => {
  slashSuggestions = getCliCommands(text);
  updateView();           // 间接调用
  tui.requestRender();    // 可能节流延迟
};
```

**对比 Claude Code**:
```typescript
// usePromptSuggestion.ts
const updateSuggestions = useCallback((input: string) => {
  setSuggestions(generateCommandSuggestions(input, commands));
}, [commands]);
```

---

### 问题 5: 分页后选择重置 [P2-低]

**问题代码** (cli.ts:1282-1292):
```typescript
editor.onSlashPage = (direction: 'next' | 'prev') => {
  hintBar.nextPage();
  const pageInfo = hintBar.getPageInfo();
  slashSelectedIndex = pageInfo.current * 10;  // 重置到页首
};
```

---

## 🏗️ 统一架构设计 (参考 Claude Code)

### 目标架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UpUp 目标架构                                          │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Command Registry (统一注册表)                 │  │
│  │  ├── CLI Commands (@upup/commands)                             │  │
│  │  ├── Skill Commands (SkillCommandRegistry)                       │  │
│  │  ├── Fuzzy Search (Fuse.js)                                      │  │
│  │  └── Usage Tracking (使用频率追踪)                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    CommandInput Controller                        │  │
│  │  ├── input: string                                                │  │
│  │  ├── cursorPosition: number                                      │  │
│  │  ├── suggestions: Command[]                                       │  │
│  │  ├── selectedIndex: number                                       │  │
│  │  └── mode: 'input' | 'suggestions' | 'executing'                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    State Store (单一状态源)                       │  │
│  │  ├── inputState: InputState                                      │  │
│  │  ├── commandState: CommandState                                  │  │
│  │  └── uiState: UIState                                            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    View Layer (视图层)                           │  │
│  │  ├── CommandSuggestions (建议列表)                              │  │
│  │  ├── CommandPreview (命令预览)                                  │  │
│  │  └── HintBar (快捷键提示)                                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

| 原则 | Claude Code 实现 | UpUp 目标实现 |
|------|------------------|---------------|
| 单一状态源 | AppState Store | CommandState + InputState |
| 光标位置追踪 | useTextInput | CommandInputController |
| 条件化分页 | 检查 cursorPosition | 同样检查 |
| 建议更新 | 同步更新 | 同步更新 |
| 使用频率 | getSkillUsageScore | commandUsageTracker |

---

## 📋 重构计划

### Phase 7: 状态统一 (核心)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 7.1 创建 CommandState Store | `src/tui/state/command-state.ts` | P0 | 统一命令状态 |
| 7.2 移除 cli.ts 中的 slashActive | `src/cli.ts` | P0 | 使用 Store |
| 7.3 创建 InputState Store | `src/tui/state/input-state.ts` | P0 | 输入状态 |
| 7.4 实现状态订阅 | `src/tui/hooks/use-command-state.ts` | P1 | 响应式更新 |

### Phase 8: 输入控制器 (最高优先级)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 8.1 创建 CommandInputController | `src/tui/command-input.ts` | P0 | 输入控制器 |
| 8.2 添加 cursorPosition 属性 | `CommandInputController` | P0 | 光标位置追踪 |
| 8.3 实现条件化左右键处理 | `custom-editor.ts` | P0 | 光标移动修复 |
| 8.4 添加 doublePress 支持 | `CommandInputController` | P1 | Esc 双击机制 |

### Phase 9: 建议系统

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 9.1 添加使用频率追踪 | `src/tui/state/command-usage.ts` | P1 | 优化排序 |
| 9.2 实现 Fuse.js 模糊搜索 | `src/tui/utils/fuzzy-search.ts` | P1 | 统一搜索 |
| 9.3 保持分页选择位置 | `hint-bar.ts` | P2 | 体验优化 |
| 9.4 实现命令预览 | `hint-bar.ts` | P2 | Hover 预览 |

### Phase 10: 集成测试

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 10.1 创建交互测试 | `scripts/oscript-cmd-interaction.ts` | P1 | 完整测试 |
| 10.2 10 轮验证 | - | P1 | 稳定性 |
| 10.3 文档更新 | cmd9.0.md | P2 | 完成记录 |

---

## 🔧 核心代码设计

### 1. CommandState Store

```typescript
// src/tui/state/command-state.ts

import { createStore } from './store.js';

export interface CommandState {
  // 命令列表
  commands: SlashCommand[];
  // 过滤后的建议
  suggestions: SlashCommand[];
  // 当前选中索引
  selectedIndex: number;
  // 搜索查询
  query: string;
  // 模式
  mode: 'idle' | 'suggestions' | 'executing';
  // 分页
  currentPage: number;
  totalPages: number;
  // 使用统计
  usageCount: Map<string, number>;
}

const initialState: CommandState = {
  commands: [],
  suggestions: [],
  selectedIndex: 0,
  query: '',
  mode: 'idle',
  currentPage: 0,
  totalPages: 0,
  usageCount: new Map(),
};

export const commandStore = createStore<CommandState>('command', initialState);

// Actions
export const commandActions = {
  setQuery(query: string) {
    commandStore.setState({ query });
  },

  setSuggestions(suggestions: SlashCommand[]) {
    commandStore.setState({
      suggestions,
      selectedIndex: 0,
      mode: suggestions.length > 0 ? 'suggestions' : 'idle',
    });
  },

  selectNext() {
    const { suggestions, selectedIndex } = commandStore.getState();
    if (suggestions.length > 0) {
      commandStore.setState({
        selectedIndex: Math.min(selectedIndex + 1, suggestions.length - 1),
      });
    }
  },

  selectPrev() {
    const { selectedIndex } = commandStore.getState();
    if (selectedIndex > 0) {
      commandStore.setState({ selectedIndex: selectedIndex - 1 });
    }
  },

  selectPage(page: number) {
    const { totalPages } = commandStore.getState();
    if (page >= 0 && page < totalPages) {
      commandStore.setState({ currentPage: page });
    }
  },

  recordUsage(commandName: string) {
    const { usageCount } = commandStore.getState();
    const count = (usageCount.get(commandName) || 0) + 1;
    const newMap = new Map(usageCount);
    newMap.set(commandName, count);
    commandStore.setState({ usageCount: newMap });
  },
};
```

### 2. CommandInputController

```typescript
// src/tui/command-input.ts

import { commandStore, commandActions } from './state/command-state.js';
import { getCliCommands } from '../cli.js';

export interface InputState {
  text: string;
  cursorPosition: number;
}

export class CommandInputController {
  private _text: string = '';
  private _cursorPosition: number = 0;
  private _inputCallback?: (text: string) => void;

  get text(): string { return this._text; }
  get cursorPosition(): number { return this._cursorPosition; }
  get hasSlashPrefix(): boolean { return this._text.startsWith('/'); }

  // 更新输入
  setText(text: string, cursorPosition: number = 0): void {
    this._text = text;
    this._cursorPosition = cursorPosition;
    this._onInputChange();
  }

  // 输入变化处理
  private _onInputChange(): void {
    if (this.hasSlashPrefix) {
      // 查询命令建议
      const suggestions = getCliCommands(this._text);
      commandActions.setSuggestions(suggestions);
      commandActions.setQuery(this._text);
    } else {
      // 清除建议
      commandStore.setState({ mode: 'idle', suggestions: [] });
    }
    this._inputCallback?.(this._text);
  }

  // 导航
  navigateUp(): void { commandActions.selectPrev(); }
  navigateDown(): void { commandActions.selectNext(); }

  // 分页 - 条件化
  canPagePrev(): boolean {
    const { currentPage } = commandStore.getState();
    return currentPage > 0;
  }

  canPageNext(): boolean {
    const { currentPage, totalPages } = commandStore.getState();
    return currentPage < totalPages - 1;
  }

  // 光标位置检查
  isAtStart(): boolean { return this._cursorPosition === 0; }
  isAtEnd(): boolean { return this._cursorPosition === this._text.length; }

  // 注册输入回调
  onInput(callback: (text: string) => void): void {
    this._inputCallback = callback;
  }
}
```

### 3. 条件化左右键处理

```typescript
// custom-editor.ts 修改

import { CommandInputController } from '../tui/command-input.js';

export class CustomEditor extends Editor {
  private commandController: CommandInputController;

  constructor() {
    super();
    this.commandController = new CommandInputController();
  }

  handleInput(data: string): void {
    const { mode } = commandStore.getState();

    // 左右键: 条件化处理
    if (matchesKey(data, Key.left)) {
      // 分页条件: suggestions 模式 + 光标在开头 + 有上一页
      if (mode === 'suggestions' &&
          this.commandController.isAtStart() &&
          this.commandController.canPagePrev()) {
        this.onSlashPage?.('prev');
        return;
      }
      // 否则处理光标移动
      super.handleInput(data);
      return;
    }

    if (matchesKey(data, Key.right)) {
      // 分页条件: suggestions 模式 + 光标在末尾 + 有下一页
      if (mode === 'suggestions' &&
          this.commandController.isAtEnd() &&
          this.commandController.canPageNext()) {
        this.onSlashPage?.('next');
        return;
      }
      // 否则处理光标移动
      super.handleInput(data);
      return;
    }

    // ... 其他按键处理
  }
}
```

---

## 📁 文件结构规划

```
src/
├── tui/
│   ├── state/
│   │   ├── store.ts              # 基础 Store
│   │   ├── command-state.ts      # 命令状态 (新增)
│   │   ├── input-state.ts        # 输入状态 (新增)
│   │   └── command-usage.ts      # 使用统计 (新增)
│   ├── command-input.ts          # 输入控制器 (新增)
│   ├── utils/
│   │   └── fuzzy-search.ts      # Fuse.js 搜索 (新增)
│   └── hooks/
│       └── use-command-state.ts  # 状态 Hook (新增)
├── components/
│   └── custom-editor.ts         # 修改: 使用 CommandInputController
└── cli.ts                       # 修改: 使用 Store
```

---

## 📊 整体修复进度

| Phase | 任务数 | 优先级 | 状态 |
|-------|--------|--------|------|
| Phase 7 (状态统一) | 4 | P0 | ✅ 100% 完成 |
| Phase 8 (输入控制器) | 4 | P0 | ✅ 100% 完成 |
| Phase 9 (建议系统) | 4 | P1/P2 | ✅ 100% 完成 |
| Phase 10 (集成测试) | 3 | P1/P2 | ✅ 100% 完成 |
| **总计** | **15** | - | **100% 完成** ✅ |

---

## 🧪 测试用例

### 核心测试场景

| 测试 | 期望行为 | 优先级 |
|------|----------|--------|
| T1: 输入 `/` 显示建议 | 应显示命令列表 | P0 |
| T2: 上下键导航 | 选择应上下移动 | P0 |
| T3: 输入 `/model cla` 后左键 | 光标应左移一位 | P0 |
| T4: 输入 `/model cla` 后右键 | 光标应右移一位 | P0 |
| T5: 光标在开头按左键 (有上页) | 应翻到上一页 | P0 |
| T6: 光标在末尾按右键 (有下页) | 应翻到下一页 | P0 |
| T7: Esc 双击清空 | 按两次清空输入 | P1 |
| T8: 命令使用频率 | 常用命令排前 | P2 |

---

## 🔗 参考文档

- Claude Code 命令系统: `/Users/louloulin/Documents/linchong/claw/loucode/src/commands.ts`
- Claude Code 建议系统: `/Users/louloulin/Documents/linchong/claw/loucode/src/utils/suggestions/`
- Claude Code 键盘处理: `/Users/louloulin/Documents/linchong/claw/loucode/src/hooks/useTextInput.ts`
- Claude Code 状态管理: `/Users/louloulin/Documents/linchong/claw/loucode/src/state/AppStateStore.ts`

---

*文档版本: 2.0*
*创建时间: 2026-05-30*
*最后更新: 2026-05-30*
*状态: Phase 7-10 全部完成 (100%) ✅*

---

## 附录 A: Claude Code 关键代码引用

### A.1 命令类型定义

```typescript
// src/types/command.ts
export type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)

type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>
}

type LocalJSXCommand = {
  type: 'local-jsx'
  load: () => Promise<LocalJSXCommandModule>
}
```

### A.2 建议生成

```typescript
// src/utils/suggestions/commandSuggestions.ts
const fuse = new Fuse(commandData, {
  includeScore: true,
  threshold: 0.3,
  keys: [
    { name: 'commandName', weight: 3 },
    { name: 'aliasKey', weight: 2 },
    { name: 'descriptionKey', weight: 0.5 },
  ],
})
```

### A.3 双击机制

```typescript
// src/hooks/useDoublePress.ts
const handleEscape = useDoublePress(
  (show: boolean) => { /* 提示 "Esc again to clear" */ },
  () => { /* 执行清空 */ },
)
```

### A.4 状态订阅

```typescript
// src/state/AppStateStore.ts
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, get, get)
}
```