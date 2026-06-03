# UpUp Skills Collection

基于 UpUp 项目代码蒸馏的技能集合，帮助理解和开发 UpUp CLI AI Agent。

## Skills 列表

| Skill | 描述 | 适用场景 |
|-------|------|----------|
| `upup-core` | 核心架构 | 理解项目结构、入口点、模块关系 |
| `upup-agent-loop` | Agent循环 | 理解工具迭代、上下文管理、流式处理 |
| `upup-tool-registry` | 工具注册 | 添加新工具、查看工具能力 |
| `upup-multi-agent` | 多代理系统 | 子Agent创建、任务协调、团队管理 |
| `upup-memory` | 记忆系统 | 持久化记忆、跨会话上下文、智能提取 |
| `upup-finance` | 金融数据 | 股价、财报、股票筛选、量化分析 |
| `upup-skill-system` | 技能系统 | 创建自定义技能、技能触发、执行流程 |
| `upup-tui` | TUI界面 | Ink组件、命令处理、覆盖层 |
| `upup-dcf` | DCF估值 | 折现现金流分析、股票内在价值 |
| `upup-plugin` | 插件系统 | MCP集成、工具扩展、插件开发 |

## 目录结构

```
.agents/skills/
├── upup-core/          # 核心架构
├── upup-agent-loop/    # Agent循环
├── upup-tool-registry/  # 工具注册
├── upup-multi-agent/    # 多代理系统
├── upup-memory/        # 记忆系统
├── upup-finance/       # 金融数据
├── upup-skill-system/  # 技能系统
├── upup-tui/           # TUI界面
├── upup-dcf/           # DCF估值
└── upup-plugin/        # 插件系统
```

## 使用方式

在 Codex 中，通过 `@upup-[skill-name]` 调用对应的 skill。

示例：
- `@upup-core` - 理解 UpUp 项目结构
- `@upup-finance` - 金融数据分析
- `@upup-dcf` - DCF 估值分析

## 来源

这些 skills 源自 UpUp 项目的源代码分析：

- **Agent Core** (`src/agent/`): agent.ts, scratchpad.ts, prompts.ts, tool-executor.ts
- **Tools** (`src/tools/`): registry/, finance/, astock/, quant/
- **Skills** (`src/skills/`): registry.ts, loader.ts, executor.ts
- **Multi-Agent** (`src/multi-agent/`): agent-factory.ts, coordinator.ts
- **Memory** (`src/memory/`): store.ts, search.ts, extraction.ts
- **TUI** (`src/tui/`): main.ts, command-input.ts, focus-manager.ts
