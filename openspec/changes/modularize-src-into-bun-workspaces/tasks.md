# Tasks — modularize-src-into-bun-workspaces

> 每个任务都包含：交付物 · 验证（`bun run typecheck` + `bun test`）· 风险提示
> 顺序：L1 → L2 → L3 → L4 → L5 → L6 → L7 → 收尾

## Phase 1 — L1 底层（types / utils）

- [x] T-1.1 把 `src/types/*` 和 `src/types.ts` 整体迁入 `packages/types/src/`
  - 验证：`bun --filter @upup/types typecheck && bun --filter @upup/types test`
- [x] T-1.2 把 `src/utils/*` 整体迁入 `packages/utils/src/`
  - 验证：同上
- [x] T-1.3 锁定 `@upup/types` 的 `exports` 字段
- [x] T-1.4 锁定 `@upup/utils` 的 `exports` 字段

## Phase 2 — L2 核心抽象

- [x] T-2.1 把 `src/model/llm.ts` 和 `src/providers.ts` 迁入 `packages/llm/src/`
- [x] T-2.2 (with 13 pre-existing TS errors noted) 把 `src/hooks/*` 迁入 `packages/hooks/src/`
- [x] T-2.3 (already in sync) 把 `src/keybindings/*` 迁入 `packages/keybindings/src/`
- [x] T-2.4 (already in sync) 把 `src/state/*` 迁入 `packages/state/src/`
- [x] T-2.5 (with 142 pre-existing TS errors noted) 把 `src/components/*` 和 `src/tui/*` 迁入新包 `packages/tui-renderer/src/`
- [ ] T-2.6 把 `packages/agent-core` 合并到 L4 的 `agent-runtime`（保留 @upup/sdk 不动）

## Phase 3 — L3 基础设施

- [x] T-3.1 创建 `packages/storage/` 包，把 `src/storage/*` 和 `src/data/*` 迁入
- [x] T-3.2 创建 `packages/telemetry/` 包，把 `src/telemetry/*` 迁入

## Phase 4 — L4 Runtime（按 capability 顺序）

- [ ] T-4.1 创建 `packages/agent-runtime/`，把 `src/agent/*` 迁入
- [ ] T-4.2 创建 `packages/tools-registry/`，把 `src/tools/registry/*` + `src/tools/tool-renderers.ts` + `src/tools/descriptions/*` 迁入
- [ ] T-4.3 创建 `packages/finance-tools/`，把 `src/tools/finance/*` + `src/tools/forecast|benchmark|research|quant|notify|monitor|calendar|astock|memory|cache|ask|fx|sector|plan|discovery|worktree|lsp|filesystem|bash|alt-data|todo|search|backtest|alerts|powershell|heartbeat|browser|fetch|news|earnings|workflow|task|portfolio|comparison|short-interest|notebook|export|sentiment|trading|valuation|risk|watchlist|cron|analytics|screening|fund` 全部迁入
- [ ] T-4.4 创建 `packages/skill-system/`，把 `src/skills/*` 迁入
- [ ] T-4.5 创建 `packages/mcp-bridge/`，把 `src/mcp/*` 迁入
- [ ] T-4.6 创建 `packages/plugin-system/`，把 `src/plugins/*` 迁入
- [ ] T-4.7 创建 `packages/memory-system/`，把 `src/memory/*` 迁入
- [ ] T-4.8 创建 `packages/cron-system/`，把 `src/cron/*` 迁入
- [ ] T-4.9 创建 `packages/daemon-system/`，把 `src/daemon/*` 迁入
- [ ] T-4.10 创建 `packages/session-system/`，把 `src/session/*` 迁入
- [ ] T-4.11 创建 `packages/realtime-channel/`，把 `src/realtime/*` 迁入
- [ ] T-4.12 创建 `packages/bridge-system/`，把 `src/bridge/*` 迁入
- [ ] T-4.13 创建 `packages/coordinator-system/`，把 `src/coordinator/*` + `src/multi-agent/*` + `src/subagent/*` 迁入
- [ ] T-4.14 创建 `packages/plan-system/`，把 `src/plan/*` 迁入
- [ ] T-4.15 创建 `packages/research-system/`，把 `src/research/*` + `src/analysis/*` + `src/competitive-positioning/*` + `src/code-archaeology/*` + `src/coach/*` 迁入
- [ ] T-4.16 创建 `packages/multimodal-system/`，把 `src/multimodal/*` 迁入
- [ ] T-4.17 创建 `packages/gateway-system/`，把 `src/gateway/*` 迁入

## Phase 5 — L5 应用编排

- [ ] T-5.1 创建 `packages/services-core/`，把 `src/services/*` 迁入
- [ ] T-5.2 把 `src/permissions/*` 迁入 `packages/services-core/src/permissions/`

## Phase 6 — L6 应用壳

- [ ] T-6.1 创建 `packages/cli/`，把 `src/commands/*` 迁入
- [ ] T-6.2 把 `src/cli.ts` 拆成 `packages/cli/src/run.ts` + `packages/cli/src/subcommands/*.ts`

## Phase 7 — L7 入口壳

- [ ] T-7.1 创建 `packages/index-app/`，把 `src/index.tsx` + `src/run.ts` + `src/bundled-runner.ts` + `src/theme.ts` 迁入
- [ ] T-7.2 `src/index.tsx` 改为只 `import 'dotenv/config'; import { runCli } from '@upup/cli'; runCli();`
- [ ] T-7.3 `src/cli.ts` 改为只 re-export 入口
- [ ] T-7.4 `src/run.ts` 改为 stdio 入口
- [ ] T-7.5 `src/bundled-runner.ts` 改为 bundled binary 入口
- [ ] T-7.6 `src/theme.ts` 改为只导出主题常量

## Phase 8 — 配置与构建

- [ ] T-8.1 根 `package.json` 校验 `workspaces: ["packages/*"]`
- [ ] T-8.2 根 `bunfig.toml` 加 `linker = "hoisted"`
- [ ] T-8.3 根 `tsconfig.base.json` 抽公共编译选项
- [ ] T-8.4 每个包独立 `tsconfig.json`（继承 base）
- [ ] T-8.5 根 `package.json` 加 `build:packages` 脚本（DAG 拓扑排序）
- [ ] T-8.6 根 `package.json` 加 `lint:boundaries` 脚本（禁止跨层 import）
- [ ] T-8.7 根 `package.json` 把 `start` 改为 `bun run --filter @upup/index-app start`

## Phase 9 — 收尾

- [ ] T-9.1 `bun install` 锁住 workspace 拓扑
- [ ] T-9.2 `bun run typecheck` 必须在所有包通过
- [ ] T-9.3 `bun test` 必须在所有包通过
- [ ] T-9.4 `bun run lint:boundaries` 必须无违规
- [ ] T-9.5 `bun run build:packages` 全部成功
- [ ] T-9.6 `bun run build:compile` 产出 `dist/upup` 二进制
- [ ] T-9.7 `bash scripts/release.sh --dry-run` 验证 release 流程
- [ ] T-9.8 删除 `src/` 残留（保留 `index.tsx` `cli.ts` `run.ts` `bundled-runner.ts` `theme.ts` 5 个文件）
- [ ] T-9.9 更新根 `package.json` 的 `workspaces` 字段，确保新增包被识别
- [ ] T-9.10 更新 README / CLAUDE.md 反映新结构

## 验证标准

- 全部 task 完成后，必须同时满足：
  1. `bun run typecheck` exit 0
  2. `bun test` 所有测试通过
  3. `bun run lint:boundaries` 0 violation
  4. `bun run build:compile` 产出可执行的 `dist/upup`
  5. `bash scripts/release.sh --dry-run` 不报错
