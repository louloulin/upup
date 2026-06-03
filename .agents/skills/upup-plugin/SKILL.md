---
name: upup-plugin
description: UpUp插件系统。用于理解插件开发、MCP服务器集成、工具扩展。当需要添加新功能、集成外部API、创建插件时触发。
---

# UpUp Plugin - 插件系统 Skill

## 概述

UpUp支持通过插件扩展功能，包括MCP服务器集成、文件系统工具、守护进程等。

## 目录结构

```
src/plugins/
├── plugin-manager.ts    # 插件管理器
├── loader.ts            # 插件加载
├── types.ts             # 类型定义
├── registry.ts          # 插件注册表
├── [plugin-name]/      # 插件目录
└── index.ts            # 导出
```

## 插件类型

### 1. MCP Server Plugins

Model Context Protocol服务器，提供外部工具和能力。

```typescript
// src/plugins/mcp/
import { MCPServer } from '@/plugins/mcp/server';

export const myServer = new MCPServer({
  name: 'my-mcp-server',
  command: 'node',
  args: ['./mcp-server.js'],
  env: { API_KEY: process.env.MY_API_KEY }
});
```

### 2. Filesystem Plugins

文件系统操作扩展。

```typescript
// src/plugins/filesystem/
export const extendedFileTools = {
  // 额外的文件工具
  watch_directory: new DynamicStructuredTool({...}),
  compare_files: new DynamicStructuredTool({...})
};
```

### 3. Daemon Plugins

后台服务插件。

```typescript
// src/plugins/daemon/
export class MyDaemonPlugin {
  private interval: NodeJS.Timer;
  
  async start() {
    this.interval = setInterval(() => this.run(), 60000);
  }
  
  async stop() {
    clearInterval(this.interval);
  }
  
  private async run() {
    // 定期任务
  }
}
```

## 创建插件

### 1. 目录结构

```
src/plugins/my-plugin/
├── index.ts       # 主入口
├── plugin.json   # 插件配置
├── tools/        # 工具定义
└── README.md     # 文档
```

### 2. plugin.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "我的插件描述",
  "author": "作者",
  "main": "index.js",
  "tools": ["my_tool", "my_other_tool"],
  "permissions": ["filesystem:read", "network:limited"],
  "dependencies": {
    "my-package": "^1.0.0"
  }
}
```

### 3. 工具定义

```typescript
// tools/my-tool.ts
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

export const myTool = new DynamicStructuredTool({
  name: 'my_tool',
  description: '我的工具描述',
  schema: z.object({
    input: z.string().describe('输入参数')
  }),
  async func(input: { input: string }) {
    // 实现
    return `Result: ${input.input}`;
  }
});
```

### 4. 注册插件

```typescript
// index.ts
import { myTool } from './tools/my-tool';
import type { Plugin } from '../types';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  tools: [myTool],
  
  async onLoad(context) {
    // 初始化
  },
  
  async onUnload() {
    // 清理
  }
};

export default myPlugin;
```

## MCP集成

### 配置MCP服务器

```json
// .upup/config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      }
    }
  }
}
```

### MCP工具使用

```typescript
import { loadMCPTools } from '@/tools/registry/mcp-tools';

// 加载所有MCP工具
const mcpTools = await loadMCPTools();

// 使用
const result = await mcpTools[0].tool.invoke({ query: '...' });
```

## 权限系统

### 声明权限

```json
{
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:limited",
    "env:read"
  ]
}
```

### 权限检查

```typescript
import { checkPermission } from '@/permissions';

if (!checkPermission(plugin, 'filesystem:write')) {
  throw new PermissionDeniedError('filesystem:write');
}
```

## 插件管理

### 安装插件

```bash
upup plugin install my-plugin
# 或
npm install @upup/my-plugin
```

### 列出插件

```bash
upup plugin list
```

### 更新插件

```bash
upup plugin update my-plugin
```

### 卸载插件

```bash
upup plugin uninstall my-plugin
```

## 生命周期

```typescript
interface Plugin {
  name: string
  version: string
  
  // 生命周期
  onLoad?(context: PluginContext): Promise<void>
  onUnload?(): Promise<void>
  onEnable?(): Promise<void>
  onDisable?(): Promise<void>
  
  // 工具
  tools?: StructuredToolInterface[]
  
  // 事件处理
  onAgentEvent?(event: AgentEvent): void
  onToolResult?(tool: string, result: any): void
}
```

## 调试

### 日志

```typescript
import { logger } from '@/utils';

logger.info('[my-plugin] Loading...');
logger.debug('[my-plugin] Tool invoked', { input });
logger.error('[my-plugin] Error', error);
```

### 测试

```typescript
import { test, expect } from 'bun:test';

test('myTool returns correct result', async () => {
  const result = await myTool.invoke({ input: 'test' });
  expect(result).toContain('Result: test');
});
```

## 发布

```json
// package.json
{
  "name": "@upup/my-plugin",
  "version": "1.0.0",
  "upup": {
    "plugin": {
      "entry": "dist/index.js",
      "compatVersion": ">=1.0.0"
    }
  }
}
```
