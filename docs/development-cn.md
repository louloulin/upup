# 开发指南

> UpUp 开发完全指南

## 概述

本指南涵盖 UpUp 项目的完整开发流程：

- 项目结构
- 开发环境配置
- 工具开发
- 技能开发
- 测试与调试
- 构建与部署

---

## 项目结构

```
dexter/
├── src/
│   ├── cli.ts              # 主入口 (~1500行)
│   ├── agent/              # 智能体核心
│   │   ├── agent.ts        # 智能体主循环
│   │   ├── capability-registry.ts  # 能力注册
│   │   └── tool-executor.ts       # 工具执行器
│   ├── session/            # 会话管理
│   │   ├── session-state.ts        # 状态管理
│   │   └── session-tracker.ts      # 会话追踪
│   ├── components/         # TUI 组件
│   │   ├── chat-log.ts     # 聊天历史
│   │   ├── approval.ts     # 授权 UI
│   │   └── editor.ts       # 输入编辑器
│   ├── tools/              # 工具系统 (64+)
│   │   ├── bash/           # Bash 命令执行
│   │   ├── filesystem/     # 文件操作
│   │   ├── finance/       # 金融数据
│   │   ├── search/        # 搜索工具
│   │   └── ...
│   ├── skills/             # 技能系统
│   │   ├── skill-registry.ts
│   │   └── built-in/      # 内置技能
│   ├── hooks/              # 钩子系统
│   │   ├── permission-hooks.ts
│   │   └── rate-limiter.ts
│   └── utils/              # 工具函数
├── packages/
│   └── sdk/               # Plugin SDK
├── docs/                   # 文档
├── tests/                  # 测试
└── dist/                   # 构建输出
```

---

## 开发环境

### 环境要求

- **运行时**: Bun 1.x 或 Node.js 18+
- **包管理器**: Bun (或 npm/pnpm)
- **TypeScript**: 严格模式

### 安装

```bash
# 克隆项目
git clone https://github.com/your-org/dexter.git
cd dexter

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API 密钥
```

### .env 配置

```bash
# LLM 提供商 (至少需要一个)
ANTHROPIC_API_KEY=sk-...      # Claude API
OPENAI_API_KEY=sk-...         # OpenAI API

# A股数据 (可选)
TUSHARE_TOKEN=your_token_here
```

### 开发命令

```bash
# 交互式 TUI
bun start

# 监听模式 (热重载)
bun dev

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建
bun run build
```

---

## 工具开发

### 工具结构

工具使用 LangChain 的 `DynamicStructuredTool`：

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const myTool = new DynamicStructuredTool({
  name: 'my_tool',
  description: '工具描述',
  schema: z.object({
    param1: z.string().describe('参数描述'),
    param2: z.number().optional(),
  }),
  async func({ param1, param2 }): Promise<string> {
    // 工具逻辑
    return JSON.stringify({ result: 'ok' });
  },
});
```

### 示例：金融数据工具

```typescript
// src/tools/my-stock-tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const getStockPriceTool = new DynamicStructuredTool({
  name: 'get_stock_price',
  description: '获取股票当前价格',
  schema: z.object({
    symbol: z.string().describe('股票代码，如 AAPL'),
  }),
  async func({ symbol }): Promise<string> {
    // 模拟获取价格
    const price = Math.random() * 100 + 150;
    return JSON.stringify({
      symbol,
      price: price.toFixed(2),
      currency: 'USD',
      timestamp: new Date().toISOString(),
    });
  },
});
```

### 工具注册

```typescript
// src/tools/index.ts
import { getStockPriceTool } from './my-stock-tool.ts';

export const tools = [
  getStockPriceTool,
  // ... 其他工具
];
```

### 安全检查 (Bash 工具)

Bash 工具包含多层安全检查：

```typescript
// AST 解析 - 复杂命令需要额外确认
const astResult = parseForSecurity(command);

// 危险命令检测
if (isDangerousCommand(command)) {
  return { stderr: '危险命令被阻止' };
}

// 路径验证
const pathValidation = validatePaths(command, cwd);
```

---

## 技能开发

### 技能结构

```
skills/
└── my-skill/
    ├── manifest.ts    # 技能元数据
    ├── index.ts       # 技能实现
    └── capabilities/  # 能力定义
```

### 技能清单

```typescript
// manifest.ts
export const manifest = {
  name: 'my-skill',
  version: '1.0.0',
  description: '我的自定义技能',
  tags: ['analysis', 'custom'],
  capabilities: [
    {
      name: 'analyze',
      description: '执行自定义分析',
      parameters: [
        { name: 'symbol', type: 'string', required: true },
        { name: 'period', type: 'number', default: 30 },
      ],
      output: { type: 'report' },
    },
  ],
};
```

### 技能实现

```typescript
// index.ts
export async function execute(params: Record<string, unknown>) {
  const symbol = params.symbol as string;
  const period = params.period as number;

  // 技能逻辑
  const result = await analyze(symbol, period);

  return {
    symbol,
    analysis: result,
    timestamp: Date.now(),
  };
}
```

---

## 权限系统开发

### 权限模式

```typescript
type PermissionMode =
  | 'default'           // 标准权限检查
  | '.accept-all'       // 接受所有提示
  | 'bypassPermissions' // 绕过所有权限检查
  | 'dangerously';      // 允许危险操作
```

### 权限检查流程

```typescript
// 检查工具是否需要审批
function requiresApproval(toolName: string, toolArgs: unknown): boolean {
  // 高危工具始终需要审批
  const highRiskTools = ['Bash', 'Write', 'Edit'];
  if (highRiskTools.includes(toolName)) {
    return true;
  }
  return false;
}
```

### 授权回调

```typescript
const approvalCallback = async (tool: string, args: unknown) => {
  // 显示授权对话框
  const result = await showApprovalDialog(tool, args);

  if (result === 'allow') {
    return { approved: true };
  } else if (result === 'deny') {
    return { approved: false, reason: '用户拒绝' };
  }
};
```

---

## 测试

### 运行测试

```bash
# 所有测试
bun test

# 指定文件
bun test src/tools/my-tool.test.ts

# 监听模式
bun test --watch
```

### 测试示例

```typescript
// src/tools/my-tool.test.ts
import { describe, it, expect } from 'bun:test';

describe('MyTool', () => {
  it('should return correct result', async () => {
    const result = await myTool.func({ symbol: 'AAPL' });
    const parsed = JSON.parse(result);

    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.price).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    const result = await myTool.func({ symbol: '' });
    const parsed = JSON.parse(result);

    expect(parsed.error).toBeDefined();
  });
});
```

---

## 调试

### 权限调试

```bash
# 启用权限调试日志
DEBUG=permissions bun start
```

### 会话恢复

```bash
# 从崩溃中恢复会话
./dist/upup --resume <session-id>
```

### 类型检查

```bash
# 运行 TypeScript 严格检查
bun run typecheck
```

---

## 构建

### 开发构建

```bash
# TypeScript 编译
bun run build

# 输出到 dist/
./dist/upup --help
```

### 生产构建

```bash
# 清理并重新构建
bun run clean && bun run build

# 验证构建
./dist/upup --version
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [权限系统](permission-cn.md)
- [技能系统](skills-cn.md)
- [API 参考](api-cn.md)
- [会话管理](session-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
