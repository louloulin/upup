---
name: tool-registry
description: |
  AI Agent工具注册系统。当需要设计工具注册机制、注册新工具、配置工具元数据、实现工具并发安全、管理工具权限、构建领域特定工具集时触发。
  包括：工具发现、工具描述、并发安全、工具审批、工具结果存储。
---

# Tool Registry - 工具注册系统设计

## 核心概念

工具注册系统是Agent能力的核心，提供标准化的工具发现、注册、执行框架。

## 架构设计

```
ToolRegistry
├── Domain Loaders (按领域加载)
│   ├── Finance Tools
│   ├── Search Tools
│   ├── Filesystem Tools
│   ├── Quant Tools
│   └── Custom Tools
├── Metadata Store
│   ├── name, description
│   ├── compactDescription
│   ├── concurrencySafe
│   └── metadata
└── Tool Factory
    └── DynamicStructuredTool
```

## 工具元数据

```typescript
interface RegisteredTool {
  name: string                    // 唯一标识
  tool: StructuredToolInterface   // LangChain工具实例
  description: string            // 完整描述
  compactDescription: string      // 紧凑描述 (<50字)
  concurrencySafe: boolean        // 是否可并发
  metadata?: ToolMetadata         // 扩展元数据
}

interface ToolMetadata {
  category: ToolCategory          // 'finance' | 'search' | 'system'
  safetyLevel: ToolSafetyLevel   // 'read' | 'write' | 'critical'
  sideEffects?: ToolSideEffects   // 'none' | 'file' | 'network'
  examples?: string[]             // 使用示例
}
```

## 工具类别

### Finance Tools

| Tool | Description | Concurrency |
|------|-------------|--------------|
| `get_financials` | 财务报表、指标、分析师估计 | ✓ |
| `get_market_data` | 股价、新闻、内部交易 | ✓ |
| `read_filings` | SEC文件 (10-K, 10-Q, 8-K) | ✓ |
| `stock_screener` | 财务条件筛选 | ✓ |

### Search Tools

| Tool | Description | Concurrency |
|------|-------------|--------------|
| `web_search` | Exa/Tavily搜索 | ✓ |
| `browser` | Playwright浏览器 | ✗ |

### System Tools

| Tool | Description | Concurrency |
|------|-------------|--------------|
| `memory_search` | 记忆搜索 | ✓ |
| `memory_update` | 记忆更新 | ✗ |
| `task` | 任务管理 | ✗ |

## 注册新工具

### 1. 定义工具

```typescript
import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'

export const myTool = new DynamicStructuredTool({
  name: 'my_tool',
  description: `详细描述工具功能、输入格式、输出示例。
  
Input: 描述输入参数
Output: 描述返回结果
Examples:
  - 示例1
  - 示例2`,
  
  schema: z.object({
    param1: z.string().describe('参数1描述'),
    param2: z.number().optional().describe('参数2描述')
  }),
  
  async func(input: { param1: string; param2?: number }) {
    // 实现逻辑
    return JSON.stringify({ result: 'success', data: input })
  }
})
```

### 2. 注册工具

```typescript
// 方式1: 域加载器
export function loadDomainTools(): RegisteredTool[] {
  return [{
    name: 'my_tool',
    tool: myTool,
    description: MY_TOOL_DESCRIPTION,
    compactDescription: '简短功能描述',
    concurrencySafe: true,
    metadata: {
      category: 'custom',
      safetyLevel: 'read'
    }
  }]
}

// 方式2: 动态注册
registry.register({
  name: 'my_tool',
  tool: myTool,
  description: '...',
  concurrencySafe: true
})
```

### 3. 构建工具列表

```typescript
async function getTools(model: string): Promise<StructuredToolInterface[]> {
  const registry = await getToolRegistry(model)
  return registry
    .filter(t => t?.tool)
    .map(t => t!.tool)
}

// 按类别获取
async function getToolsByCategory(category: ToolCategory): Promise<StructuredToolInterface[]> {
  const registry = await getToolRegistry()
  return registry
    .filter(t => t.metadata?.category === category)
    .map(t => t!.tool)
}
```

## 并发安全

### 安全原则

**可并发 (✓)**:
- 只读查询
- 无副作用
- 幂等操作
- 基于API的请求

**需串行 (✗)**:
- 文件写入
- 命令执行
- 状态修改
- 独占资源操作

### 配置示例

```typescript
const concurrencyMap = new Map([
  ['get_financials', true],
  ['get_market_data', true],
  ['web_search', true],
  ['write_file', false],
  ['run_command', false],
  ['memory_update', false]
])
```

## 工具审批

```typescript
interface ApprovalConfig {
  requestApproval: boolean       // 是否请求审批
  approvedTools: string[]         // 已批准工具
  onApprovalRequest?: (tool: string, args: object) => Promise<boolean>
}

// 使用审批
async function executeWithApproval(tool: Tool, args: object, config: ApprovalConfig) {
  if (config.requestApproval && !config.approvedTools.includes(tool.name)) {
    const approved = await config.onApprovalRequest(tool.name, args)
    if (!approved) {
      throw new ToolDeniedError(`Tool ${tool.name} denied`)
    }
  }
  return tool.func(args)
}
```

## 工具描述优化

### CompactDescription (系统提示用)

限制在50字以内，包含:
1. 主要功能
2. 批量支持
3. 数据类型

```typescript
const compactDescriptions = {
  get_financials: 'Financial statements, metrics, and analyst estimates. Handles multi-company queries.',
  get_market_data: 'Stock/crypto prices, news, and insider trades. Handles multi-asset queries.',
  read_filings: 'SEC filings (10-K, 10-Q, 8-K). Extracts specific filing sections.'
}
```

### Full Description

包含完整文档:
- 功能说明
- 输入格式
- 输出示例
- 限制说明
- 错误处理

## 工具结果存储

```typescript
interface ResultStorage {
  maxInlineSize: number     // 直接存储的最大大小 (bytes)
  storageDir: string        // 大结果存储目录
}

// 存储策略
function storeResult(result: string, config: ResultStorage): string {
  if (result.length <= config.maxInlineSize) {
    return result  // 直接存储
  }
  
  // 压缩并持久化
  const path = saveToFile(result, config.storageDir)
  return buildPersistedContent(path, result.length)
}
```

## 最佳实践

### 工具设计原则

1. **单一职责**: 每个工具做一件事
2. **幂等性**: 相同输入产生相同输出
3. **明确描述**: 输入输出格式清晰
4. **错误处理**: 完善的错误信息和处理

### 描述编写

```typescript
// ❌ 不好
description: '获取数据'

// ✅ 好
description: `获取金融数据
- 支持股票代码、年度报告、多指标
- 返回JSON格式财务数据
- 示例: get_financials({ query: "AAPL revenue" })`
```

### 触发场景

- 设计工具注册系统
- 添加新工具到Agent
- 配置工具并发安全
- 实现工具审批
- 优化工具描述

---

## 真实例子

### 例子1: 创建自定义工具

```typescript
import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'

// 股票价格工具
const stockPriceTool = new DynamicStructuredTool({
  name: 'get_stock_price',
  description: `获取股票当前价格和日内数据
  - 支持单个或多个股票代码
  - 返回价格、涨跌幅、成交量等
  - 示例: AAPL, MSFT, GOOG`,
  
  schema: z.object({
    symbols: z.union([
      z.string(),
      z.array(z.string())
    ]).describe('股票代码，如"AAPL"或["AAPL", "MSFT"]'),
    includeExtended: z.boolean().optional().default(false)
  }),
  
  async func({ symbols, includeExtended }) {
    const symbolList = Array.isArray(symbols) ? symbols : [symbols]
    const results = await fetchStockPrices(symbolList, { includeExtended })
    return JSON.stringify(results)
  }
})
```

### 例子2: 工具注册中心

```typescript
class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map()
  
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`)
    }
    this.tools.set(tool.name, tool)
  }
  
  get(name: string): StructuredToolInterface | undefined {
    return this.tools.get(name)?.tool
  }
  
  getAll(): StructuredToolInterface[] {
    return Array.from(this.tools.values())
      .filter(t => t?.tool)
      .map(t => t!.tool)
  }
  
  getByCategory(category: string): StructuredToolInterface[] {
    return Array.from(this.tools.values())
      .filter(t => t?.metadata?.category === category)
      .map(t => t!.tool)
  }
}

// 使用
const registry = new ToolRegistry()

// 注册工具
registry.register({
  name: 'get_stock_price',
  tool: stockPriceTool,
  description: '...',
  compactDescription: '获取股票价格和日内数据',
  concurrencySafe: true,
  metadata: {
    category: 'finance',
    safetyLevel: 'read'
  }
})
```

### 例子3: 按类别批量加载

```typescript
// 域加载器
const financeTools = loadFinanceTools()
const searchTools = loadSearchTools()
const systemTools = loadSystemTools()

// 构建注册中心
const registry = new ToolRegistry()

financeTools.forEach(t => registry.register(t))
searchTools.forEach(t => registry.register(t))
systemTools.forEach(t => registry.register(t))

// 按类别获取
const readOnlyTools = registry.getByCategory('read')
const writeTools = registry.getByCategory('write')
```

### 例子4: 工具权限审批

```typescript
class ToolApprovalManager {
  private approved: Set<string> = new Set()
  
  async requestApproval(toolName: string, args: object): Promise<boolean> {
    if (this.approved.has(toolName)) {
      return true
    }
    
    // 交互式审批
    const confirmed = await promptUser(`
      Tool: ${toolName}
      Args: ${JSON.stringify(args)}
      Approve? (y/n)
    `)
    
    if (confirmed) {
      this.approved.add(toolName)
    }
    
    return confirmed
  }
}

// 集成到执行流程
async function executeWithApproval(tool: Tool, args: object) {
  if (requiresApproval(tool.name)) {
    const approved = await approvalManager.requestApproval(tool.name, args)
    if (!approved) {
      throw new ToolDeniedError(`${tool.name} was denied`)
    }
  }
  
  return tool.func(args)
}
```

### 例子5: 工具结果缓存

```typescript
class ToolResultCache {
  private cache: Map<string, { result: string; expiry: number }> = new Map()
  
  get(key: string): string | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return null
    }
    
    return entry.result
  }
  
  set(key: string, result: string, ttlMs: number = 300000): void {
    this.cache.set(key, {
      result,
      expiry: Date.now() + ttlMs
    })
  }
}

async function executeWithCache(tool: Tool, args: object) {
  const cacheKey = `${tool.name}:${JSON.stringify(args)}`
  
  const cached = cache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  const result = await tool.func(args)
  cache.set(cacheKey, result)
  
  return result
}
```

### 例子6: 动态工具发现

```typescript
class DynamicToolDiscovery {
  async discover(directory: string): Promise<RegisteredTool[]> {
    const files = await glob(`${directory}/**/tool.ts`)
    const tools: RegisteredTool[] = []
    
    for (const file of files) {
      const module = await import(file)
      
      // 查找导出的工具
      if (module.default) {
        tools.push(await this.createRegistration(module.default))
      }
      
      // 查找命名导出
      for (const [name, tool] of Object.entries(module)) {
        if (name !== 'default' && this.isTool(tool)) {
          tools.push(await this.createRegistration(tool))
        }
      }
    }
    
    return tools
  }
  
  private async createRegistration(tool: unknown): Promise<RegisteredTool> {
    // 自动生成compactDescription
    const compact = truncateDescription(tool.description, 50)
    
    return {
      name: tool.name,
      tool: tool as StructuredToolInterface,
      description: tool.description,
      compactDescription: compact,
      concurrencySafe: guessConcurrency(tool)
    }
  }
}
```
