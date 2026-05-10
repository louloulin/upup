# UpUp 1.1 — 模块化改造路线图

> 创建日期: 2026-05-10 | 状态: 规划中
> 目标: 将单仓库拆分为 Bun workspace 多包结构
> 参考: OpenClaw 插件设计 + Bun workspace 最佳实践

---

## 0. 背景与动机

### 为什么需要模块化？

| 问题 | 当前状态 | 模块化后 |
|------|---------|---------|
| **插件不可独立发布** | 插件与主应用耦合 | `@upup/plugin-core` 可单独发布 |
| **依赖管理混乱** | 173 tools 共享 dependencies | 每个包管理自己的依赖 |
| **代码边界模糊** | tools/plugins 相互引用 | 清晰的包边界 + 导出接口 |
| **测试困难** | 全量测试 1903 个 | 按包隔离测试 |
| **插件生态** | 无法第三方插件 | workspace 支持外部插件包 |

### OpenClaw 的模块化设计

OpenClaw 采用：
- `packages/core` - 核心运行时
- `packages/plugin-api` - 插件 API
- `packages/adapters/*` - 运行时适配器
- `plugins/*` - 官方插件

---

## 1. 当前代码结构分析

### 1.1 当前目录结构

```
src/
├── index.tsx              # 入口点
├── cli.ts                 # CLI 主逻辑
├── providers.ts           # LLM provider
├── theme.ts               # TUI 主题
├── types.ts               # 全局类型
│
├── agent/                 # Agent 核心 (约 20 文件)
├── commands/              # 命令系统 (约 15 文件)
├── components/            # TUI 组件 (约 15 文件)
├── controllers/            # 控制器 (约 5 文件)
├── cron/                  # 定时任务 (约 3 文件)
├── daemon/                # 守护进程 (约 5 文件)
├── gateway/               # WhatsApp 网关 (约 10 文件)
├── hooks/                 # 钩子系统 (约 5 文件)
├── keybindings/           # 键绑定 (约 3 文件)
├── memory/                # 记忆系统 (约 15 文件)
├── mcp/                   # MCP 客户端 (约 10 文件)
├── model/                 # 模型层 (约 5 文件)
├── permissions/          # 权限系统 (约 5 文件)
├── plan/                  # 计划模式 (约 5 文件)
├── proactive/            # 主动模式 (约 5 文件)
├── skills/                # 技能系统 (约 3 文件)
├── state/                 # 状态管理 (约 3 文件)
├── subagent/              # 子代理 (约 5 文件)
│
├── tools/                 # 工具系统 (核心，约 50 文件)
│   ├── registry/          # 工具注册
│   ├── finance/            # 金融工具 (FMP)
│   ├── astock/            # A股工具 (Tushare)
│   ├── quant/             # 量化工具
│   ├── portfolio/         # 组合工具
│   ├── bash/              # Bash 执行
│   ├── filesystem/        # 文件系统
│   └── ... (30+ 子目录)
│
├── plugins/               # 插件系统 (约 15 文件)
│   ├── adapters/          # 运行时适配器
│   ├── data/              # 数据源插件 (DuckDB)
│   └── *.ts
│
├── evals/                 # 评估系统 (约 5 文件)
└── types/                 # 类型定义 (约 10 文件)
```

### 1.2 模块边界分析

| 模块 | 文件数 | 依赖关系 | 独立性 | 建议拆分 |
|------|--------|----------|--------|----------|
| **plugins** | 15 | tools, utils | 高 | ✅ 独立包 |
| **tools** | 80+ | 分散 | 低 | ⚠️ 按领域拆分 |
| **agent** | 20 | tools, memory, hooks | 中 | ❌ 保留核心 |
| **memory** | 15 | storage | 高 | ⚠️ 可拆分 |
| **mcp** | 10 | network | 中 | ❌ 保留 |
| **hooks** | 5 | agent | 中 | ❌ 保留 |

---

## 2. Bun Workspace 架构

### 2.1 目标包结构

```
upup/
├── package.json              # workspace 根配置
├── bun.lock
├── tsconfig.json             # 根级 TypeScript 配置
│
├── packages/
│   ├── core/                 # @upup/core - 核心运行时
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts      # 导出核心 API
│   │       ├── cli.ts        # CLI 入口
│   │       ├── agent/         # Agent 核心
│   │       ├── commands/      # 命令系统
│   │       ├── components/    # TUI 组件
│   │       ├── controllers/   # 控制器
│   │       ├── types/         # 全局类型
│   │       └── theme/         # 主题系统
│   │
│   ├── plugins/              # @upup/plugins - 插件系统
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts        # 导出
│   │   │   ├── loader.ts      # 插件加载器
│   │   │   ├── registry.ts     # 插件注册表
│   │   │   ├── discovery.ts    # 插件发现
│   │   │   ├── manifest.ts     # Manifest 验证
│   │   │   ├── services.ts     # 服务生命周期
│   │   │   ├── locator.ts      # 服务定位器
│   │   │   ├── path-safety.ts  # 路径安全
│   │   │   ├── types.ts        # 插件类型
│   │   │   └── adapters/
│   │   │       ├── index.ts
│   │   │       ├── bun.ts      # Bun 适配器
│   │   │       ├── jiti.ts     # JITI 适配器
│   │   │       ├── wasm.ts     # WASM 适配器
│   │   │       └── mcp.ts      # MCP 适配器
│   │   └── test/
│   │
│   ├── tools/                 # @upup/tools - 工具系统
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── registry/
│   │       ├── finance/
│   │       ├── astock/
│   │       ├── quant/
│   │       └── ...
│   │
│   ├── duckdb/               # @upup/duckdb - DuckDB 插件
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── plugin.ts      # DuckDBPlugin
│   │       └── service.ts     # DuckDBService
│   │
│   ├── memory/               # @upup/memory - 记忆系统
│   │   └── ...
│   │
│   └── mcp/                  # @upup/mcp - MCP 客户端
│       └── ...
│
├── plugins/                   # 官方插件（workspace 外）
│   ├── duckdb/               # @upup/plugin-duckdb
│   ├── finance/              # @upup/plugin-finance
│   └── quant/                # @upup/plugin-quant
│
└── apps/
    └── cli/                  # 主应用
        ├── package.json
        └── src/
            └── index.tsx
```

### 2.2 根 package.json (Workspace 配置)

```json
{
  "name": "upup",
  "version": "2026.05.10",
  "private": true,
  "workspaces": [
    "packages/*",
    "plugins/*",
    "apps/*"
  ],
  "scripts": {
    "dev": "bun --filter @upup/cli run dev",
    "test": "bun test",
    "typecheck": "bun --filter '*' run typecheck",
    "build": "bun run --filter '*' run build"
  }
}
```

### 2.3 子包 package.json 示例

```json
// packages/plugins/package.json
{
  "name": "@upup/plugins",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./adapters": "./src/adapters/index.ts",
    "./types": "./src/types.ts"
  },
  "dependencies": {
    "@upup/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

---

## 3. 模块拆分策略

### 3.1 Phase 1: 插件系统独立化 (优先级: 高)

**目标**: 将 `src/plugins` 拆分为独立包 `@upup/plugins`

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/plugins/index.ts` | MOVE → `packages/plugins/src/index.ts` | 导出 |
| `src/plugins/loader.ts` | MOVE → `packages/plugins/src/loader.ts` | 插件加载器 |
| `src/plugins/registry.ts` | MOVE → `packages/plugins/src/registry.ts` | 注册表 |
| `src/plugins/discovery.ts` | MOVE → `packages/plugins/src/discovery.ts` | 发现 |
| `src/plugins/adapters/*` | MOVE → `packages/plugins/src/adapters/*` | 适配器 |
| `src/plugins/data/*` | MOVE → `packages/plugins/data/` | 数据源 |

**依赖清理**:
- 删除对 `src/tools/registry` 的直接引用
- 通过 `@upup/tools` 的导出接口使用工具

### 3.2 Phase 2: DuckDB 插件独立化 (优先级: 高)

**目标**: 将 DuckDB 拆分为独立插件包 `@upup/plugin-duckdb`

```
plugins/duckdb/
├── package.json
├── upup.plugin.json      # 插件清单
├── src/
│   ├── index.ts          # 入口
│   ├── plugin.ts         # DuckDBPlugin
│   └── service.ts        # DuckDBService
└── test/
    └── duckdb.test.ts
```

**插件清单示例** (`upup.plugin.json`):
```json
{
  "id": "duckdb-analytics",
  "name": "DuckDB Analytics",
  "version": "1.0.0",
  "runtime": "bun",
  "description": "In-process SQL analytics for investment data",
  "capabilities": ["data-source", "analytics"],
  "tools": [
    "duckdb-query",
    "duckdb-timeseries",
    "duckdb-portfolio-analysis",
    "duckdb-register-parquet",
    "duckdb-import-csv",
    "duckdb-list-tables"
  ],
  "dependencies": {
    "@duckdb/duckdb-wasm": "^1.33.0"
  }
}
```

### 3.3 Phase 3: 工具系统模块化 (优先级: 中)

**目标**: 按领域拆分工具系统

```
packages/tools/
├── package.json
├── finance/               # @upup/tools-finance
├── astock/               # @upup/tools-astock
├── quant/                # @upup/tools-quant
├── registry/             # 工具注册核心
└── index.ts
```

### 3.4 Phase 4: 核心应用精简 (优先级: 低)

**目标**: `apps/cli` 只包含启动逻辑，实际功能由包提供

---

## 4. 接口设计

### 4.1 插件 ↔ 核心 接口

```typescript
// @upup/plugins/src/types.ts

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  runtime: 'bun' | 'jiti' | 'wasm' | 'mcp';
  description?: string;
  capabilities: Capability[];
  tools?: string[];
  hooks?: string[];
  services?: string[];
  configSchema?: object;
}

export type Capability =
  | 'tool' | 'hook' | 'channel' | 'command' | 'service' | 'data-source';

export interface PluginAdapter {
  readonly runtime: string;
  canLoad(manifest: PluginManifest): boolean;
  load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin>;
  unload(plugin: LoadedPlugin): Promise<void>;
}

export interface UpUpPluginApi {
  id: string;
  name: string;
  version: string;
  runtime: string;
  registerTool(tool: AgentTool): void;
  registerHook(hook: HookHandler): void;
  registerService(service: PluginService): void;
  // ... 其他注册方法
}
```

### 4.2 工具注册接口

```typescript
// @upup/tools/src/registry/types.ts

export interface ToolRegistry {
  register(tool: RegisteredTool): void;
  get(name: string): RegisteredTool | undefined;
  list(): RegisteredTool[];
  listByCategory(category: ToolCategory): RegisteredTool[];
}

export interface RegisteredTool {
  name: string;
  tool: StructuredToolInterface;
  safetyLevel: ToolSafetyLevel;
  category: ToolCategory;
  concurrencySafe: boolean;
  compactDescription: string;
}
```

### 4.3 服务定位器

```typescript
// @upup/plugins/src/locator.ts

export interface ServiceLocator {
  getService<T>(name: string): T;
  registerService<T>(name: string, service: T): void;
  hasService(name: string): boolean;
  listServices(): string[];
}
```

---

## 5. 迁移步骤

### 5.1 第一步: 创建 Workspace 结构

```bash
# 创建目录结构
mkdir -p packages/{core,plugins,tools,duckdb,memory}
mkdir -p plugins/duckdb
mkdir -p apps/cli

# 初始化根 package.json
cat > package.json << 'EOF'
{
  "name": "upup",
  "private": true,
  "workspaces": ["packages/*", "plugins/*", "apps/*"],
  "scripts": {
    "dev": "bun --filter @upup/cli run dev",
    "test": "bun test"
  }
}
EOF
```

### 5.2 第二步: 拆分 plugins 包

```bash
# 创建 packages/plugins
cd packages/plugins
cat > package.json << 'EOF'
{
  "name": "@upup/plugins",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts"
}
EOF

# 移动文件
mv ../../src/plugins/* src/
```

### 5.3 第三步: 更新依赖关系

```bash
# 在 core 包中引用 plugins
cd packages/core
bun add @upup/plugins@workspace:*
```

### 5.4 第四步: 验证构建

```bash
bun run typecheck
bun test
```

---

## 6. 测试策略

### 6.1 包级别测试

| 包 | 测试文件 | 说明 |
|---|---------|------|
| `@upup/plugins` | `*.test.ts` | 插件加载、适配器 |
| `@upup/duckdb` | `*.test.ts` | DuckDB 查询 |
| `@upup/tools` | `*.test.ts` | 工具注册 |

### 6.2 集成测试

```bash
# 测试插件系统
bun test packages/plugins

# 测试 DuckDB 工具
bun test packages/duckdb

# 全量测试
bun test
```

---

## 7. 发布策略

### 7.1 包版本管理

| 包 | 当前版本 | 发布策略 |
|---|---------|---------|
| `@upup/core` | 1.0.0 | 稳定发布 |
| `@upup/plugins` | 0.1.0 | Alpha |
| `@upup/duckdb` | 0.1.0 | Alpha |
| `@upup/tools` | 0.1.0 | Alpha |

### 7.2 独立发布命令

```bash
# 发布单个包
bun publish packages/plugins --access public

# 发布所有包
bun publish packages/* --access public
```

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 循环依赖 | 包无法构建 | 使用 `workspace:*` 依赖，明确接口边界 |
| 路径引用破坏 | 导入失败 | 使用包导出而非相对路径 |
| 版本不一致 | 运行时错误 | Lockfile 管理 + CI 检查 |
| 迁移周期长 | 业务中断 | 渐进式迁移，保留兼容性层 |

---

## 9. 时间线预估

| Phase | 工作 | 预估时间 | 优先级 |
|-------|------|---------|--------|
| 1 | Workspace 结构搭建 | 2h | 高 |
| 2 | @upup/plugins 包拆分 | 4h | 高 |
| 3 | @upup/plugin-duckdb 独立发布 | 2h | 高 |
| 4 | @upup/tools 模块化 | 8h | 中 |
| 5 | @upup/core 精简 | 4h | 低 |
| **总计** | | **20h** | |

---

## 10. 验收标准

- [ ] Bun workspace 配置完成
- [ ] `@upup/plugins` 可独立导入
- [ ] `@upup/plugin-duckdb` 可独立发布
- [ ] 所有包通过 TypeScript 检查
- [ ] 所有包测试通过
- [ ] 现有 1903 测试不破坏
- [ ] CLI 启动正常 (`bun run dev`)
- [ ] DuckDB 工具仍可调用

---

## 附录: 参考资料

- [Bun Workspace 文档](https://bun.sh/docs/workspaces)
- [OpenClaw 插件设计](https://github.com/openclaw/ocloud)
- [npm workspaces 对比](https://docs.npmjs.com/cli/v9/using-npm/workspaces)