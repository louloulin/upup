## 1. 引擎基础设施（in-process 桥接）

- [ ] 1.1 在 `app/package.json` 增加 workspace 依赖 `@upup/agent-core` / `@upup/sdk` / `@upup/skills`（link 到 `../../packages/*`），跑通 `bun install`
- [ ] 1.2 新建 `app/src/main/upup/adapter.ts`，导出 `upupRuntimeAdapter`（同 `kunRuntimeAdapter` 接口）
- [ ] 1.3 新建 `app/src/main/upup/settings-bridge.ts`，把 `AppSettingsV1` 翻译为 `@upup/agent-core` 的 LLM provider / model / API key / MCP 配置，缺 key 抛中文错误
- [ ] 1.4 新建 `app/src/main/upup/host.ts`，在主进程内启动 Node HTTP 服务（默认端口 5300），注册 `KUN_*_PATH` 路由表，调用 `@upup/agent-core` SDK
- [ ] 1.5 新建 `app/src/main/upup/event-bridge.ts`，实现 `AgentEvent → Kun SSE` 翻译（tool_start/tool_end/thinking/done/error/approval/delta）
- [ ] 1.6 修改 `app/src/main/index.ts`：根据 `DEEPSEEK_GUI_ENGINE` 或 settings 选择 `upupRuntimeAdapter` vs `kunRuntimeAdapter`，注入 baseUrl
- [ ] 1.7 修改 `app/src/main/runtime-sse-ipc.ts`：URL 改为通过 adapter 注入（不改 SSE 协议本身）
- [ ] 1.8 修改 `app/src/shared/kun-endpoints.ts`：保留旧常量，新增 `ENGINE_*_PATH` 别名指向相同字符串

## 2. 引擎层测试

- [ ] 2.1 写 `app/src/main/upup/__tests__/event-bridge.test.ts`：覆盖所有 AgentEvent 类型 → Kun SSE 事件映射
- [ ] 2.2 写 `app/src/main/upup/__tests__/settings-bridge.test.ts`：覆盖 provider/model/API key 解析、缺 key 抛错
- [ ] 2.3 写 `app/src/main/upup/__tests__/host.test.ts`：用 supertest 跑通 `/health`、`/v1/threads`、`/v1/skills`、`/v1/runtime/tools` 端点
- [ ] 2.4 写端到端 smoke：启动 app + 切换到 upup 引擎 + 发送一次"分析贵州茅台" + 校验 SSE 事件流
- [ ] 2.5 跑 `npm run typecheck` + `npm test`，确保所有现有 Kun 测试不回归

## 3. 投资工作台 UI 骨架

- [ ] 3.1 新建 `app/src/renderer/src/investment/InvestmentLayout.tsx`：基于 `AppShell` 的网格布局，集成所有面板
- [ ] 3.2 修改 `app/src/renderer/src/AppShell.tsx`：在顶部 Tab 栏加入"投资工作台"（中文）/ "Investment Workbench"（en）
- [ ] 3.3 新建 `app/src/renderer/src/locales/zh-CN/investment.json` + `en/investment.json`，所有中文文案就位
- [ ] 3.4 修改 `app/src/renderer/src/i18n.ts`：注册 `investment` namespace
- [ ] 3.5 写 i18n key 完整性测试（missing key 启动失败）

## 4. 投资工作台面板

- [ ] 4.1 新建 `panels/MarketTicker.tsx`：指数 + 自选报价，15s 轮询，红涨绿跌，`Intl.NumberFormat('zh-CN')`
- [ ] 4.2 新建 `panels/PortfolioSummary.tsx`：总资产 / 当日盈亏 / 持仓 Top 5，含 sparkline 占位
- [ ] 4.3 新建 `panels/WatchlistPanel.tsx`：自选 CRUD，调 `@upup/skills` 的 watchlist 工具
- [ ] 4.4 新建 `panels/RiskDashboard.tsx`：行业暴露 / 最大回撤 / 贝塔，中文风险标签（低/中/高）
- [ ] 4.5 新建 `panels/ResearchPanel.tsx`：研报速读列表 + 详情抽屉，分页
- [ ] 4.6 新建 `panels/SkillLauncher.tsx`：50 SKILL 按中文分类（估值/筛选/简报/复盘/风险/财报/研报/其他）展示
- [ ] 4.7 新建 `panels/WorkflowTracker.tsx`：5 阶段 `/invest` 进度追踪（dossier → strategy → earnings-preview → morning-brief → portfolio-review）
- [ ] 4.8 新建 `hooks/useQuotes.ts` / `usePortfolio.ts` / `useWatchlist.ts` / `useRisk.ts`：封装对 `@upup/sdk` 的 fetch 调用 + 缓存

## 5. 投资工作台测试

- [ ] 5.1 写 `panels/MarketTicker.test.tsx`：覆盖 5 个指数 + 自选报价渲染、空状态、错误重试
- [ ] 5.2 写 `panels/PortfolioSummary.test.tsx`：覆盖空持仓、Top 5 排序、中文千分位格式
- [ ] 5.3 写 `panels/WatchlistPanel.test.tsx`：覆盖增删改、乐观更新、持久化
- [ ] 5.4 写 `panels/RiskDashboard.test.tsx`：覆盖高贝塔 / 缺数据 状态
- [ ] 5.5 写 `panels/ResearchPanel.test.tsx`：覆盖分页、详情抽屉
- [ ] 5.6 写 `panels/SkillLauncher.test.tsx`：覆盖 50 技能分组、启动按钮跳转
- [ ] 5.7 写 `panels/WorkflowTracker.test.tsx`：覆盖 5 阶段状态机
- [ ] 5.8 跑 Playwright e2e：启动 app → 切到"投资工作台" → 截图所有面板（desktop + mobile viewport）

## 6. 文档（中文）

- [ ] 6.1 新建 `app/docs/upup-engine-integration.md`（中文）：集成方式、settings 切换、调试方法、API key 配置
- [ ] 6.2 新建 `app/docs/investment-workbench.md`（中文）：投资工作台使用指南，每个面板的字段说明 + 截图
- [ ] 6.3 修改 `app/README.md`：增加"投资工作台"章节（中英双语）
- [ ] 6.4 修改 `app/README.en.md`：同步英文版本

## 7. 收尾

- [ ] 7.1 跑 `npm run typecheck` + `npm run test` + `npm run lint`，全部通过
- [ ] 7.2 跑 `npm run dist:mac:arm64` 验证打包成功，应用可启动
- [ ] 7.3 验证 `AppSettingsV1.engine = 'kun'` 仍可正常回退到 Kun 引擎（regression 测试）
- [ ] 7.4 跑 `openspec validate upup-as-core-engine-for-investment-workbench --strict` 校验
- [ ] 7.5 用 `comet-archive` 归档此 change
