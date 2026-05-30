# UpUp 命令行交互改进计划 (cmd9.0.md)

> 基于 Claude Code (Loucode) 架构分析与 UpUp 代码深度分析
> 版本: 2.0 | 创建: 2026-05-30 | 更新: 2026-05-30
> 状态: Phase 7-10 完成，待修复 P0-P2 问题

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
│  ├── useTextInput Hook (统一状态管理)                                 │
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
├───────────────────────────────────────────────────────────────────────────┤
│  Commands (命令系统)                                                   │
│  ├── @upup/commands (CLI命令)                                        │
│  ├── SkillCommandRegistry (Skill命令)                                  │
│  ├── getCliCommands() 合并 ✅                                          │
│  └── 问题: 两套系统独立维护                                             │
│                                                                       │
│  Input Processing (输入处理)                                            │
│  ├── CustomEditor (pi-tui)                                            │
│  ├── 回调模式: onSlashChange/Navigate/Select/Page                     │
│  └── 问题: slashActive 双重状态                                       │
│                                                                       │
│  State Management (状态管理)                                            │
│  ├── createStore (自定义实现) ✅                                       │
│  ├── CommandState Store ✅                                             │
│  ├── CommandInputController ✅                                        │
│  └── 问题: cli.ts 仍维护 slashActive 变量                             │
│                                                                       │
│  Suggestion System (建议系统)                                          │
│  ├── HintBarComponent.setSuggestions() ✅                             │
│  ├── groupByCategory() 分类显示 ✅                                     │
│  └── 问题: 分页后选择重置                                              │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 问题诊断 (真实运行分析)

### P0-1: slashActive 双重状态 [严重]

**当前状态分布**:
```typescript
// cli.ts:586 - 全局状态
let slashActive = false;
// custom-editor.ts:28 - 本地状态
private slashActive: boolean = false;
```

**修复方案**:
- 完全移除 cli.ts 中的 `slashActive` 变量
- 使用 `commandStore.getState().mode === 'suggestions'` 替代

---

### P0-2: 左右键完全被劫持 [严重]

**当前代码** (custom-editor.ts:109-117):
```typescript
if (showingSuggestions && matchesKey(data, Key.left)) {
  this.onSlashPage?.('prev');  // 直接分页，不检查光标位置
  return;
}
```

**已修复代码**:
```typescript
if (showingSuggestions && matchesKey(data, Key.left)) {
  if (this._cursorPosition === 0 && this.onSlashPage) {
    this.onSlashPage('prev');
    return;
  }
  super.handleInput(data);
  return;
}
```

---

### P0-3: 缺少 cursorPosition 属性 [严重]

**问题**: `CustomEditor` 的 `_cursorPosition` 跟踪不准确。

**原因**:
1. `updateCursorPosition()` 只在 `super.handleInput()` 后调用
2. pi-tui 的 Editor 不暴露真实光标位置 API

**参考 Claude Code**:
```typescript
// useTextInput.ts - 直接从编辑器获取光标
const cursorPosition = useRef(0);
```

---

## 🏗️ 统一架构设计 (参考 Claude Code)

### 目标架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UpUp 目标架构                                          │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Command Registry (统一注册表)                   │  │
│  │  ├── CLI Commands (@upup/commands)                             │  │
│  │  ├── Skill Commands (SkillCommandRegistry)                       │  │
│  │  ├── Fuzzy Search (Fuse.js)                                      │  │
│  │  └── Usage Tracking (使用频率追踪)                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    CommandInput Controller                       │  │
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

### Phase 11: 状态统一完成 (P0)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 11.1 | 移除 cli.ts slashActive | `cli.ts` | 使用 Store.mode 替代 |
| 11.2 | 统一状态更新 | `cli.ts` | 只通过 commandActions 更新 |
| 11.3 | 简化 hintBar 回调 | `hint-bar.ts` | 使用 Store 状态 |

### Phase 12: 光标位置精确化 (P0)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 12.1 | 查询 pi-tui 光标 API | `custom-editor.ts` | 查看 Editor 基类 |
| 12.2 | 改进光标更新逻辑 | `custom-editor.ts` | 精确跟踪光标 |
| 12.3 | 条件化分页验证 | `custom-editor.ts` | 测试左右键 |

### Phase 13: Controller 集成 (P1)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 13.1 | 创建 Controller 实例 | `cli.ts` | 单例模式 |
| 13.2 | CustomEditor 使用 Controller | `custom-editor.ts` | 通过 Controller |
| 13.3 | 同步双端光标位置 | `custom-editor.ts` | 双向同步 |

### Phase 14: 双击机制 (P1)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 14.1 | 实现 doublePress 逻辑 | `custom-editor.ts` | Esc 双击清空 |
| 14.2 | escPendingClear 状态 | `cli.ts` | 显示提示 |
| 14.3 | 测试双击清空 | - | 验证功能 |

### Phase 15: 性能优化 (P2)

| 任务 | 文件 | 优先级 | 描述 |
|------|------|--------|------|
| 15.1 | 命令去重 | `getCliCommands()` | 完善去重 |
| 15.2 | 记忆化搜索 | `fuzzy-search.ts` | 缓存结果 |
| 15.3 | 分页选择保持 | `hint-bar.ts` | 保持位置 |

---

## 📊 整体修复进度

| Phase | 任务数 | 优先级 | 状态 |
|-------|--------|--------|------|
| Phase 7 (状态统一) | 4 | P0 | ✅ 100% 完成 |
| Phase 8 (输入控制器) | 4 | P0 | ✅ 100% 完成 |
| Phase 9 (建议系统) | 4 | P1/P2 | ✅ 100% 完成 |
| Phase 11 (slashActive 修复) | 3 | P0 | ✅ 100% 完成 |
| Phase 12 (光标精确化) | 3 | P1 | ✅ 测试通过 |
| Phase 13 (Controller 集成) | 3 | P1 | ✅ 测试通过 |
| Phase 14 (双击机制) | 3 | P1 | ⚠️ 待实现 |
| Phase 15 (性能优化) | 3 | P2 | ⚠️ 待实现 |
| **总计** | **27** | - | **Phase 7-13 完成** |

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

### Claude Code 参考路径

| 功能 | 路径 |
|------|------|
| 命令多源聚合 | `/Users/louloulin/Documents/linchong/claw/loucode/src/commands.ts` |
| Fuse.js 建议 | `/Users/louloulin/Documents/linchong/claw/loucode/src/utils/suggestions/commandSuggestions.ts` |
| 键盘处理 Hook | `/Users/louloulin/Documents/linchong/claw/loucode/src/hooks/useTextInput.ts` |
| 状态管理 Store | `/Users/louloulin/Documents/linchong/claw/loucode/src/state/AppStateStore.ts` |

### Claude Code 关键代码引用

#### A.1 命令类型定义

```typescript
// src/types/command.ts
export type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)

type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>
}
```

#### A.2 建议生成

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

#### A.3 双击机制

```typescript
// src/hooks/useDoublePress.ts
const handleEscape = useDoublePress(
  (show: boolean) => { /* 提示 "Esc again to clear" */ },
  () => { /* 执行清空 */ },
)
```

#### A.4 状态订阅

```typescript
// src/state/AppStateStore.ts
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, get, get)
}
```

---

## 📁 文件结构规划

```
src/
├── tui/
│   ├── state/
│   │   ├── store.ts              # 基础 Store
│   │   ├── command-state.ts      # 命令状态 ✅
│   │   ├── input-state.ts        # 输入状态 ✅
│   │   └── command-usage.ts      # 使用统计 ✅
│   ├── command-input.ts          # 输入控制器 ✅
│   ├── command-state-manager.ts  # 集成层 ✅
│   ├── utils/
│   │   └── fuzzy-search.ts      # Fuse.js 搜索 ✅
│   └── hooks/
│       └── use-command-state.ts  # 状态 Hook (待创建)
├── components/
│   └── custom-editor.ts         # 修改: 集成 Controller
└── cli.ts                       # 修改: 移除 slashActive
```

---

*文档版本: 3.0*
*创建时间: 2026-05-30*
*最后更新: 2026-05-30*
*状态: Phase 7-13 完成，Phase 14-15 待实现*