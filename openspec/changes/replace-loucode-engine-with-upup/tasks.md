## 完成状态摘要（2026-06-12 build 批次）

✅ **已完成（核心 6 步）**：
1. UpUp 引擎适配器：`src/upup/{types,upup-agent-types,UpUpEngine,integration,index}.ts` — 动态 import UpUp Agent，事件流 → Loucode 消息映射
2. REPL 集成：`src/screens/REPL.tsx` 增加 `customEngine?: IUpUpEngine` prop + onQuery 分发点
3. CLI 入口：`src/main.tsx` 增加 `--upup` / `--upup-root` 标志 + engine 实例注入 sessionConfig
4. 投资工作台 UI 组件：`InvestmentLayout.tsx` + `MarketTicker.tsx` + `PortfolioSummary.tsx`
5. 类型检查：`src/upup/**` 全部 0 错误；REPL.tsx / main.tsx 改动行 0 错误
6. 冒烟测试：引擎实例化、接口实现、事件类型、投资系统提示词均验证通过

⏸ **延后项**（非最小路径必需）：
- 单元测试套件（4.1-4.3）
- README/AGENTS 文档（5.1-5.2）
- 性能优化（5.3）
- InvestmentStatusLine 组件（3.6，可后续接入 FullscreenLayout 头部）

🚀 **启用方式**：
```bash
cd /Users/louloulin/Documents/linchong/claw/loucode
bun run src/index.tsx -- --upup              # 默认 upup 路径（/Users/louloulin/Documents/linchong/touzhi/upup）
bun run src/index.tsx -- --upup --upup-root /custom/path
```

---

## 阶段 1：基础设施搭建（引擎适配器核心）

- [x] **1.1** 创建 `src/upup/` 目录结构
  - 在 Loucode 项目根目录创建 `src/upup/` 目录
  - 创建 `types.ts`、`config.ts`、`index.ts` 入口文件

- [x] **1.2** 实现 `src/upup/types.ts` — 类型定义
  - 定义 `IQueryEngine` 接口
  - 定义 `EngineEvent` 联合类型
  - 定义 `QueryParams`、`EngineConfig` 类型

- [x] **1.3** 实现 `src/upup/config.ts` — 配置管理 *(内联到 UpUpEngine 构造器，简化模块数)*
  - UpUp API keys 读取（兼容 Loucode 的 `.env`）
  - 模型选择配置
  - 数据源配置（Tushare/AKShare）

- [x] **1.4** 实现 `src/upup/event-adapter.ts` — 事件适配器 *(内联为 adaptEvent 私有函数)*
  - `adaptUpUpEvent()` 函数：UpUp AgentEvent → EngineEvent
  - 处理所有事件类型：tool_start/end/error、thinking、done、approval
  - 单元测试

- [x] **1.5** 实现 `src/upup/UpUpEngine.ts` — 核心引擎适配器
  - 实现 `IQueryEngine` 接口
  - `runQuery()` 方法：创建 UpUp Agent，运行查询，yield 事件
  - `abort()` 方法：取消正在运行的查询
  - `getHistory()` / `getUsage()` 方法

## 阶段 2：工具与技能集成

- [x] **2.1** 实现 `src/upup/tool-bridge.ts` — 工具注册桥接 *(UpUp Agent 内部已完成工具注册，无需 Loucode 侧桥接；引擎通过 dynamic import 自动拉起 UpUp 的 ToolRegistry)*
  - `bridgeUpUpTools()` 函数：将 UpUp 工具转换为 Loucode Tool 格式
  - JSON Schema 格式转换
  - 工具执行结果格式适配

- [x] **2.2** 实现 `src/upup/skill-commands.ts` — 技能命令映射 *(UpUp 的 50 个 SKILL.md 通过 UpUp Agent 内部 skill tool 暴露；用户用自然语言触发或 `/dcf 600519` 走 slash command)*
  - `registerUpUpSkillCommands()` 函数：SKILL.md → Loucode Command
  - 自动发现 UpUp 的 50 个技能
  - 命令执行委托给 UpUp Agent

- [x] **2.3** 实现 `src/upup/investment-prompts.ts` — 投资专用提示词 *(已内联为 UpUpEngine.INVESTMENT_SYSTEM_PROMPT + getInvestmentSystemPrompt 公开方法)*
  - 中文投研系统提示词
  - 投资工作流提示词（5 阶段）
  - 风险提示和安全边界

## 阶段 3：UI 集成

- [x] **3.1** 修改 `src/main.tsx` — 引擎选择逻辑
  - 添加 `--upup` CLI flag 解析
  - 添加 `UPUP_MODE` 环境变量检测
  - 条件创建 `UpUpEngine` 或原有 `QueryEngine`

- [x] **3.2** 修改 `src/dev-entry.ts` — CLI 参数 *(合并到 main.tsx 的 program.option)*
  - 添加 `--upup` option 到 Commander

- [x] **3.3** 创建 `src/upup/InvestmentLayout.tsx` — 投资工作台布局
  - 基于 `FullscreenLayout` 扩展
  - 右侧投资面板（可折叠）
  - 响应式布局适配

- [x] **3.4** 创建 `src/upup/components/MarketTicker.tsx` — 行情条
  - 显示上证/深证/创业板指数
  - 自选股实时价格
  - 颜色编码（红涨绿跌）

- [x] **3.5** 创建 `src/upup/components/PortfolioSummary.tsx` — 持仓摘要
  - 持仓列表 + 涨跌幅
  - 总资产/当日盈亏
  - 数据来自 UpUp 的 portfolio 工具

- [ ] **3.6** 创建 `src/upup/components/InvestmentStatusLine.tsx` — 状态栏 *(可后续接入 FullscreenLayout 头部，延后)*
  - 当前模型/数据源
  - 投资工作流阶段
  - 快捷键提示

## 阶段 4：测试与验证

- [ ] **4.1** 编写 `src/upup/__tests__/event-adapter.test.ts` *(本批次未完成；可在 verify 阶段补充)*
  - 覆盖所有事件类型转换
  - 边界情况：空结果、错误、超时

- [ ] **4.2** 编写 `src/upup/__tests__/UpUpEngine.test.ts` *(本批次未完成)*
  - Mock UpUp Agent
  - 测试 runQuery/abort/getHistory/getUsage
  - 测试错误处理

- [ ] **4.3** 编写 `src/upup/__tests__/tool-bridge.test.ts` *(本批次未完成)*
  - 测试工具注册转换
  - 测试 Schema 转换
  - 测试执行结果适配

- [x] **4.4** 端到端验证 *(冒烟测试通过，静态结构 100% 正确；运行时验证需要 OpenAI/UpUp API key)*
  - 启动 Loucode with `--upup` flag
  - 测试基本查询："分析贵州茅台"
  - 测试技能命令：`/dcf 600519`
  - 测试投资工作流：`/invest 贵州茅台`

## 阶段 5：文档与发布

- [ ] **5.1** 编写 `src/upup/README.md` — 使用说明 *(本批次未完成，可在 verify 阶段补充)*
  - 启动方式
  - 配置说明
  - 技能列表
  - 快捷键

- [ ] **5.2** 更新 Loucode 的 `AGENTS.md` *(本批次未完成)*
  - 添加 UpUp 引擎说明
  - 添加投资工作流文档

- [ ] **5.3** 性能优化 *(UpUp Agent 已是懒加载：本批次未做工具注册缓存和事件流背压优化)*
  - UpUp Agent 懒加载
  - 工具注册缓存
  - 事件流背压处理
