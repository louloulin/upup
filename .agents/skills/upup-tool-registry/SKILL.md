---
name: upup-tool-registry
description: UpUp工具注册与使用指南。用于理解可用的AI工具、如何注册新工具、工具元数据、并发安全配置。当需要添加新工具、查看工具列表、理解工具能力时触发。
---

# UpUp Tool Registry - 工具注册 Skill

## 概述

工具注册中心 (`src/tools/registry/`) 是UpUp的核心能力提供者，按域分解为多个子模块。

## 架构

```
src/tools/registry/index.ts
├── loadFinanceTools()        # 美股 + A股
├── loadFundTools()           # 基金工具
├── loadWebSearchTools()      # 搜索 + 浏览器
├── loadFilesystemTools()     # 文件系统
├── loadMCPTools()            # MCP服务器
├── loadAgentPlanningTools()  # Agent规划
├── loadQuantTools()          # 量化分析
├── loadDomainTools()         # 领域特定
├── loadDuckDBTools()         # SQL分析
└── loadInvestmentKnowledgeTools()
```

## 工具元数据

每个注册工具包含:
```typescript
interface RegisteredTool {
  name: string
  tool: StructuredToolInterface  // LangChain工具实例
  description: string           // 完整描述
  compactDescription: string   // 紧凑描述 (token优化)
  concurrencySafe: boolean     // 是否可并发执行
  metadata?: ToolMetadata
}
```

## 工具类别

### 1. Finance Tools (`finance-tools.ts`)

| Tool | Description | Concurrency |
|------|-------------|-------------|
| `get_financials` | 财务报表、指标、分析师估计 | ✓ |
| `get_market_data` | 股价、新闻、内部交易 | ✓ |
| `read_filings` | SEC文件 (10-K, 10-Q, 8-K) | ✓ |
| `stock_screener` | 财务条件筛选 | ✓ |

### 2. A-Stock Tools (`astock/`)

| Tool | Description |
|------|-------------|
| `get_astock_price` | A股实时价格 |
| `get_astock_financials` | A股财务报表 |
| `get_astock_news` | A股新闻公告 |
| `screen_astocks` | A股筛选 |
| `get_sector_data` | 行业板块数据 |
| `get_technical_data` | 技术指标 |
| `get_market_structure` | 市场结构 |

### 3. Quant Tools (`quant/`)

| Tool | Description |
|------|-------------|
| `portfolio_optimization` | 投资组合优化 |
| `options_pricing` | 期权定价 |
| `technical_indicators` | 技术指标计算 |
| `risk_metrics` | 风险指标 |
| `tax_calculator` | 税务计算 |

### 4. Search & Browser

| Tool | Description |
|------|-------------|
| `web_search` | Exa/Tavily搜索 |
| `browser` | Playwright浏览器 |
| `skill` | 技能执行 |

### 5. System Tools

| Tool | Description |
|------|-------------|
| `memory_search` | 记忆搜索 |
| `memory_update` | 记忆更新 |
| `task` | 任务管理 |
| `ask` | 请求澄清 |

## 注册新工具

### 步骤1: 创建工具文件

```typescript
// src/tools/my-domain/my-tool.ts
export const MY_TOOL_DESCRIPTION = `...`;

// 工具函数使用Zod schema
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

export const myTool = new DynamicStructuredTool({
  name: 'my_tool',
  description: MY_TOOL_DESCRIPTION,
  schema: z.object({...}),
  async func(input) {
    // 实现
  }
});
```

### 步骤2: 在域加载器中注册

```typescript
// src/tools/registry/my-domain-tools.ts
export function loadMyDomainTools(): RegisteredTool[] {
  return [{
    name: 'my_tool',
    tool: myTool,
    description: MY_TOOL_DESCRIPTION,
    compactDescription: '简短描述',
    concurrencySafe: true,
  }];
}
```

### 步骤3: 在index.ts中导出

```typescript
import { loadMyDomainTools } from './my-domain-tools.js';

export async function getToolRegistry(model: string): Promise<RegisteredTool[]> {
  return [
    // ...existing
    ...loadMyDomainTools(),
  ];
}
```

## 工具描述最佳实践

**compactDescription** (用于系统提示):
- 限制在50字以内
- 包含主要功能
- 说明批量查询支持

**description** (完整文档):
- 说明输入格式
- 提供示例输出
- 列出限制和注意事项

## 并发安全

**并发安全工具** (可并行执行):
- 只读查询
- 无副作用
- 幂等操作

**非并发工具** (需串行):
- 文件写入
- 命令执行
- 状态修改

## 工具审批

```typescript
interface AgentConfig {
  requestToolApproval?: boolean      // 请求审批
  sessionApprovedTools?: string[]   // 已批准工具
  onToolApproval?: (tool, args) => Promise<boolean>
}
```

## 工具结果存储

- 小结果直接存储
- 大结果压缩/持久化到文件
- 超过阈值的结果摘要
