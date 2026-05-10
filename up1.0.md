# UpUp 1.0 — 投资 Agent 路线图

> 分析日期: 2026-05-10 | 定位: 投资研究 AI Agent | 运行时: Bun
> 当前版本: UpUp 2026.05.10 | 分支: feature/up-plugin
> 实现状态: ✅ 7/7 核心特性已实现, 插件系统完成 (100%)
>
> **插件系统完成**: loader.ts + 4 运行时适配器 (bun/jiti/wasm/mcp) + registry + discovery + 23 tests
> **测试验证**: 1875 测试通过, 0 失败

---

## 0. 定位说明

**UpUp 是投资研究 AI Agent，不是通用编程工具。**

| 维度 | Claude Code (通用) | UpUp (投资) |
|------|-------------------|-------------|
| 核心用户 | 软件工程师 | 投资者/分析师 |
| 主要任务 | 代码编写、调试、重构 | 市场分析、组合管理、量化计算 |
| 数据源 | GitHub、Stack Overflow | FMP、Tushare、Bloomberg |
| 交互方式 | 代码编辑为主 | API 调用 + 数据分析 |
| 插件生态 | npm 开发者工具 | 投资数据源/分析工具 |
| 运行时 | Node.js | **Bun 1.x** |

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UpUp (涨涨)                                │
├──────────┬──────────┬──────────┬──────────┬────────────────────────┤
│  Entry   │   CLI    │  Agent   │  Tools   │    投资基础设施         │
├──────────┼──────────┼──────────┼──────────┼────────────────────────┤
│ index.tsx│  cli.ts  │ agent/   │ finance/ │ memory/ (MV2+BM25+SQL) │
│          │  theme.ts│ prompts  │ astock/  │ mcp/ (MCP 客户端)      │
│          │  control-│ compac-  │ quant/   │ gateway/ (WhatsApp)    │
│          │  lers/   │  tion/   │ bash/    │ cron/ (定时任务)        │
│          │  comp-   │ subagent │ portfol- │ permissions/ (权限)     │
│          │  onents/ │ fallback │  io/     │ daemon/ (守护进程)      │
│          │  commands│ loop-re- │ web/     │ proactive/ (主动模式)  │
│          │          │  covery  │ memory/  │ hooks/ (钩子系统)      │
│          │          │ plan-    │ lsp/     │ keybindings/          │
│          │          │  mode    │ +80 more │ file-state/           │
│          │          │          │          │ plugins/ ✅ (核心)       │
├──────────┴──────────┴──────────┴──────────┴────────────────────────┤
│                     TUI: pi-tui (够用)                              │
│                     运行时: Bun 1.x (高性能)                          │
│                     插件: 统一适配器架构 (TS/JITI/WASM/MCP)           │
│                     工具: 110+ (金融 64+ / 通用 46)                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 统一插件系统架构 ⭐

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| **统一适配器模式** | 一个 Plugin API，适配多种运行时 (TS/JITI/WASM/MCP) |
| **Bun 原生 + JITI** | Bun ESM 优先，JITI 作为 TypeScript 回退 |
| **可插拔** | 数据源、分析工具、策略、通知渠道全部可扩展 |
| **安全优先** | 路径安全、配置验证、沙箱隔离 |
| **性能优先** | 懒加载、并发执行、服务生命周期管理 |
| **向后兼容** | 现有 Tool Registry / Hook System / MCP 完全复用 |

### 2.2 统一适配器架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                  UpUp 统一插件系统 — 适配器架构                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Plugin Manifest Layer                       │  │
│  │  upup.plugin.json — 统一元数据 (id, version, runtime)       │  │
│  │                              ↓                                  │  │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────┐  │  │
│  │  │ Validation   │  │ Runtime         │  │ Config Schema    │  │  │
│  │  │ (JSON Sch)   │──│ Declaration     │──│ (JSON Schema)   │  │  │
│  │  └──────────────┘  └─────────────────┘  └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Discovery Layer (4 sources)                │  │
│  │  ① bundled  ② global (~/.upup/plugins/)  ③ workspace  ④ npm  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 Plugin Loader (适配器选择)                      │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  runtime: "bun"     → Bun native import                 │  │  │
│  │  │  runtime: "jiti"     → JITI transpile TS                 │  │  │
│  │  │  runtime: "wasm"     → Extism SDK + WASM sandbox         │  │  │
│  │  │  runtime: "mcp"      → MCP Client + protocol adapter    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Unified Plugin API                         │  │
│  │  registerTool() / registerHook() / registerChannel()          │  │
│  │  registerCommand() / registerService() / registerDataSource()│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Runtime Layer                             │  │
│  │  Tool Registry  ← Hook System  ←  Service Locator              │  │
│  │  MCP Client     ←  Daemon      ←  Memory System               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 运行时适配器对比

| 适配器 | 运行时 | 隔离 | 性能 | 适用场景 | 复杂度 |
|--------|--------|------|------|---------|--------|
| **Bun** | Bun ESM | 无 | ⭐⭐⭐⭐⭐ | 信任的本地插件 | 低 |
| **JITI** | Node.js TS | 无 | ⭐⭐⭐ | TS 源码插件、跨 Bun/Node | 中 |
| **WASM** | Extism | 内存沙箱 | ⭐⭐⭐ | 第三方/不受信插件 | 中 |
| **MCP** | 外部进程 | 进程隔离 | ⭐⭐ | 外部数据源、服务 | 低 |

### 2.4 插件 Manifest (统一格式)

```json
{
  "schemaVersion": "1.0",
  "id": "fmp-data-provider",
  "name": "FMP 美股数据源",
  "version": "1.0.0",
  "description": "提供美股实时行情、财务数据、SEC 文件",
  "runtime": "bun",                    // "bun" | "jiti" | "wasm" | "mcp"
  "author": { "name": "UpUp Team" },
  "license": "MIT",
  "homepage": "https://github.com/upup/plugins",
  "capabilities": ["data-source", "tools"],
  "runtimeConfig": {
    "type": "api",
    "provider": "fmp",
    "apiKey": { "type": "string", "env": "FMP_API_KEY", "required": true }
  },
  "entry": "./dist/index.js",          // 适配器解释此路径
  "hooks": "./hooks.json",
  "dependencies": [],
  "peerDependencies": { "@upup/sdk": ">=1.0.0" },
  "security": {
    "sandbox": "process",              // "process" | "wasm" | "mcp" | "none"
    "permissions": ["net", "fs:read"]
  }
}
```

### 2.5 统一插件 API

```typescript
// src/plugins/types.ts

/** 插件运行时类型 */
export type PluginRuntime = 'bun' | 'jiti' | 'wasm' | 'mcp';

/** 插件能力类型 */
export type PluginCapability =
  | 'data-source'
  | 'tools'
  | 'analysis'
  | 'strategy'
  | 'channel'
  | 'service';

/** 插件配置 */
export interface UpUpPluginConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  runtime: PluginRuntime;
  entry: string;
  capabilities: PluginCapability[];
  enabled: boolean;
  config: Record<string, unknown>;
}

/** 统一插件 API — 适配器隐藏实现细节 */
export interface UpUpPluginApi {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntime;
  config: UpUpConfig;
  pluginConfig: Record<string, unknown>;
  logger: UpUpLogger;

  // === 工具注册 (复用现有 Tool Registry) ===
  registerTool(tool: AgentTool, options?: ToolOptions): void;
  registerTools(tools: AgentTool[], options?: ToolOptions): void;

  // === Hook 注册 (复用现有 Hook System) ===
  registerHook(events: string[], handler: HookHandler, options?: HookOptions): void;
  on(event: string, handler: HookHandler, priority?: number): void;

  // === 渠道注册 (复用 WhatsApp 插件模式) ===
  registerChannel(channel: ChannelPlugin): void;

  // === 命令注册 (复用 Commands System) ===
  registerCommand(command: Command): void;

  // === 服务注册 (后台服务生命周期) ===
  registerService(service: BackgroundService): void;

  // === 数据源注册 (投资插件特有) ===
  registerDataSource(source: DataSourcePlugin): void;

  // === 工具函数 ===
  resolvePath(relativePath: string): string;

  // === 生命周期 (所有运行时通用) ===
  onLoad?(api: UpUpPluginApi): Promise<void> | void;
  onStart?(api: UpUpPluginApi): Promise<void> | void;
  onStop?(api: UpUpPluginApi): Promise<void> | void;
  onUnload?(api: UpUpPluginApi): Promise<void> | void;
}

/** 适配器接口 — 每个运行时实现此接口 */
export interface PluginAdapter {
  readonly runtime: PluginRuntime;
  canLoad(manifest: UpUpPluginConfig): boolean;
  load(manifest: UpUpPluginConfig, api: UpUpPluginApi): Promise<LoadedPlugin>;
  unload(plugin: LoadedPlugin): Promise<void>;
}

/** 加载后的插件实例 */
export interface LoadedPlugin {
  id: string;
  runtime: PluginRuntime;
  manifest: UpUpPluginConfig;
  instance: unknown;                    // 运行时特定实例
  services: BackgroundService[];       // 后台服务
  tools: AgentTool[];                  // 注册的工具
  hooks: Map<string, HookHandler[]>;  // 注册的 hooks
}
```

### 2.6 适配器实现

```typescript
// src/plugins/adapters/

/** Bun 适配器 — 原生 ESM 加载 */
export class BunAdapter implements PluginAdapter {
  readonly runtime = 'bun' as const;
  canLoad(manifest) { return manifest.runtime === 'bun'; }
  async load(manifest, api) {
    // Bun 原生 import，直接执行
    const module = await import(manifest.entry);
    const plugin = module.default ?? module;
    return this.activate(plugin, api);
  }
}

/** JITI 适配器 — TypeScript 编译加载 */
export class JitiAdapter implements PluginAdapter {
  readonly runtime = 'jiti' as const;
  private jiti: any;

  canLoad(manifest) { return manifest.runtime === 'jiti'; }
  async load(manifest, api) {
    // JITI 转译 TS，支持 .ts/.tsx
    const jiti = await import('jiti');
    const module = await jiti.default(manifest.entry);
    const plugin = module.default ?? module;
    return this.activate(plugin, api);
  }
}

/** WASM 适配器 — Extism 沙箱 */
export class WasmAdapter implements PluginAdapter {
  readonly runtime = 'wasm' as const;
  async load(manifest, api) {
    // Extism WASM 加载，内存隔离
    const extism = await import('@extism/sdk');
    const plugin = new extism.Plugin(manifest.entry, withCache: false, [
      // Host functions 注册
    ]);
    return this.activateWasm(plugin, api);
  }
}

/** MCP 适配器 — 外部进程协议 */
export class McpAdapter implements PluginAdapter {
  readonly runtime = 'mcp' as const;
  async load(manifest, api) {
    // MCP 协议连接外部服务器
    const client = new MCPClient();
    await client.connect(manifest.config.url);
    return this.activateMcp(client, api);
  }
}
```

### 2.7 适配器选择器

```typescript
// src/plugins/loader.ts

export class PluginLoader {
  private adapters: Map<PluginRuntime, PluginAdapter> = new Map();

  constructor() {
    // 注册所有适配器 (按优先级)
    this.adapters.set('bun', new BunAdapter());
    this.adapters.set('jiti', new JitiAdapter());
    this.adapters.set('wasm', new WasmAdapter());
    this.adapters.set('mcp', new McpAdapter());
  }

  async loadPlugin(manifest: UpUpPluginConfig, api: UpUpPluginApi): Promise<LoadedPlugin> {
    const adapter = this.adapters.get(manifest.runtime);
    if (!adapter) {
      throw new Error(`Unknown plugin runtime: ${manifest.runtime}`);
    }
    if (!adapter.canLoad(manifest)) {
      throw new Error(`Adapter ${manifest.runtime} cannot load this plugin`);
    }
    return adapter.load(manifest, api);
  }

  async loadAll(manifests: UpUpPluginConfig[], api: UpUpPluginApi): Promise<LoadedPlugin[]> {
    return Promise.all(manifests.map(m => this.loadPlugin(m, api)));
  }
}
```

### 2.8 Hook 系统扩展

基于现有 22 类型 Hook，扩展投资专用 Hook:

```typescript
// 扩展 Hook 类型
type InvestmentHook =
  // 数据
  | 'data_fetched'           // 数据获取完成
  | 'data_source_error'      // 数据源异常
  | 'data_cached'           // 数据缓存完成

  // 分析
  | 'analysis_start'         // 分析开始
  | 'analysis_complete'      // 分析完成
  | 'analysis_render'       // 分析结果渲染

  // 组合
  | 'portfolio_updated'      // 组合变更
  | 'position_alert'        // 仓位预警
  | 'risk_threshold'        // 风险阈值触发

  // 服务
  | 'session_idle'          // 会话空闲
  | 'session_resume'        // 会话恢复
  | 'service_start'         // 服务启动
  | 'service_stop';        // 服务停止

// Hook 执行模式
type HookExecutionMode =
  | 'parallel'    // 并行执行 (fire-and-forget)
  | 'sequential'  // 顺序执行 (按优先级)
  | 'sync';       // 同步执行 (结果必须立即返回)
```

### 2.9 服务生命周期

```
应用启动
    │
    ▼
┌─────────────────┐
│ Load Plugins    │ ← 根据 runtime 选择适配器
│ (loader.ts)    │   bun/jiti/wasm/mcp
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Register APIs   │ ← registerTool / registerHook / registerService
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Start Services  │ ← 顺序启动 (注册顺序)
│ (services.ts)  │   停止时按反向顺序
└────────┬────────┘
         │
         ▼
    [服务运行中]
         │
         ▼
┌─────────────────┐
│ Stop Services   │ ← reverse(services)
└─────────────────┘
```

### 2.10 安全性设计

| 层级 | 机制 | 实现 |
|------|------|------|
| **Manifest** | Schema 验证 | JSON Schema + ajv |
| **路径安全** | 边界检查 | `isPathInside()`, 禁止逃逸 |
| **配置安全** | 环境变量 | `env:` 引用，不暴露明文 |
| **权限安全** | Capability 声明 | manifest 声明 + 运行时验证 |
| **MCP 隔离** | 进程隔离 | MCP 协议天然隔离外部数据源 |
| **WASM 沙箱** | 内存隔离 | Extism runtime |
| **JITI 安全** | 路径安全扫描 | 插件代码扫描 |
| **Bun 原生** | 高性能 | Bun import 直接执行 |

---

## 3. OpenClaw 插件系统深度学习

### 3.1 核心设计模式

| 模式 | OpenClaw | UpUp (适配) |
|------|---------|------------|
| **DI 方式** | Service Locator | Service Locator (已有) |
| **加载方式** | JITI (ts transpile) | **Bun + JITI 双模式** |
| **生命周期** | register/activate/start/stop | 扩展支持 unload |
| **Hook 优先级** | priority 数字排序 | priority + executionMode |
| **服务启动** | 正序注册，反序停止 | 复用此模式 |
| **API 分层** | Api (插件可见) / Runtime (内部) | 继承此分层 |

### 3.2 OpenClaw 关键文件

```
src/plugins/
├── types.ts              ← 核心类型定义 (PluginApi, Runtime, Hooks)
├── loader.ts             ← 加载器 (JITI + 路径安全 + provenance)
├── registry.ts           ← 注册表 (tools/hooks/channels/commands/services)
├── hooks.ts              ← Hook 执行引擎 (parallel/sequential/sync)
├── services.ts           ← 服务生命周期 (start/stop order)
├── discovery.ts          ← 发现机制 (config/workspace/bundled/global)
├── manifest.ts           ← manifest 加载 + 验证
├── manifest-registry.ts  ← manifest 缓存
├── runtime/
│   ├── types-core.ts    ← Core runtime (config/system/media/events)
│   └── types-channel.ts  ← Channel runtime (Discord/Slack/Telegram等)
├── path-safety.ts        ← 路径安全 (isPathInside, safeStatSync)
├── enable.ts            ← 启用/禁用状态解析
└── install.ts           ← 安装机制 (npm/zip/dir)
```

### 3.3 借鉴点

1. **Provenance 追踪**: 记录插件来源 (bundled/global/workspace/config)
2. **JITI → Bun+JITI**: Bun 原生快速，JITI 支持 TS 源码插件
3. **Path Safety**: 完整路径安全检查，防止插件逃逸
4. **服务反向停止**: 注册顺序正向，停止顺序反向

---

## 4. Claude Code 功能筛选

### ❌ 已删除 — 投资 Agent 不需要

| 功能 | 原因 |
|------|------|
| 自研 TUI 框架 | CLI 工具，pi-tui 完全满足 |
| SSH 远程执行 | 投资在本地，API 获取数据 |
| Vim 模式 | 代码编辑不是核心场景 |
| Voice 模式 | 投资需精确数据 |
| Buddy 系统 | Companion 动画无价值 |
| Analytics/VSCode | 非投资场景 |
| PowerShell 支持 | 投资工具在 macOS/Linux |

### ✅ 保留 — 投资 Agent 需要

| 功能 | 投资场景 |
|------|---------|
| Bash/命令执行 | API 调用、数据下载、定时任务 |
| 文件编辑 | 组合配置、回测脚本、报告 |
| 工具渲染 | 金融数据格式化、VaR 结果 |
| 任务/Jobs | 后台量化计算、定时更新 |
| **插件系统** | 扩展数据源、分析工具、渠道 |
| 键绑定 | 快速交互 |
| MCP 协议 | 外部数据源隔离 |

---

## 5. 已完成特性 ✅

| 里程碑 | 交付物 | 验证 |
|--------|--------|------|
| M1: Bash AST | ast-parser.ts + 34 tests | 1875 测试通过 |
| M2: 文件编辑追踪 | file-state.ts + 10 tests | 1875 测试通过 |
| M3: Hook 退出码 | spawn + exit 0/2 | TS 编译通过 |
| M4: 工具 UI 渲染 | tool-renderers.ts | TS 编译通过 |
| M5: 键绑定 | keybindings/ + 31 tests | 1875 测试通过 |
| M6: Jobs CLI | /tasks stop, /jobs | TS 编译通过 |
| M7: **统一插件系统** | loader + 4 adapters + registry + discovery + 23 tests | 1875 测试通过 |

---

## 6. 投资 Agent 路线图

### 🔴 P0 — 核心投资功能

| # | 功能 | 投资场景 | 插件类型 |
|---|------|---------|---------|
| **I0** | **统一插件系统架构** | 所有投资功能的扩展基础 | 核心 |
| I1 | 投资组合深度分析 | 风险报告、头寸监控、再平衡 | 分析 |
| I2 | 实时 A 股数据增强 | Level-2 推送、融资融券、IPO | 数据源 |
| I3 | 量化策略框架 | 回测引擎、策略注册、胜率 | 策略 |
| I4 | 投资记忆系统 | 偏好学习、风险跟踪、头寸 | 服务 |

### 🟡 P1 — 重要投资功能

| # | 功能 | 插件类型 |
|---|------|---------|
| I5 | Monte Carlo 模拟 | 分析 |
| I6 | 因子分析 | 分析 |
| I7 | 压力测试 | 分析 |
| I8 | 港股数据增强 | 数据源 |
| I9 | 全球宏观日历 | 数据源 |
| I10 | Telegram 通知 | 渠道 |
| I11 | 微信通知 | 渠道 |

### 🟢 P2 — 增强功能

| # | 功能 |
|---|------|
| I12 | 策略评分系统 (A-F) |
| I13 | 组合归因分析 |
| I14 | 税务优化 (A 股印花税) |
| I15 | 卖空利率监控 |
| I16 | 新闻情绪分析 |
| I17 | Excel/CSV 导入 |

---

## 7. 插件系统实施步骤

### Phase 1: 统一适配器架构 (Week 1-2)

```
Day 1-3:   Plugin types + manifest schema
Day 4-6:   Plugin adapter interface + 4 adapters (bun/jiti/wasm/mcp)
Day 7-9:   Plugin loader (适配器选择 + 路径安全)
Day 10-12: Plugin registry (capability registration)
Day 13-15: Discovery (4 sources: config/workspace/global/npm)
Day 16-18: registerTool() → Tool Registry 集成
Day 19-21: registerHook() → Hook System 集成
Day 22:    测试
```

**新文件**:
```
src/plugins/
├── types.ts              # Plugin API + capability types
├── manifest.ts           # manifest 加载 + JSON Schema 验证
├── loader.ts            # Plugin loader (适配器选择)
├── adapters/
│   ├── index.ts         # 适配器导出
│   ├── bun.ts           # Bun 原生适配器
│   ├── jiti.ts          # JITI TS 适配器
│   ├── wasm.ts          # WASM Extism 适配器
│   └── mcp.ts           # MCP 协议适配器
├── registry.ts          # 能力注册表
├── discovery.ts          # 4 来源发现
├── services.ts           # 服务生命周期
├── runtime/
│   ├── types-core.ts    # Core runtime capabilities
│   └── types-data.ts   # DataSource runtime
└── path-safety.ts       # 路径边界检查
```

### Phase 2: 数据源插件 (Week 3)

```
Day 23-26: registerDataSource() + FMP 适配器 (bun)
Day 27-30: Tushare 适配器重构为数据源插件
Day 31-33: 宏观数据插件 (FRED, 世界银行)
Day 34:    测试
```

### Phase 3: 分析工具插件 (Week 4)

```
Day 35-38: Monte Carlo 模拟器插件
Day 39-42: 因子分析插件
Day 43-45: 压力测试插件
Day 46:    测试
```

### Phase 4: 渠道 + 服务 (Week 5)

```
Day 47-50: registerChannel() + Telegram
Day 51-54: registerService() + 投资记忆服务
Day 55-57: WhatsApp 增强 (价格预警)
Day 58:    测试
```

---

## 8. 功能矩阵

| 功能 | 当前 | 1.0 目标 | 优先级 | 插件类型 |
|------|------|----------|--------|---------|
| 美股数据 (FMP) | ✅ | ✅ 增强 | P0 | 数据源 |
| A股数据 (Tushare) | ✅ | ✅ Level-2 | P0 | 数据源 |
| 港股数据 | 🟡 | ✅ 增强 | P1 | 数据源 |
| 量化计算 (20 工具) | ✅ | ✅ 25+ | P1 | 分析 |
| Monte Carlo | ❌ | ✅ | P1 | 分析 |
| 因子分析 | ❌ | ✅ | P1 | 分析 |
| 压力测试 | ❌ | ✅ | P1 | 分析 |
| 组合管理 | ✅ | ✅ 风险报告 | P0 | 分析 |
| 回测系统 | ✅ 基础 | ✅ 策略框架 | P0 | 策略 |
| 技术指标 (12) | ✅ | ✅ 20+ | P1 | 分析 |
| 数据可靠性 (A-F) | ✅ | ✅ | P0 | — |
| 投资记忆系统 | 🟡 | ✅ 偏好学习 | P0 | 服务 |
| WhatsApp 通知 | ✅ | ✅ 增强 | P1 | 渠道 |
| **插件系统** | 🟡 | ✅ 统一架构 | P0 | **核心** |
| MCP 协议 | ✅ | ✅ | P1 | — |
| 键绑定 | ✅ | ✅ | P2 | — |
| 主题系统 | 🟡 | ✅ | P2 | — |

---

## 9. 技术选型总结

| 选择 | 方案 | 原因 |
|------|------|------|
| **运行时** | Bun 1.x | 高性能、无 Node 兼容层开销 |
| **TS 插件** | Bun native + JITI 双模式 | 快速 + TS 源码支持 |
| **WASM 支持** | Extism SDK | 成熟、WASMtime 后端 |
| **MCP 支持** | MCP Client | 外部数据源进程隔离 |
| **DI 模式** | Service Locator | 已有，复用模式 |
| **路径安全** | 边界检查 + hardlink 拒绝 | 防止插件逃逸 |
| **Hook 引擎** | Parallel/Sequential/Sync | 适配不同场景 |
| **服务生命周期** | 正序启动、反序停止 | OpenClaw 模式复用 |

---

## 10. 竞争优势

| 优势 | 描述 | 保持策略 |
|------|------|---------|
| 金融工具 110+ | VaR, BS, Sharpe, Kelly, Greeks | 持续增加 MC/因子/压力 |
| A 股深度集成 | 实时 + Level-2 + 融资融券 | 增加: IPO 日历 |
| 美股数据 | FMP 完整 API | 增加: 财报预测 |
| **统一插件系统** | TS(JITI)/Bun/WASM/MCP 四种运行时 | 投资扩展基础 (✅ 已实现) |
| 量化分析 | 回测、风险、组合优化 | 增加: 多因子 |
| 消息通知 | WhatsApp + Telegram + 微信 | 多渠道预警 |
| 记忆系统 | MV2 + BM25 + SQL | 增加: 投资偏好 |

---

## 11. 代码质量

| 指标 | 当前 | 1.0 目标 |
|------|------|---------|
| 测试用例数 | **1,875** | 3,000+ |
| 测试文件数 | 97 | 120+ |
| TypeScript 严格模式 | 部分 | 全部 strict |
| CI/CD | 无 | GitHub Actions |
| 代码覆盖率 | 未测 | 80%+ |

---

## 12. 与 Claude Code 的差异

| Claude Code (通用) | UpUp (投资) |
|-------------------|-------------|
| 代码补全/重构 | 市场数据分析 |
| Git 版本控制 | 组合配置管理 |
| SSH 远程开发 | API 远程数据调用 |
| Vim/IDE 快捷键 | 快速命令执行 |
| VSCode 集成 | WhatsApp/Telegram 预警 |
| Voice 语音输入 | 精确数据输入 |
| npm 插件生态 | 统一适配器 (TS/Bun/JITI/WASM/MCP) |
| 55 个工具 | 110+ 工具 + 插件扩展 |

---

## 13. 未来扩展

### WASM 插件生态
- Extism Hub (WASM 插件市场)
- 第三方数据源 (Rust/Go 编译的 WASM)
- 量化策略 WASM 插件 (高性能计算)

### MCP 协议扩展
- Bloomberg 数据源 MCP
- 券商 API MCP
- 宏观经济数据 MCP

> **结论**: UpUp 1.0 = **投资研究 AI Agent + 统一适配器插件系统**。四种运行时 (Bun/JITI/WASM/MCP) 通过统一 Plugin API 适配，一次开发，处处运行。全面学习 OpenClaw 的 Capability Registration 模式，复用现有 Tool Registry/Hook System/MCP 协议。插件系统是 UpUp 区别于 Claude Code 的核心差异化: 支持数据源、分析工具、策略、通知渠道的全方位扩展，兼容未来 WASM 生态。