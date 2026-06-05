# tools-registry

## Purpose
统一管理所有工具的注册、调度、description 注入、rendering。每个工具 SHALL 是一等公民，registry 决定哪些工具暴露给 LLM。

## Requirements

### R-1 Tool interface
系统 SHALL 定义统一 `Tool` 接口：name、description、schema、execute(args, ctx) → result。LLM SHALL 只能调用 registry 暴露的工具。

### R-2 Conditional registration
系统 SHALL 根据环境变量（如 `FINANCIAL_DATASETS_API_KEY`、`EXASEARCH_API_KEY`、`TAVILY_API_KEY`、`LANGSMITH_API_KEY`）决定工具是否注册。

### R-3 Description injection
系统 SHALL 在 system prompt 中按 category 注入工具 description，LLM SHALL 看到当前可用的全部工具列表。

### R-4 Result rendering
系统 SHALL 为每个工具提供 renderer，UI SHALL 通过统一接口 `renderToolResult` 渲染。

### R-5 Per-tool metrics
系统 SHALL 记录每个工具的调用次数、耗时、错误率，暴露给 telemetry。

## Scenarios

### S-1 Missing API key
- **GIVEN** `FINANCIAL_DATASETS_API_KEY` 未设置
- **WHEN** CLI 启动
- **THEN** `financial_search` 工具 SHALL 不出现在 LLM 可用列表中

### S-2 Tool failure
- **GIVEN** 工具执行抛异常
- **WHEN** agent 收到 tool_end 事件
- **THEN** scratchpad SHALL 写入错误摘要，agent SHALL 可以选择重试或换工具
