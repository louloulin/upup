# Plan 23.1: 代码架构优化计划

> 创建日期：2026-05-19
> 目标：全面分析代码架构设计问题，制定优化计划

---

## 一、架构问题概览

### 1.1 代码规模统计

| 模块 | 文件数 | 代码行数 | 问题等级 |
|------|--------|----------|----------|
| agent/ | 47 | ~1300 行/文件 | ⚠️ 中 |
| tools/ | 64 | ~1300 行/文件 | ⚠️ 中 |
| memory/ | 42 | 分散 | ⚠️ 中 |
| session/ | 20 | 分散 | ✅ 良好 |
| skills/ | 25 | 分散 | ⚠️ 中 |

### 1.2 核心问题

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 工具模块过大 | 难以维护和扩展 | P0 |
| 硬编码逻辑 | 缺乏抽象 | P1 |
| 循环依赖 | 编译变慢 | P1 |
| 缺乏接口抽象 | 难以测试 | P2 |
| API 客户端分散 | 重复代码 | P2 |

---

## 二、问题详细分析

### 2.1 工具模块问题

#### 问题 1: research-tools.ts 过大 (1000+ 行)

**位置**: `src/tools/research/research-tools.ts`

**问题描述**:
```typescript
// 问题：所有情感分析逻辑都在一个文件
const POSITIVE_WORDS = [...];      // 100+ 词条
const NEGATIVE_WORDS = [...];     // 100+ 词条
const NEUTRAL_WORDS = [...];      // 50+ 词条
const NEGATION_PATTERNS_EN = [...];
const FINANCIAL_POSITIVE_SIGNALS = [...];
```

**影响**:
- 单文件超过 1000 行，难以维护
- 情感词典硬编码，无法动态扩展
- 关键词匹配逻辑重复

**优化方案**:
```
src/tools/research/
├── sentiment/
│   ├── index.ts
│   ├── keywords/
│   │   ├── positive.ts
│   │   ├── negative.ts
│   │   └── financial-signals.ts
│   ├── negation/
│   │   ├── english.ts
│   │   └── chinese.ts
│   └── analyzer.ts
├── index.ts
└── research-tools.ts (简化)
```

---

#### 问题 2: API 客户端分散

**位置**: 多个工具目录

**当前状态**:
```
src/tools/astock/
├── tushare-client.ts      # Tushare API
├── realtime-client.ts       # 实时行情
├── news-client.ts          # 新闻
├── screener-client.ts      # 筛选器
└── ...

src/tools/finance/
├── api.ts                 # 分散的 API 调用
├── crypto.ts
├── earnings.ts
└── ...
```

**问题**:
- API 客户端逻辑分散在多个文件
- 重试、超时、错误处理不统一
- 缺乏统一的 API 错误处理

**优化方案**:
```
src/api/
├── client.ts              # 统一 HTTP 客户端
├── errors.ts              # API 错误类型
├── retry.ts              # 重试机制
├── tushare/
│   ├── index.ts
│   ├── financial.ts
│   ├── market.ts
│   └── news.ts
├── yahoo/
│   ├── index.ts
│   └── finance.ts
└── base.ts               # 基础客户端
```

---

#### 问题 3: 工具注册复杂

**位置**: `src/tools/registry/`

**当前问题**:
```typescript
// 每个工具都需要手动注册
export async function getToolRegistry(model: string): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [
    ...loadFinanceTools(model),
    ...await loadWebSearchTools(),
    ...loadFilesystemTools(),
    // ... 重复的配置
  ];
  return tools;
}
```

**优化方案**:
- 使用装饰器模式自动注册
- 统一的工具元数据定义
- 动态工具发现机制

---

### 2.2 数据模块问题

#### 问题 4: 内存系统过于复杂

**位置**: `src/memory/`

**当前问题**:
- 42 个文件，职责不清
- 多个存储后端（SQLite、MemVid）
- 缺乏统一的数据模型

**优化方案**:
```
src/memory/
├── domain/
│   ├── semantic.ts        # 语义记忆
│   ├── episodic.ts         # 情景记忆
│   └── procedural.ts       # 程序记忆
├── storage/
│   ├── sqlite.ts          # SQLite 存储
│   ├── memvid.ts          # MemVid 存储
│   └── cache.ts           # 缓存层
├── services/
│   ├── consolidation.ts   # 记忆整合
│   ├── retrieval.ts       # 记忆检索
│   └── extraction.ts      # 记忆提取
└── index.ts
```

---

### 2.3 技能系统问题

#### 问题 5: 技能执行器逻辑复杂

**位置**: `src/skills/executor.ts`

**当前问题**:
```typescript
// 硬编码的执行模式
export async function executeSkillInline(...) {
  // inline 执行逻辑
}

export async function executeSkillFork(...) {
  // fork 执行逻辑
}
```

**优化方案**:
- 策略模式支持多种执行器
- 技能执行管道（预处理 → 执行 → 后处理）
- 统一的进度和错误处理

---

### 2.4 存储系统问题

#### 问题 6: 会话存储分散

**位置**: `src/storage/`, `src/session/`

**当前问题**:
- 多个存储位置（.session, .upup, ~/.upup）
- 缺乏统一的事务管理
- 会话数据模型不统一

**优化方案**:
```
src/storage/
├── unified/
│   ├── database.ts         # 统一数据库
│   ├── migrations/         # 数据库迁移
│   └── transactions.ts     # 事务管理
├── sessions/
│   ├── manager.ts
│   ├── storage.ts
│   └── restore.ts
└── project/
    ├── project-storage.ts
    └── file-history.ts
```

---

## 三、具体优化任务

### 3.1 P0: 紧急优化

#### 任务 1: 提取情感分析模块

**文件**: `src/tools/research/sentiment/`

**实现**:
```typescript
// src/tools/research/sentiment/keywords/positive.ts
export const POSITIVE_KEYWORDS: KeywordConfig = {
  english: ['growth', 'profit', 'surge', ...],
  chinese: ['增长', '盈利', '突破', ...],
  financial: [
    { pattern: /beat.*estimate/i, weight: 3, label: 'beat_estimate' },
    ...
  ]
};

// src/tools/research/sentiment/analyzer.ts
export class SentimentAnalyzer {
  constructor(private keywords: KeywordConfig) {}

  analyze(text: string): SentimentResult {
    // 分析逻辑
  }
}
```

**测试**:
- [ ] 英文情感分析准确率 > 85%
- [ ] 中文情感分析准确率 > 80%
- [ ] 金融语境权重正确应用

---

#### 任务 2: 统一 API 客户端

**文件**: `src/api/`

**实现**:
```typescript
// src/api/client.ts
export class ApiClient {
  constructor(private config: ApiClientConfig) {}

  async request<T>(endpoint: string, params: Record<string, unknown>): Promise<T> {
    // 统一的请求逻辑
    // - 自动重试
    // - 超时处理
    // - 错误转换
  }
}

// src/api/tushare/index.ts
export class TushareClient extends ApiClient {
  async getFinancials(code: string): Promise<Financials> {
    return this.request('financial_data', { trade_code: code });
  }
}
```

**测试**:
- [ ] Tushare API 调用成功
- [ ] 重试机制工作正常
- [ ] 错误处理正确

---

### 3.2 P1: 重要优化

#### 任务 3: 工具注册系统重构

**文件**: `src/tools/registry/`

**实现**:
```typescript
// src/tools/registry/decorators.ts
export function registerTool(config: ToolConfig) {
  return function <T extends new (...args: any[]) => any>(target: T) {
    ToolRegistry.register(target, config);
    return target;
  };
}

// 使用装饰器
@registerTool({
  name: 'get_stock_price',
  category: 'financial',
  safety: 'safe',
  description: 'Get real-time stock price'
})
export class StockPriceTool extends BaseTool {
  // ...
}
```

---

#### 任务 4: 存储系统重构

**文件**: `src/storage/unified/`

**实现**:
```typescript
// src/storage/unified/database.ts
export class UnifiedDatabase {
  private db: Database;

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // 统一的事务管理
    await this.db.run('BEGIN TRANSACTION');
    try {
      const result = await fn();
      await this.db.run('COMMIT');
      return result;
    } catch (e) {
      await this.db.run('ROLLBACK');
      throw e;
    }
  }
}
```

---

### 3.3 P2: 改进优化

#### 任务 5: 技能系统增强

**文件**: `src/skills/`

**实现**:
```typescript
// src/skills/pipeline.ts
export interface SkillPipeline {
  preprocessor?: SkillPreprocessor;
  executor: SkillExecutor;
  postprocessor?: SkillPostprocessor;
}

// 技能执行管道
export class SkillExecutionPipeline {
  async execute(skill: Skill, context: ExecutionContext): Promise<Result> {
    // 1. 预处理
    const preprocessed = await this.preprocess(skill);

    // 2. 执行
    const result = await this.executor.execute(preprocessed, context);

    // 3. 后处理
    return this.postprocess(result);
  }
}
```

---

## 四、重构路线图

### Phase 1: 提取情感分析模块 (1周)

```
Day 1-2: 创建 sentiment/ 目录结构
Day 3-4: 提取关键词配置
Day 5: 实现 SentimentAnalyzer 类
Day 6-7: 测试和文档
```

### Phase 2: 统一 API 客户端 (2周)

```
Week 1:
  Day 1-2: 创建 src/api/ 基础结构
  Day 3-4: 实现 ApiClient 基类
  Day 5: 添加重试和错误处理

Week 2:
  Day 1-2: 迁移 TushareClient
  Day 3-4: 迁移其他 API 客户端
  Day 5: 测试和回归测试
```

### Phase 3: 工具注册系统 (2周)

```
Week 1:
  Day 1-2: 设计装饰器 API
  Day 3-4: 实现 ToolRegistry
  Day 5: 迁移一个工具模块

Week 2:
  Day 1-3: 迁移剩余工具
  Day 4-5: 测试和文档
```

### Phase 4: 存储系统重构 (3周)

```
Week 1:
  Day 1-2: 设计统一数据模型
  Day 3-4: 实现 UnifiedDatabase
  Day 5: 迁移会话存储

Week 2:
  Day 1-3: 迁移项目存储
  Day 4-5: 添加迁移脚本

Week 3:
  Day 1-2: 测试和性能优化
  Day 3-5: 文档和发布
```

---

## 五、风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 重构破坏现有功能 | 中 | 高 | 充分的测试覆盖 |
| API 客户端迁移 | 高 | 中 | 渐进式迁移 |
| 数据迁移 | 低 | 高 | 备份和回滚 |
| 性能回退 | 中 | 中 | 性能基准测试 |

---

## 六、验收标准

### 短期 (1个月)

- [ ] 情感分析模块提取完成
- [ ] API 客户端统一
- [ ] 工具注册系统支持装饰器
- [ ] 所有现有测试通过

### 中期 (3个月)

- [ ] 存储系统重构完成
- [ ] 技能执行管道实现
- [ ] 性能无回退
- [ ] 文档完整

### 长期 (6个月)

- [ ] 所有模块重构完成
- [ ] 新的模块化架构稳定
- [ ] 开发者体验提升
- [ ] 新功能开发效率提升

---

## 七、技术债务清理

### 7.1 待删除的重复代码

| 文件 | 问题 | 建议 |
|------|------|------|
| src/tools/research/research-tools.ts | 情感分析逻辑重复 | 提取到 sentiment/ |
| src/tools/astock/*.ts | API 客户端分散 | 统一到 src/api/ |
| src/memory/*.ts | 存储逻辑重复 | 统一到 storage/ |

### 7.2 待简化的配置

| 配置 | 问题 | 建议 |
|------|------|------|
| 工具元数据 | 硬编码 | 使用配置文件 |
| API 端点 | 分散 | 统一配置 |
| 关键词词典 | 硬编码 | 外部文件加载 |

### 7.3 待添加的测试

| 模块 | 测试覆盖率 | 目标 |
|------|-----------|------|
| 情感分析 | 30% | 80% |
| API 客户端 | 50% | 90% |
| 工具注册 | 20% | 80% |
| 存储系统 | 40% | 80% |

---

## 八、总结

### 8.1 核心问题

1. **工具模块过大**: research-tools.ts 等文件超过 1000 行
2. **API 客户端分散**: 缺乏统一的 API 客户端基类
3. **缺乏模块化**: 职责不清，难以测试
4. **技术债务**: 重复代码和硬编码配置

### 8.2 优化方向

1. **提取独立模块**: 情感分析、API 客户端等
2. **统一基础设施**: HTTP 客户端、错误处理、日志
3. **添加抽象层**: 装饰器、策略模式、管道模式
4. **清理技术债务**: 删除重复代码，统一配置

### 8.3 预期收益

- **可维护性**: 模块职责清晰，易于修改
- **可测试性**: 解耦后更易测试
- **可扩展性**: 新增功能更简单
- **性能**: 减少重复计算和请求

---

*最后更新: 2026-05-19*
*状态: 草稿，待评审*
*版本: v1.0*
*关联: plan23.md (功能完善)*