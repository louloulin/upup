# 命令系统核心功能分析 (PLAN47-CMD.md)

> 命令系统核心功能分析、问题识别与改造计划
> 版本: 1.0 | 创建: 2026-05-29

---

## 📋 概述

### 命令系统架构

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          命令系统架构                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  用户输入                                                                        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    SlashCommandParser                                   │        │
│  │  • parseSlashCommand() - 解析 /skill-name args 格式                     │        │
│  │  • isSlashCommand() - 检查是否是斜杠命令                                  │        │
│  │  • getSkillName() - 提取技能名称                                       │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    SkillCommandRegistry                                 │        │
│  │  • commands Map - 轻量级元数据 (自动补全)                                │        │
│  │  • skills Map - 技能元数据                                               │        │
│  │  • skillCommands Map - 可执行命令 (getPromptForCommand)                  │        │
│  │  • searchSkillsFuzzy() - 模糊搜索                                       │        │
│  │  • getSkillsByTrigger() - 触发词匹配                                    │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    SkillCommand                                        │        │
│  │  • name - 命令名称                                                      │        │
│  │  • description - 命令描述                                                │        │
│  │  • getPromptForCommand() - 核心执行方法                                 │        │
│  │  • arguments - 参数处理                                                │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    SkillExecutor                                        │        │
│  │  • executeSkillCommand() - 命令执行                                     │        │
│  │  • autoExecuteSkillCommands() - 自动执行                                │        │
│  │  • contextMatchesArgs() - 上下文匹配                                     │        │
│  │  • Hook 系统 - pre/post 钩子                                            │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 核心模块分析

### 1. SlashCommandParser (src/skills/slash-command.ts)

#### 功能
- 解析斜杠命令格式 `/skill-name args`
- 提取技能名称和参数
- 命令路由

#### 当前实现
```typescript
export function parseSlashCommand(input: string): SkillCommand | null {
  const match = input.match(/^\/([\w-]+)(?:\s+(.*))?$/);
  if (!match) return null;
  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim(),
    raw: input,
  };
}
```

#### 问题识别

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 不支持中文命令名 | P1 | 只匹配 `[\w-]+`，中文被忽略 |
| 不支持别名解析 | P2 | 别名需要手动处理 |
| 错误信息不友好 | P2 | 返回 `null` 而不是具体错误 |

---

### 2. SkillCommandRegistry (src/skills/slash-command.ts)

#### 功能
- 统一注册表管理
- 三层 Map 结构
- 模糊搜索支持
- 触发词匹配

#### 当前实现
```typescript
class SkillCommandRegistry {
  private commands: Map<string, SkillCommandRegistration> = new Map();
  private skills: Map<string, SkillMetadata> = new Map();
  private skillCommands: Map<string, SkillCommand> = new Map();
}
```

#### 问题识别

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 双注册问题 | P0 | commands 和 skillCommands 可能不同步 |
| 别名注册重复 | P1 | 同一技能注册多次 |
| 搜索索引懒加载 | P2 | 首次搜索慢 |

---

### 3. SkillCommand (src/skills/types.ts)

#### 功能
- 命令元数据
- getPromptForCommand() 核心方法
- 参数替换

#### 当前实现
```typescript
export interface SkillCommand {
  type: 'prompt';
  name: string;
  description: string;
  contentLength: number;
  getPromptForCommand(args: string, context?: unknown): Promise<Array<{ type: 'text'; text: string }>>;
}
```

#### 问题识别

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 类型定义冗余 | P1 | 与 SkillMetadata 大量重复字段 |
| getPromptForCommand 返回类型复杂 | P2 | Promise 嵌套难处理 |
| 缺少执行统计 | P2 | 无法追踪命令使用频率 |

---

### 4. SkillExecutor (src/skills/executor.ts)

#### 功能
- 命令执行引擎
- Shell 命令自动执行
- Hook 系统

#### 当前实现
```typescript
export async function executeSkillCommand(
  commandName: string,
  args: string,
  context?: unknown
): Promise<SkillCommandResult | null> {
  const skillCmd = registry.getSkillCommand(commandName);
  if (!skillCmd) return null;
  const content = await skillCmd.getPromptForCommand(args, context);
  // ...
}
```

#### 问题识别

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 错误处理不完善 | P1 | 异常被静默吞掉 |
| 缺少执行超时 | P1 | 长时间运行命令无法取消 |
| Shell 执行安全 | P0 | 权限检查依赖全局状态 |

---

## 📊 问题清单

### P0 - 阻塞性问题

| ID | 问题 | 文件 | 影响 | 解决方案 |
|----|------|------|------|----------|
| P0-1 | Shell 执行安全风险 | `executor.ts` | 权限检查可能被绕过 | 强化权限上下文传递 |
| P0-2 | 双注册表不同步 | `slash-command.ts` | commands 和 skillCommands 不一致 | 合并为单一注册表 |
| P0-3 | 别名覆盖原始命令 | `slash-command.ts` | 触发词相同时行为不可预测 | 按优先级处理 |

### P1 - 高优先级问题

| ID | 问题 | 文件 | 影响 |
|----|------|------|------|
| P1-1 | 中文命令支持缺失 | `parseSlashCommand` | 中文斜杠命令无法解析 |
| P1-2 | 错误信息不友好 | `executor.ts` | 调试困难 |
| P1-3 | 类型定义冗余 | `types.ts` | 维护困难 |
| P1-4 | 搜索索引懒加载 | `SkillCommandRegistry` | 首次搜索慢 |
| P1-5 | 缺少执行超时 | `executeSkillCommand` | 长时间命令无法控制 |

### P2 - 中优先级问题

| ID | 问题 | 文件 | 影响 |
|----|------|------|------|
| P2-1 | 缺少使用统计 | `commands.ts` | 无法优化命令布局 |
| P2-2 | 参数验证缺失 | `getPromptForCommand` | 传入无效参数时行为不确定 |
| P2-3 | 缺少命令帮助 | `SkillCommand` | 用户不知道如何使用命令 |

---

## 🎯 改造目标

### 目标架构

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          改造后命令系统架构                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  用户输入                                                                        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    UnifiedCommandParser                                  │        │
│  │  • 支持中文命令名 (/茅台分析)                                           │        │
│  │  • 支持别名解析                                                         │        │
│  │  • 友好的错误信息                                                       │        │
│  │  • 参数验证                                                            │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    SingleRegistry (单一注册表)                          │        │
│  │  • CommandEntry 统一结构                                               │        │
│  │  • 别名指向主命令                                                       │        │
│  │  • 搜索索引预构建                                                      │        │
│  │  • 使用统计                                                            │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    CommandExecutor                                      │        │
│  │  • 超时控制                                                            │        │
│  │  • 错误边界                                                            │        │
│  │  • 执行统计                                                            │        │
│  │  • 安全的 Shell 执行                                                   │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 核心改进

1. **单一注册表** - 消除双注册问题
2. **中文命令支持** - 扩展正则表达式
3. **超时控制** - 防止长时间命令
4. **友好错误** - 提供可操作的错误信息
5. **使用统计** - 追踪命令使用频率

---

## 📁 文件变更计划

### 新增文件

| 文件 | 功能 | 优先级 |
|------|------|--------|
| `src/commands/parser.ts` | 统一命令解析器 | P0 |
| `src/commands/registry.ts` | 单一命令注册表 | P0 |
| `src/commands/executor.ts` | 命令执行器 | P0 |
| `src/commands/types.ts` | 类型定义 | P0 |
| `src/commands/validator.ts` | 参数验证 | P1 |
| `src/commands/stats.ts` | 使用统计 | P2 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/skills/slash-command.ts` | 重构为使用新解析器 |
| `src/skills/types.ts` | 简化类型定义 |
| `src/skills/executor.ts` | 迁移到新执行器 |
| `src/skills/commands.ts` | 使用新注册表 |
| `src/skills/index.ts` | 统一导出 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `src/skills/cli-commands.ts` | 整合到新命令系统 |

---

## 🧪 实施计划

### Phase 1: 统一命令解析器 (P0)

#### 1.1 新解析器实现

```typescript
// src/commands/parser.ts

export interface ParsedCommand {
  name: string;           // 主命令名
  alias?: string;          // 别名来源
  args: string | null;     // 参数
  raw: string;             // 原始输入
  isValid: boolean;        // 是否有效
  error?: string;          // 错误信息
}

/**
 * 统一命令解析器
 * 支持:
 * - 中文命令名: /茅台分析
 * - 英文命令名: /k8s-research
 * - 别名: /r → /research
 * - 参数: /compare 茅台 五粮液
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  
  // 检查是否是命令
  if (!trimmed.startsWith('/')) {
    return { name: '', args: null, raw: input, isValid: false };
  }
  
  // 匹配命令格式: /command-name[ alias] args
  const match = trimmed.match(/^\/([一-龥\w-]+)(?:\s+(.*))?$/);
  
  if (!match) {
    return {
      name: '',
      args: null,
      raw: input,
      isValid: false,
      error: '命令格式错误。正确格式: /命令名 [参数]'
    };
  }
  
  const name = match[1].toLowerCase();
  const args = match[2]?.trim() || null;
  
  return {
    name,
    args,
    raw: input,
    isValid: true,
  };
}

/**
 * 别名解析
 */
export function resolveAlias(name: string, registry: CommandRegistry): string | null {
  const entry = registry.get(name);
  if (!entry) return null;
  
  // 如果是别名，返回主命令名
  if (entry.aliasOf) {
    return entry.aliasOf;
  }
  
  return entry.name;
}
```

#### 1.2 参数验证器

```typescript
// src/commands/validator.ts

export interface ValidationRule {
  type: 'required' | 'pattern' | 'enum' | 'range';
  message: string;
  value?: string | string[] | number[];
}

export interface CommandSpec {
  name: string;
  args?: ValidationRule[];
}

/**
 * 验证命令参数
 */
export function validateArgs(spec: CommandSpec, args: string | null): ValidationResult {
  const errors: string[] = [];
  
  for (const rule of spec.args || []) {
    if (rule.type === 'required' && !args) {
      errors.push(rule.message);
    }
    
    if (rule.type === 'pattern' && args) {
      const regex = new RegExp(rule.value as string);
      if (!regex.test(args)) {
        errors.push(rule.message);
      }
    }
    
    if (rule.type === 'enum' && args) {
      const allowed = rule.value as string[];
      if (!allowed.includes(args)) {
        errors.push(rule.message);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Phase 2: 单一命令注册表 (P0)

#### 2.1 统一注册表实现

```typescript
// src/commands/registry.ts

export interface CommandEntry {
  name: string;              // 主命令名
  description: string;         // 描述
  aliasOf?: string;           // 别名指向的主命令
  triggers: string[];          // 触发词
  argsSpec?: ValidationRule[]; // 参数规格
  getPromptForCommand(args: string, context?: unknown): Promise<Array<{ type: 'text'; text: string }>>;
  metadata: {
    source: 'builtin' | 'user' | 'project';
    userInvocable: boolean;
    model?: string;
  };
}

export class CommandRegistry {
  private entries: Map<string, CommandEntry> = new Map();
  private searchIndex: Fuse<CommandEntry> | null = null;
  private stats: Map<string, { count: number; lastUsed: number }> = new Map();
  
  register(entry: CommandEntry): void {
    // 注册主命令
    this.entries.set(entry.name, entry);
    
    // 注册别名
    for (const trigger of entry.triggers) {
      const aliasEntry: CommandEntry = {
        ...entry,
        name: trigger,
        aliasOf: entry.name,
      };
      this.entries.set(trigger, aliasEntry);
    }
    
    // 重建搜索索引
    this.rebuildSearchIndex();
  }
  
  resolve(name: string): CommandEntry | null {
    const entry = this.entries.get(name.toLowerCase());
    if (!entry) return null;
    
    // 如果是别名，递归解析到主命令
    if (entry.aliasOf) {
      return this.entries.get(entry.aliasOf) || null;
    }
    
    return entry;
  }
  
  recordUsage(name: string): void {
    const entry = this.entries.get(name.toLowerCase());
    if (!entry) return;
    
    // 统计主命令
    const mainName = entry.aliasOf || entry.name;
    const stats = this.stats.get(mainName) || { count: 0, lastUsed: 0 };
    stats.count++;
    stats.lastUsed = Date.now();
    this.stats.set(mainName, stats);
  }
  
  getTopCommands(limit: number = 10): Array<{ name: string; count: number }> {
    return Array.from(this.stats.entries())
      .map(([name, stats]) => ({ name, count: stats.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
```

### Phase 3: 命令执行器 (P0)

#### 3.1 执行器实现

```typescript
// src/commands/executor.ts

export interface ExecutionOptions {
  timeout?: number;           // 超时 (ms)
  signal?: AbortSignal;       // 取消信号
  onProgress?: (msg: string) => void;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  timedOut?: boolean;
}

/**
 * 命令执行器
 */
export class CommandExecutor {
  private registry: CommandRegistry;
  private defaultTimeout = 60_000; // 60s
  
  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }
  
  async execute(
    input: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const start = Date.now();
    const timeout = options.timeout || this.defaultTimeout;
    
    // 解析命令
    const parsed = parseCommand(input);
    if (!parsed.isValid) {
      return {
        success: false,
        error: parsed.error || '无效的命令格式',
        duration: Date.now() - start,
      };
    }
    
    // 解析别名
    const mainName = resolveAlias(parsed.name, this.registry);
    if (!mainName) {
      return {
        success: false,
        error: `未知命令: ${parsed.name}`,
        duration: Date.now() - start,
      };
    }
    
    // 获取命令
    const entry = this.registry.resolve(parsed.name);
    if (!entry) {
      return {
        success: false,
        error: `命令未注册: ${parsed.name}`,
        duration: Date.now() - start,
      };
    }
    
    // 记录使用
    this.registry.recordUsage(parsed.name);
    
    // 验证参数
    if (entry.argsSpec) {
      const validation = validateArgs({ name: entry.name, args: entry.argsSpec }, parsed.args);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('; '),
          duration: Date.now() - start,
        };
      }
    }
    
    // 执行命令 (带超时)
    try {
      const result = await Promise.race([
        entry.getPromptForCommand(parsed.args || '', { cwd: options.signal?.aborted }),
        this.timeout(timeout, parsed.name),
      ]);
      
      return {
        success: true,
        output: result.map(r => r.text).join('\n\n'),
        duration: Date.now() - start,
      };
    } catch (error) {
      if (error instanceof TimeoutError) {
        return {
          success: false,
          error: `命令执行超时 (${timeout}ms)`,
          duration: Date.now() - start,
          timedOut: true,
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      };
    }
  }
  
  private timeout(ms: number, commandName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new TimeoutError(commandName)), ms);
    });
  }
}

class TimeoutError extends Error {
  constructor(command: string) {
    super(`Command '${command}' timed out`);
    this.name = 'TimeoutError';
  }
}
```

### Phase 4: 统计系统 (P2)

```typescript
// src/commands/stats.ts

export interface CommandStats {
  name: string;
  count: number;
  lastUsed: number;
  avgDuration?: number;
}

export interface CommandStatsReport {
  totalCommands: number;
  topCommands: CommandStats[];
  leastUsedCommands: CommandStats[];
  recentActivity: CommandStats[];
}

/**
 * 获取命令统计报告
 */
export function getCommandStatsReport(registry: CommandRegistry): CommandStatsReport {
  const allStats = registry.getAllStats();
  
  return {
    totalCommands: allStats.length,
    topCommands: allStats.slice(0, 10),
    leastUsedCommands: allStats.slice(-5),
    recentActivity: allStats
      .filter(s => Date.now() - s.lastUsed < 7 * 24 * 60 * 60 * 1000)
      .slice(0, 10),
  };
}
```

---

## 📅 时间线

| Phase | 任务 | 时间 | 优先级 |
|-------|------|------|--------|
| Phase 1 | 统一命令解析器 | 1天 | P0 |
| Phase 2 | 单一命令注册表 | 1天 | P0 |
| Phase 3 | 命令执行器 | 1天 | P0 |
| Phase 4 | 统计系统 | 0.5天 | P2 |
| Phase 5 | 测试覆盖 | 1天 | P1 |
| Phase 6 | 文档更新 | 0.5天 | P2 |

---

## ✅ 验收标准

- [ ] 中文命令支持测试通过
- [ ] 别名解析正确
- [ ] 命令超时控制工作
- [ ] 使用统计正确记录
- [ ] 错误信息友好
- [ ] 单元测试 100% 通过
- [ ] 集成测试通过

---

## 附录

### A. 类型定义

```typescript
// src/commands/types.ts

export interface ParsedCommand {
  name: string;
  alias?: string;
  args: string | null;
  raw: string;
  isValid: boolean;
  error?: string;
}

export interface CommandEntry {
  name: string;
  description: string;
  aliasOf?: string;
  triggers: string[];
  argsSpec?: ValidationRule[];
  getPromptForCommand(args: string, context?: unknown): Promise<Array<{ type: 'text'; text: string }>>;
  metadata: CommandMetadata;
}

export interface CommandMetadata {
  source: 'builtin' | 'user' | 'project';
  userInvocable: boolean;
  model?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ValidationRule {
  type: 'required' | 'pattern' | 'enum' | 'range';
  message: string;
  value?: string | string[] | number[];
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  timedOut?: boolean;
}
```

### B. 导出

```typescript
// src/commands/index.ts

export { parseCommand, resolveAlias } from './parser';
export { validateArgs } from './validator';
export { CommandRegistry } from './registry';
export { CommandExecutor, ExecutionResult, ExecutionOptions } from './executor';
export { getCommandStatsReport, type CommandStats, type CommandStatsReport } from './stats';
export type { ParsedCommand, CommandEntry, CommandMetadata, ValidationRule } from './types';
```

---

*文档版本: 1.0*
*创建时间: 2026-05-29*
*参考: src/skills/slash-command.ts, src/skills/executor.ts, src/skills/types.ts*
