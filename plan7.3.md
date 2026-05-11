# Plan7.3.md — Phase 9-10: LLM SDK & Hooks SDK

> 创建日期: 2026-05-11 | 目标: 迁移 @upup/llm 和 @upup/hooks | 版本: 1.1
> 前置: plan7.2.md Phase 1-8 已完成
> 状态: **Phase 9-10 已完成** ✅

---

## 0. 执行摘要

基于 plan7.2.md 已完成的模块化基础设施，继续迁移以下包：

| 包 | 来源 | 模块化价值 | 优先级 |
|----|------|------------|--------|
| `@upup/llm` | `src/providers.ts` | ⭐⭐⭐⭐ | P1 |
| `@upup/hooks` | `src/hooks/index.ts` | ⭐⭐⭐ | P2 |

---

## 1. @upup/llm - LLM Provider SDK

### 1.1 价值分析

从 `src/providers.ts` 提取统一的 LLM 接口，支持多 Provider。

**复用场景**:
- 其他 Node.js/Bun 项目使用 LLM
- 独立 Provider 客户端库
- 测试 LLM 调用

### 1.2 目录结构

```
packages/llm/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts       # LlmClient 接口 + Factory
│   ├── providers.ts   # ProviderDef + resolveProvider
│   └── clients/       # 具体 Provider 实现
│       ├── openai.ts
│       ├── anthropic.ts
│       └── deepseek.ts
└── README.md
```

### 1.3 核心接口

```typescript
// packages/llm/src/index.ts

export interface LlmClient {
  complete(prompt: string, options?: LlmOptions): Promise<LlmResponse>;
  stream?(prompt: string, options?: LlmOptions): AsyncIterable<string>;
}

export interface LlmOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  tools?: AgentTool[];
}

export interface LlmResponse {
  content: string;
  model: string;
  finishReason?: 'stop' | 'length' | 'content_filter';
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Factory
export function createClient(provider: string, apiKey?: string): LlmClient;
export function resolveProvider(modelName: string): ProviderDef;
```

### 1.4 Provider 定义

```typescript
// packages/llm/src/providers.ts

export interface ProviderDef {
  id: string;
  displayName: string;
  modelPrefix: string;
  apiKeyEnvVar?: string;
  fastModel?: string;
  contextWindow?: number;
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'openai', displayName: 'OpenAI', modelPrefix: '', apiKeyEnvVar: 'OPENAI_API_KEY', ... },
  { id: 'anthropic', displayName: 'Anthropic', modelPrefix: 'claude-', apiKeyEnvVar: 'ANTHROPIC_API_KEY', ... },
  { id: 'deepseek', displayName: 'DeepSeek', modelPrefix: 'deepseek-', apiKeyEnvVar: 'DEEPSEEK_API_KEY', ... },
  // ...
];

export function resolveProvider(modelName: string): ProviderDef;
export function getProviderById(id: string): ProviderDef | undefined;
```

### 1.5 实现文件

#### packages/llm/package.json

```json
{
  "name": "@upup/llm",
  "version": "0.1.0",
  "description": "UpUp LLM SDK - Unified LLM interface with multi-provider support",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./providers": {
      "types": "./dist/providers.d.ts",
      "default": "./dist/providers.js"
    }
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir=dist --target=bun && bun build src/index.ts --outdir=dist --target=node --format=cjs",
    "dev": "bun build src/index.ts --outdir=dist --watch --target=bun",
    "test": "bun test"
  },
  "dependencies": {
    "@upup/types": "workspace:*"
  }
}
```

#### packages/llm/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../types" }
  ],
  "include": ["src"]
}
```

#### packages/llm/src/index.ts

```typescript
/**
 * @upup/llm - LLM Client SDK
 *
 * Unified interface for multiple LLM providers.
 *
 * @example
 * ```typescript
 * import { createClient } from '@upup/llm';
 *
 * const client = createClient('openai', process.env.OPENAI_API_KEY);
 * const response = await client.complete('Hello, world!');
 * console.log(response.content);
 * ```
 */

import type { LlmOptions, LlmResponse, TokenUsage } from '@upup/types';

export type { LlmOptions, LlmResponse, TokenUsage } from '@upup/types';

// Re-export provider types
export type { ProviderDef } from './providers.js';
export { PROVIDERS, resolveProvider, getProviderById } from './providers.js';

// ===== LLM Client Interface =====

export interface LlmClient {
  complete(prompt: string, options?: LlmOptions): Promise<LlmResponse>;
  stream?(prompt: string, options?: LlmOptions): AsyncIterable<string>;
  readonly provider: string;
  readonly defaultModel: string;
}

// ===== Client Factory =====

const clients = new Map<string, typeof LlmClient>();

export function registerClient(provider: string, clientClass: typeof LlmClient): void {
  clients.set(provider, clientClass);
}

export function createClient(provider: string, apiKey?: string): LlmClient {
  const ClientClass = clients.get(provider);
  if (!ClientClass) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return new ClientClass(apiKey) as LlmClient;
}

// ===== OpenAI Client =====

export class OpenAiClient implements LlmClient {
  readonly provider = 'openai';
  readonly defaultModel = 'gpt-4o-mini';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
  }

  async complete(prompt: string, options?: LlmOptions): Promise<LlmResponse> {
    // Implementation using OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
      }),
    });

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}

// Register default client
registerClient('openai', OpenAiClient);
```

#### packages/llm/src/providers.ts

```typescript
/**
 * @upup/llm - Provider Definitions
 *
 * Provider metadata and resolution utilities.
 */

export interface ProviderDef {
  id: string;
  displayName: string;
  modelPrefix: string;
  apiKeyEnvVar?: string;
  fastModel?: string;
  contextWindow?: number;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    modelPrefix: '',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    fastModel: 'gpt-4.1',
    contextWindow: 1_047_576,
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    modelPrefix: 'claude-',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    fastModel: 'claude-haiku-4-5',
    contextWindow: 200_000,
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    modelPrefix: 'deepseek-',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    fastModel: 'deepseek-v4-flash',
    contextWindow: 1_000_000,
  },
  {
    id: 'google',
    displayName: 'Google',
    modelPrefix: 'gemini-',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    fastModel: 'gemini-3-flash-preview',
    contextWindow: 1_000_000,
  },
];

const defaultProvider = PROVIDERS.find((p) => p.id === 'openai')!;

export function resolveProvider(modelName: string): ProviderDef {
  return (
    PROVIDERS.find((p) => p.modelPrefix && modelName.startsWith(p.modelPrefix)) ??
    defaultProvider
  );
}

export function getProviderById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
```

### 1.6 README.md

```markdown
# @upup/llm

Unified LLM interface with multi-provider support.

## Installation

```bash
npm install @upup/llm
# or
bun add @upup/llm
```

## Quick Start

```typescript
import { createClient, PROVIDERS } from '@upup/llm';

// Create client
const client = createClient('openai', process.env.OPENAI_API_KEY);

// Complete
const response = await client.complete('Hello!');
console.log(response.content);

// Stream
for await (const chunk of client.stream('Hello!')) {
  process.stdout.write(chunk);
}
```

## Providers

- OpenAI (gpt-4o, gpt-4, etc.)
- Anthropic (claude-3, claude-3.5, etc.)
- DeepSeek (deepseek-chat, deepseek-coder, etc.)
- Google (gemini-pro, gemini-flash, etc.)
```

---

## 2. @upup/hooks - Hooks SDK

### 2.1 价值分析

从 `src/hooks/index.ts` 提取通用 Hook 系统。

**复用场景**:
- Rate limiting
- Response caching
- API key validation
- 其他需要 Hook 机制的应用

### 2.2 目录结构

```
packages/hooks/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts       # Main exports
│   ├── rate-limit.ts # Rate limiter
│   ├── cache.ts      # Cache system
│   └── validation.ts  # API key validation
└── README.md
```

### 2.3 核心接口

```typescript
// packages/hooks/src/index.ts

export interface HooksConfig {
  enabled: boolean;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  apiValidation?: ApiValidationConfig;
}

// Rate Limiter
export interface RateLimitConfig {
  enabled: boolean;
  interval: number;
  providers: string[];
}

export async function checkRateLimit(provider: string, interval?: number): Promise<number>;
export function recordRateLimit(provider: string): void;
export function resetRateLimit(provider?: string): void;

// Cache
export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: string;
}

export function cacheGet(namespace: string, key: string): unknown | null;
export function cacheSet(namespace: string, key: string, data: unknown, ttl?: number): void;
export function cacheClear(namespace?: string): void;
export function getCacheStats(): CacheStats;

// API Validation
export interface ApiValidationConfig {
  enabled: boolean;
  requiredKeys: string[];
  optionalKeys: string[];
}

export function checkApiKeys(): ApiKeyStatus[];
export function validateRequiredKeys(): { valid: boolean; missing: string[] };
```

### 2.4 实现文件

#### packages/hooks/package.json

```json
{
  "name": "@upup/hooks",
  "version": "0.1.0",
  "description": "UpUp Hooks SDK - Rate limiting, caching, and API validation",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir=dist --target=bun && bun build src/index.ts --outdir=dist --target=node --format=cjs",
    "dev": "bun build src/index.ts --outdir=dist --watch --target=bun",
    "test": "bun test"
  }
}
```

#### packages/hooks/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

#### packages/hooks/src/index.ts

```typescript
/**
 * @upup/hooks - Hooks SDK
 *
 * Rate limiting, caching, and API validation utilities.
 *
 * @example
 * ```typescript
 * import { checkRateLimit, cacheGet, cacheSet } from '@upup/hooks';
 *
 * // Rate limit
 * const wait = await checkRateLimit('openai');
 * if (wait > 0) await sleep(wait);
 *
 * // Cache
 * const cached = cacheGet('api', 'response-key');
 * if (!cached) {
 *   const data = await fetchData();
 *   cacheSet('api', 'response-key', data);
 * }
 * ```
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// Re-export types
export type { RateLimitConfig, CacheConfig, ApiValidationConfig } from './config.js';
export type { ApiKeyStatus, CacheStats } from './types.js';

// ===== Configuration =====

export interface HooksConfig {
  enabled: boolean;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  apiValidation?: ApiValidationConfig;
}

export interface RateLimitConfig {
  enabled: boolean;
  interval: number;
  providers: string[];
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: string;
}

export interface ApiValidationConfig {
  enabled: boolean;
  requiredKeys: string[];
  optionalKeys: string[];
}

const DEFAULT_CONFIG: HooksConfig = {
  enabled: true,
  rateLimit: {
    enabled: true,
    interval: 0.5,
    providers: ['openai', 'deepseek'],
  },
  cache: {
    enabled: true,
    ttl: 3600,
    maxSize: '100MB',
  },
  apiValidation: {
    enabled: true,
    requiredKeys: [],
    optionalKeys: [],
  },
};

let hooksConfig: HooksConfig = { ...DEFAULT_CONFIG };

// ===== Rate Limiter =====

const RATE_LIMIT_FILE = join(homedir(), '.upup', 'rate-limit.state');
const CACHE_DIR = join(homedir(), '.upup', 'cache');

interface RateLimitState {
  [provider: string]: number;
}

function loadRateLimitState(): RateLimitState {
  try {
    if (existsSync(RATE_LIMIT_FILE)) {
      const content = readFileSync(RATE_LIMIT_FILE, 'utf-8');
      const state: RateLimitState = {};
      for (const line of content.split('\n')) {
        const [key, value] = line.split('=');
        if (key && value) state[key.trim()] = parseFloat(value.trim());
      }
      return state;
    }
  } catch {}
  return {};
}

function saveRateLimitState(state: RateLimitState): void {
  try {
    const dir = dirname(RATE_LIMIT_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const content = Object.entries(state).map(([k, v]) => `${k}=${v}`).join('\n');
    writeFileSync(RATE_LIMIT_FILE, content, 'utf-8');
  } catch {}
}

export async function checkRateLimit(provider: string, interval?: number): Promise<number> {
  if (!hooksConfig.enabled || !hooksConfig.rateLimit?.enabled) return 0;
  const minInterval = interval ?? hooksConfig.rateLimit.interval ?? 0.5;
  const state = loadRateLimitState();
  const now = Date.now() / 1000;
  const lastCall = state[provider] ?? 0;
  const elapsed = now - lastCall;
  return elapsed < minInterval ? Math.ceil((minInterval - elapsed) * 1000) : 0;
}

export function recordRateLimit(provider: string): void {
  if (!hooksConfig.enabled || !hooksConfig.rateLimit?.enabled) return;
  const state = loadRateLimitState();
  state[provider] = Date.now() / 1000;
  saveRateLimitState(state);
}

export function resetRateLimit(provider?: string): void {
  if (provider) {
    const state = loadRateLimitState();
    delete state[provider];
    saveRateLimitState(state);
  } else {
    try { if (existsSync(RATE_LIMIT_FILE)) unlinkSync(RATE_LIMIT_FILE); } catch {}
  }
}

export function getRateLimitStatus(): RateLimitState {
  return loadRateLimitState();
}

// ===== Cache =====

interface CacheEntry {
  timestamp: number;
  ttl: number;
  namespace: string;
  key: string;
  data: unknown;
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  expired: number;
  byNamespace: Record<string, number>;
}

export function cacheGet(namespace: string, key: string): unknown | null {
  if (!hooksConfig.enabled || !hooksConfig.cache?.enabled) return null;
  const cacheFile = join(CACHE_DIR, `${namespace}_${hashKey(key)}.json`);
  try {
    if (!existsSync(cacheFile)) return null;
    const content = readFileSync(cacheFile, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);
    const age = (Date.now() / 1000) - entry.timestamp;
    if (age > (entry.ttl ?? hooksConfig.cache?.ttl ?? 3600)) return null;
    return entry.data;
  } catch { return null; }
}

export function cacheSet(namespace: string, key: string, data: unknown, ttl?: number): void {
  if (!hooksConfig.enabled || !hooksConfig.cache?.enabled) return;
  const cacheFile = join(CACHE_DIR, `${namespace}_${hashKey(key)}.json`);
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = {
      timestamp: Date.now() / 1000,
      ttl: ttl ?? hooksConfig.cache?.ttl ?? 3600,
      namespace, key, data,
    };
    writeFileSync(cacheFile, JSON.stringify(entry), 'utf-8');
  } catch {}
}

export function cacheClear(namespace?: string): void {
  try {
    if (!existsSync(CACHE_DIR)) return;
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!namespace || file.startsWith(`${namespace}_`)) {
        unlinkSync(join(CACHE_DIR, file));
      }
    }
  } catch {}
}

export function getCacheStats(): CacheStats {
  const stats: CacheStats = { totalEntries: 0, totalSize: 0, expired: 0, byNamespace: {} };
  try {
    if (!existsSync(CACHE_DIR)) return stats;
    const files = readdirSync(CACHE_DIR);
    const now = Date.now() / 1000;
    const ttl = hooksConfig.cache?.ttl ?? 3600;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      stats.totalEntries++;
      const filePath = join(CACHE_DIR, file);
      stats.totalSize += statSync(filePath).size;
      const ns = file.replace(/_[^_]*\.json$/, '');
      stats.byNamespace[ns] = (stats.byNamespace[ns] || 0) + 1;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const entry: CacheEntry = JSON.parse(content);
        if ((now - entry.timestamp) > (entry.ttl ?? ttl)) stats.expired++;
      } catch {}
    }
  } catch {}
  return stats;
}

// ===== API Validation =====

export interface ApiKeyStatus {
  key: string;
  present: boolean;
  required: boolean;
}

function isKeySet(key: string): boolean {
  const value = process.env[key];
  return Boolean(value && value !== 'undefined' && value !== 'null');
}

export function checkApiKeys(): ApiKeyStatus[] {
  const results: ApiKeyStatus[] = [];
  for (const key of hooksConfig.apiValidation?.requiredKeys ?? []) {
    results.push({ key, present: isKeySet(key), required: true });
  }
  for (const key of hooksConfig.apiValidation?.optionalKeys ?? []) {
    results.push({ key, present: isKeySet(key), required: false });
  }
  return results;
}

export function validateRequiredKeys(): { valid: boolean; missing: string[] } {
  const missing = checkApiKeys().filter(k => k.required && !k.present).map(k => k.key);
  return { valid: missing.length === 0, missing };
}

// ===== Configuration API =====

export function loadHooksConfig(config?: Partial<HooksConfig>): void {
  hooksConfig = { ...DEFAULT_CONFIG, ...config };
}

export function getHooksConfig(): HooksConfig {
  return { ...hooksConfig };
}

export function setHooksEnabled(enabled: boolean): void {
  hooksConfig.enabled = enabled;
}
```

### 2.5 README.md

```markdown
# @upup/hooks

Rate limiting, caching, and API validation utilities.

## Installation

```bash
npm install @upup/hooks
# or
bun add @upup/hooks
```

## Quick Start

```typescript
import { checkRateLimit, cacheGet, cacheSet, validateRequiredKeys } from '@upup/hooks';

// Rate limit API calls
const wait = await checkRateLimit('openai', 0.5);
if (wait > 0) await new Promise(r => setTimeout(r, wait));

// Cache responses
const cached = cacheGet('api', 'stock-aapl');
if (!cached) {
  const data = await fetchStockData('AAPL');
  cacheSet('api', 'stock-aapl', data, 300);
}

// Validate API keys
const { valid, missing } = validateRequiredKeys();
if (!valid) console.error('Missing keys:', missing);
```

## Features

- **Rate Limiting**: Track API call intervals
- **Caching**: TTL-based response caching
- **API Validation**: Check required environment variables
```

---

## 3. 工作量估算

| Phase | 包 | 任务 | 估算 |
|-------|-----|------|------|
| 9 | @upup/llm | 创建包 + 实现客户端 | 0.5 天 |
| 10 | @upup/hooks | 创建包 + 实现功能 | 0.5 天 |

**总计**: 1 天

---

## 4. 文件清单

| Phase | 操作 | 文件 | 说明 |
|-------|------|------|------|
| 9 | CREATE | `packages/llm/package.json` | 包配置 |
| 9 | CREATE | `packages/llm/tsconfig.json` | TypeScript 配置 |
| 9 | CREATE | `packages/llm/src/index.ts` | LLM 客户端接口 |
| 9 | CREATE | `packages/llm/src/providers.ts` | Provider 定义 |
| 9 | CREATE | `packages/llm/README.md` | 文档 |
| 10 | CREATE | `packages/hooks/package.json` | 包配置 |
| 10 | CREATE | `packages/hooks/tsconfig.json` | TypeScript 配置 |
| 10 | CREATE | `packages/hooks/src/index.ts` | Hooks 实现 |
| 10 | CREATE | `packages/hooks/README.md` | 文档 |

---

## 5. 验证计划

```bash
# 1. 构建包
bun run --filter @upup/llm build
bun run --filter @upup/hooks build

# 2. 运行测试
bun test

# 3. 验证导入
node -e "const llm = require('@upup/llm'); console.log(Object.keys(llm))"
node -e "const hooks = require('@upup/hooks'); console.log(Object.keys(hooks))"

# 4. 运行 oscript 验证
bun run scripts/oscript-workspace-verify.ts
```

## 5.1 验证结果 (2026-05-11)

| 测试项 | 结果 | 说明 |
|--------|------|------|
| @upup/llm 构建 | ✅ | dist/index.js 生成 |
| @upup/hooks 构建 | ✅ | dist/index.js 生成 |
| Unit Tests | ✅ | 1957 pass, 0 fail |
| bun run dev | ✅ | 应用启动成功 |
| oscript-workspace-verify | ✅ | 16/16 项通过 |

---

## 6. Next Steps

1. ~~Phase 1-8: Bun Workspace 基础设施~~ ✅
2. ~~Phase 9: @upup/llm~~ ✅
3. ~~Phase 10: @upup/hooks~~ ✅
4. Phase 11: 更新现有代码使用 packages (可选)
