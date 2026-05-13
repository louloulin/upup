# Plan 8.8: Memory System Optimization Plan (UpUp Optimized)

> 版本: 8.8 | 更新日期: 2026-05-13
> 目标: 基于现有 Dexter 实现，优化记忆系统，复用现有设计
> 状态: **分析完成，实施计划就绪**

---

## 1. Dexter 现有实现分析

### 1.1 现有组件总览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Dexter Memory System (Existing)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          src/memory/                                     │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │ extraction.ts│  │save-gates.ts │  │consolidation │                │   │
│  │  │ 293 lines   │  │  380 lines   │  │  393 lines   │                │   │
│  │  │             │  │              │  │              │                │   │
│  │  │ extractMem  │  │ checkSave    │  │ consolidate  │                │   │
│  │  │ createHook  │  │ shouldExclude│  │ shouldConsol │                │   │
│  │  │ hasToolCall │  │ buildPrompt  │  │ 整合函数     │                │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │  scanner.ts │  │ai-selector.ts│  │ memvid-store │                │   │
│  │  │  284 lines  │  │  352 lines   │  │  397 lines   │                │   │
│  │  │             │  │              │  │              │                │   │
│  │  │ scanMemory  │  │findRelevant  │  │ BM25搜索     │                │   │
│  │  │ buildManifest│ │findAndLoad   │  │ MemvidStore  │                │   │
│  │  │ updateIndex │  │ AI选择器     │  │ 无API依赖    │                │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │ prompts.ts  │  │session-files │  │observation-  │                │   │
│  │  │  194 lines  │  │   78 lines   │  │  buffer.ts   │                │   │
│  │  │             │  │              │  │              │                │   │
│  │  │ EXTRACTION_ │  │会话记忆文件  │  │工具观察缓冲  │                │   │
│  │  │ SYSTEM_PROMP│  │ 管理        │  │ 记录工具调用 │                │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          src/hooks/                                      │   │
│  │                                                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │ tool-hooks.ts                                                  │    │   │
│  │  │  - createMemorySaveHook()  // PostToolUse 观察记录             │    │   │
│  │  │                                                                  │    │   │
│  │  │ agent-hooks.ts                                                  │    │   │
│  │  │  - useMemoryUsage() // MemoryMonitor                          │    │   │
│  │  │  - MemoryStats, MemoryThreshold                                 │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          src/agent/                                      │   │
│  │                                                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │ agent.ts [line 55, 82, 799, 810]                               │    │   │
│  │  │  - extractionHook 在构造时创建                                  │    │   │
│  │  │  - handleDirectResponse 中调用 extractionHook                   │    │   │
│  │  │  - fire & forget 模式                                          │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 已实现功能 vs Claude Code

| Claude Code 功能 | Dexter 实现 | 状态 | 复用建议 |
|-----------------|-------------|------|----------|
| **ExtractMemories** | `extraction.ts` (293行) | ✅ 基础实现 | 扩展 Gate 系统 |
| **Save Gates** | `save-gates.ts` (380行) | ✅ 完整实现 | 直接复用 |
| **Consolidation** | `consolidation.ts` (393行) | ✅ 基础实现 | 扩展 AutoDream |
| **Memory Scanner** | `scanner.ts` (284行) | ✅ 完整实现 | 直接复用 |
| **AI Selector** | `ai-selector.ts` (352行) | ✅ 完整实现 | 直接复用 |
| **Memvid Store** | `memvid-store.ts` (397行) | ✅ 无API依赖 | 直接复用 |
| **Observation Buffer** | `observation-buffer.ts` | ✅ 完整实现 | 直接复用 |
| **Session Memory** | `session-files.ts` (78行) | ⚠️ 需扩展 | 扩展为独立服务 |
| **MEMORY.md Index** | `scanner.ts` updateMemoryIndex | ⚠️ 未调用 | 需集成到提取流程 |
| **Post-Sampling Hook** | `tool-hooks.ts` createMemorySaveHook | ⚠️ 基础 | 扩展为 Stop Hook |
| **Feature Flags** | 无 | ❌ 缺失 | 新建 feature-flags.ts |
| **Forked Agent** | 无 | ❌ 缺失 | 新建 forked-agent.ts |
| **AutoDream Service** | 无 | ❌ 缺失 | 基于 consolidation.ts |
| **Team Memory Sync** | 基础 `team-paths.ts` | ⚠️ 需完善 | 扩展同步机制 |

---

## 2. 优化策略：复用现有 + 增量开发

### 2.1 架构改进目标

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Optimized Dexter Memory Architecture                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      Post-Sampling Hook Registry                          │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │ 基于现有 tool-hooks.ts 扩展                                      │    │   │
│  │  │  - createMemorySaveHook() 已实现                                 │    │   │
│  │  │  - 添加 createExtractionStopHook()                               │    │   │
│  │  │  - 添加 createAutoDreamHook()                                    │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      Memory Service Layer                               │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │ Extraction  │  │ Consolidation│  │ SessionMem  │                │   │
│  │  │ Service     │  │ Service      │  │ Service     │                │   │
│  │  │             │  │             │  │             │                │   │
│  │  │ 基于现有    │  │ 基于现有    │  │ 基于现有    │                │   │
│  │  │ extraction  │  │ consolidation│  │session-files│                │   │
│  │  │ .ts        │  │ .ts        │  │ .ts        │                │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      Memory Storage Layer                                │   │
│  │                                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │ MemvidStore │  │ FileStore    │  │ TeamPaths   │                │   │
│  │  │ (BM25搜索)  │  │ (文件存储)   │  │ (团队路径)  │                │   │
│  │  │ ✅ 完整    │  │ ✅ 完整     │  │ ⚠️ 需扩展  │                │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 详细实施计划 (Todo List)

### 3.1 Phase 1: Hook 体系集成 (Week 1)

#### TODO 1.1: 创建 StopHookRegistry

```typescript
// src/hooks/stop-hooks.ts (新建)

import { createMemorySaveHook } from './tool-hooks.js';

interface StopHook {
  id: string;
  name: string;
  priority: number;
  execute: (context: StopHookContext) => Promise<void>;
}

interface StopHookContext {
  messages: BaseMessage[];
  sessionId: string;
  timestamp: number;
}

class StopHookRegistry {
  private hooks: Map<string, StopHook> = new Map();

  register(hook: StopHook): void {
    this.hooks.set(hook.id, hook);
  }

  async executeAll(context: StopHookContext): Promise<void> {
    const sorted = Array.from(this.hooks.values())
      .sort((a, b) => a.priority - b.priority);

    for (const hook of sorted) {
      try {
        await hook.execute(context);
      } catch (e) {
        warn('hooks', `Hook ${hook.id} failed: ${e}`);
      }
    }
  }
}

export const stopHookRegistry = new StopHookRegistry();

// 注册内置 hooks
stopHookRegistry.register(createMemorySaveHook());
```

#### TODO 1.2: 修改 Agent 集成 Stop Hook

```typescript
// src/agent/agent.ts 修改

// 添加 Stop Hook 调用
private async *handleDirectResponse(...) {
  // ... 现有逻辑 ...

  // 调用 Stop Hooks (替代硬编码的 extractionHook)
  await stopHookRegistry.executeAll({
    messages,
    sessionId: this.sessionId,
    timestamp: Date.now(),
  });

  yield { type: 'done', ... };
}
```

#### TODO 1.3: 创建 Feature Flags 系统

```typescript
// src/utils/feature-flags.ts (新建)

const FEATURE_DEFAULTS: Record<string, boolean | number> = {
  'tengu_passport_quail': false,      // 记忆提取
  'tengu_onyx_plover': false,        // AutoDream
  'tengu_session_memory': false,     // 会话记忆
  'tengu_bramble_lintel': 1,          // 提取频率
  'memory_extraction_throttle': 5,    // 轮次节流
};

export function isFeatureEnabled(flag: string): boolean {
  // 1. 环境变量 CLAUDE_CODE_FEATURE_<flag>
  // 2. 本地配置
  // 3. 默认值
  const val = FEATURE_DEFAULTS[flag];
  return typeof val === 'boolean' ? val : false;
}

export function getFeatureNumber(flag: string): number {
  const val = FEATURE_DEFAULTS[flag];
  return typeof val === 'number' ? val : 0;
}
```

---

### 3.2 Phase 2: 记忆提取服务 (Week 1-2)

#### TODO 2.1: 扩展 extraction.ts 添加 Gate 系统

```typescript
// src/memory/extraction.ts 扩展

import { isFeatureEnabled, getFeatureNumber } from '../utils/feature-flags.js';
import { hasMemoryWritesSince } from './extraction-utils.js';

// 添加 Gate 检查函数
export function shouldExtract(messages: BaseMessage[]): boolean {
  // Gate 1: Feature flag
  if (!isFeatureEnabled('tengu_passport_quail')) return false;

  // Gate 2: Not subagent
  // ... (context.agentId check)

  // Gate 3: Throttle check
  const throttle = getFeatureNumber('memory_extraction_throttle');
  if (turnsSinceLastExtraction < throttle) return false;

  // Gate 4: Mutex check
  if (hasMemoryWritesSince(messages)) return false;

  return true;
}

// 扩展 extractMemories 成功后调用 MEMORY.md 更新
async function afterExtraction(results: ExtractionResult[]): Promise<void> {
  if (results.length > 0) {
    // 复用现有的 scanner.ts updateMemoryIndex
    const { updateMemoryIndex } = await import('./scanner.js');
    await updateMemoryIndex(memoryDir);
  }
}
```

#### TODO 2.2: 创建 ExtractionStopHook

```typescript
// src/hooks/extraction-stop-hook.ts (新建)

import { stopHookRegistry } from './stop-hooks.js';
import { extractMemories, shouldExtract } from '../memory/extraction.js';
import { isFeatureEnabled } from '../utils/feature-flags.js';

stopHookRegistry.register({
  id: 'memory-extraction-stop',
  name: 'Memory Extraction Stop Hook',
  priority: 100,
  async execute(context) {
    if (!shouldExtract(context.messages)) return;

    const results = await extractMemories(
      context.messages.map(m => ({
        role: m.getType(),
        content: extractText(m),
      }))
    );

    if (results.length > 0) {
      info('memory', `Extracted ${results.length} memories`);
    }
  },
});
```

---

### 3.3 Phase 3: 整合服务 (Week 2-3)

#### TODO 3.1: 扩展 consolidation.ts 为 AutoDream

```typescript
// src/memory/consolidation.ts 扩展

import { isFeatureEnabled, getFeatureNumber } from '../utils/feature-flags.js';

// 添加 AutoDream 配置
interface AutoDreamConfig {
  minHours: number;
  minSessions: number;
}

// 4-Gate 检查
export function shouldAutoDream(): { should: boolean; reason?: string } {
  // Gate 1: Feature flag
  if (!isFeatureEnabled('tengu_onyx_plover')) {
    return { should: false, reason: 'Feature flag disabled' };
  }

  // Gate 2: Time gate
  const minHours = getFeatureNumber('auto_dream_min_hours') || 24;
  if (hoursSinceLastConsolidation < minHours) {
    return { should: false, reason: 'Time gate not passed' };
  }

  // Gate 3: Session gate
  const minSessions = getFeatureNumber('auto_dream_min_sessions') || 5;
  if (recentSessionCount < minSessions) {
    return { should: false, reason: 'Session gate not passed' };
  }

  // Gate 4: Lock check
  if (!acquireConsolidationLock()) {
    return { should: false, reason: 'Lock not acquired' };
  }

  return { should: true };
}
```

#### TODO 3.2: 创建 AutoDreamStopHook

```typescript
// src/hooks/auto-dream-stop-hook.ts (新建)

import { stopHookRegistry } from './stop-hooks.js';
import { shouldAutoDream, consolidateMemories } from '../memory/consolidation.js';

stopHookRegistry.register({
  id: 'auto-dream-stop',
  name: 'Auto Dream Stop Hook',
  priority: 70,
  async execute(context) {
    const { should, reason } = shouldAutoDream();
    if (!should) {
      debug('memory', `AutoDream skipped: ${reason}`);
      return;
    }

    info('memory', 'AutoDream triggered');
    const result = await consolidateMemories(context.sessionId);

    if (result.memoriesIntegrated > 0) {
      info('memory', `AutoDream: integrated ${result.memoriesIntegrated} memories`);
    }
  },
});
```

---

### 3.4 Phase 4: 会话记忆 (Week 3)

#### TODO 4.1: 扩展 session-files.ts

```typescript
// src/memory/session-files.ts 扩展

const MAX_SESSION_MEMORY_TOKENS = 12000;

interface SessionMemoryConfig {
  initialized: boolean;
  lastSummarizedMessageId: string | null;
  tokenCount: number;
}

export function shouldUpdateSessionMemory(config: SessionMemoryConfig): boolean {
  if (!isFeatureEnabled('tengu_session_memory')) return false;
  if (!config.initialized) return hasMetInitializationThreshold();
  return hasMetUpdateThreshold();
}

export function getSessionMemoryTokenBudget(): number {
  return MAX_SESSION_MEMORY_TOKENS;
}
```

#### TODO 4.2: 创建 SessionMemoryStopHook

```typescript
// src/hooks/session-memory-stop-hook.ts (新建)

import { stopHookRegistry } from './stop-hooks.js';
import { shouldUpdateSessionMemory, updateSessionMemory } from '../memory/session-files.js';

stopHookRegistry.register({
  id: 'session-memory-stop',
  name: 'Session Memory Stop Hook',
  priority: 80,
  async execute(context) {
    if (!shouldUpdateSessionMemory(getSessionMemoryConfig())) return;

    const result = await updateSessionMemory(context.messages);
    info('memory', `Session memory updated: ${result.tokenCount} tokens`);
  },
});
```

---

### 3.5 Phase 5: 团队记忆 (Week 4)

#### TODO 5.1: 扩展 team-paths.ts

```typescript
// src/memory/team-paths.ts 扩展

export interface TeamSyncConfig {
  enabled: boolean;
  oauthProvider?: string;
  syncIntervalMs: number;
}

// OAuth 云同步 (复用 oauth.ts)
export async function syncTeamMemories(): Promise<void> {
  // 1. 检查 oauth 配置
  // 2. 获取 token
  // 3. 上传团队记忆
  // 4. 秘密扫描 (复用 secretScanner)
}

// 路径安全验证
export function validateTeamMemoryPath(path: string): boolean {
  // 复用 path-safety.ts 验证
  return validateMemoryPath(path, teamMemoryBase);
}
```

---

## 4. 完整 Todo List

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Memory System Todo List                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 1: Hook 体系集成 (Week 1)                                               │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  [TODO 1.1] 创建 src/hooks/stop-hooks.ts                                       │
│           - StopHookRegistry 类                                                │
│           - register, executeAll 方法                                         │
│           - 集成 createMemorySaveHook                                           │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 1.2] 修改 src/agent/agent.ts                                            │
│           - 添加 stopHookRegistry.executeAll() 调用                             │
│           - 替换硬编码的 extractionHook                                          │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 1.3] 创建 src/utils/feature-flags.ts                                     │
│           - isFeatureEnabled(), getFeatureNumber()                               │
│           - 默认值配置                                                           │
│           - 环境变量支持                                                         │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 2: 记忆提取服务 (Week 1-2)                                             │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  [TODO 2.1] 扩展 src/memory/extraction.ts                                       │
│           - 添加 Gate 检查 (shouldExtract)                                       │
│           - 添加互斥检测 (hasMemoryWritesSince)                                  │
│           - 提取成功后调用 updateMemoryIndex                                     │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 2.2] 创建 src/hooks/extraction-stop-hook.ts                              │
│           - ExtractionStopHook                                                  │
│           - priority: 100                                                        │
│           - 注册到 stopHookRegistry                                             │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 2.3] 创建 src/memory/extraction-utils.ts                                 │
│           - hasMemoryWritesSince()                                               │
│           - extractText()                                                        │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 3: 整合服务 (Week 2-3)                                                  │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  [TODO 3.1] 扩展 src/memory/consolidation.ts                                   │
│           - 添加 AutoDreamConfig                                                │
│           - 添加 shouldAutoDream() 4-Gate 检查                                  │
│           - 添加 consolidationLock 管理                                         │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 3.2] 创建 src/hooks/auto-dream-stop-hook.ts                               │
│           - AutoDreamStopHook                                                    │
│           - priority: 70                                                         │
│           - 注册到 stopHookRegistry                                              │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 3.3] 创建 src/hooks/dream-command.ts                                     │
│           - /dream 命令实现                                                       │
│           - 基于 consolidation.ts                                               │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 4: 会话记忆 (Week 3)                                                    │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  [TODO 4.1] 扩展 src/memory/session-files.ts                                   │
│           - SessionMemoryConfig                                                  │
│           - shouldUpdateSessionMemory()                                          │
│           - getSessionMemoryTokenBudget()                                        │
│           - updateSessionMemory()                                                 │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 4.2] 创建 src/hooks/session-memory-stop-hook.ts                          │
│           - SessionMemoryStopHook                                                │
│           - priority: 80                                                         │
│           - 注册到 stopHookRegistry                                              │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 5: 团队记忆 (Week 4)                                                    │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  [TODO 5.1] 扩展 src/memory/team-paths.ts                                      │
│           - TeamSyncConfig                                                       │
│           - syncTeamMemories()                                                   │
│           - OAuth 集成 (复用 src/mcp/oauth.ts)                                  │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 5.2] 创建 src/utils/path-safety.ts                                      │
│           - validateMemoryPath()                                                 │
│           - symlinkEscape 检测                                                   │
│           - unicode 规范化检查                                                    │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 5.3] 创建 src/hooks/team-memory-sync-hook.ts                            │
│           - TeamMemorySyncHook                                                  │
│           - priority: 60                                                         │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 6: 测试和文档 (Week 5)                                                  │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  [TODO 6.1] 单元测试                                                            │
│           - src/hooks/stop-hooks.test.ts                                        │
│           - src/memory/extraction.test.ts (扩展)                                │
│           - src/memory/consolidation.test.ts (扩展)                             │
│           - src/utils/feature-flags.test.ts                                     │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 6.2] 集成测试                                                            │
│           - src/agent/agent.test.ts (memory 集成)                              │
│           - Stop Hook 触发测试                                                  │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
│  [TODO 6.3] 文档更新                                                            │
│           - 更新 plan8.8.md                                                      │
│           - 添加 architecture.md                                                │
│           - 状态: 待开始 | 进行中 | 完成                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 文件清单 (增量开发)

### 5.1 新建文件

| 文件 | Phase | 优先级 | 依赖 |
|------|-------|--------|------|
| `src/hooks/stop-hooks.ts` | P1 | P1 | 无 |
| `src/utils/feature-flags.ts` | P1 | P1 | 无 |
| `src/memory/extraction-utils.ts` | P2 | P1 | 无 |
| `src/hooks/extraction-stop-hook.ts` | P2 | P1 | extraction.ts |
| `src/hooks/auto-dream-stop-hook.ts` | P3 | P2 | consolidation.ts |
| `src/hooks/dream-command.ts` | P3 | P2 | consolidation.ts |
| `src/hooks/session-memory-stop-hook.ts` | P4 | P2 | session-files.ts |
| `src/hooks/team-memory-sync-hook.ts` | P5 | P3 | team-paths.ts |
| `src/utils/path-safety.ts` | P5 | P3 | 无 |
| `src/hooks/stop-hooks.test.ts` | P6 | P1 | stop-hooks.ts |
| `src/utils/feature-flags.test.ts` | P6 | P1 | feature-flags.ts |

### 5.2 修改文件

| 文件 | Phase | 修改内容 |
|------|-------|----------|
| `src/agent/agent.ts` | P1 | 集成 stopHookRegistry |
| `src/memory/extraction.ts` | P2 | 添加 Gate 系统、MEMORY.md 更新 |
| `src/memory/consolidation.ts` | P3 | 添加 AutoDream 4-Gate |
| `src/memory/session-files.ts` | P4 | 扩展会话记忆服务 |
| `src/memory/team-paths.ts` | P5 | 添加 OAuth 同步 |
| `src/hooks/tool-hooks.ts` | P1 | 注册到 stopHookRegistry |

---

## 6. 复用策略

### 6.1 现有组件复用

| 组件 | 复用方式 |
|------|----------|
| **extraction.ts** | 扩展 Gate 系统，添加互斥检测 |
| **save-gates.ts** | 直接复用，无需修改 |
| **consolidation.ts** | 扩展 AutoDream 逻辑，添加 4-Gate |
| **scanner.ts** | 直接复用 `updateMemoryIndex()` |
| **ai-selector.ts** | 直接复用 `findRelevantMemories()` |
| **memvid-store.ts** | 直接复用 BM25 搜索 |
| **observation-buffer.ts** | 直接复用工具观察 |
| **prompts.ts** | 直接复用提取/整合提示 |

### 6.2 跨模块复用

| 功能 | 复用来源 |
|------|----------|
| **OAuth 认证** | `src/mcp/oauth.ts` → Team Memory Sync |
| **路径安全** | 基础验证 → 扩展 symlink/unicode 检查 |
| **Hook 系统** | `src/hooks/tool-hooks.ts` → 扩展 Stop Hook |

---

## 7. 测试策略

### 7.1 单元测试覆盖

```
src/
├── hooks/
│   ├── stop-hooks.test.ts          [TODO 6.1]
│   ├── extraction-stop-hook.test.ts
│   ├── auto-dream-stop-hook.test.ts
│   ├── session-memory-stop-hook.test.ts
│   └── team-memory-sync-hook.test.ts
├── memory/
│   ├── extraction.test.ts         [扩展]
│   ├── consolidation.test.ts       [扩展]
│   ├── session-files.test.ts       [扩展]
│   └── team-paths.test.ts          [扩展]
└── utils/
    ├── feature-flags.test.ts       [TODO 6.1]
    └── path-safety.test.ts
```

### 7.2 集成测试

```typescript
// src/agent/agent.memory.test.ts

describe('Agent Memory Integration', () => {
  it('should trigger extraction via stop hook', async () => {
    // 启用 feature flag
    process.env.CLAUDE_CODE_FEATURE_TENGU_PASSPORT_QUAIL = '1';

    const agent = await Agent.create({ memoryEnabled: true });
    // ... 测试流程
  });

  it('should respect extraction throttle', async () => {
    // 测试轮次节流
  });

  it('should update MEMORY.md after extraction', async () => {
    // 测试索引更新
  });
});
```

---

## 8. 风险评估

| 功能 | 风险 | 缓解措施 |
|------|------|----------|
| Hook 集成 | 中 - 可能影响现有功能 | 添加 Feature Flag 控制 |
| 提取节流 | 低 - 简单计数器 | 完整测试覆盖 |
| MEMORY.md 更新 | 低 - 文件 IO | 异常捕获 |
| OAuth 同步 | 中 - 网络依赖 | 超时 + 重试机制 |

---

## 9. 验证清单

```
[ ] 验证 Hook 执行顺序
[ ] 验证 Feature Flag 控制
[ ] 验证提取节流
[ ] 验证 MEMORY.md 更新
[ ] 验证 AutoDream 4-Gate
[ ] 验证会话记忆 token 预算
[ ] 验证团队记忆同步
[ ] 验证路径安全
[ ] 运行所有 2281 tests 通过
[ ] 提交代码
```

---

> **更新日志**
> - 2026-05-13: 优化版分析完成
> - 添加详细 Todo List (共 18 项任务)
> - 明确复用现有组件策略
> - 按 Phase 分解实施计划