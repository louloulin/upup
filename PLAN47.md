# 配置化改造计划 (PLAN47.md)

> 消除硬编码，统一配置管理，支持多环境部署
> 版本: 1.1 | 创建: 2026-05-29 | 更新: 添加架构图

---

## 背景

当前代码库存在大量硬编码值，包括：
- API URLs (Tushare, Eastmoney, Sina 等)
- Timeout 值 (分散在 10+ 个文件中)
- Retry 次数 (不一致)
- Cache TTL 值 (不统一)
- 业务参数 (风险参数、筛选阈值等)

## 目标

1. **统一配置管理** - 所有可配置值通过配置文件或环境变量管理
2. **支持多环境** - 开发/测试/生产环境配置分离
3. **便于维护** - 集中管理配置，减少散落各处的硬编码
4. **灵活扩展** - 支持动态配置覆盖

---

## 系统架构图

### 当前架构 (硬编码分散)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              UpUp Agent 系统                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  tushare-  │  │  eastmoney- │  │  realtime-  │  │   news-    │         │
│  │  client.ts │  │  client.ts  │  │  client.ts │  │  client.ts │         │
│  │             │  │             │  │             │  │             │         │
│  │ HTTP 硬编码 │  │ URL 硬编码  │  │ TIMEOUT=5s  │  │ RETRY=2    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ bash-tool.ts│  │risk-manage- │  │data-cache.ts│  │  executor.ts│         │
│  │             │  │  ment.ts   │  │             │  │             │         │
│  │ TIMEOUT=30s │  │ ACCOUNT=100K│  │ TTL=5min   │  │ TIMEOUT=30s│         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │   finance/ │  │   forecast/ │  │    SKILL/  │                          │
│  │   utils.ts │  │   index.ts  │  │   *.md     │                          │
│  │             │  │             │  │             │                          │
│  │ TTL 硬编码  │  │  PE=20     │  │ URLs 硬编码 │                          │
│  └─────────────┘  └─────────────┘  └─────────────┘                          │
│                                                                                 │
│  ❌ 问题: 10+ 文件包含硬编码，难以维护，不支持多环境                           │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 目标架构 (配置中心)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              UpUp Agent 系统                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐     │
│  │                      配置中心 (src/config/)                           │     │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │     │
│  │  │ index.ts  │  │ schema.ts │  │   env.ts  │  │ defaults.ts│    │     │
│  │  │           │  │           │  │           │  │           │    │     │
│  │  │ 统一入口  │  │ 类型定义  │  │ 环境变量  │  │ 默认值    │    │     │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │     │
│  └──────────────────────────────────────────────────────────────────────┘     │
│                                    │                                           │
│                        配置加载优先级:                                          │
│                        1. 环境变量 (最高)                                      │
│                        2. settings.json                                       │
│                        3. defaults.ts (最低)                                   │
│                                    │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐     │
│  │                         配置覆盖示例                                   │     │
│  │                                                                      │     │
│  │   环境变量:  TUSHARE_TIMEOUT_MS=5000                                  │     │
│  │   settings.json: { "api.tushare.timeout": 5000 }                     │     │
│  │   代码默认值: timeout = 10000                                         │     │
│  └──────────────────────────────────────────────────────────────────────┘     │
│                                    │                                           │
└────────────────────────────────────────────────────────────────┬────────────────┘
                                                                     │
                    ┌──────────────────────────────────────────────┐  │
                    │              配置消费方                        │  │
                    ├──────────────────────────────────────────────┤  │
                    │                                              │  │
                    │  ┌─────────────┐  ┌─────────────┐           │  │
                    │  │  Tushare   │  │  Eastmoney │           │  │
                    │  │  Client    │  │  Client    │           │  │
                    │  │             │  │             │           │  │
                    │  │ baseUrl:   │  │ baseUrl:   │           │  │
                    │  │  config    │  │  config    │           │  │
                    │  │ .api.ts    │  │ .api.east  │           │  │
                    │  └─────────────┘  └─────────────┘           │  │
                    │                                              │  │
                    │  ┌─────────────┐  ┌─────────────┐           │  │
                    │  │  Bash Tool │  │Risk Manage │           │  │
                    │  │            │  │            │           │  │
                    │  │ timeout:   │  │ account:   │           │  │
                    │  │ config.tool│  │ config.biz│           │  │
                    │  │ .bash      │  │ .risk      │           │  │
                    │  └─────────────┘  └─────────────┘           │  │
                    │                                              │  │
                    └──────────────────────────────────────────────┘  │
                                                                     │
                    ┌──────────────────────────────────────────────┐  │
                    │              配置数据流                       │  │
                    ├──────────────────────────────────────────────┤  │
                    │                                              │  │
                    │   settings.json ──→ Config Index ──→ 消费方  │  │
                    │        │                   │                 │  │
                    │        ▼                   ▼                 │  │
                    │   .env.local ──→ Env Parser ──→ 覆盖值       │  │
                    │        │                                       │  │
                    │        ▼                                       │  │
                    │   defaults.ts ──→ 最终默认值                  │  │
                    │                                              │  │
                    └──────────────────────────────────────────────┘  │
                                                                     │
┌────────────────────────────────────────────────────────────────────▼────────┐
│                         配置模式切换                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                │
│   │   开发环境   │ ──▶ │   测试环境   │ ──▶ │   生产环境   │                │
│   │  (local)   │     │   (test)   │     │  (prod)   │                │
│   │             │     │             │     │             │                │
│   │ DEBUG=true │     │ TEST=true  │     │ DEBUG=false│                │
│   │ LOG=debug  │     │ LOG=info  │     │ LOG=error │                │
│   │ TIMEOUT=5s│     │TIMEOUT=10s│     │TIMEOUT=30s│                │
│   └─────────────┘     └─────────────┘     └─────────────┘                │
│                                                                             │
│   切换方式: UP_ENV=prod ./dist/upup                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 配置中心内部模块

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         配置中心模块 (src/config/)                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          schema.ts                                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │ export interface ConfigSchema {                              │  │   │
│  │  │   api: {                                                    │  │   │
│  │  │     tushare: { baseUrl, timeout, maxRetries }               │  │   │
│  │  │     eastmoney: { baseUrls, timeout }                        │  │   │
│  │  │     sina: { baseUrl, timeout }                            │  │   │
│  │  │   };                                                        │  │   │
│  │  │   agent: { maxIterations, maxOverflowRetries }             │  │   │
│  │  │   tool: { bash: {...}, fetch: {...} }                      │  │   │
│  │  │   cache: { ttl15m, ttl1h, ttl6h, ttl24h }                │  │   │
│  │  │   business: { risk: {...} }                                │  │   │
│  │  │ }                                                          │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          defaults.ts                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │ export const DEFAULT_CONFIG: ConfigSchema = {                │  │   │
│  │  │   api: {                                                    │  │   │
│  │  │     tushare: {                                             │  │   │
│  │  │       baseUrl: 'https://api.tushare.pro',                   │  │   │
│  │  │       timeout: 10000,                                      │  │   │
│  │  │       maxRetries: 2                                        │  │   │
│  │  │     }                                                       │  │   │
│  │  │   },                                                        │  │   │
│  │  │   cache: {                                                  │  │   │
│  │  │     ttl15m: 900000,  // 15 minutes                        │  │   │
│  │  │     ttl1h: 3600000,   // 1 hour                           │  │   │
│  │  │     ttl6h: 21600000,  // 6 hours                          │  │   │
│  │  │     ttl24h: 86400000 // 24 hours                           │  │   │
│  │  │   }                                                        │  │   │
│  │  │ };                                                         │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                            env.ts                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │ export function parseEnvConfig(): Partial<ConfigSchema> {         │  │   │
│  │  │   return {                                                    │  │   │
│  │  │     api: {                                                    │  │   │
│  │  │       tushare: {                                             │  │   │
│  │  │         baseUrl: process.env.TUSHARE_BASE_URL,                │  │   │
│  │  │         timeout: parseInt(process.env.TUSHARE_TIMEOUT_MS),     │  │   │
│  │  │       }                                                       │  │   │
│  │  │     },                                                        │  │   │
│  │  │     cache: {                                                  │  │   │
│  │  │       ttl15m: parseInt(process.env.CACHE_TTL_15M),           │  │   │
│  │  │     }                                                        │  │   │
│  │  │   };                                                         │  │   │
│  │  │ }                                                            │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                            index.ts                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │ import { DEFAULT_CONFIG } from './defaults';                    │  │   │
│  │  │ import { parseEnvConfig } from './env';                        │  │   │
│  │  │ import { loadSettingsConfig } from './settings';                │  │   │
│  │  │                                                           │  │   │
│  │  │ let cachedConfig: ConfigSchema | null = null;                │  │   │
│  │  │                                                           │  │   │
│  │  │ export function getConfig(): ConfigSchema {                 │  │   │
│  │  │   if (cachedConfig) return cachedConfig;                    │  │   │
│  │  │                                                           │  │   │
│  │  │   const envConfig = parseEnvConfig();                        │  │   │
│  │  │   const settingsConfig = loadSettingsConfig();             │  │   │
│  │  │                                                           │  │   │
│  │  │   cachedConfig = deepMerge(                                  │  │   │
│  │  │     DEFAULT_CONFIG,     // 最低优先级                      │  │   │
│  │  │     settingsConfig,    //                                    │  │   │
│  │  │     envConfig          // 最高优先级                        │  │   │
│  │  │   );                                                        │  │   │
│  │  │   return cachedConfig;                                       │  │   │
│  │  │ }                                                           │  │   │
│  │  │                                                           │  │   │
│  │  │ export function resetConfig(): void {                       │  │   │
│  │  │   cachedConfig = null;                                       │  │   │
│  │  │ }                                                           │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 消费方集成示例

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           消费方集成模式                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  方式 1: 函数参数注入 (推荐)                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ export async function fetchTushare(                                       │   │
│  │   params: TushareParams,                                                  │   │
│  │   options?: { timeout?: number; retries?: number }  // 可选覆盖           │   │
│  │ ) {                                                                      │   │
│  │   const config = getConfig();                                            │   │
│  │   const timeout = options?.timeout ?? config.api.tushare.timeout;         │   │
│  │   const retries = options?.retries ?? config.api.tushare.maxRetries;     │   │
│  │   // ...                                                                 │   │
│  │ }                                                                        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  方式 2: 直接引用 (简单场景)                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ import { getConfig } from '../config';                                  │   │
│  │                                                                          │   │
│  │ class TushareClient {                                                   │   │
│  │   private baseUrl = getConfig().api.tushare.baseUrl;                    │   │
│  │   private timeout = getConfig().api.tushare.timeout;                    │   │
│  │ }                                                                        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  方式 3: 依赖注入 (测试友好)                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ interface TushareConfig {                                                │   │
│  │   baseUrl: string;                                                     │   │
│  │   timeout: number;                                                      │   │
│  │ }                                                                      │   │
│  │                                                                          │   │
│  │ function createTushareClient(config: TushareConfig): TushareClient {     │   │
│  │   return new TushareClient(config);                                     │   │
│  │ }                                                                      │   │
│  │                                                                          │   │
│  │ // 在应用启动时                                                           │   │
│  │ const client = createTushareClient(getConfig().api.tushare);             │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 硬编码分析汇总

### 高优先级 (P0)

| 类别 | 文件 | 问题 |
|------|------|------|
| Tushare URL | `src/tools/astock/tushare-client.ts` | 使用 HTTP 而非 HTTPS |
| Agent Max Iterations | `src/agent/agent.ts` | `DEFAULT_MAX_ITERATIONS = 50` |
| Risk Parameters | `src/tools/risk/management.ts` | 业务参数硬编码 |
| SKILL URLs | `.claude/skills/*.md` | API URLs 硬编码 |

### 中优先级 (P1)

| 类别 | 文件数 | 问题 |
|------|--------|------|
| Timeout 配置 | 6+ | 分散在多个文件中 |
| Retry 配置 | 5+ | MAX_RETRIES 不一致 |
| Cache TTL | 4+ | TTL 值不统一 |
| Bash Limits | 2 | MAX_OUTPUT_LENGTH 等 |

### 低优先级 (P2)

| 类别 | 文件 | 说明 |
|------|------|------|
| Theme Colors | `src/theme.ts` | UI 定制通常不需要 |
| 示例代码 | SKILL.md | 示例数据保留合理 |

---

## Phase 1: 配置中心模块 (P0)

### 1.1 创建统一配置模块

**文件**: `src/config/index.ts`

```typescript
/**
 * 统一配置管理
 * 
 * 支持:
 * - 环境变量覆盖
 * - 配置文件覆盖
 * - 默认值
 */

export interface ConfigSchema {
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
    // ...
  };
  
  // Agent 配置
  agent: {
    maxIterations: number;
    maxOverflowRetries: number;
  };
  
  // Tool 配置
  tool: {
    bash: {
      timeout: number;
      maxOutputLength: number;
    };
    fetch: {
      timeout: number;
      maxChars: number;
    };
  };
  
  // Cache 配置
  cache: {
    ttl15m: number;
    ttl1h: number;
    ttl6h: number;
    ttl24h: number;
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
1. 环境变量 (最高优先级)
2. settings.json / .env
3. 默认值 (最低优先级)
```

### 1.3 实现文件

| 文件 | 功能 |
|------|------|
| `src/config/index.ts` | 配置入口 |
| `src/config/schema.ts` | 配置类型定义 |
| `src/config/env.ts` | 环境变量解析 |
| `src/config/defaults.ts` | 默认值定义 |

---

## Phase 2: API URL 配置化 (P0)

### 2.1 Tushare Client

**修改文件**: `src/tools/astock/tushare-client.ts`

```typescript
// Before
private readonly baseUrl = 'http://api.tushare.pro';

// After
import { getConfig } from '../../config/index';
const config = getConfig();
private readonly baseUrl = config.api.tushare.baseUrl;
```

### 2.2 Eastmoney Clients

**修改文件**:
- `src/tools/astock/news-client.ts`
- `src/tools/astock/realtime-client.ts`
- `src/tools/astock/screener-client.ts`

### 2.3 Finance API

**修改文件**: `src/tools/finance/api.ts`

---

## Phase 3: Timeout 配置化 (P1)

### 3.1 统一 Timeout 定义

```typescript
// src/config/defaults.ts
export const DEFAULT_TIMEOUTS = {
  bash: 30_000,           // 30s
  powershell: 30_000,     // 30s
  tushare: 10_000,        // 10s
  astock: 10_000,         // 10s
  eastmoney: 5_000,       // 5s
  fetch: 30_000,          // 30s
  skill: 60_000,          // 60s
} as const;
```

### 3.2 修改文件

| 文件 | 原值 | 新配置 |
|------|------|--------|
| `src/tools/bash/bash-tool.ts` | 30_000 | `config.tool.bash.timeout` |
| `src/tools/powershell/powershell-tool.ts` | 30_000 | `config.tool.powershell.timeout` |
| `src/tools/astock/tushare-client.ts` | 10_000 | `config.api.tushare.timeout` |
| `src/skills/executor.ts` | 30_000 | `config.tool.skill.timeout` |
| `src/skills/promptShellExecution.ts` | 30_000 | `config.tool.bash.timeout` |

---

## Phase 4: Retry 配置化 (P1)

### 4.1 统一 Retry 定义

```typescript
// src/config/defaults.ts
export const DEFAULT_RETRY = {
  maxRetries: 2,
  delayMs: 500,
  backoffMultiplier: 2,
} as const;
```

### 4.2 修改文件

| 文件 | 原值 | 新配置 |
|------|------|--------|
| `src/tools/astock/news-client.ts` | MAX_RETRIES=2 | `config.retry.maxRetries` |
| `src/tools/astock/tushare-client.ts` | MAX_RETRIES=2 | `config.retry.maxRetries` |
| `src/tools/astock/realtime-client.ts` | MAX_RETRIES=2 | `config.retry.maxRetries` |
| `src/tools/astock/screener-client.ts` | MAX_RETRIES=2 | `config.retry.maxRetries` |
| `src/agent/agent.ts` | MAX_OVERFLOW_RETRIES=2 | `config.agent.maxOverflowRetries` |

---

## Phase 5: Cache TTL 配置化 (P1)

### 5.1 统一 TTL 定义

```typescript
// src/config/defaults.ts
export const DEFAULT_CACHE_TTL = {
  TTL_15M: 15 * 60 * 1000,    // 15分钟
  TTL_1H: 60 * 60 * 1000,      // 1小时
  TTL_6H: 6 * 60 * 60 * 1000, // 6小时
  TTL_24H: 24 * 60 * 60 * 1000, // 24小时
} as const;
```

### 5.2 修改文件

| 文件 | 原值 | 新配置 |
|------|------|--------|
| `src/tools/finance/utils.ts` | TTL_15M 等 | `config.cache.ttl15m` |
| `src/tools/fetch/cache.ts` | TTL 15min | `config.cache.ttl15m` |
| `src/tools/astock/data-cache.ts` | TTL 5min | `config.cache.ttl15m` |
| `src/tools/fx/fx-tools.ts` | TTL 1h | `config.cache.ttl1h` |

---

## Phase 6: 业务参数配置化 (P0)

### 6.1 Risk Management

**修改文件**: `src/tools/risk/management.ts`

```typescript
// Before
const accountSize = 100000;
const winRate = 0.55;
const avgWin = 0.05;
const avgLoss = 0.03;
const kellyCap = 0.25;

// After
import { getConfig } from '../../config/index';
const config = getConfig();
const { accountSize, winRate, avgWin, avgLoss, kellyCap } = config.business.risk;
```

### 6.2 其他业务参数

| 文件 | 参数 | 建议 |
|------|------|------|
| `src/tools/forecast/index.ts` | avgPE=20 | 保留默认值 |
| `src/tools/risk/management.ts` | 风险参数 | 配置化 |

---

## Phase 7: SKILL.md 配置化 (P1)

### 7.1 动态日期生成

**问题**: SKILL.md 中硬编码日期如 `20240101`, `20241231`

**解决方案**: 使用脚本标签动态生成

```markdown
```bash
# 获取最近12个月的数据
python3 -c "
import datetime
end = datetime.date.today().strftime('%Y%m%d')
start = (datetime.date.today() - datetime.timedelta(days=365)).strftime('%Y%m%d')
print(f'start={start}, end={end}')
"
```
```

### 7.2 提取 API URLs 到环境变量

**问题**: SKILL.md 中硬编码 API URLs

**解决方案**: 在 SKILL.md frontmatter 中定义变量

```markdown
---
env:
  TUSHARE_API_URL: "https://api.tushare.pro"
  EXA_API_URL: "https://api.exa.ai"
---
```

### 7.3 参数化筛选阈值

**问题**: 硬编码筛选条件

**解决方案**: 使用参数占位符

```markdown
```bash
python3 -c "
import akshare as ak
df = ak.stock_a_indicator_ly(
    symbol='{{pe_threshold|30}}',
    start_date='{{start_date}}',
    end_date='{{end_date}}'
)
"
```
```

---

## Phase 8: 测试验证 (P1)

### 8.1 单元测试

```bash
# 测试配置加载
$ bun test src/config/*.test.ts

# 测试配置覆盖
$ bun test src/config/override.test.ts
```

### 8.2 集成测试

```bash
# 测试环境变量覆盖
$ TUSHARE_TIMEOUT_MS=5000 bun test

# 测试配置文件覆盖
$ cat settings.d/test.json
{
  "api.tushare.timeout": 5000
}
```

---

## 实施顺序

```
Phase 1: 配置中心模块 (基础)
Phase 2: API URL 配置化 (P0)
Phase 6: 业务参数配置化 (P0)
Phase 3: Timeout 配置化 (P1)
Phase 4: Retry 配置化 (P1)
Phase 5: Cache TTL 配置化 (P1)
Phase 7: SKILL.md 配置化 (P1)
Phase 8: 测试验证
```

---

## 环境变量清单

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `TUSHARE_BASE_URL` | string | https://api.tushare.pro | Tushare API URL |
| `TUSHARE_TIMEOUT_MS` | number | 10000 | Tushare 超时 |
| `BASH_TIMEOUT_MS` | number | 30000 | Bash 超时 |
| `AGENT_MAX_ITERATIONS` | number | 50 | Agent 最大迭代 |
| `CACHE_TTL_15M` | number | 900000 | 15分钟缓存 |
| `CACHE_TTL_1H` | number | 3600000 | 1小时缓存 |
| `RISK_ACCOUNT_SIZE` | number | 100000 | 默认账户规模 |
| `RISK_WIN_RATE` | number | 0.55 | 默认胜率 |

---

## 配置文件格式

### settings.json

```json
{
  "api": {
    "tushare": {
      "baseUrl": "https://api.tushare.pro",
      "timeout": 10000,
      "maxRetries": 2
    },
    "eastmoney": {
      "newsUrl": "https://np-anotice-stock.eastmoney.com",
      "timeout": 5000
    }
  },
  "agent": {
    "maxIterations": 50,
    "maxOverflowRetries": 2
  },
  "tool": {
    "bash": {
      "timeout": 30000,
      "maxOutputLength": 100000
    }
  },
  "cache": {
    "ttl15m": 900000,
    "ttl1h": 3600000,
    "ttl6h": 21600000,
    "ttl24h": 86400000
  },
  "business": {
    "risk": {
      "defaultAccountSize": 100000,
      "defaultWinRate": 0.55,
      "kellyCap": 0.25
    }
  }
}
```

### .env 示例

```bash
# API 配置
TUSHARE_BASE_URL=https://api.tushare.pro
TUSHARE_TIMEOUT_MS=10000

# Agent 配置
AGENT_MAX_ITERATIONS=50

# Cache 配置
CACHE_TTL_15M=900000
CACHE_TTL_1H=3600000

# 业务配置
RISK_ACCOUNT_SIZE=100000
```

---

## 验证清单

- [ ] 配置中心模块创建完成
- [ ] 所有 API URL 从配置读取
- [ ] 所有 Timeout 值统一管理
- [ ] 所有 Retry 配置统一管理
- [ ] 所有 Cache TTL 统一管理
- [ ] 业务参数支持配置化
- [ ] 环境变量覆盖测试通过
- [ ] 配置文件覆盖测试通过
- [ ] 单元测试通过
- [ ] 集成测试通过

---

## 预期收益

1. **可维护性提升** - 配置集中管理，减少散落各处的硬编码
2. **灵活性增强** - 支持多环境配置，无需修改代码
3. **错误率降低** - 统一默认值，减少不一致导致的 bug
4. **部署简化** - 支持 Docker/K8s 环境变量注入

---

*文档版本: 1.0*
*创建时间: 2026-05-29*
*参考: PLAN46.md (TUI 重构完成)*
