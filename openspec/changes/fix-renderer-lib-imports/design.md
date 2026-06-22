## Context

`app/src/renderer/src/components/` 下的 22 个 .tsx/.ts 文件 import 引用 `../lib/*` 路径，但 `app/src/renderer/src/lib/` 目录**完全不存在**：
- 无任何 git 历史（`git log --all` 找不到这些文件的 add 事件）
- 无 .gitignore 规则排除
- 无备份分支

**错误链**：组件 import → 模块解析失败 → 参数类型推断失败 → `TS7006 implicit any` → `electron-vite` (rollup) 拒绝构建 → 渲染层 bundle 缺失 → GUI 无法启动。

上游归档的 `upup-as-core-engine-for-investment-workbench` change 没有触及这些组件（投资工作台位于独立目录 `app/src/renderer/src/investment/`），所以这个 baseline 债务是仓库历史遗留。

## Goals / Non-Goals

**Goals:**
1. 创建 22 个 lib 文件（按引用点反推类型签名），让 `electron-vite build` 渲染层段从 FAIL → PASS
2. 让 `npx tsc --noEmit -p tsconfig.web.json` 从 125 errors → 0 errors
3. 最小化实现：lib 函数返回 `null`/`'placeholder'`/stub UI，不实现完整业务逻辑
4. 不修改任何 component 文件的 import 路径（保持 1:1 兼容）

**Non-Goals:**
- 不实现任何 lib 的真实业务逻辑（按需 stub）
- 不修改主进程 / preload / shared（已验证 OK）
- 不引入新依赖
- 不增加 lib 测试（vitest 已通过；lib 由 components 间接覆盖）
- 不重命名或移动 lib 文件

## Decisions

### 决策 1: 反推式实现（vs 从 git 历史恢复 vs 整体 stub）

**选择**: 反推式实现 — 从每个 lib 文件被引用的位置反推导出符号和签名。

**理由**:
- 没有 git 历史（决策 1 排除）
- 整体 stub（`export const fn = () => null`）会导致 components 渲染空白功能，但 TypeScript 编译通过
- 反推式最小代价且让 components 行为可观察（即使 stub）

**反推步骤**:
1. 列出 22 个文件名
2. 对每个文件：grep `from '../lib/FILE'` 找到所有引用点
3. 提取使用的 import 符号 + 调用签名
4. 生成最小 TS 文件满足这些签名

### 决策 2: lib 文件分类（hook vs 工具 vs 类型）

**选择**: 按角色分三类目录组织（如 `lib/hooks/` / `lib/util/`），但**保持文件路径不变**（组件 import 是 `../lib/FILE` 而非 `../lib/hooks/FILE`）。

**理由**: flat 结构最快，避免批量改 import 路径。

### 决策 3: stub 行为规范

**选择**:
- **hook**（`use*`）: 返回最小可用值 + `useEffect` 中无操作
- **工具函数**（纯函数）: 返回合理默认值（`null` / `0` / `[]` / `""`）
- **事件 emitter**（如 `emitRendererSettingsChanged`）: 接收参数 + 空函数体
- **fetch wrapper**: 返回 `Promise.resolve(null)` 或抛 `Error('not implemented')` — 由组件选择是否吞错

**理由**: GUI 启动优先，业务功能降级。任何抛错会让 lib 阻塞 component 渲染。

### 决策 4: 不做端到端验证（仅做构建验证）

**选择**: 通过 `electron-vite build` + `tsc --noEmit` 验证 lib 正确，**不在 CI/本地启动 GUI**（macOS GUI 启动需要人工确认）。

**理由**: AI 环境无法观察 GUI 状态。`npm run dev` 验证留给用户手动。

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
|------|------|------|
| stub 实现导致 UI 行为不正确 | 中 | 用户启动 GUI 后手动反馈；后续 wave 可补真实实现 |
| 反推签名不准确 | 低 | tsc 严格模式会捕获类型错误 |
| 某些 lib 文件可能需要 side effect（如全局事件注册） | 低 | stub 接受参数即可，不强制做副作用 |
| 22 个文件未做单元测试 | 中 | lib 由 95/95 现有 component 测试间接覆盖；GUI 行为由用户验证 |
| 渲染层仍有非 lib 错误残留（如 implicit any） | 低 | stub 文件导出具体类型，链式 TS7006 会消失 |

## Migration Plan

1. **阶段 0**（分析）: 列出 22 个文件名 + 反推每个的最小签名（已完成探索）
2. **阶段 1**（创建文件）: 批量创建 22 个 lib 文件，按依赖顺序（无依赖优先）
3. **阶段 2**（验证）:
   - `npx tsc --noEmit -p tsconfig.web.json` → 应 0 errors
   - `npm run build` → 渲染层应成功
4. **阶段 3**（GUI 验证 — 用户手动）:
   - `npm run dev` 启动 Electron
   - 切换到"投资工作台" tab
   - 在设置填入 apiKey
   - 验证引擎状态 + 面板渲染

**回滚**: `git revert` 整个 commit 即可（无 DB 迁移、无 IPC 协议变更）。

## Open Questions

1. lib 文件原始 git 历史是否存在？（已确认：否）→ 不影响修复
2. 用户期望 stub 行为 vs 真实实现？→ 默认 stub（满足"启动"目标）
3. 是否需要新增 lib 单元测试？→ 否（成本/收益不匹配）
