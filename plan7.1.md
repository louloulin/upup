# Plan7.1.md — UpUp 模块化重构 + 插件系统完善

> 创建日期: 2026-05-11 | 目标: 模块化重构 + 插件系统完善 | 对标: Claude Code + OpenClaw Plugin System
> 版本: 2.0 | 状态: **规划中**

---

## 0. 执行摘要

基于对 UpUp 代码库的全面分析 (466 TypeScript 文件, 105 测试文件) 及 OpenClaw 插件系统对标学习, 发现以下问题:

| 问题领域 | 当前状态 | 目标状态 | 优先级 |
|----------|----------|----------|--------|
| 工具系统 | 33 个工具散落 | 统一插件注册 | P1 |
| 插件系统 | 有框架无完善 | MCP 插件 + OpenClaw 风格 | P1 |
| Agent 系统 | 紧耦合 | 模块化解耦 | P2 |
| 记忆系统 | 32 文件复杂 | 简化接口 | P2 |

---

## 1. 代码库全面分析

### 1.1 目录结构概览

```
src/
├── agent/          # 33 文件 - Agent 核心 (紧耦合)
├── tools/          # 33 目录 - 工具系统 (散落)
├── memory/         # 32 文件 - 记忆系统 (复杂)
├── skills/         # 投资技能 (Markdown-based)
├── hooks/          # Hook 系统 (完善)
├── plugins/        # 插件系统 (有框架)
├── mcp/           # MCP 协议
├── daemon/        # 后台任务
├── cron/          # 定时调度
├── subagent/      # 子 Agent
├── proactive/     # 主动模式
├── commands/      # CLI 命令
├── components/    # TUI 组件
├── controllers/   # 控制器
├── evals/         # 评估测试
├── gateway/       # 网关
├── keybindings/  # 按键绑定
├── permissions/   # 权限系统
├── plan/          # Plan 模式
├── providers/    # LLM Provider
├── state/         # 状态管理
├── types/         # 类型定义
├── utils/         # 工具函数
├── model/         # LLM 模型
└── index.tsx      # 入口
```

### 1.2 核心模块分析

#### Agent 系统 (src/agent/)

| 文件 | 功能 | 耦合度 |
|------|------|--------|
| `agent.ts` | 主 Agent 循环 | 高 |
| `tool-executor.ts` | 工具执行器 | 高 |
| `registry.ts` | Agent 注册表 | 中 |
| `capability-registry.ts` | 能力注册 | 中 |
| `investment-config.ts` | 投资配置 | 低 |
| `investment-knowledge*.ts` | 投资知识 | 低 |
| `scratchpad.ts` | 暂存区 | 中 |
| `compaction/` | 压缩相关 | 中 |

**问题**: Agent 核心过于庞大, 工具执行和 hooks 紧耦合

#### 工具系统 (src/tools/)

| 类别 | 工具数 | 说明 |
|------|--------|------|
| `filesystem/` | 8 | 文件操作 |
| `bash/` | 1 | Bash 命令 |
| `portfolio/` | 1 | 持仓管理 |
| `notify/` | 1 | 通知 |
| `quant/` | 20 | 量化工具 |
| `finance/` | 1 | 金融 |
| `memory/` | 1 | 记忆 |
| `skill/` | 2 | 技能 |
| 其他 | 12 | 各种工具 |

**问题**: 工具注册分散, 缺乏统一插件接口

#### 记忆系统 (src/memory/)

| 文件 | 功能 |
|------|------|
| `index.ts` | 主入口 |
| `store.ts` | 存储 |
| `memvid-store.ts` | MV2 存储 |
| `search.ts` | 搜索 (4 种) |
| `embeddings.ts` | 向量嵌入 |
| `indexer.ts` | 索引 |
| `scanner.ts` | 扫描 |
| `chunker.ts` | 分块 |
| `database.ts` | 数据库 |
| `consolidation.ts` | 合并 |
| `crypto.ts` | 加密 |

**问题**: 32 文件过于复杂, 搜索就有 4 种实现

#### 插件系统 (src/plugins/)

| 文件 | 功能 |
|------|------|
| `index.ts` | 入口 |
| `registry.ts` | 注册表 |
| `loader.ts` | 加载器 |
| `discovery.ts` | 发现 |
| `locator.ts` | 定位 |
| `manifest.ts` | 清单 |
| `services.ts` | 服务 |
| `adapters/` | 适配器 |
| `data/` | 数据 |

**问题**: 有框架但功能不完整, 缺少 MCP 插件支持

### 1.3 当前问题总结

| 问题 | 描述 | 影响 | 工作量 |
|------|------|------|--------|
| 工具注册分散 | 33 工具无统一入口 | 维护困难 | 中 |
| MCP 插件缺失 | 无 MCP 协议实现 | 功能受限 | 高 |
| Agent 紧耦合 | 工具执行/hooks 耦合 | 难以扩展 | 中 |
| 记忆系统复杂 | 32 文件, 4 种搜索 | 性能问题 | 高 |
| 配置不一致 | 多种配置方式 | 用户困惑 | 低 |

---

## 1.5 OpenClaw 插件系统对标分析

### OpenClaw 插件 API (src/plugins/types.ts)

**OpenClawPluginApi** 提供了 11 种注册方法:

```typescript
export type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;

  // 工具注册
  registerTool: (tool: AnyAgentTool | OpenClawPluginToolFactory, opts?: ...) => void;

  // Hook 注册
  registerHook: (events: string | string[], handler: InternalHookHandler, opts?: ...) => void;

  // HTTP 路由
  registerHttpRoute: (params: OpenClawPluginHttpRouteParams) => void;

  // 通道注册 (MCP 风格)
  registerChannel: (registration: OpenClawPluginChannelRegistration | ChannelPlugin) => void;

  // 网关方法
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;

  // CLI 命令
  registerCli: (registrar: OpenClawPluginCliRegistrar, opts?: { commands?: string[] }) => void;

  // 服务注册
  registerService: (service: OpenClawPluginService) => void;

  // Provider 注册 (LLM)
  registerProvider: (provider: ProviderPlugin) => void;

  // 自定义命令 (绕过 LLM)
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;

  // 路径解析
  resolvePath: (input: string) => string;

  // 生命周期 Hook
  on: <K extends PluginHookName>(hookName: K, handler: PluginHookHandlerMap[K], opts?: { priority?: number }) => void;
};
```

### OpenClaw 插件清单 (src/plugins/manifest.ts)

```typescript
export type PluginManifest = {
  id: string;
  configSchema: Record<string, unknown>;  // 必需
  kind?: PluginKind;
  channels?: string[];     // MCP 通道
  providers?: string[];    // LLM Provider
  skills?: string[];       // 技能
  name?: string;
  description?: string;
  version?: string;
  uiHints?: Record<string, PluginConfigUiHint>;  // UI 提示
};
```

### UpUp vs OpenClaw 插件功能对比

| 功能 | OpenClaw | UpUp 当前 | 差距 |
|------|----------|----------|------|
| registerTool | ✅ 完整 | ✅ 已有 | 持平 |
| registerHook | ✅ 24+ hooks | ✅ 8 hooks | **差距大** |
| registerHttpRoute | ✅ | ❌ | ❌ |
| registerChannel | ✅ MCP | ❌ | ❌ |
| registerGatewayMethod | ✅ | ❌ | ❌ |
| registerCli | ✅ | ❌ | ❌ |
| registerService | ✅ | ❌ | ❌ |
| registerProvider | ✅ | ❌ | ❌ |
| registerCommand | ✅ | ❌ | ❌ |
| 生命周期 on() | ✅ | ❌ | ❌ |
| 插件清单 configSchema | ✅ | 部分 | 待完善 |

### OpenClaw Hook 类型 (24+)

| 分类 | Hook 名称 |
|------|-----------|
| 模型 | before_model_resolve, llm_input, llm_output, after_model_resolve |
| Prompt | before_prompt_build, after_prompt_build, before_prompt_render |
| 工具 | before_tool_call, after_tool_call, tool_result |
| 命令 | before_command_resolve, after_command_resolve |
| 状态 | agent_state_changed, session_state_changed |
| 消息 | before_message_render, after_message_render |
| 会话 | session_created, session_ended, before_session_start |
| 其他 | exit, error, heartbeat, idle_detected |

**关键差距**: UpUp 当前只有 8 个 hook 类型, OpenClaw 有 24+ 个。

### OpenClaw 插件清单文件

```json
// openclaw.plugin.json
{
  "id": "my-plugin",
  "configSchema": {
    "apiKey": { "type": "string", "required": true }
  },
  "name": "My Plugin",
  "description": "Description",
  "version": "1.0.0",
  "channels": ["stock-data"],
  "providers": ["openai"],
  "skills": ["my-skill"]
}
```

### OpenClaw 插件生命周期

```
1. discover()      # 发现插件
2. load()          # 加载插件代码
3. manifest.load() # 解析 manifest
4. register()      # 注册 API (tool, hook, command)
5. activate()      # 激活插件
6. on(event)       # 监听生命周期事件
7. deactivate()   # 停用插件
```

### OpenClaw 可外部化的部分

基于 OpenClaw 架构, 以下可以外部化给第三方开发:

1. **工具注册** - 已有基础
2. **Hook 注册** - 需要扩展 hook 类型
3. **CLI 命令** - 新增
4. **HTTP 路由** - 新增
5. **插件清单** - 完善 configSchema
6. **Provider 注册** - 新增
7. **服务注册** - 新增

---

## 2. 重构计划 (基于 OpenClaw 对标)

### Phase 1: OpenClaw 风格插件 API (P1)

**目标**: 实现 OpenClaw 风格的完整插件 API

#### 2.1.1 新增插件 API

```typescript
// src/plugins/api.ts - OpenClaw 风格插件 API
export type UpUpPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: UpUpConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;

  // 工具注册 (已有, 保持)
  registerTool: (tool: AgentTool, opts?: ToolOptions) => void;

  // Hook 注册 (扩展)
  registerHook: (events: string | string[], handler: HookHandler) => void;

  // MCP 通道注册 (新增)
  registerChannel: (channel: ChannelDefinition) => void;

  // HTTP 路由 (新增)
  registerHttpRoute: (route: HttpRouteDefinition) => void;

  // CLI 命令 (新增)
  registerCli: (commands: CliCommandDefinition[]) => void;

  // Provider 注册 (新增)
  registerProvider: (provider: LlmProviderDefinition) => void;

  // 自定义命令 (新增)
  registerCommand: (command: CommandDefinition) => void;

  // 生命周期 Hook (新增)
  on: <K extends UpUpHookName>(hookName: K, handler: Handler) => void;
};
```

#### 2.1.2 扩展 Hook 类型

```typescript
// src/plugins/hook-types.ts
export type UpUpHookName =
  // 模型相关
  | 'before_model_resolve'
  | 'llm_input'
  | 'llm_output'
  | 'after_model_resolve'
  // Prompt 相关
  | 'before_prompt_build'
  | 'after_prompt_build'
  | 'before_prompt_render'
  // 工具相关 (已有)
  | 'pre_tool_modify'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'tool_result'
  // 命令相关 (新增)
  | 'before_command_resolve'
  | 'after_command_resolve'
  // 状态相关 (新增)
  | 'agent_state_changed'
  | 'session_state_changed'
  // 消息相关 (新增)
  | 'before_message_render'
  | 'after_message_render'
  // 会话相关 (新增)
  | 'session_created'
  | 'session_ended'
  | 'before_session_start'
  // 其他 (新增)
  | 'exit'
  | 'error'
  | 'heartbeat'
  | 'idle_detected';
```

#### 2.1.3 插件清单文件

```json
// upup.plugin.json
{
  "id": "my-upup-plugin",
  "configSchema": {
    "apiKey": {
      "type": "string",
      "required": true,
      "description": "API key for the service"
    }
  },
  "name": "My UpUp Plugin",
  "description": "Description of what this plugin does",
  "version": "1.0.0",
  "channels": ["stock-data", "market-feed"],
  "providers": ["openai", "deepseek"],
  "skills": ["my-investment-skill"],
  "hooks": ["pre_tool_use", "llm_output"]
}
```

#### 2.1.6 插件作为独立模块架构

**目标**: 将插件系统重构为独立模块, 支持外部开发

```
src/plugins/                          # 插件模块 (独立)
├── sdk/                              # 公共 SDK (外部开发者使用)
│   ├── index.ts                     # PluginAPI 导出
│   ├── types.ts                     # 外部类型定义
│   ├── manifest.ts                  # upup.plugin.json Schema
│   └── manifest.schema.json         # JSON Schema
├── core/                             # 核心运行时
│   ├── registry.ts                 # 插件注册表 (已重构)
│   ├── loader.ts                   # 模块加载器
│   ├── discovery.ts                # 插件发现
│   ├── lifecycle.ts                # 生命周期管理
│   └── services.ts                 # 服务管理
├── adapters/                         # 协议适配器
│   ├── native.ts                  # 本地/内置插件
│   ├── mcp.ts                     # MCP 协议 (新增)
│   ├── cli.ts                     # CLI 命令 (新增)
│   └── index.ts                   # 适配器导出
├── path-safety.ts                   # 路径安全检查
├── types.ts                        # 内部类型 (不导出)
└── index.ts                        # 模块入口
```

#### 2.1.7 插件 SDK 接口 (外部开发者使用)

```typescript
// src/plugins/sdk/index.ts - 公共 API
export interface PluginAPI {
  /** 插件标识 */
  id: string;
  /** 插件元数据 */
  meta: {
    name: string;
    version?: string;
    description?: string;
  };

  /** 日志器 */
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string, err?: Error): void;
  };

  // ===== 核心注册方法 =====

  /** 注册工具 */
  registerTool(tool: ExternalTool): void;

  /** 注册 Hook */
  registerHook(events: string | string[], handler: HookHandler): void;

  /** 注册 MCP 通道 */
  registerChannel(config: ChannelConfig): void;

  /** 注册 CLI 命令 */
  registerCli(commands: CliCommand[]): void;

  /** 注册 LLM Provider */
  registerProvider(config: ProviderConfig): void;

  // ===== 生命周期 =====

  /** 监听生命周期事件 */
  on<K extends PluginLifecycleEvent>(event: K, handler: PluginLifecycleHandler[K]): void;

  /** 插件初始化完成 */
  ready(): void;
}

// 外部工具定义 (不依赖内部 AgentTool)
export interface ExternalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface HookHandler {
  (context: HookContext): Promise<HookResult | void>;
}

export interface ChannelConfig {
  id: string;
  type: 'stdio' | 'http' | 'websocket';
  config?: Record<string, unknown>;
}
```

#### 2.1.8 插件清单 (upup.plugin.json)

```json
{
  "$schema": "https://upup.dev/plugins/schema/v1",
  "id": "stock-analyzer",
  "name": "Stock Analyzer",
  "description": "Real-time stock analysis plugin",
  "version": "1.0.0",
  "runtime": "node",
  "main": "dist/index.js",

  "configSchema": {
    "apiKey": {
      "type": "string",
      "required": true,
      "description": "API key for stock data service"
    },
    "refreshInterval": {
      "type": "number",
      "default": 300000
    }
  },

  "capabilities": ["tool", "hook"],
  "channels": ["stock-data"],
  "hooks": ["llm_output"],
  "tools": ["analyze_stock", "get_realtime_quote"]
}
```

#### 2.1.9 插件初始化流程

```typescript
// src/plugins/core/loader.ts

export async function loadPlugin(
  manifest: PluginManifest,
  sdk: PluginAPI,
  options: LoadOptions
): Promise<LoadedPlugin> {
  // 1. 创建沙箱环境
  const sandbox = createSandbox(manifest, options);

  // 2. 加载插件模块
  const module = await sandbox.load(manifest.main);

  // 3. 创建插件上下文
  const context = createPluginContext(manifest, sdk);

  // 4. 调用插件入口
  if (typeof module === 'function') {
    await module(sdk, context);
  } else if (module.default) {
    await module.default(sdk, context);
  } else if (module.register) {
    await module.register(sdk, context);
  }

  // 5. 返回已加载插件
  return {
    id: manifest.id,
    manifest,
    tools: sdk.getRegisteredTools(),
    hooks: sdk.getRegisteredHooks(),
    channels: sdk.getRegisteredChannels(),
    runtime: manifest.runtime,
  };
}
```

### Phase 2: MCP 协议支持 (P1)

**目标**: 支持通过 MCP (Model Context Protocol) 连接外部插件

#### 2.2.1 MCP Server 实现

```typescript
// src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export class McpPluginServer {
  private server: Server;

  constructor(pluginId: string) {
    this.server = new Server(
      { name: `upup-${pluginId}`, version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );
  }

  // 注册工具
  registerTools(tools: ToolDefinition[]): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));
  }

  // 注册资源
  registerResources(resources: ResourceDefinition[]): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    }));
  }

  // 启动
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

#### 2.2.2 MCP 适配器

```typescript
// src/plugins/adapters/mcp.ts
export class McpPluginAdapter {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly server: McpPluginServer
  ) {}

  // 将 UpUp 插件转换为 MCP 服务器
  async adaptPlugin(plugin: UpUpPlugin): Promise<void> {
    // 1. 注册工具
    const tools = this.registry.getTools(plugin.id);
    this.server.registerTools(tools);

    // 2. 注册资源
    const resources = this.registry.getResources(plugin.id);
    this.server.registerResources(resources);

    // 3. 注册 handler
    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      return this.handleToolCall(req.params.name, req.params.arguments);
    });
  }
}
```

#### 2.2.3 MCP 插件目录结构

```
src/plugins/
├── adapters/
│   └── mcp/                      # MCP 协议适配器
│       ├── index.ts
│       ├── server.ts             # MCP Server
│       ├── client.ts             # MCP Client
│       ├── transport.ts          # Stdio/WebSocket
│       └── protocol.ts           # 协议处理
└── ... (其他已有文件)

src/mcp/                          # MCP 协议实现
├── server.ts                     # MCP 服务器 (核心)
├── handler.ts                   # 请求处理器
├── tools.ts                     # 工具暴露
├── resources.ts                  # 资源暴露
├── prompts.ts                   # Prompt 模板
└── registry.ts                  # MCP 插件注册表
```

### Phase 3: 工具系统统一 (P1)

**目标**: 统一工具注册和发现

#### 2.3.1 工具注册表重构

```typescript
// src/tools/registry/unified.ts
interface ToolCategory {
  id: string;
  name: string;
  tools: ToolDefinition[];
}

interface UnifiedToolRegistry {
  categories: Map<string, ToolCategory>;
  registerCategory(cat: ToolCategory): void;
  getTool(name: string): ToolDefinition | null;
  listTools(filter?: ToolFilter): ToolDefinition[];
}
```

#### 2.3.2 工具目录重组

```
src/tools/
├── registry/           # 注册表
│   ├── unified.ts
│   └── types.ts
├── filesystem/         # 文件操作
├── bash/             # Bash
├── portfolio/        # 持仓 (已有)
├── notify/           # 通知 (已有)
├── quant/            # 量化
├── mcp/              # MCP 工具
└── templates/        # 工具模板
```

### Phase 4: Agent 解耦 (P2)

**目标**: 将 Agent 核心模块化

#### 2.4.1 解耦策略

```
src/agent/
├── core/              # 核心接口
│   ├── agent.ts       # 接口定义
│   ├── executor.ts    # 执行器接口
│   └── hooks.ts       # Hook 接口
├── implementations/    # 实现
│   ├── default/       # 默认实现
│   └── investment/    # 投资专用
├── tool-executor.ts   # 保持独立
├── scratchpad.ts      # 保持独立
└── plugins/          # 插件扩展点
```

#### 2.4.2 接口定义

```typescript
// src/agent/core/interfaces.ts
interface IAgent {
  run(query: string): AsyncGenerator<AgentEvent>;
  compact(): Promise<void>;
}

interface IToolExecutor {
  execute(tool: string, args: Record<string, unknown>): AsyncGenerator<ToolEvent>;
  addHook(hook: Hook): void;
}

interface IHookExecutor {
  preToolUse(params: PreToolParams): Promise<HookResult>;
  postToolUse(params: PostToolParams): Promise<HookResult>;
}
```

### Phase 5: 记忆系统简化 (P2)

**目标**: 简化搜索接口

#### 2.5.1 统一搜索接口

```typescript
// src/memory/search.ts 简化
export interface MemorySearch {
  // 单一入口
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // 内部实现
  bm25: BM25Search;
  semantic: SemanticSearch;
  scan: FileSearch;
}

export async function search(
  query: string,
  options: {
    maxResults?: number;
    type?: 'keyword' | 'semantic' | 'hybrid';
  } = {}
): Promise<SearchResult[]> {
  // 根据 type 选择实现
}
```

#### 2.4.2 删除冗余实现

| 删除 | 原因 |
|------|------|
| `tfidf.ts` | 使用 Memvid 内置 |
| `embeddings.ts` | 外部依赖 |
| 多余的 search 函数 | 统一入口 |

### Phase 6: 配置文件统一 (P3)

**目标**: 统一配置管理

#### 2.6.1 配置管理器

```typescript
// src/config/
interface Config {
  agent: AgentConfig;
  tools: ToolsConfig;
  memory: MemoryConfig;
  plugins: PluginsConfig;
}

class ConfigManager {
  load(): Config;
  mergeGlobal(): Config;
  mergeProject(): Config;
  save(config: Config): void;
}
```

---

## 3. 文件清单

### Phase 1: OpenClaw 风格插件 API + SDK

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `src/plugins/sdk/index.ts` | PluginAPI 接口 |
| CREATE | `src/plugins/sdk/types.ts` | 外部类型定义 |
| CREATE | `src/plugins/sdk/manifest.ts` | upup.plugin.json Schema |
| CREATE | `src/plugins/core/loader.ts` | 插件加载器重构 |
| CREATE | `src/plugins/core/lifecycle.ts` | 生命周期管理 |

### Phase 2: MCP 协议支持

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `src/plugins/adapters/mcp/` | MCP 适配器目录 |
| CREATE | `src/mcp/server.ts` | MCP 服务器 |
| CREATE | `src/mcp/handler.ts` | 请求处理器 |
| CREATE | `src/mcp/tools.ts` | 工具暴露 |

### Phase 3: 工具系统统一

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `src/tools/registry/unified.ts` | 统一注册表 |
| CREATE | `src/tools/registry/types.ts` | 注册类型 |
| MODIFY | `src/tools/index.ts` | 导出统一接口 |

### Phase 4: Agent 解耦

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `src/agent/core/interfaces.ts` | 核心接口 |
| CREATE | `src/agent/core/executor.ts` | 执行器接口 |
| MODIFY | `src/agent/tool-executor.ts` | 实现接口 |
| MODIFY | `src/hooks/tool-hooks.ts` | 实现接口 |

### Phase 5: 记忆系统简化

| 操作 | 文件 | 说明 |
|------|------|------|
| MODIFY | `src/memory/search.ts` | 统一入口 |
| DELETE | `src/memory/tfidf.ts` | 冗余 |
| DELETE | `src/memory/embeddings.ts` | 外部依赖 |

### Phase 6: 配置统一

| 操作 | 文件 | 说明 |
|------|------|------|
| CREATE | `src/config/index.ts` | 配置管理器 |
| MODIFY | `src/agent/investment-config.ts` | 使用配置管理器 |

---

## 4. 工作量估算

| Phase | 功能 | 估算 | 优先级 |
|-------|------|------|--------|
| 1 | MCP 插件系统 | 2-3 天 | P1 |
| 2 | 工具系统统一 | 1 天 | P1 |
| 3 | Agent 解耦 | 2 天 | P2 |
| 5 | 记忆系统简化 | 1 天 | P2 |
| 6 | 配置统一 | 0.5 天 | P3 |

**总计**: 6-7 天 (最佳最小实现)

---

## 5. 实施顺序

```
Week 1:
├── Day 1: Plugin SDK 接口 + manifest
├── Day 2: MCP 协议适配器
├── Day 3: 工具注册表统一
└── Day 4-5: Agent 核心解耦

Week 2:
├── Day 6: 记忆系统简化
├── Day 7: 配置统一
└── Day 8: 集成测试 + 文档
```

---

## 6. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 重构破坏现有功能 | 保留旧接口, 逐步迁移 |
| MCP 协议复杂性 | 使用成熟库 (@modelcontextprotocol/sdk) |
| 插件 SDK 泄露内部类型 | 使用外部类型, 依赖注入 |
| 测试覆盖不足 | 增加集成测试 |

---

## 7. 验证计划

```bash
# 1. 构建测试
bun run build  # 必须通过

# 2. 单元测试
bun test       # 期望: 1957+ pass

# 3. 插件加载测试
bun run dev
/plugins list

# 4. MCP 插件测试
osascript scripts/verify-upup-dev.applescript

# 5. 工具注册测试
# 执行各种工具验证注册表
```

---

## 8. 外部插件开发指南 (目标)

### 8.1 创建外部插件

```bash
# 创建插件目录
mkdir my-upup-plugin
cd my-upup-plugin

# 创建 package.json
cat > package.json << 'EOF'
{
  "name": "my-upup-plugin",
  "version": "1.0.0",
  "main": "dist/index.js"
}
EOF

# 创建 manifest
cat > upup.plugin.json << 'EOF'
{
  "id": "my-upup-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "configSchema": {
    "apiKey": { "type": "string", "required": true }
  },
  "capabilities": ["tool"],
  "tools": ["my_tool"]
}
EOF
EOF
```

### 8.2 插件代码

```typescript
// src/index.ts
import type { PluginAPI } from '@upup/plugins/sdk';

export default function myPlugin(api: PluginAPI) {
  api.registerTool({
    name: 'my_tool',
    description: 'My custom tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      }
    },
    handler: async (args) => {
      return { result: `Processed: ${args.input}` };
    }
  });

  api.on('llm_output', async (context) => {
    api.logger.info('LLM output received');
  });
}
```

### 8.3 安装插件

```bash
# 将插件复制到全局目录
cp -r my-upup-plugin ~/.upup/plugins/

# 或通过 CLI 安装
upup plugin install ./my-upup-plugin
```

---

**Next Steps**:
1. ~~分析 OpenClaw 插件系统~~ ✅
2. ~~更新 plan7.1.md 架构~~ ✅
3. Phase 1: Plugin SDK 接口实现
4. Phase 2: MCP 协议适配器
5. Phase 3: 工具系统统一
6. Phase 4: Agent 解耦
7. Phase 5: 记忆系统简化
8. Phase 6: 配置统一
