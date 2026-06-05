## Why

upup 仓库已经在 package.json 中声明 21 个 workspace 包（packages/*），但 src/ 仍然保留了所有原始实现，packages/* 中多数只是空 index.ts stub。这种"双轨制"导致：模块边界模糊、无法独立发布、构建必须绕过 workspace、测试/类型/发布路径不一致、onboarding 看不清职责。本次整改要把 src/ 下的 68 个目录彻底迁移到对应的 workspace 包，让 src/index.tsx 只做应用壳 + 顶层编排，让每个 packages/* 真正成为可独立构建/测试/发布的单元。

## What Changes

- 把 src/ 下 68 个目录按"单一职责"映射到 21+ 个 workspace 包，逐个搬运、补全 stub、调整 import 路径
- 新增缺失的 workspace 包（@upup/agent、@upup/tools、@upup/tui、@upup/components、@upup/bridge、@upup/coordinator、@upup/plan、@upup/daemon、@upup/cron、@upup/telemetry、@upup/realtime、@upup/gateway、@upup/memory、@upup/skills、@upup/plugins、@upup/mcp、@upup/multimodal、@upup/research、@upup/services、@upup/storage、@upup/session、@upup/cli、@upup/index）补齐 src/ 现有所有目录
- src/index.tsx、src/cli.ts、src/run.ts、src/bundled-runner.ts、src/theme.ts 改为只组合 packages/*，不再写业务逻辑
- 顶层 tsconfig.base.json + 每个包独立 tsconfig.json，统一 ESM/bun 解析与 path alias
- 引入 bunfig.toml workspace 锁定、根 package.json workspaces 字段校验
- 增量构建脚本：bun run build:packages（按拓扑排序逐包构建）；替换当前手写多步
- 现有测试全部跟着代码迁移，bun test 必须在迁移后保持绿灯
- 现有 bun run typecheck / bun run lint:scc 在迁移后必须保持绿灯
- 删除 src/ 中所有已被 workspace 包接管的实现（保留 src/index.tsx / src/cli.ts / src/run.ts / src/bundled-runner.ts / src/theme.ts 作为入口壳）

## Capabilities

### New Capabilities

- agent-runtime: agent 循环、scratchpad、上下文压缩、事件流、状态机
- tools-registry: 工具注册、调度、rendering、description 注入
- finance-tools: 行情/财报/估值/筛选/backtest/watchlist 等金融工具集
- tui-renderer: Ink 风格 pi-tui 渲染层、组件、keybindings、overlays
- skill-system: SKILL.md 发现、调度、执行、审计
- mcp-bridge: MCP 客户端、服务端、stdio 传输
- plugin-system: 插件 manifest、加载、adapters
- memory-system: memvid/SQLite/BM25 记忆、归档、跨 session 共享
- cron-system: croner 调度、任务状态、worker pool
- daemon-system: 后台守护进程、健康检查、worker 池
- session-system: session 持久化、checkpoint、resume、迁移
- realtime-channel: 实时通道（WebSocket/SSE/广播）
- telemetry-system: 指标、trace、events、anonymized 遥测
- cli-shell: CLI 命令注册、子命令解析、onboarding、doctor、stdio server
- bridge-system: 外部桥接（Paperclip/WhatsApp/IM）
- coordinator-system: 多 agent 编排、planner、orchestrator
- plan-system: research plan、plan builder、plan executor、audit
- research-system: research workflow、dossier、报告生成
- multimodal-system: 多模态输入/输出（image/audio/structured）
- services-core: 应用服务层、context wiring、DI 容器
- storage-system: 存储抽象、KV、文件、对象存储适配
- gateway-system: 通道网关、消息路由、WhatsApp/Webhook
- index-app: 顶层入口（src/index.tsx + src/run.ts），把 cli/bundled-runner/stdio server 串起来

### Modified Capabilities

无（首次系统性模块化，只搬运实现，不修改已有 capability 的需求）。

## Impact

- 受影响代码：src/**/*、packages/**/*、tsconfig*.json、package.json、bunfig.toml、bun.lock
- 受影响 API：所有 import 路径；新 import 必须走 workspace 协议 @upup/<name>
- 受影响依赖：现有 @upup/* 之间的 peer/dev/dependency 关系按"分层 + 单向"重排（types → utils → hooks → state → llm → agent-core → tools/skills/mcp/memory/cron/... → cli → index）
- 受影响系统：CI（bun run typecheck + bun test）、本地 dev、release 流程、二进制编译
- 受影响测试：所有 *.test.ts 随被测代码迁移到对应包；bun test 在所有包必须通过
- 风险：迁移面广（68 目录 + 21+ 包）；必须"逐包迁移 + 绿测试 + 绿 typecheck"滚动式推进
