# Spec: CLI 隐藏命令生态 (cli-extension)

## Purpose

在 upup CLI 暴露 20+ 投研隐藏命令,通过 `feature()` 编译开关门控,默认关闭,用户主动 `/feature enable <command-name>` 才加载。对标 loucode HIDDEN-COMMANDS 生态,让 upup CLI 真正成为"投研 Claude Code"的命令面板。

## Requirements

### REQ-1: 20+ 命令分类

The CLI SHALL expose these 20+ hidden commands, organized in 5 categories:

**晨会类**(2):
- `/morning-brief`:每日开盘前简报
- `/earnings-preview`:财报日 T-1 简报

**盘后类**(3):
- `/after-hours-summary`:每日收盘总结
- `/portfolio-review`:组合每日复盘
- `/risk-dashboard`:风险仪表盘

**持仓类**(3):
- `/watchlist-edit`:编辑自选股
- `/rebalance-now`:立即调仓
- `/alert-add` / `/alert-remove`:加减预警

**研究类**(4):
- `/industry-deep-dive`:行业深度研究(走 deep-plan)
- `/backtest-run`:快速回测
- `/screen`:自然语言选股
- `/compare`:多标的对比

**协同类**(3):
- `/bridge`:启动远程桥接
- `/wechat-bind` / `/feishu-bind`:绑定推送渠道
- `/session-share`:分享会话链接

**调试类**(3):
- `/telemetry-show`:查看最近事件
- `/feature-list`:列出 50+ 编译开关
- `/doctor`:环境自检

### REQ-2: 编译开关

Each command SHALL be gated by a `feature()`:

- 命名规范:`COMMAND_<NAME>` 全大写,下划线分隔
- 例子:`feature('COMMAND_MORNING_BRIEF')`
- 默认 off
- 加载方式:`/feature enable morning-brief` 启用单个

### REQ-3: 注册表

The commands SHALL register in a central registry:

- `src/commands/index.ts`:中央注册表
- 每个命令文件 export `command: Command`
- 启动时遍历注册表,根据 `feature()` 过滤可见命令

### REQ-4: 帮助集成

The commands SHALL integrate with:

- `/help`:列出可见命令(过滤后)
- `/help <command>`:显示具体命令帮助
- `/feature-list`:列出所有命令对应的 feature 开关

### REQ-5: 优先级

Commands MUST be implemented in 2 batches:

- **P0**(Sprint 1):`/morning-brief` `/earnings-preview` `/risk-dashboard` `/portfolio-review` `/watchlist-edit`(5 个,优先)
- **P1**(Sprint 2):`/rebalance-now` `/alert-add` `/alert-remove` `/screen` `/compare` `/doctor`(6 个)
- **P2**(Sprint 3):其余 9+ 个

## Scenarios

### Scenario 1: 启用命令

- **Given**: `feature('COMMAND_MORNING_BRIEF')` 默认 off
- **When**: 用户输入 `/feature enable morning-brief`
- **Then**: 该命令下次启动时可见,`/help` 列出

### Scenario 2: 调用命令

- **Given**: `/morning-brief` 已启用
- **When**: 用户输入 `/morning-brief`
- **Then**: Coach 生成简报 → 推送到 CLI / 微信 / 飞书

### Scenario 3: 批量启用

- **Given**: 用户想启用所有"持仓类"命令
- **When**: 用户输入 `/feature enable category:portfolio`
- **Then**: 该类别下 3 个命令全部启用

### Scenario 4: 关闭命令

- **Given**: `/morning-brief` 已启用
- **When**: 用户输入 `/feature disable morning-brief`
- **Then**: 下次启动时该命令不可见

## Dependencies

- `src/commands/index.ts`(中央注册表)
- `src/agent/feature-gates.ts`(升级 50+ 开关)
- `src/coach/`(命令实现)
- `src/coordinator/`(命令实现,deep-plan)
- `src/bridge/`(命令实现,bridge 启动)

## Out of Scope

- 命令的参数解析细节(由具体命令文件决定)
- 命令的 UI 风格(用 Ink 现有组件)
