# Model System

> LLM provider integration and model management

## Overview

UpUp supports multiple LLM providers through a unified interface. The model system handles provider selection, API key management, token optimization, and streaming.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Model System Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Model Manager                             │    │
│  │                                                              │    │
│  │  • Provider routing                                        │    │
│  │  • API key resolution                                     │    │
│  │  • Token optimization                                      │    │
│  │  • Streaming support                                      │    │
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
│  │             │      │  (Local)   │      │             │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Supported Providers

| Provider | Model | API Key |
|----------|-------|---------|
| `anthropic` | Claude 3.5, Claude 4 | `ANTHROPIC_API_KEY` |
| `openai` | GPT-4, GPT-4o | `OPENAI_API_KEY` |
| `google` | Gemini Pro, Gemini Ultra | `GOOGLE_API_KEY` |
| `deepseek` | DeepSeek-V4, DeepSeek-Coder | `DEEPSEEK_API_KEY` |
| `ollama` | Local models | (local) |
| `moonshot` | Moonshot-V1 | `MOONSHOT_API_KEY` |
| `xai` | Grok | `XAI_API_KEY` |
| `openrouter` | Multi-provider routing | `OPENROUTER_API_KEY` |

---

## Quick Usage

### Basic Call

```typescript
import { callLlm } from '@/model/llm';

const result = await callLlm('Analyze this stock data');
console.log(result.response);
```

### With Tools

```typescript
import { callLlm } from '@/model/llm';
import { getTools } from '@/tools';

const tools = getTools();
const result = await callLlm('Calculate RSI for AAPL', {
  tools,
});

if (result.usage) {
  console.log('Tokens used:', result.usage.totalTokens);
}
```

### Streaming

```typescript
import { streamLlmWithMessages } from '@/model/llm';

const messages = [
  new HumanMessage('Hello'),
];

for await (const chunk of streamLlmWithMessages(messages)) {
  process.stdout.write(chunk.content);
}
```

---

## API Reference

### callLlm

```typescript
async function callLlm(
  prompt: string,
  options?: CallLlmOptions
): Promise<LlmResult>
```

**Options:**

```typescript
interface CallLlmOptions {
  model?: string;           // Model name (default: deepseek-v4-flash)
  systemPrompt?: string;    // Override system prompt
  tools?: StructuredToolInterface[];
  outputSchema?: z.ZodType;
  signal?: AbortSignal;
}
```

**Result:**

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

Multi-turn conversation support:

```typescript
async function callLlmWithMessages(
  messages: BaseMessage[],
  options?: CallLlmWithMessagesOptions
): Promise<LlmResult>
```

### streamLlmWithMessages

Streaming response:

```typescript
async function* streamLlmWithMessages(
  messages: BaseMessage[],
  options?: CallLlmWithMessagesOptions
): AsyncGenerator<AIMessageChunk>
```

---

## Model Selection

### Default Model

```typescript
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEFAULT_PROVIDER = 'deepseek';
```

### Fast Model

For quick responses:

```typescript
import { getFastModel } from '@/model/llm';

// Get fast variant for provider
const fastModel = getFastModel('anthropic', 'claude-3-haiku');
```

---

## Provider Resolution

### Model Name Parsing

```typescript
import { resolveProvider } from '@/providers';

// Parse provider from model name
const provider = resolveProvider('claude-3-5-sonnet');
console.log(provider.id); // 'anthropic'

// Custom API endpoints
const provider2 = resolveProvider('openrouter:anthropic/claude-3.5-sonnet');
console.log(provider2.id); // 'openrouter'
```

---

## API Key Management

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### Settings File

API keys can also be stored in `~/.upup/settings.json`:

```json
{
  "apiKey": "sk-..."
}
```

---

## Token Optimization

### Anthropic Prompt Caching

UpUp automatically uses Anthropic's cache_control for ~90% input token savings:

```typescript
// System prompt is cached automatically
const messages = [
  new SystemMessage(systemPrompt),  // Marked with cache_control
  new HumanMessage(userPrompt),
];

// Subsequent calls reuse cached prefix
```

### Usage Tracking

```typescript
const result = await callLlm('Analyze AAPL');

if (result.usage) {
  console.log(`Input: ${result.usage.inputTokens}`);
  console.log(`Output: ${result.usage.outputTokens}`);
  console.log(`Total: ${result.usage.totalTokens}`);
}
```

---

## Error Handling

```typescript
import { callLlm } from '@/model/llm';

try {
  const result = await callLlm('Analyze this');
} catch (error) {
  if (error.message.includes('rate_limit')) {
    console.log('Rate limited, retry later');
  } else if (error.message.includes('invalid_api_key')) {
    console.log('Check your API key');
  }
}
```

---

## Custom Provider

Add a new provider by extending the model factory:

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

## Related Documents

- [Architecture](architecture.md)
- [API Reference](api.md)
- [Development Guide](development.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
