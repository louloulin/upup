## ADDED Requirements

### Requirement: 架构债清单 8+ 条目
变更 MUST 在 `docs/architecture-debt.md` 中提供一份架构债清单,至少 8 条,每条标注:`问题描述 / 影响文件 / 影响面 / 修复成本 / 优先级`。

#### Scenario: 8 条以上
- **WHEN** 读者读 `docs/architecture-debt.md`
- **THEN** 至少 8 条架构债,每条独立小节,标注 P0/P1/P2 优先级

#### Scenario: 每条引用具体文件
- **WHEN** 债条标注"agent.ts 1305 行"
- **THEN** 同时引用 `src/agent/agent.ts` 文件路径,行数偏差 ≤ 5%

### Requirement: 单文件超长问题清单
清单 MUST 列出所有 > 800 行的源文件,包括至少:`src/agent/agent.ts` (1305L)、`src/agent/subagent-runner.ts` (631L)、`src/agent/scratchpad.ts` (557L)、`src/agent/feature-gates.ts` (393L)。

#### Scenario: 4 个超长文件全列
- **WHEN** 读者读 §单文件超长
- **THEN** 至少 4 个文件被点名,每个标注"建议拆分为 N 个 < 400 行模块"

### Requirement: 模块边界泄漏清单
清单 MUST 列出已知的模块边界泄漏,至少:`src/agent/agent.ts` 内部 import `src/tools/finance/*` 反向引用、`src/agent/agent-port.ts` 暴露 `src/tools/` API、`src/agent/investment-workflow.ts` 通过 callback 注入工具。

#### Scenario: 3+ 个边界泄漏
- **WHEN** 读者读 §模块边界泄漏
- **THEN** 至少 3 个具体泄漏点,每个引用 `import` 语句

### Requirement: 状态机散落清单
清单 MUST 列出 4 套独立状态机:`Agent.SessionState` (idle/running/waiting/completed/error/canceled)、`Plan.ResearchPlanState`、`KAIROS.TaskState`、`Coordinator.TaskState`,指出它们之间的转换协议不统一。

#### Scenario: 4 套状态机
- **WHEN** 读者读 §状态机散落
- **THEN** 4 套状态机的"状态名 + 触发器 + 持久化路径"三列表

### Requirement: 测试覆盖率评估
清单 MUST 评估当前测试覆盖:`src/**/*.test.ts` 共 276 个 vs `src/tools/**/*.ts` 共 296 个,核心模块(`src/agent/agent.ts` 1305L)有 8+ 个 `.test.ts`。

#### Scenario: 数量级一致
- **WHEN** 引用 276 vs 296
- **THEN** 数字偏差 ≤ 5%,`find ... -name "*.test.ts" | wc -l` 验证

### Requirement: Bun 兼容性风险清单
清单 MUST 列出 Bun 兼容性风险:至少 2 处,引用 `package.json` 中已知的 npm 包(如 `@whiskeysockets/baileys`、`better-sqlite3` native binding)需要 Bun 兼容版本。

#### Scenario: 至少 2 个 Bun 风险
- **WHEN** 读者读 §Bun 兼容性
- **THEN** 至少 2 个 npm 包被点名,每个引用 `package.json:dependencies` 行号
