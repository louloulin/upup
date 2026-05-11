# @upup/llm

Unified LLM interface with multi-provider support.

## Installation

```bash
npm install @upup/llm
# or
bun add @upup/llm
```

## Features

- **Multi-Provider**: OpenAI, Anthropic, DeepSeek, Google, and more
- **Provider Resolution**: Auto-detect provider from model name
- **TypeScript**: Full type definitions
- **Zero Dependencies**: No external runtime dependencies

## Quick Start

```typescript
import { PROVIDERS, resolveProvider, getProviderById } from '@upup/llm';

// Resolve provider from model name
const provider = resolveProvider('claude-3-opus');
console.log(provider.displayName); // "Anthropic"

// Look up by ID
const openai = getProviderById('openai');
console.log(openai.fastModel); // "gpt-4.1"

// Register custom client
import { registerClient, createClient, type LlmClient } from '@upup/llm';

class MyClient implements LlmClient {
  readonly provider = 'my';
  readonly defaultModel = 'my-model';

  async complete(prompt: string) {
    // Your implementation
    return { content: 'response', model: this.defaultModel };
  }
}

registerClient('my', MyClient);
const client = createClient('my', 'api-key');
```

## Providers

| Provider | Prefix | API Key Env |
|----------|--------|-------------|
| OpenAI | (default) | OPENAI_API_KEY |
| Anthropic | claude- | ANTHROPIC_API_KEY |
| DeepSeek | deepseek- | DEEPSEEK_API_KEY |
| Google | gemini- | GOOGLE_API_KEY |
| xAI | grok- | XAI_API_KEY |
| Moonshot | kimi- | MOONSHOT_API_KEY |
| OpenRouter | openrouter: | OPENROUTER_API_KEY |
| Ollama | ollama: | (local) |

## API Reference

### PROVIDERS

Array of all supported provider definitions.

### resolveProvider(modelName: string): ProviderDef

Resolve the provider for a given model name.

```typescript
const provider = resolveProvider('gpt-4o');
// { id: 'openai', displayName: 'OpenAI', ... }
```

### getProviderById(id: string): ProviderDef | undefined

Look up a provider by its ID.

### createClient(provider: string, apiKey?: string): LlmClient

Create a client instance for a provider.

## License

MIT
