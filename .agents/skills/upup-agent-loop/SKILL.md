---
name: upup-agent-loop
description: UpUp Agent循环执行机制。当需要理解agent如何迭代执行工具、处理上下文、生成最终答案时触发。涉及tool-executor, scratchpad, compaction, loop-detection, streaming。
---

# UpUp Agent Loop - 代理循环 Skill

## 概述

Agent循环是UpUp的核心执行引擎，控制工具调用迭代、上下文管理和答案生成。

## 循环流程

```
用户查询 → Agent.run()
    ↓
1. 构建系统提示 (prompts.ts)
    ↓
2. 初始化Scratchpad
    ↓
3. 主循环 (最多50次迭代)
    ├── 3.1 调用LLM (streaming)
    ├── 3.2 解析工具调用
    ├── 3.3 执行工具 (AgentToolExecutor)
    ├── 3.4 记录结果到Scratchpad
    ├── 3.5 检查循环检测 (loop-recovery)
    ├── 3.6 上下文压缩 (compact)
    └── 3.7 检查终止条件
    ↓
4. 生成最终答案 (无工具调用)
    ↓
返回 AnswerEvent
```

## Scratchpad (工具结果追踪)

**位置**: `.upup/scratchpad/`

**格式**: JSONL (每行一个JSON条目)

**条目类型**:
- `init`: 初始化，包含用户查询
- `tool_result`: 工具执行结果
- `thinking`: 思考过程

**关键方法**:
```typescript
scratchpad.addToolResult(toolName, args, result)
scratchpad.getToolResults()  // 获取所有工具结果
scratchpad.canCallTool(toolName)  // 检查限制
scratchpad.recordToolCall(toolName)  // 记录调用
```

**工具限制**:
- 每个工具默认最多3次调用
- 相似查询检测防止重复
- 软限制警告（非硬阻止）

## 工具执行器

**类**: `AgentToolExecutor`

**功能**:
- 并发执行只读工具
- 工具审批流程
- 工具结果渲染

**并发安全映射**:
```typescript
// 只读工具可并发
get_financials: true
get_market_data: true
web_search: true

// 写操作需串行
write_file: false
run_command: false
```

## 上下文压缩

### Microcompact (每轮)

去除冗余、压缩空格、合并连续消息

### Full Compaction (阈值触发)

**触发条件**:
- 工具结果数量 > MIN_TOOL_RESULTS_FOR_COMPACTION (10)
- 上下文大小 > getAutoCompactThreshold()

**压缩策略**:
1. 保留最近N条结果
2. 总结早期结果为摘要
3. 保留关键数据点

## 循环检测与恢复

**类**: `LoopDetector`

**检测**:
- 相同工具调用 + 相同参数
- 相似查询 + 无进展
- 连续失败

**恢复策略**:
1. 建议尝试不同工具
2. 提示数据限制
3. 建议直接回答

## LLM调用

**流式处理**:
```typescript
streamLlmWithMessages(messages, {
  signal: abortSignal,
  onChunk: (chunk) => {/* 实时更新 */},
})
```

**回退机制**:
- 主模型失败时自动切换备用模型
- `ModelFallbackHandler`

## 事件系统

```typescript
type AgentEvent = 
  | { type: 'thinking', content: string }
  | { type: 'tool_start', tool: string }
  | { type: 'tool_end', tool: string, result: string }
  | { type: 'answer_start' }
  | { type: 'done', answer: string }
```

## 最终答案生成

循环结束后，使用完整scratchpad上下文调用LLM:
- 无工具绑定
- 提供所有工具结果
- 要求生成结构化答案

## 配置

```typescript
interface AgentConfig {
  model?: string           // 默认 gpt-5.4
  maxIterations?: number  // 默认 50
  memoryEnabled?: boolean // 默认 true
  signal?: AbortSignal
  toolFilter?: string[]   // 限制可用工具
}
```
