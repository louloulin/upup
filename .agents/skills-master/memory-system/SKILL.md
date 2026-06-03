---
name: memory-system
description: |
  AI Agent持久化记忆系统。当需要实现记忆存储、跨会话上下文、记忆搜索、记忆提取、个性化建议时触发。
  包括：TF-IDF搜索、Embeddings搜索、记忆加密、访问控制、记忆提取。
---

# Memory System - 持久化记忆系统

## 核心概念

记忆系统为AI Agent提供持久化存储、跨会话上下文和智能记忆提取能力。

## 架构概览

```
MemorySystem
├── Storage Layer
│   ├── File System (.upup/memory/)
│   └── SQLite Index (memory.db)
├── Search Layer
│   ├── TF-IDF Search
│   ├── Embedding Search
│   └── Hybrid Search (MMR)
├── Extraction Layer
│   └── Memory Extraction Hook
└── Access Control
    └── Encryption + Permissions
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
  category TEXT,          -- 'long-term', 'daily', 'session'
  created_at INTEGER,
  updated_at INTEGER,
  vector_id TEXT,
  importance REAL DEFAULT 0.5,
  access_level TEXT       -- 'private', 'team', 'shared'
);

CREATE VIRTUAL TABLE memories_fts USING fts5(content, content='memories', content_rowid='rowid');
```

## 记忆类型

### 1. Long-term Memory

```typescript
interface LongTermMemory {
  type: 'long-term'
  content: string
  metadata: {
    importance: number      // 0-1
    tags: string[]
    lastAccessed: Date
  }
}

// 存储
memory.update({
  action: 'append',
  category: 'long-term',
  content: 'User prefers conservative investments with max 10% drawdown'
})

// 搜索
const results = await memory.search({
  query: 'investment preferences',
  category: 'long-term',
  limit: 10
})
```

### 2. Daily Log

```typescript
interface DailyLog {
  type: 'daily'
  date: string             // YYYY-MM-DD
  content: string
  entries: LogEntry[]
}

memory.update({
  action: 'append',
  file: 'daily',
  content: '2024-01-15: Analyzed AAPL earnings, meeting tomorrow'
})
```

### 3. Session Memory

```typescript
interface SessionMemory {
  type: 'session'
  sessionId: string
  context: {
    goals: string[]
    constraints: string[]
    recentTopics: string[]
  }
}

// 加载会话上下文
const sessionContext = await memory.loadSessionContext(sessionId)
```

## 搜索系统

### 1. TF-IDF搜索

```typescript
async function tfidfSearch(query: string, options: SearchOptions): Promise<MemoryResult[]> {
  const tokens = tokenize(query)
  const scores = new Map<string, number>()
  
  for (const memory of memories) {
    const memoryTokens = tokenize(memory.content)
    const tfidf = calculateTFIDF(tokens, memoryTokens, allMemories)
    scores.set(memory.id, tfidf)
  }
  
  return sortByScore(scores).slice(0, options.limit)
}
```

### 2. Embedding搜索

```typescript
async function embeddingSearch(
  query: string, 
  options: SearchOptions
): Promise<MemoryResult[]> {
  const queryEmbedding = await generateEmbedding(query)
  
  const results = await db.query(`
    SELECT * FROM memories 
    ORDER BY cosine_similarity(vector, $queryEmbedding)
    LIMIT $limit
  `, { queryEmbedding, limit: options.limit })
  
  return results.filter(r => 
    r.similarity >= (options.similarityThreshold ?? 0.7)
  )
}
```

### 3. 混合搜索 (MMR)

```typescript
async function hybridSearch(
  query: string,
  options: SearchOptions & { useMMR: true }
): Promise<MemoryResult[]> {
  const tfidfResults = await tfidfSearch(query, options)
  const embedResults = await embeddingSearch(query, options)
  
  // MMR去重
  const seen = new Set<string>()
  const merged: MemoryResult[] = []
  
  for (const result of [...tfidfResults, ...embedResults]) {
    if (!seen.has(result.id)) {
      seen.add(result.id)
      merged.push(result)
    }
    if (merged.length >= options.limit) break
  }
  
  return merged
}
```

## 记忆提取

### 自动提取Hook

```typescript
interface ExtractionConfig {
  minTurnsBetweenExtractions: number  // 默认5轮
  maxMemoriesPerExtraction: number     // 默认3条
}

function createExtractionHook(config: ExtractionConfig) {
  let turnCount = 0
  
  return async (messages: Message[]): Promise<ExtractionResult[]> => {
    turnCount++
    
    if (turnCount < config.minTurnsBetweenExtractions) {
      return []
    }
    
    turnCount = 0  // 重置
    
    // 从消息中提取记忆
    const extractions = await extractMemories(messages, config.maxMemoriesPerExtraction)
    
    for (const extraction of extractions) {
      await memory.update({
        action: 'append',
        category: 'long-term',
        content: extraction.content,
        importance: extraction.importance
      })
    }
    
    return extractions
  }
}
```

### 提取规则

```typescript
const extractionRules = [
  {
    pattern: /I prefer|I like|I want|My (goal|target)/i,
    type: 'preference',
    category: 'preferences'
  },
  {
    pattern: /my (risk|tolerance|limit)/i,
    type: 'constraint',
    category: 'constraints'
  },
  {
    pattern: /remember|don't forget|keep in mind/i,
    type: 'explicit',
    category: 'explicit'
  }
]
```

## 加密存储

```typescript
import { createCipher, createDecipher } from 'crypto'

class EncryptedStore {
  private cipher: Algorithm
  private key: Buffer
  
  constructor(config: { key: string; cipher: 'aes-256-gcm' }) {
    this.key = Buffer.from(config.key, 'hex')
    this.cipher = config.cipher
  }
  
  async set(key: string, value: object): Promise<void> {
    const encrypted = this.cipher.update(JSON.stringify(value))
    await db.set(key, {
      encrypted: encrypted.toString('base64'),
      iv: this.cipher.getIV()
    })
  }
  
  async get(key: string): Promise<object> {
    const stored = await db.get(key)
    const decipher = createDecipher(this.cipher, this.key)
    const decrypted = decipher.update(Buffer.from(stored.encrypted, 'base64'))
    return JSON.parse(decrypted.toString())
  }
}
```

## 访问控制

```typescript
interface AccessLevel {
  level: 'private' | 'team' | 'shared'
  teamId?: string
  grantedUsers?: string[]
}

function checkAccess(memory: Memory, user: User): boolean {
  if (memory.accessLevel === 'shared') return true
  if (memory.accessLevel === 'private') {
    return memory.ownerId === user.id
  }
  if (memory.accessLevel === 'team') {
    return user.teamId === memory.teamId
  }
  return false
}
```

## 触发场景

### 什么时候使用

- 用户明确说明偏好
- 需要跨会话上下文
- 个性化建议前
- 重要决策和理由
- 反馈和修正

### 什么时候不存储

- 临时计算结果
- 一次性的搜索结果
- 明显的一次性信息

## API接口

```typescript
// 搜索
memory.search(query: string, options?: SearchOptions): Promise<MemoryResult[]>

// 更新
memory.update(action: MemoryAction): Promise<void>

// 加载会话
memory.loadSessionContext(sessionId: string): Promise<SessionContext>

// 列表
memory.list(category?: string): Promise<MemoryMetadata[]>

// 删除
memory.delete(id: string): Promise<void>
```

## 最佳实践

### 搜索优化

```typescript
// 精确分类搜索
memory.search({
  query: 'risk limit',
  category: ['long-term'],  // 限制范围
  limit: 5
})

// 时间范围过滤
memory.search({
  query: 'recent positions',
  timeRange: { days: 30 }
})

// 相似度阈值
memory.search({
  query: 'investment goals',
  similarityThreshold: 0.75  // 提高精度
})
```
