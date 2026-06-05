# Plan — modularize-src-into-bun-workspaces

> 上游：openspec/changes/modularize-src-into-bun-workspaces/{proposal,design,tasks}.md
> 技术设计：docs/superpowers/specs/2026-06-05-modularize-src-into-bun-workspaces-design.md

## 目标
把 `src/` 下 68 个目录彻底迁移到 21+ 个 workspace 包，让 `src/index.tsx` 只做应用壳 + 顶层编排。

## 执行顺序（按拓扑深度）

### Batch 1: L1 底层（types + utils）
- [ ] T-1.1 补全 `@upup/types`：把 `src/types/*` + `src/types.ts` 迁入 `packages/types/src/`
- [ ] T-1.2 补全 `@upup/utils`：把 `src/utils/*` 迁入 `packages/utils/src/`
- 验证：`bun --filter @upup/types typecheck && test`，`bun --filter @upup/utils typecheck && test`

### Batch 2: L2 核心抽象
- [ ] T-2.1 `@upup/llm`：`src/model/llm.ts` + `src/providers.ts`
- [ ] T-2.2 `@upup/hooks`：`src/hooks/*`
- [ ] T-2.3 `@upup/keybindings`：`src/keybindings/*`
- [ ] T-2.4 `@upup/state`：`src/state/*`
- [ ] T-2.5 `@upup/tui-renderer`（新）：`src/components/*` + `src/tui/*`

### Batch 3: L3 基础设施
- [ ] T-3.1 `@upup/storage`（新）：`src/storage/*` + `src/data/*`
- [ ] T-3.2 `@upup/telemetry`（新）：`src/telemetry/*`

### Batch 4: L4 Runtime（最大工作量）
- [ ] T-4.1 `@upup/agent-runtime`（新）：`src/agent/*`
- [ ] T-4.2 `@upup/tools-registry`（新）：`src/tools/registry/*` + `src/tools/tool-renderers.ts` + `src/tools/descriptions/*`
- [ ] T-4.3 `@upup/finance-tools`（新）：`src/tools/finance/*` + 其余 src/tools/* 子目录
- [ ] T-4.4 `@upup/skill-system`（新）：`src/skills/*`
- [ ] T-4.5 `@upup/mcp-bridge`（新）：`src/mcp/*`
- [ ] T-4.6 `@upup/plugin-system`（新）：`src/plugins/*`
- [ ] T-4.7 `@upup/memory-system`（新）：`src/memory/*`
- [ ] T-4.8 `@upup/cron-system`（新）：`src/cron/*`
- [ ] T-4.9 `@upup/daemon-system`（新）：`src/daemon/*`
- [ ] T-4.10 `@upup/session-system`（新）：`src/session/*`
- [ ] T-4.11 `@upup/realtime-channel`（新）：`src/realtime/*`
- [ ] T-4.12 `@upup/bridge-system`（新）：`src/bridge/*`
- [ ] T-4.13 `@upup/coordinator-system`（新）：`src/coordinator/*` + `src/multi-agent/*` + `src/subagent/*`
- [ ] T-4.14 `@upup/plan-system`（新）：`src/plan/*`
- [ ] T-4.15 `@upup/research-system`（新）：`src/research/*` + `src/analysis/*` + `src/competitive-positioning/*` + `src/code-archaeology/*` + `src/coach/*`
- [ ] T-4.16 `@upup/multimodal-system`（新）：`src/multimodal/*`
- [ ] T-4.17 `@upup/gateway-system`（新）：`src/gateway/*`

### Batch 5: L5 应用编排
- [ ] T-5.1 `@upup/services-core`（新）：`src/services/*` + `src/permissions/*` + `src/tasks/*` + `src/worktree/*` + `src/proactive/*` + `src/kairos/*`

### Batch 6: L6 应用壳
- [ ] T-6.1 `@upup/cli`（新）：`src/commands/*` + `src/cli.ts` 拆解
- [ ] T-6.2 `@upup/cli-shell`（已有/补全）：`src/stdio/*`

### Batch 7: L7 入口壳
- [ ] T-7.1 `@upup/index-app`（新）：`src/index.tsx` + `src/run.ts` + `src/bundled-runner.ts` + `src/theme.ts`

### Batch 8: 配置
- [ ] T-8.1 `bunfig.toml` 校验
- [ ] T-8.2 根 `tsconfig.base.json` + 每个包独立 `tsconfig.json`
- [ ] T-8.3 `build:packages` 拓扑脚本

### Batch 9: 收尾
- [ ] T-9.1 `bun run typecheck`（全仓）
- [ ] T-9.2 `bun test`（全仓）
- [ ] T-9.3 `lint:boundaries` 守门
- [ ] T-9.4 `bun run build:compile` 产出 `dist/upup`
- [ ] T-9.5 `bash scripts/release.sh --dry-run` 不报错

## 验证矩阵

每完成一个 Batch 后必须：
1. `bun --filter @upup/<name> typecheck` exit 0
2. `bun --filter @upup/<name> test` 全过
3. 跨包 import 路径已用 `@upup/<name>` 重写

最终收尾必须：
1. `bun run typecheck` exit 0
2. `bun test` 全过
3. `bun run lint:boundaries` 0 violation
4. `bun run build:compile` 产出可执行二进制

## 风险与回退

| 风险 | 缓解 |
|---|---|
| 跨包循环依赖 | 边界检查 + 强制拓扑 |
| 类型解析慢 | composite + 增量编译 |
| 测试路径分裂 | 每个包独立 `bun test` |
| 二进制编译失败 | Phase 9 验证 |
| release 脚本坏 | `--dry-run` 验证 |
