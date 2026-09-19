# 实施计划：simplify-cmd-autocomplete-pi-tui

> **关联 change**：`openspec/changes/simplify-cmd-autocomplete-pi-tui/`
> **设计文档**：[../specs/2026-06-04-simplify-cmd-autocomplete-pi-tui-design.md](../specs/2026-06-04-simplify-cmd-autocomplete-pi-tui-design.md)
> **base-ref**：`7dce0a1a82ef99c6ae1635c28de8c8aa1b1b9ef1`（实施前 HEAD）
> **方法**：TDD，每任务 2-5 分钟，红 → 绿 → 重构 → 提交
> **范围**：Sprint 1（Provider + 状态清理，~0.5 turn）+ Sprint 2（验证 + 收尾，~0.2 turn）
> **目标**：净删除 ~1,184 行；新增 ~110 行（Provider 80 + StatusHint 30）；零行为差异

---

## 0. 文件结构（实施前先看清边界）

### 新增（2 个文件）
| 文件 | 行数 | 职责 |
|------|------|------|
| `src/tui/slash-autocomplete-provider.ts` | ~80 | `AutocompleteProvider` 适配器，唯一数据源 |
| `src/tui/slash-autocomplete-provider.test.ts` | ~150 | 8 个 bun:test 用例 |

### 修改（5 个文件）
| 文件 | 原行数 | 目标行数 | 变化 |
|------|-------|---------|------|
| `src/components/custom-editor.ts` | 489 | ~250 | 删 6 字段 + ~180 行路由 |
| `src/tui/state/input-state.ts` | 579 | ~450 | 删 6 字段 + 6 action + 9 selector |
| `src/commands/unified-registry.ts` | 399 | ~30 | 重写为薄 builder |
| `src/cli.ts` | 1667 | ~1597 | 删 ~80 行 + 增 ~10 行 |
| `src/components/select-list.ts` | 279 | 279 | 不改（approval/model 选择器，非 slash） |

### 删除（2 个文件）
| 文件 | 原行数 | 替代 |
|------|-------|------|
| `src/components/hint-bar.ts` | 545 | 拆为 `src/components/status-hint.ts`（~30 行） |
| `src/components/hint-bar.test.ts` | - | 重命名为 `src/components/status-hint.test.ts` |

### 依赖关系（完善后）
```
src/cli.ts
  ├─→ src/components/custom-editor.ts (extends pi-tui Editor)
  │     └─→ src/tui/slash-autocomplete-provider.ts (NEW)
  │           └─→ @upup/commands.getAllSlashCommands() (read)
  │           └─→ @earendil-works/pi-tui.AutocompleteProvider (implement)
  └─→ src/components/status-hint.ts (NEW, extracted from hint-bar)
        └─→ src/theme.ts (read)

@upup/commands ────(no pi-tui dep)──── ✓ 保持 TUI-agnostic
src/tui/         ────(only depends on @upup/commands)──── ✓ 干净单向
```

---

## 1. 实施顺序（expand-contract 模式）

**关键原则**：每个 commit 后代码必须能 `bun run typecheck && bun test` 通过。

```
Phase A: 增量添加（不破坏现状）
  A1. 新增 Provider + 测试（8 cases，红 → 绿）
  A2. cli.ts 加 setAutocompleteProvider 调用（仍保留旧 wiring，typecheck 仍绿）
  A3. typecheck + test 全绿，commit A

Phase B: 切换主路径（保留 fallback 一行 commit）
  B1. cli.ts 删 onSlash* 回调接线
  B2. cli.ts 删 hintBar.setSuggestions 等引用
  B3. typecheck + test 全绿，commit B（旧 callback 仍存在但未调用）

Phase C: 清理旧代码（callbacks 真正成 dead code）
  C1. custom-editor.ts 删 6 字段 + ~180 行路由
  C2. input-state.ts 删 6 字段 + 6 action + 9 selector
  C3. unified-registry.ts 重写为薄 builder
  C4. hint-bar.ts → status-hint.ts（status hint 部分留下，下拉部分删）
  C5. 删 hint-bar.ts
  C6. typecheck + test + 3 个 grep 验证 0 命中，commit C
```

---

## 2. Sprint 1 任务清单

### Phase A — 增量添加（0.15 turn）

#### Task A1.1：写失败测试（Provider 类不存在）
- **文件**：`src/tui/slash-autocomplete-provider.test.ts`（新）
- **动作**：
  1. 创建文件，写 8 个 `test()` 用例（参考 Design Doc §8.2）
  2. 在文件头部 import：`import { SlashCommandAutocompleteProvider } from './slash-autocomplete-provider.js'`
- **验证**：`bun test src/tui/slash-autocomplete-provider.test.ts` → 应报"module not found"
- **commit**：❌ 不提交（红测试）

#### Task A1.2：创建 Provider 类骨架（让 import 通过）
- **文件**：`src/tui/slash-autocomplete-provider.ts`（新）
- **动作**：
  1. 创建文件，写空类 `class SlashCommandAutocompleteProvider implements AutocompleteProvider`
  2. 4 个方法签名：getSuggestions / applyCompletion / shouldTriggerFileCompletion / 第三个参数 + getArgumentCompletions 留空
- **验证**：`bun test` → 8 个 test 应**全部失败**（方法体 throw "not implemented" 或返回 undefined）
- **commit**：❌ 不提交

#### Task A1.3：实现 getSuggestions（前 6 个 test 绿）
- **动作**：复制 Design Doc §2 的实现
- **验证**：`bun test src/tui/slash-autocomplete-provider.test.ts` → 前 6 个 test 通过
- **commit**：❌ 不提交（后 2 个仍红）

#### Task A1.4：实现 applyCompletion + shouldTriggerFileCompletion（全部 8 个绿）
- **动作**：补全剩余方法
- **验证**：`bun test src/tui/slash-autocomplete-provider.test.ts` → 8/8 通过
- **commit**：`feat: add SlashCommandAutocompleteProvider (SCAP-001..011)`

#### Task A2.1：cli.ts 增量加 setAutocompleteProvider
- **文件**：`src/cli.ts`（修改）
- **动作**：
  1. import `SlashCommandAutocompleteProvider`
  2. 在 `editor` 构造后追加：`editor.setAutocompleteProvider(new SlashCommandAutocompleteProvider()); editor.setAutocompleteMaxVisible(8);`
  3. **不改**任何旧 wiring
- **验证**：`bun run typecheck` → 绿（旧 wiring 仍调用 `inputActions.setSuggestions` 等，但 pi-tui Editor 不再读这些字段，shadow state 仍在但被忽略）
- **commit**：`feat(wire): hook SlashCommandAutocompleteProvider into CustomEditor`

### Phase B — 切换主路径（0.10 turn）

#### Task B1.1：删 cli.ts 中 6 个 onSlash* 回调赋值
- **文件**：`src/cli.ts`（修改，~80 行删除）
- **动作**：
  1. 删除 `editor.onSlashChange = async (text) => { ... }` 整块
  2. 删除 `editor.onSlashExactMatch = (text) => { ... }` 整块
  3. 删除 `editor.onSlashNavigate = (direction) => { ... }` 整块
  4. 删除 `editor.onSlashPage = (direction) => { ... }` 整块
  5. 删除 `editor.onSlashSelect = () => { ... }` 中**仅 slash 分支**（保留 fallback 到 `handleSlashCommand(editorText)`）
  6. 删除 `editor.onSlashDismiss = () => { ... }`
  7. 删除 `import { getCliCommands }`（如果唯一使用处已删）
- **验证**：`bun run typecheck` → 报错（`onSlashChange` 等字段在 CustomEditor 上不存在了？→ 仍存在，**因为字段未删**。typecheck 仍绿，因为只是删了赋值，字段还在）

> **重要**：此步**不删** CustomEditor 的回调字段，只删 cli.ts 的赋值。CustomEditor 仍声明这些字段但无人调用。这样 typecheck 保持绿。

#### Task B1.2：删 cli.ts 中 hintBar.setSuggestions 等引用
- **文件**：`src/cli.ts`（修改，~10 行删除）
- **动作**：
  1. 在 `updateView()` 中删除 `hintBar.setSuggestions(suggestions, selectedIndex)` 分支
  2. 删除 `hintBar.clearSuggestions()` 调用
  3. 删除 `hintBar.refreshPage` / `nextPage` / `prevPage` 调用
  4. 保留 `hintBar.update({...})` 路径
- **验证**：`bun run typecheck` → 绿（hintBar 方法仍存在，只是无人调）
- **commit**：`refactor: route slash UI through pi-tui Editor's built-in popup`

### Phase C — 清理旧代码（0.25 turn）

#### Task C1.1：CustomEditor 删 6 个 onSlash* 字段
- **文件**：`src/components/custom-editor.ts`（修改，~10 行删除）
- **动作**：
  1. 删除字段声明：`onSlashChange?: ...` / `onSlashNavigate?: ...` / `onSlashPage?: ...` / `onSlashSelect?: ...` / `onSlashDismiss?: ...` / `onSlashExactMatch?: ...`
- **验证**：`bun run typecheck` → 应报错（cli.ts 已不再赋值，但 grep 确认无其他引用）

> **关键检查**：在删字段前，先 `grep -rn "editor.onSlash\|customEditor.onSlash" src/` 确认 0 命中（除 cli.ts 自身外）

#### Task C1.2：CustomEditor 删 handleInput 中的 slash 路由块
- **文件**：`src/components/custom-editor.ts`（修改，~150 行删除）
- **动作**：
  1. 删除 `if (matchesKey(data, Key.up))` 等 6 个 slash 路由分支
  2. 删除 `if (matchesKey(data, Key.escape))` 中的 slash dismiss 分支（保留双击清空逻辑）
  3. 删除 `if (matchesKey(data, Key.left/right))` 中的 page 分支
  4. 删除 `if (matchesKey(data, Key.tab))` 中的 slash select 分支
  5. 删除 `if (matchesKey(data, Key.return))` 中的 slash select 分支
  6. 删除 `if (matchesKey(data, Key.escape))` 中的 showingSuggestions 检测
- **验证**：`bun run typecheck` → 应报错（多个未引用的 import：Key.up / Key.down 等可能仍在用，需逐一检查）

#### Task C1.3：CustomEditor 删 trailing wasSlashActive 块
- **文件**：`src/components/custom-editor.ts`（修改，~20 行删除）
- **动作**：删除 `handleInput` 末尾的 `wasSlashActive` / `shouldBeActive` 检查块
- **验证**：`bun run typecheck` → 绿（如果 C1.2 已清理完 import）

#### Task C1.4：CustomEditor 删 slashActive getter + canPageLeft/Right
- **文件**：`src/components/custom-editor.ts`（修改，~5 行删除）
- **动作**：
  1. 删除 `get slashActive(): boolean` getter
  2. 删除 `canPageLeft()` / `canPageRight()` 方法
- **验证**：`bun run typecheck` → 绿
- **commit**：`refactor(editor): remove slash callbacks and routing logic from CustomEditor`

#### Task C2.1：input-state.ts 删 6 个 suggestion 字段
- **文件**：`src/tui/state/input-state.ts`（修改，~10 行删除）
- **动作**：从 `InputState` interface 删除 `showingSuggestions` / `suggestions` / `selectedIndex` / `currentPage` / `totalPages` / `pageSize`
- **验证**：`bun run typecheck` → 应报错（initial state 还有这些字段，actions 还在写它们）

#### Task C2.2：input-state.ts 删 6 个 action
- **文件**：`src/tui/state/input-state.ts`（修改，~50 行删除）
- **动作**：从 `inputActions` 删除 `setSuggestions` / `showSuggestions` / `hideSuggestions` / `selectNext` / `selectPrev` / `nextPage` / `prevPage`
- **验证**：`bun run typecheck` → 报错（仍有引用）

#### Task C2.3：input-state.ts 删 9 个 selector
- **文件**：`src/tui/state/input-state.ts`（修改，~20 行删除）
- **动作**：从 `inputSelectors` 删除 `isShowingSuggestions` / `getSuggestions` / `getSelectedIndex` / `getPageInfo` / `nextPage` / `prevPage` 等
- **验证**：`grep -rn "inputSelectors.isShowingSuggestions\|inputSelectors.getSuggestions\|inputSelectors.getSelectedIndex\|inputSelectors.getPageInfo" src/ --include='*.ts' --include='*.tsx' | grep -v input-state.ts` → 0 命中
- **验证**：`bun run typecheck` → 绿
- **commit**：`refactor(state): remove suggestion fields/actions/selectors from input-state`

#### Task C3.1：unified-registry.ts 重写为薄 builder
- **文件**：`src/commands/unified-registry.ts`（修改，399 → 30 行）
- **动作**：
  1. 删 `UnifiedCommandRegistry` 类
  2. 删 `fuzzySearch` / `searchByPrefix` / `getSuggestions` / `inferCategory` / `recordCommandUsage` / `getCommandUsage` / `getCommandCount` / `getUnifiedCommandRegistry` / `resetUnifiedCommandRegistry` / `getCliCommands` / `CATEGORY_MAP` / `usageCache`
  3. 保留并简化：导出 `listAllCommands()` 和 `findCommand(name)`
- **验证**：`grep -rn "fuzzySearch\|searchByPrefix\|getUnifiedCommandRegistry\|recordCommandUsage\|getCommandUsage\|getCommandCount\|UnifiedCommand\|getCliCommands" src/ packages/ --include='*.ts' --include='*.tsx' | grep -v unified-registry.ts | grep -v '\.test\.ts'` → 0 命中
- **验证**：`bun run typecheck` → 绿
- **commit**：`refactor(registry): collapse unified-registry to thin builder`

#### Task C4.1：新建 status-hint.ts（从 hint-bar.ts 提取）
- **文件**：`src/components/status-hint.ts`（新，~30 行）
- **动作**：复制 Design Doc §6.2 的实现
- **验证**：`bun run typecheck` → 报错（import 未用，不影响）

#### Task C4.2：cli.ts 替换 HintBarComponent → StatusHintComponent
- **文件**：`src/cli.ts`（修改，~5 行改动）
- **动作**：
  1. `import { HintBarComponent }` → `import { StatusHintComponent }`
  2. `new HintBarComponent()` → `new StatusHintComponent()`
  3. `hintBar.update({...})` → `statusHint.update({...})`
- **验证**：`bun run typecheck` → 报错（hintBar 方法未定义）

#### Task C4.3：删 hint-bar.ts + 重命名测试
- **文件**：`src/components/hint-bar.ts`（删）+ `src/components/hint-bar.test.ts`（重命名/重写）
- **动作**：
  1. `git rm src/components/hint-bar.ts`
  2. `git mv src/components/hint-bar.test.ts src/components/status-hint.test.ts`
  3. 修改 `status-hint.test.ts` 只测新组件
- **验证**：`bun run typecheck` → 绿
- **验证**：`bun test` → 全绿
- **commit**：`refactor(hint): extract StatusHint from HintBarComponent, drop suggestion dropdown`

#### Task C5.1：全量验证
- **动作**：
  1. `bun run typecheck` → 必须绿
  2. `bun test` → 必须全绿（含 Provider 8/8 + StatusHint 新测试 + 既有 60+ 命令可执行性测试）
  3. `grep -rn "showingSuggestions\|inputActions.setSuggestions\|inputActions.hideSuggestions\|inputActions.selectNext\|inputActions.selectPrev\|inputActions.nextPage\|inputActions.prevPage\|inputSelectors.isShowingSuggestions\|inputSelectors.getSuggestions\|inputSelectors.getSelectedIndex\|inputSelectors.getPageInfo\|editor.onSlash\|HintBarComponent" src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts' | grep -v 'status-hint'` → 0 命中
  4. `wc -l` 验证行数（Design Doc §1.3 表格）
- **commit**：❌ 不单独 commit（前面已有 5 个 commit）

### Phase D — Smoke test（0.05 turn）

#### Task D1.1：手工 7 步验证
- **动作**：
  1. `bun run start`，键入 `/` → 弹下拉显示 60+ 命令
  2. 键入 `/mo` → 下拉收窄到 4 个
  3. 按 ↓ → 高亮下移
  4. 按 Enter → `/morning-brief` 执行
  5. 按 Esc → 下拉关闭
  6. 键入 `@src/components/` → 文件补全下拉
  7. 观察 `StatusHint` 行渲染
- **验证**：7/7 通过
- **commit**：❌ 不单独 commit

---

## 3. Sprint 2 任务清单（验证 + 收尾，0.20 turn）

#### Task S2.1：行数审计
- **动作**：`wc -l` 验证 6 个目标行数
  - `custom-editor.ts` ~250（原 489）
  - `input-state.ts` ~450（原 579）
  - `unified-registry.ts` ~30（原 399）
  - `slash-autocomplete-provider.ts` ~80（new）
  - `status-hint.ts` ~30（new）
  - `hint-bar.ts` 不存在（删）
- **commit**：❌

#### Task S2.2：3 个 grep 验证
- 影子状态审计（§4.3）：0 命中
- 注册表审计（§5.4）：0 命中
- hint-bar 审计（§6.3）：0 命中
- **commit**：❌

#### Task S2.3：openspec archive
- **动作**：`openspec archive simplify-cmd-autocomplete-pi-tui`（如果 verify 阶段已完成；本 sprint 不做）

#### Task S2.4：CHANGELOG
- **动作**：在 `openspec/CHANGELOG.md` 加 v6 条目：
  - **v6 (2026-06-04) — 简化命令补全：采用 pi-tui AutocompleteProvider**
  - 一句话：把 upup 命令补全栈从自建 ~1,184 行替换为 ~80 行 pi-tui 适配器，对齐 codex / claude code
  - 5 个文件瘦身，净删除 ~1,184 行
- **commit**：`docs: add v6 changelog entry for cmd autocomplete simplification`

#### Task S2.5：AGENTS.md / CLAUDE.md 更新
- **动作**：
  1. `AGENTS.md` "Tools" 章节：删除 `hint-bar.ts` 描述，添加 `slash-autocomplete-provider.ts` 描述
  2. `CLAUDE.md` 同步
- **commit**：`docs: update AGENTS.md / CLAUDE.md for new cmd autocomplete architecture`

#### Task S2.6：build guard --apply
- **动作**：`bash /Users/louloulin/.codex/skills/comet/scripts/comet-guard.sh simplify-cmd-autocomplete-pi-tui build --apply`
- **验证**：所有检查 PASS，phase 自动 → verify
- **commit**：❌（脚本改 .comet.yaml）

---

## 4. 验证清单（每个 Phase 结束必跑）

| 命令 | 期望 | 频率 |
|------|------|------|
| `bun run typecheck` | exit 0 | 每次 commit 前 |
| `bun test` | exit 0 | 每次 commit 前 |
| `wc -l` 6 个目标文件 | 符合 Design Doc §1.3 | Sprint 1 结束 |
| 3 个 grep 验证 | 0 命中 | Sprint 1 结束 |
| 7 步 smoke test | 7/7 | Sprint 1 结束 |

---

## 5. 风险与回滚

| 风险 | 缓解 |
|------|------|
| CustomEditor 删字段导致 cli.ts typecheck 失败 | 在删字段前 grep 确认无外部引用 |
| input-state.ts 删字段导致 selector 引用失败 | 在删 selector 前 grep 确认 0 命中 |
| hint-bar.ts 提取 status-hint 时遗漏 escPendingClear 等字段 | 参考 Design Doc §6.2 的状态字段表 |
| 7 步 smoke test 失败 | 回到对应 Phase 检查（命令补全 → A1，状态清理 → C2，hint → C4） |
| `bun run dev` 启动报 console.error | 检查 Provider 是否 catch 所有异常（SCAP-010） |

**回滚**：`git revert` 整个分支，单 commit 即可回退所有变更。

---

## 6. 与 bun workspace 架构的关系

**用户目标**："基于 bun workspace 结构实现，完善整个依赖关系"

**当前依赖图**（实施前）：
```
@upup/commands (TUI-agnostic) ←─ src/components/custom-editor.ts
                                  ↑ (Fuse + matchCommands + ...)
                                  │
@earendil-works/pi-tui ←───────── src/commands/unified-registry.ts
                                  ↑ (UnifiedCommandRegistry, FUSE, 分类)
                                  │
                            src/components/hint-bar.ts (shadow dropdown)
```

**实施后依赖图**（目标）：
```
@upup/commands (TUI-agnostic) ←─ src/tui/slash-autocomplete-provider.ts (NEW, ~80 行)
                                  ↑ (getAllSlashCommands, read-only)
                                  │
@earendil-works/pi-tui ←───────── Editor (autocomplete state, popup, 键处理)
                                  ↑ (setAutocompleteProvider)
                                  │
                            src/components/custom-editor.ts (extends Editor, 删 slash 路由)
```

**改进点**：
1. **`@upup/commands` 保持 TUI-agnostic**：Provider 适配器在 `src/tui/`，不污染 commands 包
2. **单向依赖**：`src/tui/` 只依赖 `@upup/commands`，不反向依赖
3. **零循环依赖**：pi-tui 是叶子节点；commands 是叶子节点；tui/ 在中间
4. **可测试性**：Provider 单元测试 8 cases 全部独立，无副作用；StatusHint 纯渲染；Editor 行为由 pi-tui 保证

**为什么 Provider 不进 workspace 包？**：
- 仅 ~80 行，单一职责（适配器）
- 仅 upup CLI 使用，bridge / daemon 不消费
- 进 `packages/tui-adapters/` 会增加 publish 复杂度而无复用收益
- **最小方式**：留在 `src/tui/`，作为 internal adapter

---

## 7. 实施后状态

| 指标 | 实施前 | 实施后 | 变化 |
|------|-------|-------|------|
| `custom-editor.ts` | 489 行 | ~250 行 | **-49%** |
| `input-state.ts` | 579 行 | ~450 行 | **-22%** |
| `unified-registry.ts` | 399 行 | ~30 行 | **-92%** |
| `hint-bar.ts` | 545 行 | 0（删） | **-100%** |
| `slash-autocomplete-provider.ts` | 0 | ~80 行 | **+80** |
| `status-hint.ts` | 0 | ~30 行 | **+30** |
| `cli.ts` | 1667 行 | ~1597 行 | **-4%** |
| **净行数** | **3,679** | **~2,437** | **净 -1,242** |
| 影子状态字段 | 6 | 0 | **-6** |
| onSlash* 回调 | 6 | 0 | **-6** |
| 行为差异 | — | 0 | 0 |

**关键不变量**：
- `bun run typecheck` 0 报错
- `bun test` 0 失败
- 60+ 命令全部仍可执行
- 与 codex / claude code 行为一致（Design Doc §16）

---

**计划就绪，等待工作流配置确认后开始执行。**
