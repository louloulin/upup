# Plan7.2.md — Bun Workspace + Plugin SDK 模块化

> 创建日期: 2026-05-11 | 目标: Bun Workspace + 外部 Plugin SDK | 对标: Bun Workspaces 2025-2026 最佳实践
> 版本: 2.0 | 状态: **Phase 1-3 已完成** ✅

---

## 0. 执行摘要

基于 [Bun Workspace 最佳实践](#参考文档) 分析，制定最小改造方案，实现模块化 Plugin SDK 支持。

| 改造项 | 当前状态 | 目标状态 | 状态 |
|--------|----------|----------|------|
| Bun Workspace | 单包 | ✅ 多包 | ✅ 已完成 |
| @upup/types | ✅ 已创建 | packages/独立 | ✅ 已完成 |
| @upup/plugin-sdk | ✅ 已创建 | packages/独立 | ✅ 已完成 |
| 外部插件支持 | 紧耦合 | 依赖注入 | ⏳ 进行中 |

---

## 1. Bun Workspace 分析

### 1.1 Bun Workspace 核心配置

Bun workspace 使用与 npm workspaces 相同的格式，在 `package.json` 中定义：

```json
// 根目录 package.json
{
  "name": "upup",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun run dev --filter upup",
    "build": "bun run build --filter upup",
    "build:sdk": "bun run build --filter @upup/plugin-sdk",
    "test": "bun test",
    "test:sdk": "bun test packages/plugin-sdk"
  }
}
```

### 1.2 内部依赖协议

包之间使用 `workspace:*` 协议引用：

```json
// packages/plugin-sdk/package.json
{
  "name": "@upup/plugin-sdk",
  "dependencies": {
    "@upup/core": "workspace:*"
  }
}
```

发布时 `workspace:*` 自动替换为实际版本号。

### 1.3 Linker 策略

Bun 1.3.2+ 默认使用 `isolated` linker：

```toml
# bunfig.toml
[install]
linker = "isolated"
```

| 模式 | 特点 |
|------|------|
| **isolated** | 每个 workspace 独立 node_modules，禁止幽灵依赖 |
| **hoisted** | 依赖提升到根目录，与 npm/yarn 兼容 |

### 1.4 bun.lockb

Bun 使用 `bun.lockb`（二进制锁文件），提交到 git 保证确定性安装。

---

## 2. 目标架构

### 2.1 目录结构

```
upup/
├── package.json           # 根目录: workspaces 配置
├── bun.lockb             # 锁文件
├── bunfig.toml           # Bun 配置
├── packages/             # 独立包
│   └── plugin-sdk/      # @upup/plugin-sdk (NEW)
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts    # PluginAPI 主接口
│       │   ├── types.ts    # 外部类型定义
│       │   └── manifest.ts # upup.plugin.json Schema
│       └── README.md
├── src/                  # 主应用 (保持不变)
│   ├── plugins/
│   │   ├── index.ts    # 内部实现
│   │   └── sdk/        # 从 packages/plugin-sdk 导入
│   ├── agent/
│   ├── tools/
│   └── ...
└── dist/                # 编译输出
    ├── upup/           # CLI 输出
    └── plugin-sdk/    # SDK 输出
```

### 2.2 包职责

| 包 | 职责 | 导出 |
|----|------|------|
| `@upup/plugin-sdk` | Plugin SDK 公共接口 | PluginAPI, types, manifest |
| `upup` (src/) | 主应用 | CLI, Agent, Tools |

---

## 3. 最小改造计划

### Phase 1: Bun Workspace 初始化 (0.5 天)

**目标**: 添加 workspace 配置，最小侵入

#### 3.1.1 创建 bunfig.toml

```toml
# bunfig.toml
[install]
linker = "isolated"

[install.scopes]
# 可选: 定义依赖版本范围
```

#### 3.1.2 更新根 package.json

```json
{
  "name": "upup",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun run dev --filter upup",
    "build": "bun run build --filter upup",
    "build:sdk": "bun run build --filter @upup/plugin-sdk",
    "build:all": "bun run build --filter '*'",
    "test": "bun test",
    "test:sdk": "bun test packages/plugin-sdk"
  }
}
```

#### 3.1.3 更新根 tsconfig.json

```json
{
  "files": [],
  "references": [
    { "path": "./packages/plugin-sdk" },
    { "path": "./src" }
  ]
}
```

### Phase 2: 创建 Plugin SDK 包 (1 天)

**目标**: 提取公共接口到独立包

#### 3.2.1 创建 packages/plugin-sdk/

```bash
mkdir -p packages/plugin-sdk/src
```

#### 3.2.2 packages/plugin-sdk/package.json

```json
{
  "name": "@upup/plugin-sdk",
  "version": "0.1.0",
  "description": "UpUp Plugin SDK for external plugin development",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types.d.ts",
      "default": "./dist/types.js"
    },
    "./manifest": {
      "types": "./dist/manifest.d.ts",
      "default": "./dist/manifest.js"
    }
  },
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "dev": "tsc --project tsconfig.json --watch",
    "test": "bun test"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

#### 3.2.3 packages/plugin-sdk/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

#### 3.2.4 packages/plugin-sdk/src/index.ts

```typescript
/**
 * UpUp Plugin SDK - Public API
 *
 * This is the public interface for external plugin development.
 * Import this package to create plugins for UpUp.
 *
 * @example
 * ```typescript
 * import type { PluginAPI } from '@upup/plugin-sdk';
 *
 * export default function myPlugin(api: PluginAPI) {
 *   api.registerTool({
 *     name: 'my_tool',
 *     description: 'My custom tool',
 *     inputSchema: { type: 'object', properties: {} },
 *     handler: async (args) => ({ result: 'done' })
 *   });
 * }
 * ```
 */

// ===== Plugin API =====

export interface PluginAPI {
  /** Plugin identifier */
  id: string;

  /** Plugin metadata */
  meta: PluginMeta;

  /** Logger instance */
  logger: PluginLogger;

  /** Register a tool */
  registerTool(tool: ExternalTool): void;

  /** Register hooks */
  registerHook(events: string | string[], handler: HookHandler): void;

  /** Register MCP channel */
  registerChannel(config: ChannelConfig): void;

  /** Register CLI commands */
  registerCli(commands: CliCommand[]): void;

  /** Register LLM provider */
  registerProvider(config: ProviderConfig): void;

  /** Listen to lifecycle events */
  on<K extends PluginLifecycleEvent>(event: K, handler: PluginLifecycleHandler[K]): void;

  /** Mark plugin as ready */
  ready(): void;
}

// ===== Metadata =====

export interface PluginMeta {
  name: string;
  version?: string;
  description?: string;
}

// ===== Logger =====

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
  debug?(message: string): void;
}

// ===== Tool =====

export interface ExternalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// ===== Hook =====

export type HookHandler = (
  context: HookContext
) => Promise<HookResult | void>;

export interface HookContext {
  event: string;
  data: Record<string, unknown>;
  pluginId: string;
}

export interface HookResult {
  modified?: boolean;
  blocked?: boolean;
  data?: Record<string, unknown>;
}

// ===== Channel =====

export interface ChannelConfig {
  id: string;
  type: 'stdio' | 'http' | 'websocket';
  config?: Record<string, unknown>;
}

// ===== CLI =====

export interface CliCommand {
  name: string;
  description?: string;
  handler: (args: string[]) => Promise<void>;
}

// ===== Provider =====

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'deepseek' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  options?: Record<string, unknown>;
}

// ===== Lifecycle =====

export type PluginLifecycleEvent =
  | 'install'
  | 'activate'
  | 'deactivate'
  | 'update';

export type PluginLifecycleHandler = {
  install: () => Promise<void>;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  update: (oldVersion: string) => Promise<void>;
};
```

#### 3.2.5 packages/plugin-sdk/src/types.ts

```typescript
/**
 * UpUp Plugin SDK - Additional Types
 */

// Re-export common types
export type {
  PluginAPI,
  ExternalTool,
  HookHandler,
  HookContext,
  HookResult,
  ChannelConfig,
  CliCommand,
  ProviderConfig,
} from './index.js';

// Plugin manifest
export type PluginManifest = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  main: string;
  configSchema?: Record<string, ConfigSchemaField>;
  capabilities?: string[];
  channels?: string[];
  hooks?: string[];
  tools?: string[];
};

export interface ConfigSchemaField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: unknown[];
}

// Tool result
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Provider types
export interface LlmResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

#### 3.2.6 packages/plugin-sdk/src/manifest.ts

```typescript
/**
 * UpUp Plugin SDK - Manifest Schema
 */

import type { PluginManifest, ConfigSchemaField } from './types.js';

/**
 * JSON Schema for upup.plugin.json
 */
export const PLUGIN_MANIFEST_SCHEMA: Record<string, unknown> = {
  $schema: 'https://upup.dev/plugins/schema/v1',
  type: 'object',
  required: ['id', 'name', 'main'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9-]+$' },
    name: { type: 'string' },
    version: { type: 'string' },
    description: { type: 'string' },
    main: { type: 'string' },
    runtime: { type: 'string', enum: ['node', 'bun', 'deno'] },
    configSchema: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['string', 'number', 'boolean', 'object', 'array'],
          },
          required: { type: 'boolean' },
          default: {},
          description: { type: 'string' },
          enum: { type: 'array' },
        },
      },
    },
    capabilities: { type: 'array', items: { type: 'string' } },
    channels: { type: 'array', items: { type: 'string' } },
    hooks: { type: 'array', items: { type: 'string' } },
    tools: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Validate plugin manifest
 */
export function validateManifest(manifest: unknown): {
  valid: boolean;
  errors?: string[];
} {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Record<string, unknown>;
  const errors: string[] = [];

  if (!m.id || typeof m.id !== 'string') {
    errors.push('id is required and must be a string');
  }

  if (!m.name || typeof m.name !== 'string') {
    errors.push('name is required and must be a string');
  }

  if (!m.main || typeof m.main !== 'string') {
    errors.push('main is required and must be a string');
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Load manifest from plugin directory
 */
export async function loadManifest(
  pluginDir: string
): Promise<PluginManifest | null> {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const manifestPath = path.join(pluginDir, 'upup.plugin.json');

  try {
    const content = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as PluginManifest;

    const validation = validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors?.join(', ')}`);
    }

    return manifest;
  } catch {
    return null;
  }
}
```

#### 3.2.7 packages/plugin-sdk/README.md

```markdown
# @upup/plugin-sdk

UpUp Plugin SDK for external plugin development.

## Installation

```bash
npm install @upup/plugin-sdk
# or
bun add @upup/plugin-sdk
```

## Quick Start

```typescript
import type { PluginAPI } from '@upup/plugin-sdk';

export default function myPlugin(api: PluginAPI) {
  // Register a tool
  api.registerTool({
    name: 'stock_analyzer',
    description: 'Analyze stock data',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' }
      }
    },
    handler: async (args) => {
      return { result: `Analyzed ${args.ticker}` };
    }
  });

  // Listen to LLM output
  api.on('llm_output', async (context) => {
    api.logger.info('LLM response received');
  });
}
```

## API Reference

See [API.md](API.md) for full documentation.
```

### Phase 3: 更新现有代码 (0.5 天)

**目标**: 让现有代码使用新 SDK 包

#### 3.3.1 更新 src/plugins/sdk/index.ts

```typescript
// src/plugins/sdk/index.ts
// 从 packages/plugin-sdk 重新导出
export * from '@upup/plugin-sdk';
```

#### 3.3.2 更新 src/plugins/types.ts

```typescript
// 内部类型仍然使用自己的，但扩展公共接口
import type { PluginAPI as ExternalPluginAPI } from '@upup/plugin-sdk';

// 扩展为内部版本
export interface PluginAPI extends ExternalPluginAPI {
  // 内部额外方法
  registerService(service: PluginService): void;
  getConfig(): Record<string, unknown>;
}
```

### Phase 4: 构建和测试 (0.5 天)

**目标**: 验证改造正常工作

```bash
# 构建所有
bun run build:all

# 运行测试
bun test
bun test:sdk

# 验证 SDK 导出
node -e "const sdk = require('@upup/plugin-sdk'); console.log(Object.keys(sdk))"
```

---

## 4. 文件清单

### 核心文件

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `bunfig.toml` | Bun 配置 |
| MODIFY | `package.json` | 添加 workspaces |
| CREATE | `tsconfig.base.json` | 共享 TypeScript 配置 |

### @upup/plugin-sdk (P1)

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `packages/plugin-sdk/` | SDK 包目录 |
| CREATE | `packages/plugin-sdk/package.json` | 包配置 |
| CREATE | `packages/plugin-sdk/tsconfig.json` | TypeScript 配置 |
| CREATE | `packages/plugin-sdk/src/index.ts` | 主接口 |
| CREATE | `packages/plugin-sdk/src/types.ts` | 类型定义 |
| CREATE | `packages/plugin-sdk/src/manifest.ts` | Manifest Schema |
| CREATE | `packages/plugin-sdk/README.md` | 文档 |
| MODIFY | `src/plugins/sdk/index.ts` | 重新导出 |
| MODIFY | `src/plugins/types.ts` | 使用 SDK 类型 |

### @upup/types (P2)

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `packages/types/` | Types 包目录 |
| CREATE | `packages/types/package.json` | 包配置 |
| CREATE | `packages/types/src/index.ts` | 共享类型 |

### @upup/memory (P2)

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `packages/memory/` | Memory 包目录 |
| CREATE | `packages/memory/package.json` | 包配置 |
| CREATE | `packages/memory/src/index.ts` | MemoryStore 类 |
| CREATE | `packages/memory/src/types.ts` | 类型定义 |
| CREATE | `packages/memory/README.md` | 文档 |

---

## 5. 外部插件开发流程

### 5.1 创建外部插件

```bash
# 创建插件目录
mkdir my-upup-plugin
cd my-upup-plugin

# 初始化 npm 包
npm init
npm install @upup/plugin-sdk

# 创建 manifest
cat > upup.plugin.json << 'EOF'
{
  "id": "my-plugin",
  "name": "My Plugin",
  "main": "dist/index.js",
  "configSchema": {
    "apiKey": { "type": "string", "required": true }
  }
}
EOF

# 创建插件代码
mkdir -p src
cat > src/index.ts << 'EOF'
import type { PluginAPI } from '@upup/plugin-sdk';

export default function myPlugin(api: PluginAPI) {
  api.registerTool({
    name: 'my_tool',
    description: 'My custom tool',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => ({ result: 'done' })
  });
}
EOF
EOF
```

### 5.2 编译和安装

```bash
# 编译
bun build src/index.ts --outdir dist --target node

# 安装到 UpUp
cp -r . ~/.upup/plugins/my-plugin/

# 或者通过 CLI 安装
upup plugin install ./my-upup-plugin
```

### 5.3 插件使用

```typescript
// upup.plugin.json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "configSchema": {
    "apiKey": {
      "type": "string",
      "required": true,
      "description": "Your API key"
    }
  },
  "capabilities": ["tool"],
  "tools": ["my_tool"]
}
```

---

## 6. 工作量估算

### 最小实现 (P1 + P2 包)

| Phase | 任务 | 估算 | 优先级 |
|-------|------|------|--------|
| 1 | Bun Workspace 初始化 | 0.5 天 | P1 |
| 2 | 创建 @upup/types | 0.5 天 | P1 |
| 3 | 创建 @upup/plugin-sdk | 1 天 | P1 |
| 4 | 更新现有代码 | 0.5 天 | P2 |
| 5 | 创建 @upup/memory | 1 天 | P2 |
| 6 | 构建和测试 | 0.5 天 | P2 |

**总计**: 4 天 (完整模块化)

### 可选扩展 (P3 包)

| 包 | 估算 | 优先级 |
|-----|------|--------|
| `@upup/llm` | 0.5 天 | P3 |
| `@upup/hooks` | 0.5 天 | P3 |

---

## 7. 验证计划

```bash
# 1. 构建测试
bun run --filter @upup/types build  # ✅ 通过
bun run --filter @upup/plugin-sdk build  # ✅ 通过

# 2. 集成测试
bun test  # ✅ 1957 pass

# 3. 手动验证
bun run dev
```

## 7.1 验证结果 (2026-05-11)

| 测试项 | 结果 | 说明 |
|--------|------|------|
| Bun Workspace 配置 | ✅ | package.json workspaces 配置正确 |
| @upup/types 构建 | ✅ | packages/types/dist/ 生成正确 |
| @upup/plugin-sdk 构建 | ✅ | packages/plugin-sdk/dist/ 生成正确 |
| bun install | ✅ | 1592 packages installed |
| Unit Tests | ✅ | 1957 pass, 0 fail |
| Typecheck | ⚠️ | 有预存的类型错误 (非本次改动) |

---

## 8. 参考文档

- [Bun Workspaces 文档](https://bun.sh/docs/install/workspaces)
- [npm vs pnpm vs Bun Workspaces](https://stevekinney.com/courses/enterprise-ui/workspace-package-managers)
- [Bun Monorepo Support - DeepWiki](https://deepwiki.com/oven-sh/bun/4.4-workspace-and-monorepo-support)

---

## 9. 其他可模块化的功能模块

### 9.1 模块化分析

基于代码库全面分析，以下模块具有模块化价值：

| 模块 | 包名 | 优先级 | 模块化价值 | 原因 |
|------|------|--------|------------|------|
| `src/plugins/` | `@upup/plugin-sdk` | P1 | ⭐⭐⭐⭐⭐ | 外部插件开发核心 |
| `src/memory/` | `@upup/memory` | P2 | ⭐⭐⭐⭐ | Memvid 存储可复用 |
| `src/types.ts` | `@upup/types` | P2 | ⭐⭐⭐ | 共享类型定义 |
| `src/providers.ts` | `@upup/llm` | P3 | ⭐⭐⭐ | LLM 接口可复用 |
| `src/hooks/` | `@upup/hooks` | P3 | ⭐⭐ | Hook 系统通用 |
| `src/tools/` | `@upup/tools` | P3 | ⭐⭐ | 工具注册系统 |
| `src/agent/` | - | P4 | ⭐ | 紧耦合 UpUp 特定 |
| `src/skills/` | - | P4 | ⭐ | 特定用例 |
| `src/commands/` | - | P4 | ⭐ | CLI 特定 |

### 9.2 @upup/memory (P2) - Memory SDK

**价值**: Memvid MV2 存储 + BM25 搜索，可被其他应用复用

```typescript
// packages/memory/src/index.ts
export class MemoryStore {
  constructor(options?: MemoryOptions);
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  async semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  async ask(question: string, options?: AskOptions): Promise<string>;
  async put(content: string, metadata?: MemoryMetadata): Promise<string>;
  async timeline(limit?: number): Promise<TimelineEntry[]>;
  async close(): Promise<void>;
}

export interface MemoryOptions {
  path?: string;
  maxSize?: number;
}

export interface SearchOptions {
  maxResults?: number;
  minScore?: number;
  type?: 'keyword' | 'semantic' | 'hybrid';
}
```

**目录结构**:
```
packages/memory/
├── package.json
├── src/
│   ├── index.ts        # MemoryStore 类
│   ├── types.ts       # 类型定义
│   ├── memvid.ts      # Memvid 封装
│   └── search.ts      # 搜索实现
└── README.md
```

### 9.3 @upup/types (P2) - Shared Types

**价值**: 提取共享 TypeScript 类型，其他包可复用

```typescript
// packages/types/src/index.ts
// 从 src/types.ts 提取核心类型

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface HookConfig {
  events: string[];
  handler: string;
  enabled?: boolean;
}

export interface ProviderConfig {
  id: string;
  type: 'openai' | 'anthropic' | 'deepseek';
  apiKey?: string;
  baseUrl?: string;
}

export interface SessionConfig {
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
}
```

### 9.4 @upup/llm (P3) - LLM Provider SDK

**价值**: 统一的 LLM 接口，支持多 Provider

```typescript
// packages/llm/src/index.ts
export interface LlmClient {
  complete(prompt: string, options?: LlmOptions): Promise<LlmResponse>;
  stream(prompt: string, options?: LlmOptions): AsyncIterable<string>;
}

export interface LlmOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'content_filter';
}

export class OpenAiClient implements LlmClient { ... }
export class AnthropicClient implements LlmClient { ... }
export class DeepseekClient implements LlmClient { ... }
```

### 9.5 完整 packages 架构

```
packages/
├── plugin-sdk/      # @upup/plugin-sdk (P1)
├── memory/         # @upup/memory (P2)
├── types/         # @upup/types (P2)
└── llm/          # @upup/llm (P3)
```

### 9.6 分阶段实施

```json
// 根目录 package.json
{
  "workspaces": [
    "packages/types",
    "packages/plugin-sdk",
    "packages/memory",
    "packages/llm"
  ]
}
```

| Phase | 包 | 时间 | 依赖 |
|-------|-----|------|------|
| 1 | `@upup/types` | 0.5 天 | 无 |
| 2 | `@upup/plugin-sdk` | 1 天 | types |
| 3 | `@upup/memory` | 1 天 | types |
| 4 | `@upup/llm` | 0.5 天 | types |

**总计**: 3 天 (全部模块)

---

**Next Steps**:
1. ~~Phase 1: Bun Workspace 初始化~~ ✅
2. ~~Phase 2: 创建 @upup/types~~ ✅
3. ~~Phase 3: 创建 @upup/plugin-sdk~~ ✅
4. Phase 4: 更新现有代码使用 packages (可选)
5. Phase 5: 创建 @upup/memory (可选)
6. Phase 6: 创建 @upup/llm (可选)
