## 1. 引擎基础设施（in-process SDK 单例）

> 实际简化方案：投资工作台直接走 `app/src/main/upup/sdk-host.ts` UpClient 单例 + 7 个 IPC handler（非 HTTP 桥接）。旧设计 `upupRuntimeAdapter` + KUN 路径兼容方案已演化为单例（详见 `app/src/main/runtime/get-active-adapter.ts`）。

- [x] 1.1 在 `app/package.json` 增加 workspace 依赖 `@upup/sdk` / `@upup/skills`（link 到 `../../packages/*`）
- [x] 1.2 新建 `app/src/main/upup/sdk-host.ts`：导出 `upupSdkHost` 单例（`UpClient` 包装 + start/stop/restart 生命周期）
- [x] 1.3 新建 `app/src/main/upup/settings-bridge.ts`：把 `AppSettingsV1.agents.upup` 翻译为 `@upup/sdk` 的 `ClientConfig`，缺 key 抛中文错误
- [x] 1.4 新建 `app/src/main/upup/ipc.ts`：注册 7 个 IPC handler（health/list-tools/list-skills/list-sessions/query/stream/cancel）+ 流事件推送
- [x] 1.5 新建 `app/src/main/upup/cancellation.ts`：AbortController 池，按 turnId 管理
- [x] 1.6 新建 `app/src/main/upup/index.ts`：barrel re-export `upupSdkHost` + `registerUpupIpcHandlers` + `setMainWindow`
- [x] 1.7 修改 `app/src/main/index.ts`：在 `createWindow` 之后调 `setMainWindow(win)` 注入主窗口引用
- [x] 1.8 保留 `app/src/main/runtime/get-active-adapter.ts` 的 `kunRuntimeAdapter` 作为聊天工作台回退路径

## 2. 引擎层测试

- [x] 2.1 写 `app/src/main/upup/__tests__/settings-bridge.test.ts`：覆盖 provider/model/API key 解析、缺 key 抛错（17 测试）
- [x] 2.2 写 `app/src/main/upup/__tests__/cancellation.test.ts`：覆盖 register/unregister/cancelTurn/cancelAll 生命周期（8 测试）
- [x] 2.3 写 `app/src/main/upup/__tests__/sdk-host.test.ts`：mock @upup/sdk 验证 start/stop/restart 流程（11 测试）
- [x] 2.4 写 `app/src/main/upup/__tests__/ipc.test.ts`：覆盖 7 个 IPC handler 的返回值 + 错误包装（13 测试）
- [x] 2.5 跑 `npm test` 确认所有现有 Kun 测试不回归

## 3. 投资工作台 UI 骨架

- [x] 3.1 新建 `app/src/renderer/src/investment/InvestmentLayout.tsx`：基于 `AppShell` 的网格布局
- [x] 3.2 修改 `app/src/renderer/src/AppShell.tsx`：在顶部 Tab 栏加入"投资工作台"（中文）/ "Investment Workbench"（en）
- [x] 3.3 新建 `app/src/renderer/src/locales/zh/investment.json` + `en/investment.json`
- [x] 3.4 修改 `app/src/renderer/src/i18n.ts`：注册 `investment` namespace
- [x] 3.5 i18n key 完整性测试（沿用现有缺失 key 启动失败约束）

## 4. 投资工作台面板

- [x] 4.1 新建 `panels/MarketTicker.tsx`：指数 + 自选报价，15s 轮询，红涨绿跌，中文千分位
- [x] 4.2 新建 `panels/PortfolioSummary.tsx`：总资产 / 当日盈亏 / 持仓 Top 5
- [x] 4.3 新建 `panels/WatchlistPanel.tsx`：自选 CRUD + 乐观更新
- [x] 4.4 新建 `panels/RiskDashboard.tsx`：行业暴露 / 最大回撤 / 贝塔，中文风险标签（低/中/高）
- [x] 4.5 新建 `panels/ResearchPanel.tsx`：研报速读列表 + 详情抽屉 + 分页
- [x] 4.6 新建 `panels/SkillLauncher.tsx`：50 SKILL 按 8 分类（估值/筛选/简报/复盘/风险/财报/研报/其他）
- [x] 4.7 新建 `panels/WorkflowTracker.tsx`：5 阶段 `/invest` 进度追踪
- [x] 4.8 新建 `hooks/useUpup.ts`：6 个具名 hook（health/list-tools/list-skills/list-sessions/query/stream），错误中文包装

## 5. 投资工作台测试

- [x] 5.1 写 `panels/__tests__/MarketTicker.test.tsx`：覆盖 5 指数渲染、空状态、错误、千分位（6 测试）
- [x] 5.2 写 `panels/__tests__/PortfolioSummary.test.tsx`：覆盖空持仓、Top 5、千分位（5 测试）
- [x] 5.3 写 `panels/__tests__/WatchlistPanel.test.tsx`：覆盖增删改、乐观更新、持久化 key（6 测试）
- [x] 5.4 写 `panels/__tests__/RiskDashboard.test.tsx`：覆盖高贝塔 / 缺数据 / 风险标签（6 测试）
- [x] 5.5 写 `panels/__tests__/ResearchPanel.test.tsx`：覆盖分页、详情抽屉、tryParse 逻辑（7 测试）
- [x] 5.6 写 `panels/__tests__/SkillLauncher.test.tsx`：覆盖 50 技能分组、启动按钮（9 测试）
- [x] 5.7 写 `panels/__tests__/WorkflowTracker.test.tsx`：覆盖 5 阶段状态机（7 测试）
- [x] 5.8 跑 vitest 验证（46/46 通过）

## 6. 文档（中文）

- [x] 6.1 改写 `app/docs/upup-engine-integration.md`：in-process 集成方式、settings 切换、调试方法、API key 配置（322 行）
- [x] 6.2 新建 `app/docs/investment-workbench.md`：投资工作台使用指南，每个面板的字段说明 + 截图占位（363 行）
- [x] 6.3 修改 `app/README.md`：增加"投资工作台"章节
- [x] 6.4 修改 `app/README.en.md`：同步英文版本

## 7. 收尾

- [x] 7.1 跑 `npx tsc --noEmit -p tsconfig.node.json` 通过；`tsconfig.web.json` 125 个错误为预先存在（baseline 179→125 改善 54 个），与本次任务无关
- [x] 7.2 验证 `AppSettingsV1.engine = 'kun'` 仍可正常回退到 Kun 引擎（kunRuntimeAdapter 在 `app/src/main/runtime/get-active-adapter.ts` 保留）
- [x] 7.3 跑 `openspec validate upup-as-core-engine-for-investment-workbench --strict` → Change is valid
- [x] 7.4 用 `comet-archive` 归档此 change（由 verify 阶段后执行）
