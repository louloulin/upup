# UpUp 命令行交互改进计划 (cmd9.md)

> 基于完整代码深度分析 + Claude Code 参考实现
> 版本: 5.0 | 创建: 2026-05-30 | 更新: 2026-05-30

---

## 🎯 目标

**参考 Claude Code (Loucode) 架构，重构 UpUp 命令系统，实现可靠的命令补全和导航功能**

---

## 📊 架构对比

| 方面 | Claude Code (Loucode) | UpUp 当前 | UpUp 目标 |
|------|----------------------|----------|-----------|
| 状态管理 | Zustand + useSyncExternalStore | 多模块分散 | **CommandState Store** |
| 命令注册 | 多源聚合 (内置+技能+插件+MCP) | 两套独立 | **统一注册表** |
| 输入处理 | useTextInput Hook | CustomEditor 回调 | **CommandInputController** |
| 光标追踪 | useTextInput 内置 | ✅ 已添加 | **cursorPosition 属性** |
| 建议系统 | Fuse.js + 使用频率追踪 | ✅ 已实现 | **Fuse.js + UsageTracker** |
| 双击机制 | useDoublePress | 手动实现 | **doublePress 支持** |

---

## ✅ 已完成实现

### Phase 7: 状态统一 (核心) - 100% ✅

| 任务 | 文件 | 状态 |
|------|------|------|
| 7.1 创建 CommandState Store | `src/tui/state/command-state.ts` | ✅ 完成 |
| 7.2 创建 InputState Store | `src/tui/command-input.ts` | ✅ 完成 |
| 7.3 创建 CommandStateManager | `src/tui/command-state-manager.ts` | ✅ 完成 |

### Phase 8: 输入控制器 (最高优先级) - 100% ✅

| 任务 | 文件 | 状态 |
|------|------|------|
| 8.1 创建 CommandInputController | `src/tui/command-input.ts` | ✅ 完成 |
| 8.2 添加 cursorPosition 属性 | `custom-editor.ts` | ✅ 完成 |
| 8.3 实现条件化左右键处理 | `custom-editor.ts` | ✅ 完成 |

### Phase 9: 建议系统 - 100% ✅

| 任务 | 文件 | 状态 |
|------|------|------|
| 9.1 使用频率追踪 | `src/tui/state/command-state.ts` | ✅ 内置 |
| 9.2 Fuse.js 模糊搜索 | `src/tui/utils/fuzzy-search.ts` | ✅ 完成 |
| 9.3 分类分组显示 | `hint-bar.ts` groupByCategory() | ✅ 完成 |
| 9.4 分页支持 | `hint-bar.ts` nextPage/prevPage | ✅ 完成 |

---

## 🏗️ 目标架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UpUp 命令系统目标架构                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Command Registry (命令注册表)                                    │   │
│  │  ├── @upup/commands (CLI命令)                                   │   │
│  │  ├── SkillCommandRegistry (Skill命令)                            │   │
│  │  ├── getCliCommands() 合并                                      │   │
│  │  └── commandState.setSuggestions() 统一更新                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CommandState Store (命令状态)                                  │   │
│  │  ├── suggestions: SlashCommand[]                                │   │
│  │  ├── selectedIndex: number                                       │   │
│  │  ├── mode: 'idle' | 'suggestions' | 'executing'                │   │
│  │  ├── currentPage / totalPages / pageSize                        │   │
│  │  └── usageCount: Map<string, number>                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CommandInputController (输入控制器)                            │   │
│  │  ├── text / cursorPosition / hasSlashPrefix                    │   │
│  │  ├── isAtStart() / isAtEnd()                                   │   │
│  │  ├── shouldPageLeft() / shouldPageRight()                      │   │
│  │  └── navigateUp/Down()                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CustomEditor (编辑器)                                          │   │
│  │  ├── _cursorPosition: number                                    │   │
│  │  ├── 条件化左右键: 光标在边界才分页，否则移动光标                │   │
│  │  └── 上下键导航建议                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  HintBarComponent (提示栏)                                      │   │
│  │  ├── setSuggestions() 显示命令列表                              │   │
│  │  ├── groupByCategory() 分类分组                                  │   │
│  │  ├── nextPage/prevPage 分页                                      │   │
│  │  └── getPageInfo() 页信息                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 已创建文件清单

| 文件 | 功能 | 状态 |
|------|------|------|
| `src/tui/state/command-state.ts` | 统一命令状态 Store | ✅ 完成 |
| `src/tui/command-input.ts` | 输入控制器 | ✅ 完成 |
| `src/tui/command-state-manager.ts` | 集成层 (解决循环依赖) | ✅ 完成 |
| `src/tui/utils/fuzzy-search.ts` | Fuse.js 模糊搜索 | ✅ 完成 |
| `src/components/custom-editor.ts` | cursorPosition + 条件化分页 | ✅ 完成 |
| `src/cli.ts` | 集成 CommandState | ✅ 完成 |

---

## 📋 Claude Code 命令融合设计分析

### Claude Code 命令多源聚合

```typescript
// loucode/src/commands.ts
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const [
    { skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills },
    pluginCommands,
    workflowCommands,
  ] = await Promise.all([
    getSkills(cwd),           // skill dir + plugin skills
    getPluginCommands(),      // 插件命令
    getWorkflowCommands(cwd), // 工作流命令
  ]);

  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...workflowCommands,
    ...pluginCommands,
    ...pluginSkills,
    ...COMMANDS(),            // 内置命令
  ];
});
```

### UpUp 当前命令合并

```typescript
// cli.ts getCliCommands()
function getCliCommands(text: string) {
  const commands: SlashCommand[] = [...matchCommands(text)];  // CLI 命令
  const registry = getSkillCommandRegistry();
  const matchedSkills = registry.searchSkillsFuzzy(query, 10);  // Skill 命令
  return [...commands, ...matchedSkills].slice(0, 10);
}
```

### 建议: 统一命令融合

```typescript
// 建议的融合方案
async function getAllCommands(): Promise<SlashCommand[]> {
  const [cliCommands, skillCommands] = await Promise.all([
    getGlobalRegistry().getAll(),
    getSkillCommandRegistry().getAll(),
  ]);

  // 合并并去重
  const merged = [...cliCommands, ...skillCommands];
  const seen = new Set<string>();
  return merged.filter(cmd => {
    if (seen.has(cmd.name)) return false;
    seen.add(cmd.name);
    return true;
  });
}
```

---

## 🧪 测试场景

| 测试 | 期望行为 | 状态 |
|------|----------|------|
| T1: 输入 `/` 显示建议 | 应显示命令列表 | ⏳ 待测 |
| T2: 上下键导航 | 选择应上下移动 | ⏳ 待测 |
| T3: 输入 `/model cla` 后左键 | 光标应左移一位 | ⏳ 待测 |
| T4: 输入 `/model cla` 后右键 | 光标应右移一位 | ⏳ 待测 |
| T5: 光标在开头按左键 (有上页) | 应翻到上一页 | ⏳ 待测 |
| T6: 光标在末尾按右键 (有下页) | 应翻到下一页 | ⏳ 待测 |

---

## 📁 已修改文件

| 文件 | 修改内容 | 优先级 |
|------|----------|--------|
| `src/cli.ts` | 集成 CommandState + commandActions | ✅ 完成 |

---

*文档版本: 6.0*
*创建时间: 2026-05-30*
*最后更新: 2026-05-30*
*状态: Phase 7-10 完成 ✅*

---

## 附录 A: Claude Code 参考路径

| 功能 | 路径 |
|------|------|
| 命令多源聚合 | `/Users/louloulin/Documents/linchong/claw/loucode/src/commands.ts` |
| Fuse.js 建议 | `/Users/louloulin/Documents/linchong/claw/loucode/src/utils/suggestions/commandSuggestions.ts` |
| 键盘处理 Hook | `/Users/louloulin/Documents/linchong/claw/loucode/src/hooks/useTextInput.ts` |
| 状态管理 Store | `/Users/louloulin/Documents/linchong/claw/loucode/src/state/AppStateStore.ts` |

---

## 附录 B: 核心代码模板

### CommandState Store 使用

```typescript
import { commandStore, commandActions, commandSelectors } from './tui/state/command-state.js';

// 更新建议
commandActions.setSuggestions(suggestions);

// 导航
commandActions.selectNext();
commandActions.selectPrev();

// 分页
commandActions.nextPage();
commandActions.prevPage();

// 获取状态
const state = commandStore.getState();
const pageInfo = commandSelectors.getPageInfo();
```

### FuzzySearch 使用

```typescript
import { getCommandFuzzySearch } from './tui/utils/fuzzy-search.js';

const fuzzySearch = getCommandFuzzySearch();
fuzzySearch.setCommands(allCommands);

// 搜索
const results = fuzzySearch.search('/model', 10);

// 记录使用
fuzzySearch.recordUsage('model');
```

### CustomEditor 条件化分页

```typescript
// 左右键: 条件化处理
if (showingSuggestions && matchesKey(data, Key.left)) {
  // 只有光标在开头且有上一页才分页
  if (this._cursorPosition === 0 && this.onSlashPage) {
    this.onSlashPage('prev');
    return;
  }
  // 否则让编辑器处理光标移动
  super.handleInput(data);
  return;
}

if (showingSuggestions && matchesKey(data, Key.right)) {
  // 只有光标在末尾且有下一页才分页
  if (this._cursorPosition === this.getText().length && this.onSlashPage) {
    this.onSlashPage('next');
    return;
  }
  // 否则让编辑器处理光标移动
  super.handleInput(data);
  return;
}
```