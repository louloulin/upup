# UpUp Pi Runtime 架构与模块边界

> 当前架构以 Pi 为唯一 Agent Runtime。所有生产 Agent、Session、Tool、Model、Streaming、Compaction 和 Worker 能力都必须通过 `src/runtime/pi/` 或 Pi Package 边界实现；旧自定义 Agent、LangChain Runtime 和 Paperclip 不再是可执行架构。

## 1. 核心原则

1. **Pi 唯一运行时**：CLI、Print、stdio、SDK、Gateway、Cron、Daemon、Bridge、Eval 和多 Agent Worker 都通过 Pi Session Factory、Pi runner 或 Pi background service 执行。
2. **领域能力插件化**：金融数据、投研工作流、Prompt、Skill、Policy、Eval 和 Extension 优先放入受信任的 Pi Package，不修改 Pi Agent loop。
3. **金融边界安全**：金融 Tool 必须声明权限等级、参数、是否产生金融影响、证据链和审计 ID；真实交易默认拒绝，只允许 sandbox 与逐次审批。
4. **Session 是事实来源**：消息、生命周期、Fork、Resume、Compaction、Export、迁移和工作流 checkpoint 均以 Pi JSONL Session 为事实来源。
5. **可审计与可回滚**：插件加载、凭证访问、网络范围、工具调用、权限决策和金融证据都必须可审计；Package 必须 pinned、trusted、可 disable 和 rollback。

## 2. 分层与依赖方向

```
Layer 0  第三方依赖
Layer 1  src/utils/                         纯工具与配置辅助
Layer 2  src/state/ src/session/            基础状态、Pi Session 生命周期与迁移
Layer 3  src/tools/ src/skills/             金融工具适配器、计算能力与知识资源
Layer 4  src/runtime/pi/ src/plan/           Pi Runtime、AgentSpec、工作流与编排
         src/multi-agent/ src/worktree/
Layer 5  src/commands/ src/controllers/     CLI 与业务入口
         src/bridge/ src/stdio/ src/gateway/
```

依赖方向只能从高层指向低层或同层。`bun run lint:scc` 检查循环依赖、反向层依赖、深层动态 import 和跨包非公开路径；当前门禁要求四项均为零。

## 3. Pi Runtime 边界

### 3.1 唯一入口

`src/runtime/pi/index.ts` 导出 Runtime 公共能力。生产代码使用以下边界：

| 能力 | Pi 边界 | 责任 |
|---|---|---|
| Session 创建 | `PiAgentSessionFactory` | AgentSpec、Profile、Tool allowlist、Package 和权限策略装配 |
| 单次执行 | `runPiPrompt` / `streamPiAgent` | Prompt、Model、Tool Call、Streaming、Abort、Timeout 和错误事件 |
| Session 生命周期 | `PiSessionService` | create、resume、fork、compact、rename、tag、export、remove、recovery |
| 后台任务 | `PiBackgroundService` | Daemon、Agent Tool 和 Worker 的 Pi Session 执行 |
| Agent 定义 | `@upup/pi-investment-workflow` 的 `PiAgentCatalog` | `UpUpAgentSpec` 的唯一可执行存储 |
| 工具协议 | Pi Tool Contract | schema、AbortSignal、progress、details、safety 和 evidence |
| Package 目录 | `PiPackageCatalog` | pinned 版本、trusted path、hash、资源发现、disable、rollback |

禁止新增第二个 Agent loop、第二个可执行 Agent 定义存储或直接实例化旧 Agent。`Coordinator` 只能负责拆解、spawn、消息、聚合、生命周期和回收，Worker 的 LLM、Tool、Session 与 Compaction 必须来自 Pi。

### 3.2 AgentSpec

所有普通 Agent、投资 Profile、Custom Agent、Subagent 和 Worker 都序列化为 `UpUpAgentSpec`，至少包含：

- `version`、身份和 prompt；
- `tools`、skills、workflow；
- permissions、profile 和 lifecycle 配置；
- 可重放、可审计的输入与结果边界。

`PiAgentSpecInput`、`PiAgentFileSpec` 和 `PiSubagentConfig` 只作为输入或结果 DTO，不拥有独立执行逻辑。

## 4. 跨包 Port

跨 `packages/commands` 与 `src` 的平台能力通过 `globalThis.__upupAgentPorts` 访问。规范接口位于 `src/runtime/pi/agent-port.ts`，包侧仅保留形状一致的本地镜像：

- `PlanModePort`：计划模式状态；
- `SubagentPort`：任务创建、查询和取消；
- `McpRegistryPort`：MCP 状态；
- `StatePort`：应用状态、格式化和 Pi Session 列表。

Port 只承载平台边界能力，不承载 Agent loop。新增 Port 必须同时补充规范接口、本地镜像、注册实现和跨包契约测试；禁止 `packages/*` 使用四级以上相对动态 import。

## 5. Pi 金融插件生态

内置金融包为 `@upup/pi-finance-sdk@0.1.0`，依赖与 Pi 版本精确锁定。Package 目录包含：

| 资源 | 作用 |
|---|---|
| Extension | 通过 Pi `registerTool()` 注册金融 Tool Contract |
| Skill | DCF、基本面、技术分析、回测、组合和风险等知识工作流 |
| Prompt | 投资 Profile 和报告模板 |
| Workflow | `/invest` 五阶段投研流程 |
| Policy | safe、warning、dangerous、critical 权限策略 |
| Eval | 金融证据、权限、确定性和回归评估 |

Finance Extension 通过受控 host bridge 获取生产金融合同，不能直接依赖工作区源码。默认仅自动加载受信任且 pinned 的包；`UPUP_PI_PACKAGE_PATHS` 只能替换为同样经过 path、hash、版本和资源审计的 Package。

## 6. 金融安全与证据

每个金融 Tool 结果必须携带：`evidence[].id`、`source`、`retrievedAt`、`asOf`、`dataFreshness`、`warnings` 和 `auditId`。凭证、Token 和未脱敏秘密不得进入 Tool 结果、Session、日志或 telemetry。

权限等级：

| 等级 | 示例 | 默认行为 |
|---|---|---|
| `safe` | 行情、基本面、新闻、交易日 | 允许，保留证据 |
| `warning` | 筛选、回测、组合草案 | 允许，记录审计 |
| `dangerous` | 下单计划、撤单、外发草案 | sandbox 或显式确认 |
| `critical` | 真实交易、资金或凭证访问 | 默认拒绝，逐次审批 |

## 7. Session 与投研工作流

Session 生命周期由 Pi JSONL 管理。旧 JSON/JSONL 迁移必须支持 dry-run、备份、hash、report、Pi 回读、tree/fork/compact/export；失败不得覆盖源文件。

`/invest` 使用五阶段状态机：

```
detect → plan → execute → verify → report
                  ↘ paused → resume/fork
```

每个阶段通过 Pi custom entry 保存 checkpoint，必须支持暂停、恢复、Fork、幂等和审计。金融摘要保留 ticker、market、asOf、assumption、risk、evidence 和未完成阶段。

## 8. 验证规则

本地最低门禁：

```text
bun run check:pi-migration
bun run check:pi-packages
bun run test:pi-contracts
bun run typecheck
bun run lint:scc
bun test
bun run build
git diff --check
```

独立语义验收必须逐项覆盖 `pi5.md` 的 A1–A20；本地测试通过不能替代独立 Verifier。真实外部行情、真实模型和真实券商交易属于单独的生产验证阶段，不能用 deterministic fixture 冒充。

## 9. 历史迁移说明

旧 `src/agent/`、`src/model/llm.ts`、`packages/agent-core`、`packages/llm`、`upup-agent`、Paperclip 适配层和旧 bundled runner 已删除。旧路径只允许在迁移计划、审计报告或防回流检查中作为历史字符串出现，不得重新创建目录、导入或实例化。

完整迁移计划、A1–A20 证据矩阵和当前正式进度见 [`pi5.md`](../pi5.md)；Runtime、插件、金融数据流、Session、多 Agent 和 `/invest` 细节见 `docs/architecture/` 下的专题文档。
