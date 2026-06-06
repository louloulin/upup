---
comet_change: simplify-cmd-autocomplete-pi-tui
role: technical-design
canonical_spec: openspec
---

# 深度技术设计：simplify-cmd-autocomplete-pi-tui

> **范围**：本文档是 `comet-design` 阶段产出，基于 `comet-open` 阶段已落地的 OpenSpec 产物做**实施级**技术细化。OpenSpec 是规范的唯一真相源；本文档不重写需求，只补充实现细节。
>
> **v2 关键决策（基于 pi-tui 实际 API 调研后）**：
> 1. **不写自定义 provider** — pi-tui 已经在 `CombinedAutocompleteProvider` 中实现了 slash 补全、`/${name} ` 尾随空格、fuzzy 过滤、`@` 触发文件补全。**直接接线 3 行**。
> 2. **不写 provider 单元测试** — `CombinedAutocompleteProvider` 由 pi-tui 上游维护、有自己的测试。补 1 个集成测试即可。
> 3. **删除 v1 已写的 `slash-autocomplete-provider.ts` 和测试** — 不需要。
> 4. **行为变化**：Enter 在 slash 弹窗里会**直接提交**（pi-tui 默认行为），与 codex / claude code 一致；当前 upup 是"只补全不提交"。这是有意的对齐。
>
> **净行数变化**：从原估的 -830 行提升至 **-910 行**（不写 provider 文件 + 测试，约 200 行）。

---

## 1. 架构

### 1.1 顶层数据流

```
                用户键入 "/mo"
                      │
                      ▼
   ┌─────────────────────────────────────────────┐
   │  @earendil-works/pi-tui  Editor             │  ◀── 唯一状态源
   │  (autocompleteState, 私有)                  │
   │                                             │
   │  1. tryTriggerAutocomplete()  (每键)        │
   │  2. 调用 provider.getSuggestions(...)        │
   │  3. 用返回的 items 渲染内置下拉               │
   │  4. 监听 ↑↓/Tab/Enter/Esc                  │
   │  5. 用户按 Tab 调 applyCompletion           │
   │  6. 用户按 Enter 调 applyCompletion + 提交  │
   └──────────────────┬──────────────────────────┘
                      │  3 个方法调用
                      ▼
   ┌─────────────────────────────────────────────┐
   │  CombinedAutocompleteProvider (上游)        │  ◀── 已实现
   │  (node_modules/@earendil-works/pi-tui)      │
   │                                             │
   │  - getSuggestions()  ──→ slash 模糊 + 文件  │
   │  - applyCompletion() ──→ /<name>  插入     │
   │  - shouldTriggerFileCompletion() ──→ Tab    │
   └──────────────────┬──────────────────────────┘
                      │  读
                      ▼
   ┌─────────────────────────────────────────────┐
   │  @upup/commands                             │
   │  (SlashCommand[] 直接喂给上游)              │
   └─────────────────────────────────────────────┘

   ── cli.ts 接线 (3 行) ─────────────────────────
   editor.setAutocompleteProvider(
     new CombinedAutocompleteProvider(
       getAllSlashCommands(), process.cwd()));
   editor.setAutocompleteMaxVisible(8);
```

### 1.2 模块边界（内聚 / 耦合审计）

| 单元 | 单一职责 | 依赖 | 能否独立理解？ |
|------|---------|------|---------------|
| `CombinedAutocompleteProvider` (pi-tui) | 补全渲染 + 键处理 + 内部状态 | 上游黑盒 | ✅ 由 pi-tui 维护 |
| `Editor` (pi-tui) | 编辑器 + 内置补全 | 上游黑盒 | ✅ 由 pi-tui 维护 |
| `CustomEditor` (upup) | Vim/Emacs + kill-ring + 历史 | Editor（继承）+ kill-ring | ✅ 删 slash 路由后仅剩编辑增强 |
| `StatusHint` (NEW, ~30 行) | 单行 esc/processing/permission 提示 | theme | ✅ 纯渲染 |
| `cli.ts` 接线 | 1 个 `setAutocompleteProvider` + 1 个 `setAutocompleteMaxVisible` | Editor, Provider, StatusHint | ✅ 最小胶水 |

**判定**：5 个单元职责互不重叠；`CustomEditor` 不再知道 slash 概念，只知道 Vim/Emacs；`cli.ts` 不再 `onSlash*` 接线。**符合"高内聚、低耦合"目标**。

### 1.3 不再存在的旧单元（行数变化表）

| 删除/瘦身 | 原行数 | 新行数 | 删除原因 |
|----------|-------|-------|---------|
| `HintBarComponent`（删） | 545 | 0 | pi-tui Editor 已内置下拉渲染 |
| `CustomEditor` 的 6 个 `onSlash*` 回调 + ~150 行路由块 | 489 | ~250 | pi-tui Editor 已内置 ↑↓/Tab/Enter/Esc |
| `InputState` 的 6 个 suggestion 字段 + 6 个 action + 9 selector | ~160 (实际 579 含其他状态) | ~500 | pi-tui Editor 内部持有 autocompleteState |
| `UnifiedCommandRegistry`（Fuse + 分类 + 用量 + matchCommands 重写） | 399 | ~30 | `CombinedAutocompleteProvider` 用内置 fuzzyFilter |
| `cli.ts` 的 `onSlash*` + `hintBar.setSuggestions/clear/refresh/nextPage/prevPage` 接线 | ~80 | ~5 | 1 个 `setAutocompleteProvider` 替代 |
| `slash-autocomplete-provider.ts` (v1 设计的，**v2 删除**) | 0 → 80 (不写) | 0 | CombinedAutocompleteProvider 已实现 |
| `slash-autocomplete-provider.test.ts` (v1 设计的，**v2 删除**) | 0 → 100 (不写) | 0 | 上游测试覆盖 |
| `status-hint.ts` (NEW) | 0 | ~30 | 替代 hint-bar.ts 的单行提示职责 |
| **合计** | **~1,773** | **~845** | 净 **-928 行** |

---

## 2. 接线实现（仅 cli.ts 3 行）

> **关键发现**：pi-tui 的 `CombinedAutocompleteProvider` 已经实现了 v1 design 中 `SlashCommandAutocompleteProvider` 的所有功能，且**支持 v1 design 没考虑的能力**（文件补全、参数补全、Tab 触发）。我们不需要自己写 provider。

### 2.1 接线代码

```ts
// src/cli.ts  (在 editor 构造后追加 3 行)
import { CombinedAutocompleteProvider } from '@earendil-works/pi-tui';
import { getAllSlashCommands } from '@upup/commands';

const editor = new CustomEditor(/* existing args */);
editor.setAutocompleteProvider(
  new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
);
editor.setAutocompleteMaxVisible(8);
```

### 2.2 类型兼容性

`CombinedAutocompleteProvider` 构造签名（来自 `node_modules/@earendil-works/pi-tui/dist/autocomplete.d.ts`）：

```ts
constructor(
  commands: (AutocompleteItem | SlashCommand)[] | undefined,
  basePath: string,
  fdPath?: string | null,
);
```

pi-tui `SlashCommand` 类型：
```ts
interface SlashCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  getArgumentCompletions?(argumentPrefix: string): Awaitable<AutocompleteItem[] | null>;
}
```

upup `SlashCommand` 类型（`packages/commands/src/all-commands.ts:361`）：
```ts
interface SlashCommand {
  name: string;
  description: string;        // 必填
  category: CommandCategory;  // 额外字段（被 pi-tui 忽略）
  aliases?: string[];          // 额外字段（被 pi-tui 忽略）
}
```

**类型兼容性**：upup `SlashCommand` 结构上满足 pi-tui `SlashCommand`（`name` + `description` 都存在且兼容），额外字段 `category` / `aliases` 被忽略。TypeScript 结构化类型检查通过。

`argumentHint` / `getArgumentCompletions` 在 upup 中不存在 → CombinedAutocompleteProvider 调用时这些分支被跳过（"argumentHint" in cmd 检查）。upup 不支持参数补全，与 v1 design §13 范围外一致。

### 2.3 动态命令支持

`CombinedAutocompleteProvider` 在构造时拍下 `commands` 数组引用，新增的 dynamic command 不会自动出现。**两种解法**：

- **方案 A（v2 默认）**：构造一次后命令列表稳定。upup 的 dynamic command 主要在 plugin / skill 启动期注册，运行时新增罕见。CLI 重启即生效。
- **方案 B（如需运行时支持）**：暴露一个 `refreshProvider()` 函数，重新构造并调用 `editor.setAutocompleteProvider()`。~5 行。

**v2 采用方案 A**。如果后续发现 dynamic command 真的需要运行时刷新，开一个 5 行 follow-up PR 加方案 B。

---

## 3. CustomEditor 改造清单

> 与 v1 design 一致，因为改动目标是删除"自建 slash 路由"，与"用 CombinedAutocompleteProvider 还是自定义 provider"无关。

### 3.1 删除（~180 行）

| 字段/方法 | 位置 | 删除原因 |
|----------|------|---------|
| `onSlashChange?: (text: string) => void` | 类字段 | pi-tui Editor 内部触发 |
| `onSlashNavigate?: (direction: 'up' \| 'down') => void` | 类字段 | pi-tui Editor 内置 ↑↓ |
| `onSlashPage?: (direction: 'next' \| 'prev') => void` | 类字段 | pi-tui Editor 内置 ←→ |
| `onSlashSelect?: () => void` | 类字段 | pi-tui Editor 内置 Tab |
| `onSlashDismiss?: () => void` | 类字段 | pi-tui Editor 内置 Esc |
| `onSlashExactMatch?: (text: string) => boolean` | 类字段 | pi-tui Editor 内置 Tab 自动完成 |
| `get slashActive(): boolean` | getter | 改用 `editor.isShowingAutocomplete()` |
| `canPageLeft() / canPageRight()` | 方法 | pi-tui Editor 内部处理 |
| `handleInput` 中的 slash 路由块 | ~150 行 | pi-tui Editor 内部处理 |

### 3.2 保留

| 字段/方法 | 保留原因 |
|----------|---------|
| `onEscape?` / `onCtrlC?` | Esc/Ctrl+C 通用行为 |
| `addToHistoryWithTruncation` / `getFullText` | 多行粘贴 + 历史压缩 |
| Vim/Emacs 快捷键层 | 与 slash 无关 |
| `getSlashCursor` / `syncCursor` | 给 kill-ring / yank 用 |
| `resolveKeybinding` / `dataToKeyEvent` | 扩展 hook |
| `onApprovalKey` / `onApprovalNavigate` / `onApprovalSelect` / `onSessionListKey` | 审批与会话模式，不属于 slash |

**净效果**：`CustomEditor` 从 489 行瘦身到 ~250 行（-49%）。

---

## 4. InputState 改造清单

### 4.1 删除（~80 行）

| 字段 | 替代 |
|------|------|
| `showingSuggestions: boolean` | `editor.isShowingAutocomplete()` |
| `suggestions: SlashCommand[]` | pi-tui Editor 内部 |
| `selectedIndex: number` | pi-tui Editor 内部 |
| `currentPage: number` | pi-tui Editor 内部 |
| `totalPages: number` | pi-tui Editor 内部 |
| `pageSize: number` | `editor.setAutocompleteMaxVisible(8)` 注入 |

| Action | 替代 |
|--------|------|
| `setSuggestions(suggestions)` | Provider 内部 |
| `showSuggestions(suggestions)` | 同上 |
| `hideSuggestions()` | `editor.cancelAutocomplete()`（或 Esc 由 pi-tui 自动处理） |
| `selectNext()` / `selectPrev()` | ↑↓ 键 pi-tui 内部 |
| `nextPage()` / `prevPage()` | ←→ 键 pi-tui 内部 |

| Selector | 替代 |
|----------|------|
| `isShowingSuggestions()` | `editor.isShowingAutocomplete()` |
| `getSuggestions()` / `getSelectedIndex()` / `getPageInfo()` | pi-tui Editor 内部 |
| `getSelectedSuggestion()` | pi-tui Editor 内部 |

### 4.2 保留

| 字段/Action | 保留原因 |
|------------|---------|
| `text` / `cursorPosition` | 给 status hint + keybinding resolver 读 |
| `inputMode` / `query` | 给上层（agent runner、bridge）读 |
| `usageCount: Map<string, number>` | 后续可做频率排序 |
| `history` / `historyIndex` | 持久化用户输入历史 |
| `moveCursor*` / `setText` / `setCursorPosition` | 上层调用 |
| `recordUsage` / `getUsage` / `addToHistory` / `historyUp` / `historyDown` | 使用统计 + 历史 |

**净效果**：`InputState` 实际从 579 行瘦身到 ~500 行（删除 ~80 行 suggestion 相关代码，保留 history / mode / usageCount 等与本 change 无关的状态）。

### 4.3 验证

```bash
grep -rn "showingSuggestions\|inputActions.setSuggestions\|inputActions.hideSuggestions\|inputActions.selectNext\|inputActions.selectPrev\|inputActions.nextPage\|inputActions.prevPage\|inputSelectors.isShowingSuggestions\|inputSelectors.getSuggestions\|inputSelectors.getSelectedIndex\|inputSelectors.getPageInfo" src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts'
# 预期输出: (空)
```

---

## 5. 统一注册表改造清单

### 5.1 当前（`src/commands/unified-registry.ts`，399 行）

包含：`UnifiedCommandRegistry` 类（实例缓存、Fuse 索引、分类映射、用量统计）、9 个对外方法、6 个工具函数、1 个全局单例。

### 5.2 目标（~30 行）

```ts
// src/commands/unified-registry.ts  (重写为薄 builder)
import { getAllSlashCommands, findCommand as upstreamFindCommand, type SlashCommand } from '@upup/commands';

/** Provider 用：列出当前所有 slash 命令（含动态 + 技能） */
export function listAllCommands(): SlashCommand[] {
  return getAllSlashCommands();
}

/** Executor 用：按名称或别名解析命令 */
export function findCommand(name: string): SlashCommand | undefined {
  return upstreamFindCommand(name);
}
```

### 5.3 删除项

| 删除 | 原因 |
|------|------|
| `Fuse.js` 索引 | `CombinedAutocompleteProvider` 内置 fuzzyFilter |
| `inferCategory` / `CATEGORY_MAP` | 分类展示已删（codex/claude code 不分分类） |
| `recordCommandUsage` / `getCommandUsage` / `getCommandCount` | 无消费者 |
| `fuzzySearch` / `searchByPrefix` / `getSuggestions` | 无消费者 |
| `getUnifiedCommandRegistry` / `resetUnifiedCommandRegistry` / 全局单例 | 无状态后不需要单例 |

### 5.4 验证

```bash
grep -rn "fuzzySearch\|searchByPrefix\|getUnifiedCommandRegistry\|recordCommandUsage\|getCommandUsage\|getCommandCount\|UnifiedCommand\|getCliCommands" src/ packages/ --include='*.ts' --include='*.tsx' | grep -v unified-registry.ts | grep -v '\.test\.ts'
# 预期输出: (空)
```

---

## 6. hint-bar.ts → status-hint.ts

### 6.1 当前（545 行）

3 大块功能：建议下拉、分类分组、单行 esc/processing/permission 提示。**只保留第三块**。

### 6.2 目标（`src/components/status-hint.ts`，~30 行）

```ts
import { Text } from '@earendil-works/pi-tui';
import { theme } from '../theme.js';

export interface StatusHintState {
  isProcessing: boolean;
  hasPendingApproval: boolean;
  hasInput: boolean;
  escPendingClear: boolean;
  escPendingExit: boolean;
  queueLength: number;
  permissionModeLabel?: string;
  permissionModeSource?: string;
}

export class StatusHintComponent {
  private text: Text;
  constructor() { this.text = new Text('', 0, 0); }

  update(state: StatusHintState): void {
    const left: string[] = [];
    const right: string[] = [];

    if (state.escPendingClear) right.push('esc again to clear');
    else if (state.escPendingExit) right.push('esc again to exit');
    else if (state.isProcessing) right.push('esc to stop');

    if (state.isProcessing) {
      const q = state.queueLength > 0 ? ` · ${state.queueLength} queued` : '';
      left.push(`⏳ processing${q}`);
    } else if (state.hasPendingApproval) {
      left.push('↑↓ navigate · Enter to confirm · esc to deny');
    } else if (state.hasInput) {
      left.push('Enter to send · esc to cancel');
    } else {
      left.push('/ for commands');
    }

    const permBadge = state.permissionModeLabel
      ? `${state.permissionModeLabel} · ` : '';

    this.text.setText(permBadge + left.join(' · ') + '   ' + right.join(' · '));
  }

  render(width: number): string[] { return this.text.render(width); }
  handleInput(): void { /* no-op */ }
  invalidate(): void { this.text.invalidate(); }
}
```

**净效果**：545 → 30 行（-94%）。

---

## 7. cli.ts 接线（净变化 +5 / -80 行）

### 7.1 新增（~5 行）

```ts
// src/cli.ts  (在 editor 构造后追加)
import { CombinedAutocompleteProvider } from '@earendil-works/pi-tui';
import { getAllSlashCommands } from '@upup/commands';

// 替换:
//   const hintBar = new HintBarComponent();
//   root.addChild(hintBar);
const statusHint = new StatusHintComponent();
root.addChild(statusHint);

// 在 editor 构造后追加:
editor.setAutocompleteProvider(
  new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
);
editor.setAutocompleteMaxVisible(8);
```

### 7.2 删除（~80 行）

- `editor.onSlashChange = async (text) => { ... }`（~10 行）
- `editor.onSlashExactMatch = (text) => { ... }`（~15 行）
- `editor.onSlashNavigate = (direction) => { ... }`（~10 行）
- `editor.onSlashPage = (direction) => { ... }`（~12 行）
- `editor.onSlashSelect = () => { ... }` 中的 autocomplete 分支（保留 fallback 到 `handleSlashCommand`）
- `editor.onSlashDismiss = () => { ... }`（~5 行）
- `updateView()` 中的 `hintBar.setSuggestions` / `hintBar.clearSuggestions` / `hintBar.refreshPage` / `hintBar.nextPage` / `hintBar.prevPage` 引用（~10 行）
- `getCliCommands` import（~1 行）

**净效果**：~80 行删除 + ~5 行新增 = 净 -75 行。

### 7.3 Enter 行为变化（重要）

**v1 行为**（旧 upup）：
- 用户在 `/mo` 弹窗中按 Enter → `onSlashSelect` 被调用，**清空 editor + 手动 `handleSlashCommand('morning-brief', '')`**
- 用户需要输入 args 时，args 加在 `/morning-brief` 后面再按 Enter 才提交

**v2 行为**（pi-tui CombinedAutocompleteProvider）：
- 用户在 `/mo` 弹窗中按 Enter → `applyCompletion` 插入 `/morning-brief `（尾随空格）→ 弹窗关闭 → **onSubmit 自动调用，editor 提交 `/morning-brief `**（含尾随空格）
- `handleSlashCommand('morning-brief', '')` 由 `onSubmit` 解析触发，**逻辑不变**（cli.ts 中的 `onSubmit` 已存在处理 `getText().trim()`）

**为什么这样更对**：
1. 与 codex / claude code 一致：Enter = 接受 + 提交
2. Tab = 接受 + 留在 editor（不提交），让用户继续输入 args
3. 减少 onSlashSelect 中重复的"清空 + 提取 args + 调 handleSlashCommand"逻辑（这些 `onSubmit` 已经在做）

**风险点**：`onSubmit` 必须能正确解析 `/morning-brief ` (含尾随空格)。当前 cli.ts 的 `onSubmit` 走 `getText().trim()`，尾随空格被剥掉，安全。

---

## 8. 边界条件与测试

### 8.1 边界条件表

| # | 条件 | 期望行为 | 覆盖位置 |
|---|------|---------|---------|
| 1 | 用户键入 `/` | 弹下拉显示全部命令（fuzzyFilter 行为） | smoke |
| 2 | 用户键入 `/mo` | 弹下拉收窄到 `morning-brief` / `model` / `monitor` / `memory` | smoke |
| 3 | 用户键入 `/morning-brief` + 空格 | 弹下拉关闭（slash 上下文结束） | smoke |
| 4 | 用户键入 `/unknown` | 弹下拉显示 pi-tui 原生 "no matches" | smoke |
| 5 | 用户在 `/mo` 弹窗中按 Tab | 第一条命令插入 `/morning-brief `，弹窗关闭，光标停在尾随空格后 | smoke |
| 6 | 用户在 `/mo` 弹窗中按 Enter | 第一条命令插入 + onSubmit 触发 | smoke |
| 7 | 用户从剪贴板粘贴 `/morning-brief` | 同手键 | smoke |
| 8 | Provider 在 1000 字符粘贴中被调 | `signal.aborted` 返回 null | pi-tui 上游测试 |
| 9 | 首次键入后注册 dynamic command | 需重启 CLI（v2 接受此限制，方案 A） | 文档说明 |
| 10 | 命令名含 Unicode（如 `/数据`） | pi-tui 内置 UTF-8 支持 | smoke |
| 11 | 弹窗关闭时按 ↑/↓ | 历史导航 | pi-tui 上游测试 |
| 12 | 弹窗打开时按 Esc | 弹窗关闭，焦点回 Editor，文本保留 | pi-tui 上游测试 |
| 13 | 弹窗关闭时双击 Esc | 第二次 Esc 清空输入 | cli.ts onEscape（未改） |
| 14 | 用户在 `/mo` 弹窗中按 `@` | 切换到文件补全模式 | smoke |
| 15 | 用户在 `@src/components/` | 文件路径补全下拉出现 | smoke |

### 8.2 测试策略

**v2 不写 provider 单元测试**（v1 design 的 8 个测试被废弃），原因：
- `CombinedAutocompleteProvider` 由 pi-tui 上游维护，有自己的测试覆盖
- 我们的接线只有 3 行，无业务逻辑可测
- 改用 **1 个集成测试**验证 wiring

```ts
// src/components/custom-editor.test.ts  (新增 1 个 case)
test('editor has autocomplete provider set after construction', () => {
  const editor = new CustomEditor(mockTui, mockTheme);
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd())
  );
  expect((editor as any).autocompleteProvider).toBeInstanceOf(
    CombinedAutocompleteProvider
  );
  expect(editor.getAutocompleteMaxVisible()).toBeGreaterThan(0);
});
```

**修改/新增的测试**：
- `src/components/hint-bar.test.ts` → `src/components/status-hint.test.ts`：~6 cases（empty / processing / esc-pending / permission badge / input / approval）
- `src/components/custom-editor.test.ts`：删除 vim/emacs 相关的 slash cases（不再适用），保留 kill-ring / 历史 / Vim 快捷键测试，新增 1 个 provider 接线 case

### 8.3 手工 smoke test

1. `bun run start`，键入 `/` → 弹下拉显示全部 60+ 命令
2. 键入 `/mo` → 下拉收窄
3. 按 ↓ → 高亮下移
4. 按 Tab → `/morning-brief` 插入到 editor（带尾随空格），下拉关闭
5. 键入 `AAPL` → editor 文本变为 `/morning-brief AAPL`
6. 按 Enter → handleSlashCommand 触发
7. 键入 `/mo` + Enter → 同样执行 `/morning-brief`（无参时也行）
8. 键入 `@src/components/` → 文件补全下拉出现
9. 观察 StatusHint 行（esc to dismiss · enter to run · ↑↓ to navigate）正确渲染

---

## 9. 错误处理策略

| 错误源 | 处理 | 用户感知 |
|--------|------|---------|
| `getAllSlashCommands()` 抛异常 | pi-tui 上游 try/catch | 弹窗不出现 |
| `process.cwd()` 不存在 | `CombinedAutocompleteProvider.getFileSuggestions` 内部 try/catch | slash 弹窗不受影响；`@` 触发文件补全会失败 |
| 命令存在但 `description` 为空 | pi-tui 渲染空白 description | 无报错 |
| 粘贴超大文本（>10KB） | pi-tui 内置 paste 缓冲 | 编辑器不卡顿 |
| dynamic command 运行时新增 | **v2 不支持**（方案 A） | 用户需重启 CLI 才能看到新命令 |

**核心原则**：编辑永不崩；用户始终能键入。

---

## 10. 性能分析

| 操作 | 时间复杂度 | 备注 |
|------|----------|------|
| `getAllSlashCommands()` | O(1) memoized | @upup/commands 内部缓存 |
| `CombinedAutocompleteProvider.getSuggestions` 内部 `fuzzyFilter` | O(n·m) (n=60 commands, m=query length) | 可忽略 |
| `applyCompletion` | O(1) | 字符串构造 |
| `shouldTriggerFileCompletion` | O(1) | 简单布尔 |
| **端到端（键入到下拉渲染）** | **<10ms** | pi-tui 防抖 100ms 远大于此 |

**结论**：60+ 命令规模下无性能瓶颈。1000+ 命令时若需要可改为 trie 前缀索引（在 CombinedAutocompleteProvider 内部优化，不在 upup 范围）。

---

## 11. 迁移安全

### 11.1 硬切换的论证

| 维度 | 硬切换（采纳） | Feature flag（已拒绝） |
|------|--------------|---------------------|
| 单 commit 行数 | ~1,100 | Sprint 1-5 各 ~200 |
| 并存代码峰值 | 0 | ~1,500（老）+ ~5（新） |
| 回滚时间 | `git revert` 1 分钟 | 即时但代码仍在 |
| CI 路径爆炸 | 1×N | 2×N |
| 状态不一致风险 | 0 | 高（`InputState` 双形状共存） |
| 匹配"最小改造" | ✅ | ❌ |

**关键论点**：`handleSlashCommand` 不动；`@upup/commands` API 不动；`Editor` 不动。爆炸半径 = `CustomEditor` 的 6 个回调 + `HintBarComponent` + `InputState` 6 字段 + `UnifiedCommandRegistry` 9 方法 + `cli.ts` ~80 行 wiring。都是内部状态，外部无消费者。

### 11.2 回滚方案

```bash
git revert <commit-sha> && bun run start
```

无 feature flag 也能秒级回滚（git revert 是原子操作）。

---

## 12. 集成点（与现有系统的关系）

| 集成点 | 关系 | 影响 |
|--------|------|------|
| `handleSlashCommand(name, args)` in `cli.ts` | **未改** | 60+ 命令执行路径不变 |
| `@upup/commands.ALL_COMMANDS` | 读 | CombinedAutocompleteProvider 消费 |
| `registerDynamicCommand` / `unregisterDynamicCommand` | 读 | **v2 限制**：运行时新增需重启 |
| `getSkillCommandRegistry()` | 读 | 启动期合并到 `getAllSlashCommands()` |
| `findCommand` / `resolveAlias` / `COMMAND_ALIASES` | 未改 | `handleSlashCommand` 内部用 |
| agent runner / session / plan mode | 间接 | 不读 slash UI 状态 |
| Bridge / Daemon 进程 | 无关 | 不走 CLI |

**结论**：`CombinedAutocompleteProvider` 是最外层适配器，不破坏任何内部模块的契约。

---

## 13. 范围外（明确不做）

- **不新增命令**：60+ 现有命令定义不变
- **不改键位**：沿用 pi-tui 默认（与 codex / claude code 一致）
- **不写自定义 provider**：用上游 `CombinedAutocompleteProvider`
- **不写 provider 单元测试**：依赖上游测试
- **不支持运行时 dynamic command 刷新**：v2 接受此限制（方案 A）
- **不做视觉重设计**：沿用 pi-tui popup 视觉
- **不做多行命令参数**：仅 `/cmd args` 单行
- **不做频率排序**：usage 数据保留但不消费
- **不做 `/<cmd> <arg>` 弹窗后的文件补全**：upup 命令没有 `getArgumentCompletions`，no-op

---

## 14. 实施 Sprint（v2 简化为 1 sprint）

对比 v1 的 5 sprint 计划，v2 不需要 provider 步骤，简化为 **1 sprint + 1 close-out**：

### Sprint 1 — 改造（5 个原子步骤）

- [ ] 1.1 `src/components/custom-editor.ts`：删除 6 字段 + ~180 行路由块（参考 §3.1）
- [ ] 1.2 `src/tui/state/input-state.ts`：删除 6 字段 + 6 action + 9 selector（参考 §4.1）
- [ ] 1.3 `src/commands/unified-registry.ts`：重写为 30 行薄 builder（参考 §5.2）
- [ ] 1.4 `src/components/hint-bar.ts` → `status-hint.ts`（545 → 30 行，参考 §6）
- [ ] 1.5 `src/cli.ts`：删除 80 行 + 新增 5 行（参考 §7）
- [ ] 1.6 `bun run typecheck` + `bun test` 全绿
- [ ] 1.7 9 步 smoke test 全过（参考 §8.3）

### Sprint 2 — 验证 + 收尾

- [ ] 2.1 `wc -l` 验证各文件行数（参考 §1.3）
- [ ] 2.2 三个 grep 验证 0 命中（参考 §4.3, §5.4, §6）
- [ ] 2.3 `openspec archive simplify-cmd-autocomplete-pi-tui`
- [ ] 2.4 CHANGELOG.md 加 v6 条目
- [ ] 2.5 AGENTS.md / CLAUDE.md "Tools" 章节更新

**总计 ~0.5 turn**（对比 v1 估的 ~0.7 turn，更省）。

---

## 15. Spec Patch 落地点

v2 比 v1 简化了 spec（不写 provider → 不需要 provider 行为 spec）：

**保留的 Requirements**：
- **SCAP-005** — Editor 集成（`setAutocompleteProvider` + `setAutocompleteMaxVisible`）
- **SCAP-006** — 向后兼容（`handleSlashCommand` 不改）
- **SCAP-007** — 单一状态源（删除 6 字段 + 6 action）
- **SCAP-008** — 测试覆盖（合并入 custom-editor.test.ts）
- **SCAP-009** — 无新依赖

**删除的 Requirements**（v1 有，v2 不需要）：
- ~~SCAP-001 — Provider 实现~~ （不写 provider）
- ~~SCAP-002 — getSuggestions 规则~~ （上游）
- ~~SCAP-003 — applyCompletion 规则~~ （上游）
- ~~SCAP-004 — shouldTriggerFileCompletion~~ （上游）
- ~~SCAP-010 — Provider never throws~~ （不写 provider）
- ~~SCAP-011 — Inserted line trailing space~~ （上游）

**新增 Requirement**（v2 行为变化）：
- **SCAP-012 — Enter 行为变化**：在 slash 弹窗中按 Enter，**直接提交**到 `onSubmit`（与 codex / claude code 一致）。`handleSlashCommand` 解析逻辑不变。

spec.md 行数：179 → ~120（-59 行）。

---

## 16. 与 codex / claude code 的行为一致性

| 行为 | codex | claude code | upup v2 |
|------|-------|-------------|---------|
| 键入 `/` 弹下拉 | ✅ | ✅ | ✅ |
| ↑↓ 导航 | ✅ | ✅ | ✅（pi-tui 内置） |
| Tab 接受 + 留在 editor | ✅ | ✅ | ✅（pi-tui 内置） |
| Enter 接受 + 提交 | ✅ | ✅ | ✅（pi-tui 内置） |
| Esc 关闭 | ✅ | ✅ | ✅（pi-tui 内置） |
| type-to-filter | ✅ | ✅ | ✅（pi-tui fuzzyFilter） |
| `@` 触发文件补全 | ✅ | ✅ | ✅（CombinedAutocompleteProvider） |
| 单列下拉 + 描述右侧 | ✅ | ✅ | ✅ |
| 分类头 | ❌ | ❌ | ❌（已删） |
| 预览面板 | ❌ | ❌ | ❌（已删） |
| 用量排序 | ✅ | ❌ | ❌（parked） |
| 动态 fuzzy（`/mbrf` 匹配 `morning-brief`） | ✅ | ✅ | ✅（pi-tui fuzzyFilter，**v1 改进去 v2 保留**） |

**v1 → v2 升级点**：fuzzy filter 从"前缀匹配"提升为"上游 fuzzyFilter"，更接近 codex / claude code。

---

## 17. 验证清单（commit 前必跑）

```bash
# 1. 类型检查
bun run typecheck

# 2. 单元测试
bun test
# 预期: 全部 passed（hint-bar.test.ts 已迁移为 status-hint.test.ts）

# 3. 代码行数审计
wc -l src/components/custom-editor.ts src/tui/state/input-state.ts \
      src/commands/unified-registry.ts src/components/hint-bar.ts \
      src/components/status-hint.ts
# 预期: 250 / 500 / 30 / (hint-bar 不存在) / 30

# 4. 影子状态审计（应全 0 命中）
grep -rn "showingSuggestions\|inputActions.setSuggestions\|inputActions.hideSuggestions\|inputActions.selectNext\|inputActions.selectPrev\|inputActions.nextPage\|inputActions.prevPage\|inputSelectors.isShowingSuggestions\|inputSelectors.getSuggestions\|inputSelectors.getSelectedIndex\|inputSelectors.getPageInfo\|editor.onSlash\|HintBarComponent" src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts' | grep -v 'status-hint'
# 预期: (空)

# 5. 启动检查
bun run dev
# 手动: 键入 / → 弹下拉（无 console.error）
```

---

**v2 实施准备就绪**。等待用户确认后，落 spec 修订（删除 SCAP-001/002/003/004/010/011，新增 SCAP-012），重生 handoff 跑 phase guard。
