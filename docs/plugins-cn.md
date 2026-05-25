# 插件系统

> 运行时扩展性框架

## 概述

UpUp 实现了多运行时插件系统，支持多种插件类型和执行环境：

- **Bun 运行时**: 原生 ESM 支持
- **Jiti 运行时**: TypeScript 原生执行
- **Wasm 运行时**: WebAssembly 沙箱
- **MCP 运行时**: 外部服务集成

```
┌─────────────────────────────────────────────────────────────────────┐
│                       插件系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    插件注册表                               │    │
│  │                                                              │    │
│  │  • 插件发现                                              │    │
│  │  • 插件加载                                              │    │
│  │  • 运行时适配                                            │    │
│  │  • 生命周期管理                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Bun      │      │   Jiti     │      │   Wasm     │     │
│  │  原生运行时 │      │  TS 运行时  │      │  沙箱运行时 │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
│         ┌────────────────────┬────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │    MCP     │      │   工具     │      │   服务     │     │
│  │  外部服务  │      │   注册     │      │   注册     │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 支持的运行时

| 运行时 | 描述 | 沙箱级别 |
|--------|------|----------|
| `bun` | Bun 运行时原生支持 | process |
| `jiti` | TypeScript 原生执行 | process |
| `wasm` | WebAssembly 隔离 | wasm |
| `mcp` | Model Context Protocol | mcp |

---

## 插件能力

插件可以提供多种能力：

```typescript
type PluginCapability =
  | 'data-source'   // 数据源
  | 'tools'        // 工具
  | 'analysis'     // 分析能力
  | 'strategy'     // 交易策略
  | 'channel'      // 消息通道
  | 'service'      // 后台服务
  | 'skill'        // 技能
  | 'hook';        // 钩子
```

---

## 插件清单

每个插件需要一个 `upup.plugin.json` 清单文件：

```json
{
  "schemaVersion": "1.0",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "我的插件描述",
  "runtime": "bun",
  "capabilities": ["tools", "data-source"],
  "entry": "./dist/index.js",
  "author": {
    "name": "作者名称",
    "email": "author@example.com"
  },
  "security": {
    "sandbox": "process",
    "permissions": ["network", "filesystem"]
  }
}
```

### 字段说明

| 字段 | 必需 | 描述 |
|------|------|------|
| `schemaVersion` | 是 | 清单版本，固定为 "1.0" |
| `id` | 是 | 插件唯一标识 (a-z0-9-) |
| `name` | 是 | 插件显示名称 |
| `version` | 是 | 语义化版本 (x.y.z) |
| `runtime` | 是 | 运行时类型 |
| `capabilities` | 是 | 能力列表 |
| `entry` | 是 | 入口文件路径 |
| `description` | 否 | 插件描述 |
| `author` | 否 | 作者信息 |
| `security` | 否 | 安全配置 |

---

## 插件 API

插件接收统一的 API 接口：

```typescript
interface UpUpPluginApi {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntime;
  config: Record<string, unknown>;

  // 工具注册
  registerTool(tool: AgentTool): void;
  registerTools(tools: AgentTool[]): void;

  // 钩子注册
  registerHook(events: string[], handler: HookHandler): void;
  on(event: string, handler: HookHandler): void;

  // 服务注册
  registerService(service: PluginService): void;

  // 生命周期
  onLoad?(api: UpUpPluginApi): Promise<void>;
  onStart?(api: UpUpPluginApi): Promise<void>;
  onStop?(api: UpUpPluginApi): Promise<void>;
}
```

---

## 工具类型

```typescript
interface AgentTool {
  name: string;
  description?: string;
  execute(args: Record<string, unknown>): Promise<unknown>;
  schema?: Record<string, unknown>;
}
```

### 示例：注册工具

```typescript
import type { UpUpPluginApi, AgentTool } from '@upup/sdk';

const myTool: AgentTool = {
  name: 'my_analysis',
  description: '自定义分析工具',
  execute: async (args) => {
    const symbol = args.symbol as string;
    return { result: `分析 ${symbol} 的结果` };
  },
};

export default {
  onLoad(api: UpUpPluginApi) {
    api.registerTool(myTool);
  },
};
```

---

## 钩子系统

### 可用钩子

```typescript
type HookName =
  // 生命周期钩子
  | 'SessionStart'
  | 'SessionEnd'
  | 'BeforeAgentStart'
  | 'AgentEnd'
  // 工具钩子
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  // 消息钩子
  | 'MessageReceived'
  | 'MessageSending'
  | 'MessageSent'
  // LLM 钩子
  | 'LLMInput'
  | 'LLMOutput'
  // 投资专用钩子
  | 'data_fetched'
  | 'analysis_complete'
  | 'portfolio_updated'
  | 'risk_threshold';
```

### 钩子处理器

```typescript
type HookHandler = (
  context: HookContext
) => Promise<HookResult> | HookResult;

interface HookContext {
  event: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}
```

### 示例：注册钩子

```typescript
export default {
  onLoad(api: UpUpPluginApi) {
    api.registerHook(['PreToolUse'], async (ctx) => {
      console.log('工具调用前:', ctx.data);
      return { allowed: true };
    });

    api.on('PostToolUse', async (ctx) => {
      console.log('工具调用后:', ctx.metadata?.toolName);
    });
  },
};
```

---

## 服务类型

```typescript
interface PluginService {
  name: string;
  start(ctx: ServiceContext): Promise<void>;
  stop?(ctx: ServiceContext): Promise<void>;
}
```

### 示例：注册服务

```typescript
const myService: PluginService = {
  name: 'market-data',
  start: async (ctx) => {
    console.log('服务启动:', ctx.config);
    // 初始化服务
  },
  stop: async (ctx) => {
    console.log('服务停止');
    // 清理资源
  },
};

export default {
  onLoad(api: UpUpPluginApi) {
    api.registerService(myService);
  },
};
```

---

## 数据源类型 (投资专用)

```typescript
interface DataSourcePlugin {
  id: string;
  name: string;
  provider: string;
  type: 'api' | 'file' | 'database';
  fetch<T>(params: DataSourceParams): Promise<T>;
  validateConfig?(config: Record<string, unknown>): boolean;
  healthCheck?(): Promise<boolean>;
}

interface DataSourceParams {
  symbol?: string;
  startDate?: string;
  endDate?: string;
  interval?: string;
  [key: string]: unknown;
}
```

---

## 完整示例

### 插件目录结构

```
my-plugin/
├── upup.plugin.json
├── package.json
└── src/
    └── index.ts
```

### 完整插件代码

```typescript
// src/index.ts
import type { UpUpPluginApi, AgentTool, PluginService } from '@upup/sdk';

// 定义工具
const stockTool: AgentTool = {
  name: 'get_stock_price',
  description: '获取股票价格',
  execute: async (args) => {
    const symbol = args.symbol as string;
    return { symbol, price: 150.25 };
  },
};

// 定义服务
const dataService: PluginService = {
  name: 'stock-data',
  start: async () => {
    console.log('Stock data service started');
  },
  stop: async () => {
    console.log('Stock data service stopped');
  },
};

// 插件入口
export default {
  onLoad(api: UpUpPluginApi) {
    api.registerTool(stockTool);
    api.registerService(dataService);

    api.on('PreToolUse', async (ctx) => {
      console.log('Tool call:', ctx.metadata?.toolName);
      return { allowed: true };
    });

    console.log(`Plugin ${api.name} loaded`);
  },
};
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [技能系统](skills-cn.md)
- [API 参考](api-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
