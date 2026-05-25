# 模型系统

> LLM 提供商集成和模型管理

## 概述

UpUp 通过统一接口支持多个 LLM 提供商。模型系统处理提供商选择、API 密钥管理、Token 优化和流式输出。

```
┌─────────────────────────────────────────────────────────────────────┐
│                       模型系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    模型管理器                                  │    │
│  │                                                              │    │
│  │  • 提供商路由                                               │    │
│  │  • API 密钥解析                                             │    │
│  │  • Token 优化                                               │    │
│  │  • 流式支持                                                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │ Anthropic  │      │   OpenAI   │      │   Google    │     │
│  │  (Claude)   │      │   (GPT)    │      │  (Gemini)   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
│         ┌────────────────────┬────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │  DeepSeek  │      │   Ollama   │      │   Moonshot  │     │
│  │             │      │  (本地)     │      │             │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 支持的提供商

| 提供商 | 模型 | API 密钥 |
|--------|------|----------|
| `anthropic` | Claude 3.5, Claude 4 | `ANTHROPIC_API_KEY` |
| `openai` | GPT-4, GPT-4o | `OPENAI_API_KEY` |
| `google` | Gemini Pro, Gemini Ultra | `GOOGLE_API_KEY` |
| `deepseek` | DeepSeek-V4, DeepSeek-Coder | `DEEPSEEK_API_KEY` |
| `ollama` | 本地模型 | (本地) |
| `moonshot` | Moonshot-V1 | `MOONSHOT_API_KEY` |
| `xai` | Grok | `XAI_API_KEY` |
| `openrouter` | 多提供商路由 | `OPENROUTER_API_KEY` |

---

## 快速使用

### 基础调用

```typescript
import { callLlm } from '@/model/llm';

const result = await callLlm('分析这些股票数据');
console.log(result.response);
```

### 带工具调用

```typescript
import { callLlm } from '@/model/llm';
import { getTools } from '@/tools';

const tools = getTools();
const result = await callLlm('计算 AAPL 的 RSI', {
  tools,
});

if (result.usage) {
  console.log('使用的 Token:', result.usage.totalTokens);
}
```

### 流式输出

```typescript
import { streamLlmWithMessages } from '@/model/llm';

const messages = [
  new HumanMessage('你好'),
];

for await (const chunk of streamLlmWithMessages(messages)) {
  process.stdout.write(chunk.content);
}
```

---

## API 参考

### callLlm

```typescript
async function callLlm(
  prompt: string,
  options?: CallLlmOptions
): Promise<LlmResult>
```

**选项:**

```typescript
interface CallLlmOptions {
  model?: string;           // 模型名称 (默认: deepseek-v4-flash)
  systemPrompt?: string;    // 覆盖系统提示
  tools?: StructuredToolInterface[];
  outputSchema?: z.ZodType;
  signal?: AbortSignal;
}
```

**结果:**

```typescript
interface LlmResult {
  response: AIMessage | string;
  usage?: TokenUsage;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

### callLlmWithMessages

多轮对话支持：

```typescript
async function callLlmWithMessages(
  messages: BaseMessage[],
  options?: CallLlmWithMessagesOptions
): Promise<LlmResult>
```

### streamLlmWithMessages

流式响应：

```typescript
async function* streamLlmWithMessages(
  messages: BaseMessage[],
  options?: CallLlmWithMessagesOptions
): AsyncGenerator<AIMessageChunk>
```

---

## 模型选择

### 默认模型

```typescript
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEFAULT_PROVIDER = 'deepseek';
```

### 快速模型

用于快速响应：

```typescript
import { getFastModel } from '@/model/llm';

// 获取提供商的快速变体
const fastModel = getFastModel('anthropic', 'claude-3-haiku');
```

---

## 提供商解析

### 模型名称解析

```typescript
import { resolveProvider } from '@/providers';

// 从模型名称解析提供商
const provider = resolveProvider('claude-3-5-sonnet');
console.log(provider.id); // 'anthropic'

// 自定义 API 端点
const provider2 = resolveProvider('openrouter:anthropic/claude-3.5-sonnet');
console.log(provider2.id); // 'openrouter'
```

---

## API 密钥管理

### 环境变量

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### 设置文件

API 密钥也可以存储在 `~/.upup/settings.json`：

```json
{
  "apiKey": "sk-..."
}
```

---

## Token 优化

### Anthropic 提示缓存

UpUp 自动使用 Anthropic 的 cache_control 实现约 90% 的输入 Token 节省：

```typescript
// 系统提示自动缓存
const messages = [
  new SystemMessage(systemPrompt),  // 使用 cache_control 标记
  new HumanMessage(userPrompt),
];

// 后续调用重用缓存前缀
```

### 使用量追踪

```typescript
const result = await callLlm('分析 AAPL');

if (result.usage) {
  console.log(`输入: ${result.usage.inputTokens}`);
  console.log(`输出: ${result.usage.outputTokens}`);
  console.log(`总计: ${result.usage.totalTokens}`);
}
```

---

## 错误处理

```typescript
import { callLlm } from '@/model/llm';

try {
  const result = await callLlm('分析这个');
} catch (error) {
  if (error.message.includes('rate_limit')) {
    console.log('速率限制，稍后重试');
  } else if (error.message.includes('invalid_api_key')) {
    console.log('检查您的 API 密钥');
  }
}
```

---

## 自定义提供商

通过扩展模型工厂添加新提供商：

```typescript
import { MODEL_FACTORIES } from '@/model/llm';

MODEL_FACTORIES['my-provider'] = (name, opts) => {
  return new ChatOpenAI({
    model: name,
    ...opts,
    apiKey: process.env.MY_PROVIDER_API_KEY,
    configuration: {
      baseURL: 'https://api.my-provider.com/v1',
    },
  });
};
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [API 参考](api-cn.md)
- [开发指南](development-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
