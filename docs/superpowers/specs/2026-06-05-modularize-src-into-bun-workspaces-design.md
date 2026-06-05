---
comet_change: modularize-src-into-bun-workspaces
role: technical-design
canonical_spec: openspec
---

# Technical Design — modularize-src-into-bun-workspaces

> 上游事实源：`openspec/changes/modularize-src-into-bun-workspaces/{proposal,design,tasks}.md` + `specs/*/spec.md`
> 本文档负责把 OpenSpec 设计与实现细节桥接起来：文件级迁移顺序、import 重写模式、CI 守门脚本、验证矩阵。

## 1. 入口条件（已满足）

- [x] `openspec/changes/modularize-src-into-bun-workspaces/proposal.md` 存在
- [x] `openspec/changes/modularize-src-into-bun-workspaces/design.md` 存在
- [x] `openspec/changes/modularize-src-into-bun-workspaces/tasks.md` 存在
- [x] 23 个 capability spec 存在
- [x] `.comet.yaml` 处于 phase=design
- [x] handoff context 已生成

## 2. 实施策略

### 2.1 滚动式 + 绿测试

每完成一个包都强制 `bun --filter @upup/<name> typecheck && bun --filter @upup/<name> test` 通过。任何一步 fail 必须回到上一步修复，不允许跳过。

### 2.2 import 重写模式

把 `from '../xxx/yyy.js'` 或 `from './xxx.js'` 替换为 `from '@upup/<package>/<subpath>.js'`。

重写规则：
- `src/types/foo.ts` → `@upup/types`
- `src/utils/foo.ts` → `@upup/utils`
- `src/utils/logging/foo.ts` → `@upup/utils/logging`
- `src/model/llm.ts` → `@upup/llm`
- `src/agent/foo.ts` → `@upup/agent-runtime`
- `src/components/foo.tsx` → `@upup/tui-renderer`
- `src/tools/foo.ts` → `@upup/tools-registry`
- `src/tools/finance/foo.ts` → `@upup/finance-tools`
- `src/hooks/foo.ts` → `@upup/hooks`
- `src/keybindings/foo.ts` → `@upup/keybindings`
- `src/state/foo.ts` → `@upup/state`
- `src/skills/foo.ts` → `@upup/skill-system`
- `src/mcp/foo.ts` → `@upup/mcp-bridge`
- `src/plugins/foo.ts` → `@upup/plugin-system`
- `src/memory/foo.ts` → `@upup/memory-system`
- `src/cron/foo.ts` → `@upup/cron-system`
- `src/daemon/foo.ts` → `@upup/daemon-system`
- `src/session/foo.ts` → `@upup/session-system`
- `src/realtime/foo.ts` → `@upup/realtime-channel`
- `src/telemetry/foo.ts` → `@upup/telemetry-system`
- `src/commands/foo.ts` → `@upup/cli-shell`
- `src/bridge/foo.ts` → `@upup/bridge-system`
- `src/coordinator/foo.ts` + `src/multi-agent/foo.ts` + `src/subagent/foo.ts` → `@upup/coordinator-system`
- `src/plan/foo.ts` → `@upup/plan-system`
- `src/research/foo.ts` + `src/analysis/foo.ts` + `src/competitive-positioning/foo.ts` + `src/code-archaeology/foo.ts` + `src/coach/foo.ts` → `@upup/research-system`
- `src/multimodal/foo.ts` → `@upup/multimodal-system`
- `src/services/foo.ts` → `@upup/services-core`
- `src/storage/foo.ts` + `src/data/foo.ts` → `@upup/storage-system`
- `src/gateway/foo.ts` → `@upup/gateway-system`
- `src/evals/foo.ts` + `src/controllers/foo.ts` → `@upup/evals`（新包）
- `src/permissions/foo.ts` → `@upup/services-core/src/permissions/`
- `src/worktree/foo.ts` → `@upup/services-core/src/worktree/`
- `src/tui/foo.tsx` → `@upup/tui-renderer/src/tui/`
- `src/stdio/foo.ts` → `@upup/cli-shell/src/stdio/`
- `src/screening/foo.ts` → `@upup/finance-tools/src/screening/`
- `src/tasks/foo.ts` → `@upup/services-core/src/tasks/`
- `src/proactive/foo.ts` → `@upup/services-core/src/proactive/`
- `src/kairos/foo.ts` → `@upup/services-core/src/kairos/`
- `src/types.ts` + `src/index.tsx` + `src/cli.ts` + `src/run.ts` + `src/bundled-runner.ts` + `src/theme.ts` + `src/providers.ts` → `@upup/index-app` 或对应底层包

### 2.3 每个包的标准 package.json 模式

```json
{
  "name": "@upup/<name>",
  "version": "0.3.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./*": { "types": "./dist/*.d.ts", "default": "./dist/*.js" }
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir=dist --target=bun && bun x tsc --emitDeclarationOnly --declaration --declarationMap --outDir dist",
    "dev": "bun build src/index.ts --outdir=dist --watch --target=bun",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": { "@upup/types": "workspace:*" },
  "peerDependencies": {},
  "devDependencies": { "@types/bun": "latest" }
}
```

### 2.4 每个包的标准 tsconfig.json

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

### 2.5 根 bunfig.toml

```toml
[install]
linker = "hoisted"

[install.scopes]
"@upup" = { workspace = true }
```

## 3. 拓扑排序

按依赖深度排序：

```
L1 (depth 0):  @upup/types, @upup/utils
L2 (depth 1):  @upup/llm, @upup/state, @upup/hooks, @upup/keybindings, @upup/tui-renderer
L3 (depth 2):  @upup/storage, @upup/telemetry
L4 (depth 3):  @upup/agent-runtime, @upup/tools-registry, @upup/finance-tools,
               @upup/skill-system, @upup/mcp-bridge, @upup/plugin-system,
               @upup/memory-system, @upup/cron-system, @upup/daemon-system,
               @upup/session-system, @upup/realtime-channel,
               @upup/bridge-system, @upup/coordinator-system,
               @upup/plan-system, @upup/research-system,
               @upup/multimodal-system, @upup/gateway-system
L5 (depth 4):  @upup/services-core
L6 (depth 5):  @upup/cli, @upup/cli-shell, @upup/evals
L7 (depth 6):  @upup/index-app
```

## 4. CI 守门脚本

### 4.1 `scripts/lint-boundaries.ts`

检查所有 `import` 路径，禁止跨层 import：

```ts
// 伪代码
// 1. 解析每个 .ts/.tsx 文件的 import 路径
// 2. 提取 @upup/<name> 前缀
// 3. 用拓扑图查 source 包 → target 包
// 4. 如果 target 深度 > source 深度，violation
```

### 4.2 根 package.json scripts

```json
{
  "scripts": {
    "lint:boundaries": "bun run scripts/lint-boundaries.ts",
    "lint": "bun run lint:scc && bun run lint:boundaries",
    "ci": "bun run lint && bun run typecheck && bun test",
    "build:packages": "bun run scripts/build-packages.ts"
  }
}
```

## 5. 验证矩阵

| 步骤 | 验证命令 | 通过标准 |
|---|---|---|
| 1 | `bun --filter @upup/types typecheck` | exit 0 |
| 2 | `bun --filter @upup/types test` | 所有 test pass |
| 3 | `bun --filter @upup/utils typecheck && test` | 同上 |
| 4 | ... 逐包执行 | 同上 |
| N | `bun run typecheck`（全仓） | exit 0 |
| N+1 | `bun test`（全仓） | 所有 test pass |
| N+2 | `bun run lint:boundaries` | 0 violation |
| N+3 | `bun run build:packages` | 全部 dist 产出 |
| N+4 | `bun run build:compile` | 产出 dist/upup 二进制 |
| N+5 | `./dist/upup --version` | 输出版本号 |
| N+6 | `bash scripts/release.sh --dry-run` | 不报错 |

## 6. 风险与回退

| 风险 | 缓解 |
|---|---|
| 跨包循环依赖 | 边界检查 + 强制拓扑 |
| 类型解析慢 | composite + 增量编译 |
| 二进制编译失败 | Phase 9 验证 |
| 测试路径不一致 | 每个包独立 `bun test` |
| release 脚本坏 | `--dry-run` 验证 |

## 7. 不在本 design 范围

- 不引入新功能
- 不修改 capability 需求
- 不重命名 public API
- 不删除现有测试

## 8. 后续

完成 build 阶段后进入 comet-verify 做收尾验证。
