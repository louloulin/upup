# UpUp Memory Transformation Plan

> 基于 Claude Code、Codex、Loucode、OpenClaw、ClawKB/memvid 的最佳实践
> 制定时间: 2026-05-07

---

## 摘要

本计划将 UpUp 的记忆系统从依赖外部 Embedding API 改造为**三层混合架构**：
1. **AI-Selector 主导**: LLM 语义选择记忆文件 (无 API 依赖)
2. **FTS5 全文兜底**: SQLite FTS5 关键词搜索 (无 API 依赖)
3. **向量搜索可选**: Memvid 内置 BM25 / 源码编译版向量 (可离线)

**核心目标**: 消除 15s Embedding 超时导致的 memory_search 失败。

---

## 一、现状分析

### 1.1 当前问题

| 问题 | 根因 | 影响 |
|------|------|------|
| Embedding API 超时 | 15s 硬超时 + 外部 API 依赖 | memory_search 完全失败 |
| 外部依赖 | OpenAI/Gemini API | 离线不可用 |
| 无记忆分类 | 所有记忆混在一起 | 检索质量差 |
| 无自动提取 | 需手动保存记忆 | 记忆丢失 |

### 1.2 当前架构

```
src/memory/
├── index.ts           # MemoryManager
├── embeddings.ts      # ← 问题源: 15s 超时
├── database.ts        # SQLite + FTS5
├── search.ts          # Hybrid search (向量 + FTS)
├── ai-selector.ts     # AI-driven selection
└── ...
```

---

## 二、参考系统全面对比

### 2.1 核心特性矩阵

| 系统 | 存储格式 | 向量引擎 | 全文搜索 | AI 选择 | 特点 |
|------|---------|---------|---------|---------|------|
| **Claude Code** | Markdown | 无 | 无 | ✅ LLM 选择 | 4 类分类、提取 Agent |
| **Codex** | Markdown | 无 | 无 | ✅ LLM 选择 | 2-phase Pipeline |
| **Loucode** | Markdown | 可选 Memvid | SQLite FTS | ✅ LLM 选择 | AutoDream、晋升 |
| **OpenClaw** | SQLite | sqlite-vec | FTS5 | 混合搜索 | 多 Provider、FTS 降级 |
| **ClawKB** | MV2 单文件 | **内置 ONNX** | Tantivy BM25 | 混合搜索 | memvid-core、100% 离线 |

### 2.2 Memvid npm SDK (@memvid/sdk) 分析

**已安装版本**: `@memvid/sdk@2.0.120`

**架构**: Node.js N-API 原生插件，预编译二进制文件:
- `memvid_sdk.darwin-arm64.node` (Apple Silicon)
- `memvid_sdk.darwin-x64.node` (Intel Mac)
- `memvid_sdk.linux-x64.node` (Linux)
- `memvid_sdk.win32-x64.node` (Windows)

**关键发现: npm SDK 需要外部 Embedding API**

```typescript
// @memvid/sdk 的 EmbeddingProvider 接口
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

// 三个实现: 全部需要外部 API
OpenAIEmbeddings   // OPENAI_API_KEY
CohereEmbeddings   // COHERE_API_KEY
VoyageEmbeddings   // VOYAGE_API_KEY
```

**npm SDK vs Rust memvid-core 对比**:

| 维度 | @memvid/sdk (npm) | memvid-core (Rust) |
|------|-------------------|-------------------|
| 语言绑定 | N-API 原生插件 | Tauri/FFI |
| Embedding | **需要外部 API** | 内置 ONNX + BGE-small |
| 向量索引 | HNSW (Rust) | HNSW (Rust) |
| 全文搜索 | BM25 (Rust) | Tantivy BM25 |
| 存储格式 | MV2 单文件 | MV2 单文件 |
| 离线可用 | 否 | **是** |

**结论**: @memvid/sdk 的 npm 版本需要 OpenAI/Cohere/Voyage API Key，**不是 100% 离线**。
只有 Rust 版本的 memvid-core (通过 Tauri 集成) 才能真正离线运行。

**memvid npm SDK 的价值**: 用于 RAG 流程 (`ask()` 方法)，但 embedding 本身仍依赖外部 API。

### 2.3 Memvid MV2 文件格式

```
┌─────────────────────────────────────────────────────────┐
│  MV2 File Structure (MP4 Container)                     │
├─────────────────────────────────────────────────────────┤
│  Header (4 KiB)                                        │
│  Magic="MV2\0", version=2.1, WAL pointer               │
├─────────────────────────────────────────────────────────┤
│  WAL (64 KiB ~ 64MB)                                  │
│  Write-Ahead Log, 提交前暂存变更                        │
├─────────────────────────────────────────────────────────┤
│  Payload Region                                        │
│  Frame 字节序列 (追加写入)                              │
├─────────────────────────────────────────────────────────┤
│  Index Segments                                         │
│  ├── Lex: Tantivy BM25 全文索引                       │
│  ├── Vec: HNSW 向量索引                                │
│  ├── Time: 时间线索引                                  │
│  └── Temporal: 自然语言日期解析                         │
├─────────────────────────────────────────────────────────┤
│  TOC (Table of Contents)                                │
│  bincode 序列化, 所有帧元信息                           │
├─────────────────────────────────────────────────────────┤
│  Commit Footer                                          │
│  Magic="MV2FOOT!", blake3 hash, generation             │
└─────────────────────────────────────────────────────────┘
```

**Frame 结构**:

```rust
struct Frame {
    id: u32,                    // 自增整数主键
    timestamp: i64,             // Unix 毫秒时间戳
    kind: String,               // "note", "docx", "pdf"...
    tags: Vec<String>,          // 标签
    search_text: String,       // 供全文索引的纯文本
    metadata: DocMetadata,       // MIME/EXIF/媒体信息
    enrichment_state: EnrichmentState, // 渐进摄取状态
}
```

---

## 三、目标架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEXTER MEMORY ARCHITECTURE                            │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║                    RECALL LAYER (查询时)                               ║ │
│  ╠═══════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                        ║ │
│  ║    Query ──┬──► AI-Selector ──► Selected files ──► load content    ║ │
│  ║              │     (LLM, 4-type filter)           │                   ║ │
│  ║              │                                     ▼                   ║ │
│  ║              └──► FTS5 Search ──► candidate chunks ──► merge       ║ │
│  ║                            (fallback)                │                   ║ │
│  ║                                                  ▼                   ║ │
│  ║                               Optional: Memvid RAG (ask)              ║ │
│  ║                                                        │               ║ │
│  ║  ┌─────────────────────────────────────────────────────┐               ║ │
│  ║  │              2-TIER SEARCH + MEMVID               │               ║ │
│  ║  │                                                      │               ║ │
│  ║  │  Tier 1: AI-Selector + FTS5    (Always works)     │               ║ │
│  ║  │  Tier 2: Memvid.find(mode: lex)  (BM25, no API)   │               ║ │
│  ║  │  Tier 3: Memvid.find(mode: sem)  (Vector, 需编译) │               ║ │
│  ║  └─────────────────────────────────────────────────────┘               ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║                    STORAGE LAYER                                       ║ │
│  ╠═══════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                        ║ │
│  ║   ~/.upup/memory/                                                   ║ │
│  ║   ├── MEMORY.md                    # 入口索引 (最多 200 行)             ║ │
│  ║   ├── user/                       # 用户记忆                           ║ │
│  ║   │   ├── preferences.md                                             ║ │
│  ║   │   └── role.md                                                     ║ │
│  ║   ├── feedback/                   # 反馈记忆                           ║ │
│  ║   │   └── coding_style.md                                           ║ │
│  ║   ├── project/                    # 项目记忆                           ║ │
│  ║   │   └── auth_rewrite.md                                           ║ │
│  ║   ├── reference/                  # 引用记忆                           ║ │
│  ║   │   └── linear_bugs.md                                            ║ │
│  ║   └── logs/                       # 追加日志                           ║ │
│  ║       └── 2026/05/2026-05-07.md                                     ║ │
│  ║                                                                        ║ │
│  ║   ~/.upup/index.sqlite                                              ║ │
│  ║   ├── memories                  # 记忆文件索引                         ║ │
│  ║   ├── memories_fts              # FTS5 全文索引                       ║ │
│  ║   ├── embedding_cache           # 向量缓存                           ║ │
│  ║   └── meta                      # 元数据                              ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║                    EXTRACTION PIPELINE (2-phase)                       ║ │
│  ╠═══════════════════════════════════════════════════════════════════════╣ │
│  ║                                                                        ║ │
│  ║   ┌──────────────────────────────────────────────────────────────┐   ║ │
│  ║   │  Phase 1: extractMemories (per turn, post-response)        │   ║ │
│  ║   │  ────────────────────────────────────────────────────────── │   ║ │
│  ║   │  Trigger: model produced final response (no tool calls)     │   ║ │
│  ║   │  Forked agent reads last N messages + existing manifest     │   ║ │
│  ║   │  Writes: user/feedback/project/reference + MEMORY.md index   │   ║ │
│  ║   └──────────────────────────────────────────────────────────────┘   ║ │
│  ║                              │                                       ║ │
│  ║                              ▼                                       ║ │
│  ║   ┌──────────────────────────────────────────────────────────────┐   ║ │
│  ║   │  Phase 2: consolidateMemories (periodic, background)       │   ║ │
│  ║   │  ────────────────────────────────────────────────────────   │   ║ │
│  ║   │  Trigger: ≥24h since last OR ≥5 new sessions             │   ║ │
│  ║   │  Lock file prevents concurrent consolidation                  │   ║ │
│  ║   │  Reads: recent logs + existing files + transcripts           │   ║ │
│  ║   │  Writes: merge into topic files + update MEMORY.md          │   ║ │
│  ║   └──────────────────────────────────────────────────────────────┘   ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 搜索流程图

```
用户查询
    │
    ├──► AI Selector (主要方式)
    │         │
    │         ├── 扫描 MEMORY.md 索引
    │         ├── 构建 manifest: "- filename: type — description"
    │         ├── LLM 选择最相关的记忆 (max 5)
    │         └── 读取选中文件内容
    │
    └──► 搜索补充 (AI 无结果时)
              │
              ├── Memvid.find(mode: 'lex') (BM25 关键词搜索)
              │     └── prebuilt binary 可用, 无 API 依赖
              │
              ├── Memvid RAG (ask())
              │     └── 可选增强, 需要 LLM API Key
              │
              └── SQLite FTS5 (降级)
                    └── 纯关键词兜底
```

**最终决策: 使用 @memvid/sdk 作为存储和搜索引擎**
- Memvid prebuilt binary BM25 搜索已可用 (无 API 依赖)
- 向量搜索 (mode: 'sem') 需要源码编译 memvid-core
- AI-Selector + Memvid BM25 是唯一保证无 API 超时的路径

---

## 四、记忆类型体系

### 4.1 四类分类法 (来自 Claude Code)

| 类型 | 英文名 | 说明 | 保存时机 |
|------|--------|------|----------|
| **用户** | user | 用户角色、目标、知识背景 | 学到用户任何相关信息时 |
| **反馈** | feedback | 对工作方式的指导 | 用户纠正或确认成功时 |
| **项目** | project | 进行中的工作、目标 | 学到 who/what/why/by when 时 |
| **引用** | reference | 外部系统指针 | 学到外部资源位置时 |

### 4.2 前端格式

```yaml
---
name: portfolio_rebalance_strategy
description: User prefers quarterly rebalancing with tax-loss harvesting triggers
type: project
---
Lead with the fact or decision.

**Why:** User's accountant flagged wash-sale risk in taxable accounts.

**How to apply:** Before suggesting any rebalancing trade, check if the position
is within 30 days of a prior sale. If yes, skip the trade and flag it.
```

### 4.3 不保存的内容

- 代码模式、架构、Git 历史 (可从当前状态推导)
- 已在配置文件中声明的内容
- 临时任务细节
- 当前会话上下文

### 4.4 金融领域扩展

```typescript
const FINANCIAL_MEMORY_GUIDANCE = {
  user: [
    "Risk tolerance (conservative/moderate/aggressive)",
    "Investment horizon (retirement date, liquidity needs)",
    "Account types (taxable, IRA, 401k, Roth)",
    "Brokerage preferences",
  ],
  feedback: [
    "Approved trading strategies",
    "Disallowed trade types (e.g., no options, no meme stocks)",
    "Reporting requirements",
  ],
  project: [
    "Current portfolio positions and thesis",
    "Research targets and coverage list",
    "Key financial metrics being tracked",
  ],
  reference: [
    "Bloomberg terminal shortcuts",
    "SEC EDGAR filing schedules",
    "Earnings calendar sources",
  ],
}
```

---

## 五、设计决策

### Decision 1: 为什么不用向量作为主要搜索方式

**问题根源**: 15s Embedding 超时导致 memory_search 完全失败。

**解决方案**: 两层搜索 + Memvid 存储，确保任何情况下都有可用搜索。

```
Tier 1 (Always works):  AI-Selector + FTS5
  - AI-Selector: lightweight LLM call, ~50ms, 无 API 失败风险
  - FTS5: SQLite 原生, 无网络依赖

Tier 2 (Local search):  Memvid.find(mode: 'lex')
  - BM25 Tantivy, prebuilt binary 可用
  - 无 API 依赖, 100% 离线
  - 向量搜索 (mode: 'sem') 仅源码编译版可用
```

### Decision 2: Memvid 作为 UpUp 的核心

**结论**: @memvid/sdk npm 包是 UpUp 的最佳选择。

| 维度 | @memvid/sdk (npm) | 说明 |
|------|-------------------|------|
| BM25 搜索 | ✅ `find(mode: 'lex')` | prebuilt 可用, 无 API |
| MV2 存储 | ✅ 单文件存储 | 高效追加, 版本化 |
| RAG 合成 | ✅ `ask()` | 需要 LLM API Key |
| PII 脱敏 | ✅ `maskPii()` | 内置函数 |
| 向量搜索 | ⚠️ 需源码编译 | `find(mode: 'sem')` |
| 离线可用 | ✅ BM25/RAG | BM25 无 API, RAG 需 LLM Key |

**决策**:
1. Memvid 作为**核心存储和搜索引擎** (BM25 prebuilt 可用)
2. AI-Selector 作为**主要检索方式** (LLM 语义选择)
3. SQLite FTS5 作为**降级搜索** (极端情况)
4. 向量搜索作为**可选增强** (如需源码编译 memvid-core)

### Decision 3: 存储格式

**决策: Pure Markdown + SQLite FTS5 (混合)**。

- 记忆文件: 纯 Markdown + YAML frontmatter
- 搜索索引: SQLite + FTS5
- Session 转录: JSONL + chunking (保留现有)

### Decision 4: 提取时机

**决策: Phase 1 post-turn 触发; Phase 2 idle/periodic 触发**

- **Phase 1**: 每个无 tool calls 的响应后触发。快速捕获用户纠正和偏好。
- **Phase 2**: idle 时触发 (24h + 5 sessions)。深度提炼日志为结构化 topic 文件。

---

## 六、实施计划

### Phase 0: 基础架构 (Week 1)

- [ ] 添加 `MemoryType` 到 `types.ts`
- [ ] 创建 `scanner.ts` -- 扫描 + 解析 frontmatter + 构建 manifest
- [ ] 创建 `prompts.ts` -- typed extraction prompts
- [ ] 创建 `extraction.ts` -- Phase 1 forked-agent extractor
- [ ] 添加迁移脚本: 现有记忆 → 4-type 分类

### Phase 1: AI-Selection Recall (Week 2)

- [ ] 重写 `ai-selector.ts` 使用 scanner + manifest
- [ ] 修改 `MemoryManager.search()` 以 AI-selector 为主要路径
- [ ] 添加 FTS5 refinement pass
- [ ] 添加 `degraded` 结果标志
- [ ] Feature flag: `memory.aiSelection`

### Phase 2: Typed Extraction (Week 3)

- [ ] 将 `extractMemories` 接入 stopHooks
- [ ] 添加 extraction throttle (turnsSinceLastExtraction guard)
- [ ] 添加 mutual exclusion (跳过主 agent 已写入的情况)
- [ ] Feature flag: `memory.extraction`

### Phase 3: Consolidation (Week 4)

- [ ] 创建 `consolidation.ts` -- Phase 2 periodic consolidator
- [ ] 创建 `consolidation-prompt.ts` -- 4-phase consolidation prompt
- [ ] 创建 `consolidation-lock.ts` -- file-based lock
- [ ] Feature flag: `memory.consolidation`

### Phase 4: Memvid 增强 (Week 5)

- [ ] 实现 Memvid `ask()` RAG 合成
- [ ] 添加 Memvid RAG feature flag
- [ ] 评估源码编译 memvid-core 启用向量搜索
- [ ] 移除 `embeddings.ts` 中 15s 超时相关代码

### Phase 5: 清理 (Week 6-8)

- [ ] 移除 `flush.ts` 和调用点
- [ ] 移除 `mmr.ts` (如果 vector 路径完全移除)
- [ ] 更新 CLAUDE.md

---

## 七、文件变更清单

```
src/memory/
├── index.ts                  # [改造] MemoryManager
├── types.ts                  # [改造] 添加 MemoryType, frontmatter types
│
├── [保留]
├── store.ts                 # 文件系统操作
├── temporal-decay.ts        # 时间衰减
├── session-files.ts          # Session transcript parsing
├── chunker.ts               # 文本分块
│
├── [改造]
├── ai-selector.ts           # 重写: scanner + LLM
├── search.ts                # 改造: Memvid BM25 为主 + FTS5 降级
├── database.ts              # 增强: memories 表 + FTS5
│
├── [新增]
├── memvid-store.ts         # Memvid MV2 存储 + BM25 搜索
├── scanner.ts               # 扫描 memory dir + 解析 frontmatter
├── fts-refine.ts            # FTS5 pass over selected files
├── extraction.ts             # Phase 1 per-turn extractor
├── prompts.ts               # extraction + consolidation prompts
├── consolidation.ts          # Phase 2 periodic consolidator
├── consolidation-lock.ts     # file-based lock
│
├── [废弃]
├── embeddings.ts            # Phase 4 移除 (不再需要)
├── flush.ts                 # Phase 5 移除
└── mmr.ts                   # Phase 5 移除
```

---

## 八、SQLite Schema

```sql
-- memories: 每个记忆文件一行
CREATE TABLE memories (
  id           TEXT PRIMARY KEY,
  file_path    TEXT NOT NULL,
  memory_type  TEXT,
  title        TEXT,
  description  TEXT,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  frontmatter  TEXT,
  mtime        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX idx_memories_hash ON memories(content_hash);
CREATE INDEX idx_memories_type ON memories(memory_type);
CREATE INDEX idx_memories_path ON memories(file_path);
CREATE INDEX idx_memories_updated ON memories(updated_at);

-- FTS5: 全文搜索 (无 API 依赖)
CREATE VIRTUAL TABLE memories_fts USING fts5(
  title,
  description,
  content,
  memory_id UNINDEXED
);

-- Embedding 缓存
CREATE TABLE embedding_cache (
  content_hash TEXT PRIMARY KEY,
  embedding    BLOB NOT NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- Meta 配置
CREATE TABLE meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

---

## 九、参考实现

| 项目 | 参考点 |
|------|--------|
| Claude Code | 4 类分类、AI Selector、MEMORY.md 索引 |
| Codex | 2-phase Pipeline、遗忘机制 |
| Loucode | AutoDream、typed extraction、晋升 |
| OpenClaw | sqlite-vec、FTS 降级、多 Provider |
| ClawKB/memvid-core | MV2 单文件、内置 ONNX HNSW (Rust Tauri 集成，非 npm) |

---

## 十、关键文件路径

- `/Users/louloulin/Documents/linchong/touzhi/upup/src/memory/index.ts`
- `/Users/louloulin/Documents/linchong/touzhi/upup/src/memory/ai-selector.ts`
- `/Users/louloulin/Documents/linchong/touzhi/upup/src/memory/search.ts`
- `/Users/louloulin/Documents/linchong/claw/loucode/src/memdir/memoryTypes.ts`
- `/Users/louloulin/Documents/linchong/claw/openclaw/src/memory/embeddings.ts`
- `/Users/louloulin/Documents/linchong/claw/kb/crates/clawkb-core/src/kb.rs`
- `/Users/louloulin/Documents/linchong/claw/kb/kb2.1.md` (memvid 深度分析)
