## Why

`app/src/renderer/src/` 下的 22 个组件文件 import 引用 `../lib/*` 路径（35 个独立文件），但 `src/renderer/src/lib/` 目录在仓库中**完全不存在**（无任何 git 历史记录）。这导致 `npx tsc --noEmit -p tsconfig.web.json` 报 125 个错误（106 个 `Cannot find module` + 19 个链式 `TS7006`），且 `electron-vite build` 在渲染层段失败（`out/renderer/index.html` 不可生成），让 GUI 启动完全不可达。

这是上一轮归档的 `upup-as-core-engine-for-investment-workbench` change 留下的 baseline 债务 — 投资工作台本身已正常工作（主进程 + 95/95 单元测试通过），但缺少 lib 工具函数让 renderer 编译失败。

## What Changes

- **新增** `app/src/renderer/src/lib/` 目录，**22 个文件**：基于引用点反推的最小化实现（hook + 工具函数）
- **不修改** 任何 `src/renderer/src/components/*` 的 import 路径（保持 1:1 兼容）
- **不修改** 主进程 / preload / shared 模块（已验证 OK）
- **不修改** 业务逻辑（lib 只提供"满足类型 + 最小运行时"的实现）

## Capabilities

### New Capabilities

- `renderer-lib-utilities`: 渲染层工具函数 + React hooks 集合（22 个文件），提供 components/* 所需的纯函数与 hooks

### Modified Capabilities

（无 — 本 change 不修改任何现有 spec 的 REQUIREMENT，只补齐缺失的代码）

## Impact

- **代码**: `app/src/renderer/src/lib/` 新增 22 个文件（~500-800 LOC 估计）
- **构建**: `electron-vite build` 渲染层从 FAIL → PASS；`tsc --noEmit -p tsconfig.web.json` 从 125 errors → 0 errors
- **依赖**: 无（不引入新 npm 包）
- **测试**: 现有 95/95 upup+investment 测试不回归；不要求新增 lib 测试（lib 行为由 components 间接覆盖）
- **用户**: GUI 可启动；`设置 → 智能体 → UpUp` 中填入 apiKey 后可使用投资工作台
