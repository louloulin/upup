---
name: upup-core
description: UpUp CLI AI agent 核心架构。用于理解upup项目的整体结构、入口点、主要模块关系。当用户询问upup如何工作、架构设计、项目结构时触发。
---

# UpUp Core - 核心架构 Skill

## 项目概述

UpUp 是一个基于 TypeScript + Ink (React for CLI) + LangChain 构建的 CLI AI Agent，用于深度金融研究。

## 目录结构

```
src/
├── index.tsx          # CLI 入口
├── cli.tsx            # Ink CLI 主程序
├── agent/             # Agent 核心
├── tools/             # 工具集
├── skills/            # SKILL.md 技能系统
├── multi-agent/       # 多代理系统
├── memory/            # 记忆系统
├── model/             # LLM 抽象层
├── components/        # UI 组件
├── hooks/             # React hooks
├── tui/               # TUI 界面
└── utils/             # 工具函数
```

## 核心组件

### 1. Agent Core (`src/agent/`)
- `agent.ts`: 主Agent循环 (48KB+)，包含工具调用、上下文管理
- `scratchpad.ts`: 工具结果追踪，支持JSONL持久化
- `prompts.ts`: 系统提示构建，支持SOUL.md/RULES.md
- `tool-executor.ts`: 工具执行器
- `compact.ts`: 上下文压缩
- `loop-recovery.ts`: 循环检测与恢复
- `fallback.ts`: LLM回退机制

### 2. Tools Registry (`src/tools/registry/`)
- `index.ts`: 工具注册中心，按域分解 (finance, filesystem, search, etc.)
- `finance-tools.ts`: 美股金融工具
- `astock-tools.ts`: A股工具
- `quant-tools.ts`: 量化分析工具

### 3. Skills System (`src/skills/`)
- `registry.ts`: 技能发现与加载
- `loader.ts`: SKILL.md 解析器
- `executor.ts`: 技能执行器
- `skill-trigger.ts`: 技能触发检测
- 技能目录: `.upup/skills/` > `~/.claude/skills/` > `src/skills/`

### 4. Multi-Agent (`src/multi-agent/`)
- `agent-factory.ts`: 子Agent工厂
- `coordinator.ts`: 任务协调器
- `agent-registry.ts`: Agent注册表
- `skill-tracker.ts`: 技能使用追踪

### 5. Memory (`src/memory/`)
- `store.ts`: 记忆存储
- `search.ts`: 记忆搜索 (TF-IDF + embeddings)
- `extraction.ts`: 记忆提取
- `consolidation.ts`: 记忆整合

### 6. Model Layer (`src/model/`)
- `llm.ts`: 多提供商LLM抽象
- 支持: OpenAI, Anthropic, Google, xAI, OpenRouter, Ollama

## 入口点

1. **CLI启动**: `bun run src/index.tsx` → `src/cli.tsx`
2. **Agent运行**: `src/run.ts` → 创建Agent实例 → 循环调用工具
3. **TUI渲染**: `src/tui/main.ts` → Ink组件

## 关键类型

- `AgentConfig`: Agent配置 (model, maxIterations, memoryEnabled等)
- `AgentEvent`: Agent事件 (tool_start, tool_end, thinking等)
- `RegisteredTool`: 工具注册条目
- `Skill`: 技能定义

## 工具类型

| Category | Tools |
|----------|-------|
| Finance | get_financials, get_market_data, read_filings, stock_screener |
| A-Stock | get_astock_price, get_astock_financials, get_astock_news, screen_astocks |
| Quant | portfolio_optimization, options_pricing, technical_indicators |
| Search | web_search, browser, skill |
| System | memory_search, memory_update, task, ask |

## 上下文管理

- **Scratchpad**: 追踪所有工具结果，JSONL格式持久化
- **Compaction**: 自动压缩旧消息，保留关键结果
- **Microcompact**: 每轮压缩，去除冗余

## 工具执行

- `AgentToolExecutor`: 并发执行只读工具
- `ConcurrencyMap`: 工具并发安全映射
- `ToolApproval`: 工具使用审批流程
