# UpUp 实施改造计划 (PLAN48.md)

> 基于PLAN46 (TUI重构) + PLAN47 (问题分析) 的实施路线图
> 版本: 1.0 | 创建: 2026-05-29

---

## 📋 执行总结

### 已完成工作

| 计划 | 状态 | 验证 |
|------|------|------|
| PLAN46 (TUI重构) | ✅ 完成 | 34/34 测试通过 |
| PLAN47 (问题分析) | ✅ 完成 | 识别38个问题 |
| 单元测试修复 | ✅ 完成 | 2983/2983 通过 |

### 待实施工作

| 类别 | P0 | P1 | P2 |
|------|-----|-----|-----|
| 数量 | 3 | 10 | 10 |
| 状态 | 待实施 | 待实施 | 待实施 |

---

## 🎯 实施架构总览

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          PLAN48 实施架构                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Phase 1: 配置中心 (P0)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  src/config/                                                           │    │
│  │  ├── index.ts      - 统一配置入口 (getConfig)                         │    │
│  │  ├── schema.ts     - 配置类型定义                                     │    │
│  │  ├── env.ts        - 环境变量解析                                      │    │
│  │  ├── defaults.ts   - 默认值定义                                       │    │
│  │  └── validation.ts  - 配置验证                                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Phase 2: 命令系统重构 (P0)                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  src/commands/                                                        │    │
│  │  ├── parser.ts        - 统一命令解析器 (中文支持)                       │    │
│  │  ├── registry.ts       - 单一注册表                                     │    │
│  │  ├── executor.ts      - 安全执行器                                     │    │
│  │  ├── shell.ts         - Shell安全执行                                   │    │
│  │  ├── validator.ts     - 参数验证器                                     │    │
│  │  └── stats.ts         - 使用统计                                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Phase 3-6: 各系统优化                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Agent优化  │  Tools优化  │  Memory优化  │  Hooks优化                 │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 配置中心 (P0)

### 1.1 配置架构

```typescript
// src/config/schema.ts

export interface ConfigSchema {
  // Agent 配置
  agent: {
    maxIterations: number;
    maxOverflowRetries: number;
    overflowKeepRounds: number;
  };

  // API 配置
  api: {
    tushare: {
      baseUrl: string;
      timeout: number;
      maxRetries: number;
    };
    eastmoney: {
      baseUrls: Record<string, string>;
      timeout: number;
    };
    fund: {
      baseUrl: string;
      timeout: number;
    };
  };

  // 工具配置
  tool: {
    bash: {
      timeout: number;
      maxOutputLength: number;
    };
    fetch: {
      timeout: number;
      maxChars: number;
    };
    skill: {
      timeout: number;
    };
  };

  // 缓存配置
  cache: {
    ttl15m: number;  // 15分钟
    ttl1h: number;    // 1小时
    ttl6h: number;    // 6小时
    ttl24h: number;   // 24小时
  };

  // Memory 配置
  memory: {
    extractionInterval: number;
    maxMemoriesPerExtraction: number;
    minTurnsBetweenExtractions: number;
  };

  // Hooks 配置
  hooks: {
    memoryWarningThreshold: number;
    memoryCriticalThreshold: number;
  };

  // 业务配置
  business: {
    risk: {
      defaultAccountSize: number;
      defaultWinRate: number;
      defaultAvgWin: number;
      defaultAvgLoss: number;
      kellyCap: number;
    };
  };
}
```

### 1.2 配置加载优先级

```
环境变量 (最高)
    ↓
settings.json
    ↓
defaults.ts (最低)
```

### 1.3 实现文件

```typescript
// src/config/defaults.ts
export const DEFAULT_CONFIG: ConfigSchema = {
  agent: {
    maxIterations: 50,
    maxOverflowRetries: 2,
    overflowKeepRounds: 3,
  },
  api: {
    tushare: {
      baseUrl: 'https://api.tushare.pro',
      timeout: 10000,
      maxRetries: 2,
    },
    eastmoney: {
      baseUrls: {
        news: 'https://np-anotice-stock.eastmoney.com',
        // ...
      },
      timeout: 5000,
    },
    fund: {
      baseUrl: 'https://fundgz.1234567.com.cn',
      timeout: 10000,
    },
  },
  tool: {
    bash: {
      timeout: 30000,
      maxOutputLength: 100000,
    },
    fetch: {
      timeout: 30000,
      maxChars: 50000,
    },
    skill: {
      timeout: 60000,
    },
  },
  cache: {
    ttl15m: 15 * 60 * 1000,
    ttl1h: 60 * 60 * 1000,
    ttl6h: 6 * 60 * 60 * 1000,
    ttl24h: 24 * 60 * 60 * 1000,
  },
  memory: {
    extractionInterval: 5 * 60 * 1000,
    maxMemoriesPerExtraction: 3,
    minTurnsBetweenExtractions: 5,
  },
  hooks: {
    memoryWarningThreshold: 0.75,
    memoryCriticalThreshold: 0.9,
  },
  business: {
    risk: {
      defaultAccountSize: 100000,
      defaultWinRate: 0.55,
      defaultAvgWin: 0.05,
      defaultAvgLoss: 0.03,
      kellyCap: 0.25,
    },
  },
};
```

### 1.4 验收标准

- [ ] `getConfig()` 返回正确配置
- [ ] 环境变量覆盖生效
- [ ] `ConfigSchema` 类型安全
- [ ] 单元测试通过

---

## Phase 2: 命令系统重构 (P0)

### 2.1 问题分析

| ID | 问题 | 影响 | 修复方案 |
|----|------|------|----------|
| P0-1 | Shell执行安全风险 | 权限检查可能被绕过 | 使用spawn + 权限检查 |
| P0-2 | 三重Map不同步 | commands/skills/skillCommands不一致 | 重构为单一注册表 |
| P0-3 | 危险命令检测不完整 | 安全风险 | 完善检测规则 |

### 2.2 统一命令解析器

```typescript
// src/commands/parser.ts

export interface ParsedCommand {
  name: string;
  alias?: string;
  args: string | null;
  raw: string;
  isValid: boolean;
  error?: string;
  suggestions?: string[];
}

/**
 * 支持中文命令的正则
 * - 英文: /macro-china
 * - 中文: /茅台分析
 */
const COMMAND_PATTERN = /^\/([\w一-鿿-]+)(?:\s+(.*))?$/;

export function parseCommand(input: string): ParsedCommand {
  if (!input.trim().startsWith('/')) {
    return { name: '', args: null, raw: input, isValid: false };
  }

  const match = input.match(COMMAND_PATTERN);
  if (!match) {
    return {
      name: '',
      args: null,
      raw: input,
      isValid: false,
      error: '命令格式错误。正确格式: /命令名 [参数]',
    };
  }

  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim() || null,
    raw: input,
    isValid: true,
  };
}
```

### 2.3 单一命令注册表

```typescript
// src/commands/registry.ts

export interface CommandEntry {
  name: string;
  description: string;
  aliasOf?: string;
  triggers: string[];
  argSpec?: ValidationRule[];
  getPromptForCommand(args: string, context?: unknown): Promise<Array<{ type: 'text'; text: string }>>;
  metadata: CommandMetadata;
}

export class CommandRegistry {
  private entries: Map<string, CommandEntry> = new Map();

  register(entry: CommandEntry): void {
    // 注册主命令
    this.entries.set(entry.name, entry);

    // 注册别名 (指向主命令)
    for (const trigger of entry.triggers) {
      const aliasEntry: CommandEntry = {
        ...entry,
        name: trigger,
        aliasOf: entry.name,
      };
      this.entries.set(trigger, aliasEntry);
    }
  }

  resolve(name: string): CommandEntry | null {
    const entry = this.entries.get(name.toLowerCase());
    if (!entry) return null;
    // 别名解析到主命令
    if (entry.aliasOf) {
      return this.entries.get(entry.aliasOf) || null;
    }
    return entry;
  }
}
```

### 2.4 安全Shell执行器

```typescript
// src/commands/shell.ts

import { spawn } from 'child_process';
import { hasPermissionsToUseTool } from '../skills/permissions.js';

export async function executeShellCommand(
  command: string,
  options: { timeout?: number; cwd?: string; permissionContext?: unknown } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { timeout = 30000, cwd = process.cwd(), permissionContext } = options;

  // 权限检查
  if (permissionContext) {
    const allowed = await hasPermissionsToUseTool('bash', command, permissionContext);
    if (!allowed) {
      throw new Error(`Permission denied: ${command}`);
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      shell: true,
      cwd,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    child.on('error', reject);

    setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
}
```

### 2.5 验收标准

- [ ] `/茅台分析` 中文命令解析通过
- [ ] Shell执行超时可配置
- [ ] Shell执行权限检查工作
- [ ] 三重Map问题解决
- [ ] 单元测试通过

---

## Phase 3: Agent系统优化 (P1)

### 3.1 当前硬编码问题

| 文件 | 变量 | 当前值 |
|------|------|--------|
| `src/agent/agent.ts:34` | `DEFAULT_MAX_ITERATIONS` | 50 |
| `src/agent/agent.ts:35` | `MAX_OVERFLOW_RETRIES` | 2 |
| `src/agent/compact.ts` | `MAX_CONTEXT_TOKENS` | - |
| `src/agent/loop-recovery.ts` | 循环检测阈值 | - |

### 3.2 修复方案

```typescript
// Before: src/agent/agent.ts
const DEFAULT_MAX_ITERATIONS = 50;
const MAX_OVERFLOW_RETRIES = 2;

// After: src/agent/agent.ts
import { getConfig } from '../config/index';

const config = getConfig();
const DEFAULT_MAX_ITERATIONS = config.agent.maxIterations;
const MAX_OVERFLOW_RETRIES = config.agent.maxOverflowRetries;
```

### 3.3 验收标准

- [ ] MaxIterations可配置
- [ ] 上下文压缩阈值可配置
- [ ] 模型回退配置统一

---

## Phase 4: 工具系统优化 (P1)

### 4.1 当前硬编码问题

| 类别 | 文件 | 问题 |
|------|------|------|
| API URLs | `src/tools/astock/*.ts` | 硬编码 |
| Timeout | 6+ 文件 | 值不统一 |
| Retry | 5+ 文件 | MAX_RETRIES不一致 |
| Cache TTL | 4+ 文件 | TTL值不统一 |

### 4.2 API配置化

```typescript
// Before: src/tools/astock/tushare-client.ts
private readonly baseUrl = 'http://api.tushare.pro';

// After: src/tools/astock/tushare-client.ts
import { getConfig } from '../../config/index';
const config = getConfig();
private readonly baseUrl = config.api.tushare.baseUrl;
```

### 4.3 验收标准

- [ ] API URLs从配置读取
- [ ] Timeout值可配置
- [ ] Retry次数可配置
- [ ] Cache TTL可配置

---

## Phase 5: Memory系统优化 (P2)

### 5.1 当前硬编码问题

| 文件 | 变量 | 当前值 |
|------|------|--------|
| `src/memory/extraction.ts` | `minTurnsBetweenExtractions` | 5 |
| `src/memory/memory-manager.ts` | `maxMemoriesPerExtraction` | 3 |

### 5.2 修复方案

```typescript
// Before: src/memory/extraction.ts
const minTurnsBetweenExtractions = 5;
const maxMemoriesPerExtraction = 3;

// After: src/memory/extraction.ts
import { getConfig } from '../config/index';
const config = getConfig();
const minTurnsBetweenExtractions = config.memory.minTurnsBetweenExtractions;
const maxMemoriesPerExtraction = config.memory.maxMemoriesPerExtraction;
```

---

## Phase 6: Hooks系统优化 (P2)

### 6.1 当前硬编码问题

| 文件 | 变量 | 当前值 |
|------|------|--------|
| `src/hooks/agent-hooks.ts` | `warningThreshold` | 0.75 |
| `src/hooks/agent-hooks.ts` | `criticalThreshold` | 0.9 |

### 6.2 修复方案

```typescript
// Before: src/hooks/agent-hooks.ts
const DEFAULT_MEMORY_THRESHOLD = {
  warningThreshold: 0.75,
  criticalThreshold: 0.9,
};

// After: src/hooks/agent-hooks.ts
import { getConfig } from '../config/index';
const config = getConfig();
const DEFAULT_MEMORY_THRESHOLD = {
  warningThreshold: config.hooks.memoryWarningThreshold,
  criticalThreshold: config.hooks.memoryCriticalThreshold,
};
```

---

## Phase 7: 其他优化 (P2)

### 7.1 问题清单

| ID | 模块 | 问题 | 解决方案 |
|----|------|------|----------|
| P2-1 | Skills | 统计不持久化 | 添加持久化存储 |
| P2-2 | Session | 会话恢复逻辑简单 | 改进恢复机制 |
| P2-3 | TUI | 主题配置分散 | 统一主题系统 |

### 7.2 统计持久化

```typescript
// src/commands/stats.ts

import { readFile, writeFile } from 'fs/promises';

export class CommandStatsStore {
  private stats: Map<string, CommandStats> = new Map();

  async load(dir: string): Promise<void> {
    const content = await readFile(join(dir, '.upup/command-stats.json'), 'utf-8');
    this.stats = new Map(Object.entries(JSON.parse(content)));
  }

  async save(dir: string): Promise<void> {
    await writeFile(
      join(dir, '.upup/command-stats.json'),
      JSON.stringify(Object.fromEntries(this.stats), null, 2)
    );
  }
}
```

---

## 📅 实施时间线

```
Week 1:
├── Phase 1: 配置中心
│   ├── src/config/index.ts
│   ├── src/config/schema.ts
│   ├── src/config/defaults.ts
│   ├── src/config/env.ts
│   └── 测试
│
Week 2:
├── Phase 2: 命令系统重构
│   ├── src/commands/parser.ts
│   ├── src/commands/registry.ts
│   ├── src/commands/shell.ts
│   └── 测试
│
Week 3:
├── Phase 3: Agent系统优化
├── Phase 4: 工具系统优化
│
Week 4:
├── Phase 5: Memory系统优化
├── Phase 6: Hooks系统优化
├── Phase 7: 其他优化
│
Week 5:
├── 测试验证
├── 集成测试
└── 文档更新
```

**预计总工时**: ~40小时

---

## ✅ 验收标准清单

### Phase 1: 配置中心
- [ ] 配置入口正常工作
- [ ] 环境变量覆盖生效
- [ ] 默认值正确
- [ ] 类型安全
- [ ] 单元测试通过

### Phase 2: 命令系统
- [ ] 中文命令解析测试通过
- [ ] Shell执行超时控制工作
- [ ] Shell执行权限检查工作
- [ ] 三重Map问题解决
- [ ] `/dcf` 技能可执行
- [ ] 使用统计正确记录

### Phase 3: Agent系统
- [ ] MaxIterations可配置
- [ ] 上下文压缩阈值可配置
- [ ] 模型回退配置统一

### Phase 4: 工具系统
- [ ] API URLs从配置读取
- [ ] Timeout值可配置
- [ ] Retry次数可配置
- [ ] Cache TTL可配置

### Phase 5-7: 其他系统
- [ ] Memory阈值可配置
- [ ] 权限配置可管理
- [ ] 会话恢复机制改进
- [ ] 统计持久化

### 全面验收
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] Skills执行测试100%通过
- [ ] 连续对话测试通过
- [ ] AppScript验证通过

---

## 📝 问题追踪表

### P0 - 阻塞性问题

| ID | 模块 | 问题 | 状态 | 负责人 |
|----|------|------|------|--------|
| P0-1 | Skills | Shell执行安全风险 | 待修复 | - |
| P0-2 | Skills | 三重Map不同步 | 待修复 | - |
| P0-3 | Skills | 危险命令检测不完整 | 待修复 | - |

### P1 - 高优先级问题

| ID | 模块 | 问题 | 状态 | 负责人 |
|----|------|------|------|--------|
| P1-1 | Skills | 中文命令不支持 | 待修复 | - |
| P1-2 | Skills | Shell超时硬编码 | 待修复 | - |
| P1-3 | Skills | `/dcf` 技能缺失 | 待修复 | - |
| P1-4 | Tools | API URLs硬编码 | 待修复 | - |
| P1-5 | Tools | Timeout值分散 | 待修复 | - |
| P1-6 | Agent | MAX_ITERATIONS硬编码 | 待修复 | - |
| P1-7 | Model | API Key加载逻辑重复 | 待修复 | - |

### P2 - 中优先级问题

| ID | 模块 | 问题 | 状态 | 负责人 |
|----|------|------|------|--------|
| P2-1 | Skills | 统计不持久化 | 待修复 | - |
| P2-2 | Tools | Cache TTL不统一 | 待修复 | - |
| P2-3 | Tools | Retry次数不一致 | 待修复 | - |
| P2-4 | Agent | 循环检测算法简单 | 待改进 | - |
| P2-5 | Memory | 提取间隔硬编码 | 待配置化 | - |
| P2-6 | Hooks | 内存阈值硬编码 | 待配置化 | - |
| P2-7 | Session | 会话恢复逻辑简单 | 待改进 | - |
| P2-8 | TUI | 主题配置分散 | 待统一 | - |
| P2-9 | Permissions | 权限日志缺失 | 待添加 | - |
| P2-10 | Model | 模型配置分散 | 待统一 | - |

---

## 参考文档

- `PLAN46.md` - TUI重构计划 (已完成)
- `PLAN47.md` - 核心功能分析报告 (已完成)
- `src/agent/agent.ts` - Agent核心逻辑
- `src/skills/slash-command.ts` - 命令系统
- `src/config/` - 配置模块 (待创建)
- `src/commands/` - 命令模块 (待创建)

---

## 附录A: 环境变量清单

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `AGENT_MAX_ITERATIONS` | number | 50 | Agent最大迭代 |
| `AGENT_OVERFLOW_RETRIES` | number | 2 | 溢出重试次数 |
| `TUSHARE_BASE_URL` | string | https://api.tushare.pro | Tushare API URL |
| `TUSHARE_TIMEOUT_MS` | number | 10000 | Tushare超时 |
| `BASH_TIMEOUT_MS` | number | 30000 | Bash超时 |
| `CACHE_TTL_15M` | number | 900000 | 15分钟缓存 |
| `CACHE_TTL_1H` | number | 3600000 | 1小时缓存 |
| `MEMORY_EXTRACTION_INTERVAL` | number | 300000 | 记忆提取间隔 |
| `MEMORY_WARNING_THRESHOLD` | number | 0.75 | 内存警告阈值 |
| `MEMORY_CRITICAL_THRESHOLD` | number | 0.9 | 内存严重阈值 |

---

*文档版本: 1.0*
*创建时间: 2026-05-29*
*状态: 实施准备阶段*
*参考: PLAN46.md (TUI重构完成), PLAN47.md (问题分析完成)*
