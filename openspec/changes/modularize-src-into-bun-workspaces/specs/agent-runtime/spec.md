# agent-runtime

## Purpose
封装 agent 循环（思考→工具调用→观察→再思考）、scratchpad、上下文压缩、事件流和状态机。所有 agent 行为只走这一个 capability，不在其它 capability 里重新发明轮子。

## Requirements

### R-1 Agent loop
系统 SHALL 提供迭代式 agent 循环：接收 query → 调用 LLM → 处理 tool_call → 执行工具 → 写回 scratchpad → 再次调用 LLM，直至 LLM 返回 final answer 或达到 max_iterations。

### R-2 Scratchpad
系统 SHALL 把所有工具结果存到单一 scratchpad 对象，作为该 query 的"事实之源"；LLM 在每轮只能看到 scratchpad 的内容。

### R-3 Context compaction
系统 SHALL 在累计 token 超过阈值时按"最旧优先"清理工具结果；压缩前后 scratchpad 内容 SHALL 一致。

### R-4 Event stream
系统 SHALL 在循环中 yield 类型化事件（`tool_start`、`tool_end`、`thinking`、`answer_start`、`done` 等），供 UI 和外部观察者订阅。

### R-5 Final answer
系统 SHALL 在 LLM 决定收尾时单独发起一次无工具的 LLM 调用生成 final answer，传入完整 scratchpad 上下文。

### R-6 Multi-provider LLM
系统 SHALL 支持 OpenAI、Anthropic、Google、xAI、OpenRouter、Ollama；模型选择由 `@upup/llm` 提供。

## Scenarios

### S-1 Single-tool research
- **GIVEN** 用户 query "NVDA 2024 revenue"
- **WHEN** agent 启动
- **THEN** 经过 ≤10 轮迭代后返回引用财报数据的 final answer

### S-2 Context overflow
- **GIVEN** scratchpad 累计 token 超过 80k
- **WHEN** 新一轮 LLM 调用发起
- **THEN** 系统清理最旧工具结果并继续，scratchpad 内容不丢
