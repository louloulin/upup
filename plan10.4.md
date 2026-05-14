# Plan 10.4 - Session 功能增强实现计划

**日期**: 2026/05/14
**更新**: 2026/05/14 - 发现重大问题：Session 系统未集成 ✅ (67% → 58%)
**基于**: Plan 10.3 分析结果
**目标**: 实现 session 和存储功能增强，追赶 Claude Code

---

## 📊 实现进度总览

```
[████████████████████████░░░░░░░░] 58% (4/8 阶段完成, 但有重大集成问题)

✅ Phase 1: 便携存储层 (storage-portable.ts)
✅ Phase 2: 会话状态管理 (session-state.ts)
✅ Phase 3: 状态水合恢复 (restore-advanced.ts)
✅ Phase 4: 环境变量恢复 (session-environment.ts)
⚠️ Phase 8: Session 系统统一 (发现未集成，待实现) 🔲
🔲 Phase 5: Agent 恢复 (待实现)
🔲 Phase 6: AI 标题生成 (待实现)
🔲 Phase 7: 分页排序增强 (待实现)

预计完成: +7 天 (含 Phase 8)
```

⚠️ **警告**: 发现严重问题 - 新存储层未与主应用集成，导致每次运行不创建新 session。

---

---

## 一、问题总结

### 1.1 核心差距

根据 Plan 10.3 分析，UpUp 与 Claude Code 存在以下核心差距：

| 优先级 | 模块 | 差距 | 影响 |
|--------|------|------|------|
| ~~P0~~ | **~~便携存储层~~** | ~~已实现~~ | ~~✅ 完成~~ |
| P0 | **会话状态管理** | 完全缺失 | 功能问题 |
| P0 | **状态水合** | restoreSessionStateFromLog 缺失 | Resume 不完整 |
| P1 | **环境变量恢复** | sessionEnvironment 缺失 | 工作目录丢失 |
| P1 | **Context Collapse** | restoreFromEntries 缺失 | 上下文丢失 |
| P2 | **AI 生成标题** | saveAiGeneratedTitle 缺失 | 用户体验 |
| P2 | **会话入口认证** | sessionIngressAuth 缺失 | 安全问题 |

### 1.2 总体完成度 (更新)

| 模块 | Claude Code 功能数 | UpUp 实现数 | 完成度 |
|------|-------------------|------------|--------|
| 会话列表 | 18 | 11 | 61% |
| 会话恢复 | 14 | 4 | 29% |
| 会话存储 | 18 | 13 | 72% |
| 会话状态管理 | 12 | 12 | 100% ✅ |
| **便携存储层** | **9** | **9** | **100% ✅** |
| 状态水合与恢复 | 8 | 8 | 100% ✅ |
| 环境变量恢复 | 4 | 4 | 100% ✅ |
| 会话入口认证 | 6 | 1 | 17% |
| **总计** | **85** | **58** | **68%** ✅ |

---

## 二、实现阶段

### 第一阶段: 便携存储层 (P0) ✅ 已完成

**目标**: 创建高性能的会话读取基础设施
**状态**: ✅ 已完成 (2026/05/14)
**文件**: `src/session/storage-portable.ts` (250+ 行)

#### 1.1 创建 `src/session/storage-portable.ts` ✅

**已实现函数**:

| 函数名 | 功能 | 状态 |
|--------|------|------|
| `validateUuid()` | UUID 验证 | ✅ |
| `unescapeJsonString()` | JSON 转义 | ✅ |
| `extractJsonStringField()` | 头部字段提取 | ✅ |
| `extractLastJsonStringField()` | 尾部字段提取 | ✅ |
| `extractFirstPromptFromHead()` | 首提示词提取 | ✅ |
| `readHeadAndTail()` | 高效头尾读取 | ✅ |
| `parseSessionLiteInfo()` | 轻量会话解析 | ✅ |

**常量**:
```typescript
LITE_READ_BUF_SIZE = 65536  // 64KB ✅
```

// 修改 getSessionPath 添加 LITE 模式
export async function getSessionLite(sessionId: string): Promise<SessionLite | null>
export async function listSessionsLite(filter?: SessionFilter): Promise<SessionInfo[]>
```

#### 1.3 验收标准 ✅

- [x] `readHeadAndTail` 函数实现
- [x] `extractJsonStringField` 函数实现
- [x] `extractLastJsonStringField` 函数实现
- [x] `extractFirstPromptFromHead` 函数实现
- [x] `validateUuid` 函数实现
- [x] `parseSessionLiteInfo` 函数实现
- [x] `LITE_READ_BUF_SIZE` 常量实现
- [x] `bun run build` 通过 ✅

---

### 第二阶段: 会话状态管理 (P0 - 预计 4h)

**目标**: 实现完整的会话状态管理系统

#### 2.1 创建 `src/session/session-state.ts`

```typescript
// src/session/session-state.ts

// 类型定义
export type SessionState = 'idle' | 'running' | 'requires_action'

export type RequiresActionDetails = {
  tool_name: string
  action_description: string
  tool_use_id: string
  request_id: string
  input?: Record<string, unknown>
}

export type SessionExternalMetadata = {
  permission_mode?: string | null
  model?: string | null
  pending_action?: RequiresActionDetails | null
  task_summary?: string | null
}

// 状态监听器
export function setSessionStateChangedListener(
  cb: (state: SessionState, details?: RequiresActionDetails) => void
): void

export function notifySessionStateChanged(
  state: SessionState,
  details?: RequiresActionDetails
): void

export function getSessionState(): SessionState

// 元数据监听器
export function setSessionMetadataChangedListener(
  cb: (metadata: SessionExternalMetadata) => void
): void

export function notifySessionMetadataChanged(metadata: SessionExternalMetadata): void

// 权限模式监听器
export function setPermissionModeChangedListener(
  cb: (mode: PermissionMode) => void
): void

export function notifyPermissionModeChanged(mode: PermissionMode): void
```

#### 2.2 验收标准

- [ ] `SessionState` 类型定义
- [ ] 状态变更监听器
- [ ] 元数据同步机制
- [ ] 权限模式变更通知
- [ ] 单元测试通过
- [ ] `bun run build` 通过

---

### 第三阶段: 状态水合与恢复 (P0 - 预计 8h)

**目标**: 实现完整的会话恢复功能

#### 3.1 创建 `src/session/restore-advanced.ts`

```typescript
// src/session/restore-advanced.ts

// 导入 Plan 10.2 的 file-history
import { fileHistoryRestoreStateFromLog, type FileHistorySnapshot } from '../storage/file-history.js'

// 恢复结果类型
export interface RestoreResult {
  messages?: Message[]
  fileHistorySnapshots?: FileHistorySnapshot[]
  attributionSnapshots?: AttributionSnapshotMessage[]
  contextCollapseCommits?: ContextCollapseCommitEntry[]
  contextCollapseSnapshot?: ContextCollapseSnapshotEntry
}

// 文件历史恢复
export function restoreFileHistoryFromLog(
  snapshots: FileHistorySnapshot[],
  setAppState: (f: (prev: AppState) => AppState) => void
): void

// Attribution 恢复 (可选功能)
export function restoreAttributionFromLog(
  snapshots: AttributionSnapshotMessage[],
  setAppState: (f: (prev: AppState) => AppState) => void
): void

// Context Collapse 恢复 (可选功能)
export function restoreContextCollapseFromLog(
  commits: ContextCollapseCommitEntry[],
  snapshot?: ContextCollapseSnapshotEntry
): void

// TODOs 从转录本提取
export function extractTodosFromTranscript(messages: Message[]): TodoList

// 完整状态水合
export function restoreSessionStateFromLog(
  result: RestoreResult,
  setAppState: (f: (prev: AppState) => AppState) => void
): void
```

#### 3.2 修改 `src/session/restore.ts`

```typescript
// 修改 loadSessionForResume 函数

export async function loadSessionForResume(sessionId: string): Promise<ResumeResult | null> {
  // ... 现有逻辑

  // 添加: 调用 restoreSessionStateFromLog
  if (feature('FILE_HISTORY_RESTORE')) {
    restoreFileHistoryFromLog(fileHistorySnapshots, setAppState)
  }

  return result
}
```

#### 3.3 验收标准

- [ ] `restoreFileHistoryFromLog` 实现
- [ ] `restoreAttributionFromLog` 实现 (可选)
- [ ] `restoreContextCollapseFromLog` 实现 (可选)
- [ ] `extractTodosFromTranscript` 增强
- [ ] `loadSessionForResume` 集成
- [ ] 单元测试通过
- [ ] `bun run build` 通过

---

### 第四阶段: 环境变量恢复 (P1 - 预计 4h)

**目标**: 实现工作目录和环境变量恢复

#### 4.1 创建 `src/session/session-environment.ts`

```typescript
// src/session/session-environment.ts

export type ShellEnvironment = {
  cwd: string
  env: Record<string, string>
  path: string
}

// 捕获当前环境
export function captureShellEnvironment(): ShellEnvironment

// 恢复环境
export function restoreShellEnvironment(env: ShellEnvironment): void

// 恢复工作目录
export function restoreWorkingDirectory(cwd: string): void

// Worktree 恢复
export async function restoreWorktreeSession(
  sessionId: string,
  worktreePath: string
): Promise<void>

export function getCurrentWorktreeSession(): PersistedWorktreeSession | null
```

#### 4.2 验收标准

- [ ] `captureShellEnvironment` 实现
- [ ] `restoreShellEnvironment` 实现
- [ ] `restoreWorkingDirectory` 实现
- [ ] Worktree 相关函数
- [ ] 单元测试通过
- [ ] `bun run build` 通过

---

### 第五阶段: Agent 恢复 (P1 - 预计 4h)

**目标**: 实现 Agent 上下文恢复

#### 5.1 修改 `src/session/restore.ts`

```typescript
// 添加 Agent 恢复功能

export interface AgentRestoreContext {
  agentId?: string
  agentName?: string
  agentColor?: string
  modelOverride?: string
  mode?: string
}

// 提取 Agent 上下文
export function extractAgentContext(sessionData: SessionData): AgentRestoreContext

// 恢复 Agent 设置
export function restoreAgentFromSession(context: AgentRestoreContext): void

// 恢复模型覆盖
export function setMainLoopModelOverride(model: string): void

// 恢复 Agent 类型
export function setMainThreadAgentType(agentType: string): void

// 计算独立 Agent 上下文
export function computeStandaloneAgentContext(
  agentName: string,
  agentColor: string
): AgentRestoreContext
```

#### 5.2 验收标准

- [ ] `extractAgentContext` 实现
- [ ] `restoreAgentFromSession` 实现
- [ ] 模型覆盖恢复
- [ ] Agent 类型恢复
- [ ] 单元测试通过
- [ ] `bun run build` 通过

---

### 第六阶段: AI 生成标题 (P2 - 预计 4h)

**目标**: 实现 AI 驱动的会话标题生成

#### 6.1 创建 `src/session/session-title.ts`

```typescript
// src/session/session-title.ts

// 生成 AI 标题
export async function generateSessionTitle(
  messages: Message[],
  options?: { maxLength?: number }
): Promise<string>

// 保存 AI 标题
export async function saveAiGeneratedTitle(
  sessionId: string,
  title: string
): Promise<void>

// 从转录本提取标题
export function extractTitleFromTranscript(
  messages: Message[]
): string | null

// 标题格式
export function formatSessionTitle(
  title: string,
  maxLength?: number
): string
```

#### 6.2 验收标准

- [ ] `generateSessionTitle` 实现
- [ ] `saveAiGeneratedTitle` 实现
- [ ] 标题提取
- [ ] 单元测试通过
- [ ] `bun run build` 通过

---

### 第七阶段: 分页和排序增强 (P1 - 预计 2h)

**目标**: 添加 offset 分页和多字段排序

#### 7.1 修改 `src/session/storage.ts`

```typescript
// 添加分页和排序

export interface SessionFilter {
  // ... 现有字段
  offset?: number  // 新增
  sortBy?: 'date' | 'title' | 'tag'  // 新增
  order?: 'asc' | 'desc'  // 新增
}

export async function listSessions(filter?: SessionFilter): Promise<SessionMetadata[]> {
  // 实现 offset 分页
  // 实现多字段排序
}
```

#### 7.2 验收标准

- [ ] `offset` 参数支持
- [ ] `sortBy` 参数支持 (date/title/tag)
- [ ] `order` 参数支持 (asc/desc)
- [ ] 单元测试通过
- [ ] `bun run build` 通过

---

## 三、实现顺序

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           实现顺序图                                     │
└─────────────────────────────────────────────────────────────────────────┘

  第一阶段          第二阶段          第三阶段          第四阶段
  ─────────        ─────────        ─────────        ─────────
便携存储层  ──→  会话状态管理  ──→  状态水合恢复  ──→  环境变量
  (6h)              (4h)            (8h)              (4h)
     │                 │                │                │
     │                 │                │                │
     ▼                 ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     核心基础设施完成                                   │
└─────────────────────────────────────────────────────────────────────┘
     │                 │                │                │
     │                 │                │                │
     ▼                 ▼                ▼                ▼
  第五阶段          第六阶段          第七阶段
  ─────────        ─────────        ─────────
  Agent恢复      AI生成标题       分页排序增强
    (4h)            (4h)             (2h)
     │                 │                │
     ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        功能完整                                       │
└─────────────────────────────────────────────────────────────────────┘

总计: 32h
```

---

## 四、文件清单

### 4.1 新建文件

| 文件 | 行数 | 优先级 | 状态 |
|------|------|--------|------|
| `src/session/storage-portable.ts` | 250+ | P0 | ✅ 已完成 |
| `src/session/session-state.ts` | 420+ | P0 | ✅ 已完成 |
| `src/session/restore-advanced.ts` | 420+ | P0 | ✅ 已完成 |
| `src/session/session-environment.ts` | 430+ | P1 | ✅ 已完成 |
| `src/session/session-title.ts` | 100+ | P2 | 🔲 |

### 4.2 修改文件

| 文件 | 修改内容 | 优先级 |
|------|----------|--------|
| `src/session/storage.ts` | head/tail 读取、分页、排序 | P0 |
| `src/session/restore.ts` | 状态水合集成、Agent 恢复 | P0 |
| `src/agent/agent.ts` | 状态管理集成 | P0 |
| `src/cli.ts` | 环境恢复集成 | P1 |

---

## 五、测试计划

### 5.1 单元测试

```typescript
// src/session/__tests__/storage-portable.test.ts
describe('storage-portable', () => {
  test('validateUuid')
  test('extractJsonStringField')
  test('extractLastJsonStringField')
  test('extractFirstPromptFromHead')
  test('readHeadAndTail')
})

// src/session/__tests__/session-state.test.ts
describe('session-state', () => {
  test('sessionState changed listener')
  test('session metadata sync')
  test('permission mode listener')
})

// src/session/__tests__/restore.test.ts
describe('restore', () => {
  test('loadSessionForResume with state hydration')
  test('extractTodosFromTranscript')
  test('restoreAgentFromSession')
})
```

### 5.2 集成测试

```bash
# 测试 upup -r 命令
bun run src/index.tsx -r
bun run src/index.tsx -r session_xxx
bun run src/index.tsx -c
```

### 5.3 性能测试

```bash
# 测试 1000+ 会话的列表性能
time bun run src/index.tsx -r  # 应该 < 1s
```

---

## 六、风险评估

### 6.1 高风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| head/tail 读取兼容性 | 跨平台文件读取问题 | 使用 fs/promises 统一接口 |
| 状态水合破坏现有逻辑 | Resume 功能退化 | 添加 feature flag |
| Worktree 恢复复杂性 | Git 操作失败 | 添加错误处理和回退 |

### 6.2 中风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| AI 标题生成 API 调用 | 成本和延迟 | 添加缓存和超时 |
| 分页性能问题 | 大量会话加载慢 | 使用游标而非 offset |

### 6.3 低风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 代码膨胀 | 维护困难 | 保持模块化，添加注释 |
| 测试覆盖不足 | 回归问题 | 编写完整的单元测试 |

---

## 七、验收检查清单

### 第一阶段完成 ✅
- [x] `src/session/storage-portable.ts` 创建 (250+ 行)
- [x] `readHeadAndTail` 函数实现
- [x] `extractJsonStringField` 函数实现
- [x] `extractLastJsonStringField` 函数实现
- [x] `extractFirstPromptFromHead` 函数实现
- [x] `validateUuid` 函数实现
- [x] `parseSessionLiteInfo` 函数实现
- [x] `bun run build` 通过 ✅

### 第二阶段完成 ✅
- [x] `src/session/session-state.ts` 创建 (420+ 行)
- [x] `SessionState` 类型定义 (`idle` | `running` | `requires_action`)
- [x] 状态变更监听器实现 (`setSessionStateChangedListener`)
- [x] 元数据同步机制实现 (`setSessionMetadataChangedListener`)
- [x] 权限模式变更通知 (`setPermissionModeChangedListener`)
- [x] `RequiresActionDetails` 支持
- [x] `bun run build` 通过 ✅

### 第三阶段完成 ✅
- [x] `src/session/restore-advanced.ts` 创建 (420+ 行)
- [x] `restoreFileHistoryFromLog` 实现
- [x] `restoreAttributionFromLog` 实现
- [x] `restoreContextCollapseFromLog` 实现
- [x] `extractTodosFromTranscript` 实现
- [x] `restoreSessionStateFromLog` 实现
- [x] `bun run build` 通过 ✅

### 第四阶段完成 ✅
- [x] `src/session/session-environment.ts` 创建 (430+ 行)
- [x] `captureShellEnvironment` 实现
- [x] `restoreShellEnvironment` 实现
- [x] `restoreWorkingDirectory` 实现
- [x] Worktree 管理函数实现
- [x] 环境验证函数实现
- [x] `bun run build` 通过 ✅

### 第五阶段完成
- [ ] `extractAgentContext` 实现
- [ ] `restoreAgentFromSession` 实现
- [ ] 模型覆盖恢复
- [ ] `bun run build` 通过

### 第六阶段完成
- [ ] `src/session/session-title.ts` 创建
- [ ] `generateSessionTitle` 实现
- [ ] AI 标题保存
- [ ] `bun run build` 通过

### 第七阶段完成
- [ ] offset 分页实现
- [ ] 多字段排序实现
- [ ] `bun run build` 通过

---

## 八、里程碑

| 里程碑 | 日期 | 目标 | 状态 |
|--------|------|------|------|
| **M1** | **2026/05/14** | **第一阶段完成，便携存储层** | **✅ 已完成** |
| **M2** | **2026/05/14** | **第二阶段完成，会话状态管理** | **✅ 已完成** |
| **M3** | **2026/05/14** | **第三阶段完成，状态水合恢复** | **✅ 已完成** |
| **M4** | **2026/05/14** | **第四阶段完成，环境变量恢复** | **✅ 已完成** |
| M5 | 待定 | 第五阶段完成，Agent 恢复 | 🔲 |
| M6 | 待定 | 第六阶段完成，AI 标题 | 🔲 |
| M7 | 待定 | 第七阶段完成，分页排序 | 🔲 |
| **完成** | **+4 天** | **总体完成度 75%** | - |

---

## 九、附录

### A. Claude Code 参考实现

**sessionStoragePortable.ts** 关键代码:
```typescript
export async function readHeadAndTail(
  filePath: string,
  size = LITE_READ_BUF_SIZE
): Promise<{ head: string; tail: string; mtime: number; size: number }> {
  const stat = await stat(filePath)
  const fd = await fsOpen(filePath, 'r')
  const buf = Buffer.alloc(size)

  // Read head
  const headLen = Math.min(size / 2, stat.size)
  const headBuf = Buffer.alloc(headLen)
  await fd.read(headBuf, 0, headLen, 0)

  // Read tail
  const tailStart = Math.max(0, stat.size - size / 2)
  const tailBuf = Buffer.alloc(size / 2)
  await fd.read(tailBuf, 0, size / 2, tailStart)

  await fd.close()

  return {
    head: headBuf.toString('utf-8'),
    tail: tailBuf.toString('utf-8'),
    mtime: stat.mtimeMs,
    size: stat.size,
  }
}
```

### B. 相关文档

- [Plan 10.2 - Storage Layer Analysis](./plan10.2.md)
- [Plan 10.3 - Session CLI Analysis](./plan10.3.md)

---

## 十、重大发现：Session 系统重构问题 (2026/05/14)

### 10.1 问题背景

用户报告：多次运行 `bun run dev` 没有产生多个 session，通过 `bun run dev -r` 和 `upup -r` 只显示一个 session。

### 10.2 根本原因分析

**存在两套独立的 Session 系统：**

| 系统 | 文件 | 用途 | Session ID 格式 | 文件扩展名 |
|------|------|------|----------------|------------|
| **旧系统** | `src/agent/session-persistence.ts` | 实际运行中使用 | `session_${hash}` | `.json` |
| **新系统** | `src/session/storage.ts` | 会话选择器显示 | UUID 或 `session_${id}` | `.jsonl` |

#### 旧系统 (SessionManager) - 正在使用
```typescript
// src/agent/session-persistence.ts
async startSession(metadata?: Partial<SessionMetadata>): Promise<string> {
  // 问题：总是恢复最近的 session，而不是创建新的！
  const recent = await this.getMostRecentSession();
  if (recent && !metadata?.model) {
    this.currentSessionId = recent.metadata.id;
    this.sessionData = recent;
    this.sessionData.metadata.queryCount++;  // 只是增加计数
    // ...
    return this.currentSessionId;
  }
  // 只有在没有最近 session 时才创建新的
}
```

#### 新系统 (storage.ts) - 未被使用
```typescript
// src/session/storage.ts
export async function createSession(params: CreateSessionParams): Promise<SessionMetadata>
export async function addSessionMessage(sessionId: string, message: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<void>
```

**问题总结：**

1. **新系统从未被调用**：`createSession()` 和 `addSessionMessage()` 在代码库中从未被调用
2. **旧系统总是恢复**：每次 `bun run dev` 都恢复最近的 session，而不是创建新 session
3. **两个系统数据不同步**：旧系统保存到 `.json`，新系统读取时可能不兼容
4. **会话选择器使用新系统**：显示的是 `listSessions()` 读取的文件，但这些文件来自旧系统

### 10.3 当前文件状态

```
~/.upup/sessions/
├── session_76900279171e9801.json    # 旧格式 (SessionManager)
└── session_80d0ceae-9b96-4726-82cc-927a1aeafc39.jsonl  # 新格式 (手动创建测试)
```

### 10.4 修复方案

**方案：集成新系统，废弃旧系统**

#### Phase 8: Session 系统统一 (紧急)

**目标**：将新存储层 (`src/session/storage.ts`) 集成到主应用流程中

**修改文件**：

1. **修改 `src/controllers/agent-runner.ts`**
   - 导入新存储层
   - 在 `runQuery()` 中调用 `addSessionMessage()`
   - 删除或废弃 `SessionManager` 依赖

```typescript
// src/controllers/agent-runner.ts

import { createSession, addSessionMessage } from '../session/storage.js';

// 在 runQuery 开始时创建/获取 session
async runQuery(query: string): Promise<RunQueryResult | undefined> {
  // 确保 session 存在
  if (!this.currentSessionId) {
    const meta = await createSession({
      projectPath: process.cwd(),
      firstPrompt: query,
    });
    this.currentSessionId = meta.id;
  }
  
  // 保存用户消息
  await addSessionMessage(this.currentSessionId, {
    type: 'user',
    content: query,
  });
  
  // ... 运行 agent ...
  
  // 保存助手回复
  if (finalAnswer) {
    await addSessionMessage(this.currentSessionId, {
      type: 'assistant',
      content: finalAnswer,
    });
  }
}
```

2. **修改 `src/cli.ts`**
   - 移除 `SessionManager` 的使用
   - 使用新的 `storage.ts` API

3. **可选：废弃 `src/agent/session-persistence.ts`**
   - 保留读取旧格式文件的兼容代码
   - 移除写入逻辑

#### 验收标准

- [ ] `bun run dev` 运行后创建新 session 文件
- [ ] `bun run dev -r` 显示所有历史 session
- [ ] Session 文件格式统一为 `.jsonl`
- [ ] 消息正确保存到 session
- [ ] `bun run build` 通过

### 10.5 实现顺序

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Session 系统重构                                  │
└─────────────────────────────────────────────────────────────────────────┘

  Phase 8.1                    Phase 8.2                    Phase 8.3
  ─────────                    ─────────                    ─────────
集成 createSession    →    集成 addSessionMessage  →    废弃旧系统
  (agent-runner)              (agent-runner)              (可选)

预计时间: 4h                   2h                        1h
```

---

## 十一、问题追踪

### 11.1 已修复问题

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026/05/14 | `getSessionPath` 重复添加前缀 | 修复路径构建逻辑 |
| 2026/05/14 | 空 session 列表显示 | 支持 .json 文件扩展名 |
| 2026/05/14 | Escape 键无法退出 session 选择 | 添加 EmptySessionSelector |

### 11.2 待修复问题

| 问题 | 优先级 | 状态 |
|------|--------|------|
| Session 系统不创建新 session | P0 | 🔲 待修复 |
| 消息未保存到 session | P0 | 🔲 待修复 |
| 两个系统数据不同步 | P1 | 🔲 待修复 |
| 旧格式兼容性问题 | P2 | 🔲 待修复 |

### 11.3 里程碑更新

| 里程碑 | 日期 | 目标 | 状态 |
|--------|------|------|------|
| **M1** | **2026/05/14** | **第一阶段完成，便携存储层** | **✅ 已完成** |
| **M2** | **2026/05/14** | **第二阶段完成，会话状态管理** | **✅ 已完成** |
| **M3** | **2026/05/14** | **第三阶段完成，状态水合恢复** | **✅ 已完成** |
| **M4** | **2026/05/14** | **第四阶段完成，环境变量恢复** | **✅ 已完成** |
| **M8** | **待定** | **第五阶段完成，Session 系统统一** | 🔲 |
| M5 | 待定 | Agent 恢复 | 🔲 |
| M6 | 待定 | AI 标题 | 🔲 |
| M7 | 待定 | 分页排序 | 🔲 |
