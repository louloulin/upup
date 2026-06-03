---
name: upup-memory
description: UpUp记忆系统。用于理解持久化记忆、记忆搜索、记忆提取、记忆整合。当需要存储用户偏好、跨会话记忆、记忆搜索、个性化建议时触发。
---

# UpUp Memory - 记忆系统 Skill

## 概述

UpUp的记忆系统提供持久化存储、跨会话上下文和智能记忆提取。

## 架构

```
src/memory/
├── store.ts            # 基础存储
├── search.ts          # 搜索 (TF-IDF + Embeddings)
├── extraction.ts      # 记忆提取 (自动学习)
├── consolidation.ts   # 记忆整合
├── indexer.ts         # 向量化索引
├── database.ts        # SQLite存储
├── embeddings.ts      # Embedding生成
├── mmr.ts            # 最大边际相关性
├── extraction.ts     # 提取Hook
├── daily-log.ts      # 每日日志
├── prompts.ts        # 记忆提示
├── access-control.ts # 访问控制
└── types.ts          # 类型定义
```

## 存储结构

### 文件系统

```
.upup/
├── memory/
│   ├── long-term/     # 长期记忆
│   ├── daily/         # 每日日志
│   ├── sessions/      # 会话记忆
│   └── transcripts/  # 对话记录
└── memory.db         # SQLite索引
```

### SQLite模式

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT,        -- 'long-term', 'daily', 'session'
  created_at INTEGER,
  updated_at INTEGER,
  vector_id TEXT,       -- 向量ID
  importance REAL DEFAULT 0.5,
  access_level TEXT     -- 'private', 'team', 'shared'
);
```

## 记忆类型

### 1. Long-term Memory

长期存储的用户信息、偏好、目标。

```typescript
// 存储
memory.update({
  action: 'append',
  content: 'User prefers conservative investments with 10% max drawdown',
  category: 'long-term'
});

// 搜索
const results = await memory.search('investment preferences risk tolerance');
```

### 2. Daily Log

每日工作记录和临时笔记。

```typescript
memory.update({
  action: 'append',
  file: 'daily',
  content: '2024-01-15: Analyzed AAPL earnings, meeting with portfolio team tomorrow'
});
```

### 3. Session Memory

当前会话的上下文。

```typescript
memory.loadSessionContext(sessionId);
```

## 搜索

### 1. TF-IDF搜索

基于词频-逆文档频率的关键词搜索。

```typescript
const results = await memorySearch({
  query: 'portfolio risk management',
  limit: 10,
  categories: ['long-term', 'daily']
});
```

### 2. Embedding搜索

语义相似性搜索。

```typescript
const results = await memorySearch({
  query: 'What are the investment goals?',
  useEmbeddings: true,
  similarityThreshold: 0.75
});
```

### 3. 混合搜索 (MMR)

结合关键词和语义搜索，最大边际相关性去重。

```typescript
const results = await memorySearch({
  query: 'risk management strategy',
  useMMR: true,
  limit: 10
});
```

## 记忆提取

### 自动提取Hook

Agent每5轮自动提取一次记忆:

```typescript
const extractionHook = createExtractionHook({
  minTurnsBetweenExtractions: 5,
  maxMemoriesPerExtraction: 3,
});

// 在Agent中
await extractionHook(messages);
```

### 提取规则

1. 用户偏好和目标
2. 重要的决策和理由
3. 反馈和修正
4. 新知识或发现

### 保存门控

```typescript
interface SaveGate {
  shouldSave: boolean
  importance: number      // 0-1
  category: string
  reason: string
}
```

## 访问控制

```typescript
memory.update({
  content: 'Team strategy for Q2',
  accessLevel: 'team',   // 'private' | 'team' | 'shared'
  metadata: { teamId: 'alpha' }
});
```

## 加密存储

```typescript
import { EncryptedStore } from '@/memory/encrypted-store';

const store = new EncryptedStore({
  encryptionKey: process.env.MEMORY_ENCRYPTION_KEY,
  cipher: 'aes-256-gcm'
});

// 自动加密/解密
await store.set('sensitive-data', { ssn: 'xxx' });
const data = await store.get('sensitive-data');
```

## 与Agent集成

### 系统提示注入

```typescript
const memoryContext = await memoryManager.loadSessionContext();
const systemPrompt = buildSystemPrompt({
  // ...
  memoryFiles: await memoryManager.listFiles(),
  memoryContext: memoryContext.text,
});
```

### 记忆强制检查

```markdown
### Recalling memories
Before giving personalized financial advice, ALWAYS call memory_search first.
```

## 最佳实践

### 什么时候存储记忆

✓ 用户明确说明偏好 ("I prefer..." / "My goal is...")
✓ 重要决策和理由
✓ 反馈和修正
✓ 长期目标和约束

### 什么时候不存储

✗ 临时计算结果
✗ 一次性的搜索结果
✗ 明显的一次性信息

### 查询优化

```typescript
// 精确分类搜索
const results = await memorySearch({
  query: 'risk limit',
  categories: ['long-term'],  // 限制范围
  limit: 5
});

// 时间范围过滤
const results = await memorySearch({
  query: 'recent positions',
  timeRange: { days: 30 }
});
```
