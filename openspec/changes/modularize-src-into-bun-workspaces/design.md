# Design — modularize-src-into-bun-workspaces

## Architecture overview

把 upup 重塑为**多层 workspace** + **单向上游依赖**：

```
┌──────────────────────────────────────────────────────────────┐
│                     L7 入口壳  src/                           │
│   src/index.tsx · src/run.ts · src/bundled-runner.ts         │
│   src/cli.ts · src/theme.ts                                  │
│   职责: .env 加载 · 启动 wiring · 暴露 dist/upup 二进制      │
└──────────────────────────┬───────────────────────────────────┘
                           │ depends on @upup/cli
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L6 应用壳  @upup/cli (packages/cli)                          │
│   子命令路由 · onboarding · doctor · stdio server            │
│   depends on: @upup/commands · @upup/services-core           │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L5 应用编排  @upup/services-core                              │
│   AppContext · ServiceRegistry · DI 容器                      │
│   depends on: 全部 L4 runtime 包                              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L4 Runtime  (按职责划分)                                      │
│   @upup/agent-runtime · @upup/tools-registry                  │
│   @upup/skill-system · @upup/mcp-bridge                      │
│   @upup/plugin-system · @upup/memory-system                  │
│   @upup/cron-system · @upup/daemon-system                    │
│   @upup/session-system · @upup/realtime-channel              │
│   @upup/bridge-system · @upup/coordinator-system             │
│   @upup/plan-system · @upup/research-system                  │
│   @upup/multimodal-system · @upup/gateway-system             │
│   @upup/finance-tools · @upup/cli-shell (l5 entry)            │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L3 基础设施  @upup/storage · @upup/telemetry                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L2 核心抽象  @upup/llm · @upup/state · @upup/hooks            │
│   @upup/keybindings · @upup/tui-renderer                      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L1 底层共享  @upup/types · @upup/utils                        │
└──────────────────────────────────────────────────────────────┘
```

**分层规则**：
- 同层包之间**不直接互相 import**；跨层只能**向下依赖**
- `@upup/types` 是叶子；任何包都可以依赖
- `@upup/utils` 提供纯函数工具，不允许持有 runtime 状态
- `@upup/llm` 不允许 import 任何 agent / tool / skill
- `@upup/agent-runtime` 是 L4 的核心；其它 L4 包可以 import 它

## Workspace 包映射（src/ → packages/*）

| 现有 src 目录 | 目标包 | 备注 |
|---|---|---|
| `src/agent/` | `@upup/agent-runtime` | agent 循环、scratchpad、context、events、state |
| `src/tools/` | `@upup/tools-registry` + `@upup/finance-tools` | registry 与 finance 拆开 |
| `src/agent/tools/finance/` | `@upup/finance-tools` | 全部金融工具族 |
| `src/components/` | `@upup/tui-renderer` | UI 组件 |
| `src/hooks/` + `src/keybindings/` | `@upup/hooks` + `@upup/keybindings` | 拆开 |
| `src/skills/` | `@upup/skill-system` | 保留 `skills/` 目录（SKILL.md） |
| `src/mcp/` | `@upup/mcp-bridge` | MCP 客户端/服务端 |
| `src/plugins/` | `@upup/plugin-system` | 含 sdk + adapters |
| `src/memory/` | `@upup/memory-system` | memvid + sqlite + bm25 |
| `src/cron/` | `@upup/cron-system` | croner |
| `src/daemon/` | `@upup/daemon-system` | daemon + worker pool |
| `src/session/` | `@upup/session-system` | checkpoint + resume |
| `src/realtime/` | `@upup/realtime-channel` | ws/sse |
| `src/telemetry/` | `@upup/telemetry-system` | metrics + trace |
| `src/commands/` | `@upup/cli-shell` | CLI 框架 |
| `src/cli.ts` `src/index.tsx` `src/run.ts` `src/bundled-runner.ts` | `@upup/index-app` | 入口壳 |
| `src/bridge/` | `@upup/bridge-system` | paperclip + whatsapp |
| `src/coordinator/` `src/multi-agent/` `src/subagent/` | `@upup/coordinator-system` | 多 agent 编排 |
| `src/plan/` | `@upup/plan-system` | research plan |
| `src/research/` `src/analysis/` `src/competitive-positioning/` `src/code-archaeology/` `src/coach/` | `@upup/research-system` | 调研闭环 |
| `src/multimodal/` | `@upup/multimodal-system` | 多模态 |
| `src/services/` | `@upup/services-core` | DI 容器 |
| `src/storage/` `src/data/` | `@upup/storage-system` | 存储抽象 |
| `src/gateway/` | `@upup/gateway-system` | whatsapp/webhook |
| `src/types/` `src/utils/` `src/model/llm.ts` `src/providers.ts` | `@upup/types` + `@upup/utils` + `@upup/llm` | 拆开 |
| `src/tui/` | `@upup/tui-renderer` | 渲染层 |
| `src/controllers/` `src/evals/` | `@upup/evals` (新) | 评测 runner |
| `src/kairos/` `src/proactive/` `src/permissions/` `src/realtime/` `src/screening/` `src/tasks/` `src/worktree/` `src/stdio/` `src/state/` | 归到对应 L4 包 | 业务就近原则 |
| `src/theme.ts` | `@upup/index-app` (主题壳) + 主题常量移到 `@upup/tui-renderer` |  |

## 关键设计决策

### D-1 单向分层 + 严格边界

- 所有 `import` 路径必须走 `@upup/<name>` workspace 协议
- 禁止 `import '../xxx'` 这种跨包相对路径
- 在每个包的 `package.json` 用 `exports` 字段锁住公开 API；内部文件不能跨包 import
- 用 `tsc --noEmit` + 边界检查脚本（`bun run lint:boundaries`）守门

### D-2 bun workspace 配置

根 `package.json`：
```json
{
  "workspaces": ["packages/*"],
  "trustedDependencies": ["@biomejs/biome", "esbuild"]
}
```

根 `bunfig.toml`：
```toml
[install]
linker = "hoisted"
[install.scopes]
"@upup" = { workspace = true }
```

### D-3 包级 tsconfig

每个包独立 `tsconfig.json`，继承 `tsconfig.base.json`：
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

### D-4 构建拓扑

`bun run build:packages` 按以下拓扑顺序构建（用 DAG 排序）：
```
L1 (types, utils) → L2 (llm, state, hooks, keybindings, tui) → L3 (storage, telemetry)
→ L4 (agent-runtime, tools-registry, ...) → L5 (services-core)
→ L6 (cli) → L7 (index)
```

### D-5 测试与 CI

- 每个包带 `bun test` 入口
- 根 `bun test` 跑所有包：`bun test packages/`
- CI 强制三步：`bun run typecheck` → `bun test` → `bun run lint:boundaries`

### D-6 入口壳最小化

`src/index.tsx` 目标 ≤ 30 行：
```ts
import 'dotenv/config';
import { runCli } from '@upup/cli';
runCli();
```

`src/run.ts` 处理 stdio 模式；`src/bundled-runner.ts` 处理单文件分发；`src/cli.ts` 已被 `@upup/cli` 接管。

### D-7 现有包复用

- `@upup/agent-core`（已存在）→ 合并到 `@upup/agent-runtime`
- `@upup/sdk`（已存在）→ 保留，作为外部 SDK 入口（stdio 协议）
- `@upup/plugin-sdk`（已存在）→ 保留
- `@upup/adapter-paperclip`（已存在）→ 保留，作为 bridge 实现的子包

### D-8 SKILL.md 与 skills/ 目录

- SKILL.md 文件按"哪个 cap 拥有它"分散到对应包
- 全局扫描入口在 `@upup/skill-system`
- 顶层 `skills/` 目录保留，作为"未归类"备份

## 迁移策略

**滚动式：逐 cap 推进，每完成一个 cap 都必须通过 typecheck + test**

1. **Phase 0 - 准备**（本 change）
   - 创建本 proposal/design/tasks
   - 在 `openspec/changes/modularize-src-into-bun-workspaces/` 锁定基线

2. **Phase 1 - L1/L2 底层**（先搬叶子）
   - `@upup/types` 补全
   - `@upup/utils` 补全
   - `@upup/llm` 补全
   - `@upup/hooks` `@upup/state` `@upup/keybindings` 补全

3. **Phase 2 - L3 基础设施**
   - `@upup/storage` `@upup/telemetry`

4. **Phase 3 - L4 Runtime**（最大工作量）
   - 逐个 cap 搬运（按 capability 顺序）
   - 每个 cap：创建包 → 复制 src/ 对应目录 → 改 import → 补全 stub → 跑 `bun test` → 跑 `bun run typecheck`

5. **Phase 4 - L5/L6/L7**
   - `@upup/services-core` → `@upup/cli` → `@upup/index-app`
   - 删 `src/cli.ts` 业务逻辑，只留 wiring

6. **Phase 5 - 收尾**
   - `bun run lint:boundaries`
   - `bun run typecheck`
   - `bun test`
   - `bun run build:packages`
   - 删 `src/` 残留

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 跨包 import 失控 | D-1 边界检查 + 强制 `exports` |
| 测试路径分裂 | 每个包独立 `bun test`，根 `bun test` 聚合 |
| 类型解析变慢 | composite 项目 + 增量编译 |
| 二进制编译失败 | `bun run build:compile` 在 Phase 5 验证 |
| release 脚本坏 | `bash scripts/release.sh --dry-run` 验证 |

