# Plan7.5.md — Phase 11: 源码迁移到新 Packages

> 创建日期: 2026-05-11 | 目标: 迁移 src/ 到新 packages | 版本: 1.1
> 前置: plan7.2.md (Phase 1-8) + plan7.3.md (Phase 9-10) 已完成
> 状态: **Phase 11 已完成** ✅

---

## 0. 执行摘要

将现有 `src/` 代码迁移到使用新创建的 packages，删除重复代码。

### 当前状态

| 源码文件 | 对应 Package | 需要迁移 |
|----------|-------------|----------|
| `src/types.ts` | `@upup/types` | ✅ 已部分完成 |
| `src/plugins/sdk/index.ts` | `@upup/plugin-sdk` | ✅ 已完成 |
| `src/providers.ts` | `@upup/llm` | ❌ 待迁移 |
| `src/hooks/index.ts` | `@upup/hooks` | ❌ 待迁移 |

---

## 1. 迁移任务清单

### Phase 11.1: 迁移 src/providers.ts → @upup/llm

**当前状态**: 独立文件，包含 ProviderDef 和相关函数

**目标**: 删除 `src/providers.ts`，使用 `@upup/llm`

#### 1.1.1 创建 src/providers.ts 桥接文件

```typescript
// src/providers.ts
/**
 * @deprecated Use @upup/llm instead
 * Re-exports from @upup/llm for backward compatibility
 */

export {
  PROVIDERS,
  resolveProvider,
  getProviderById,
  type ProviderDef,
} from '@upup/llm';
```

#### 1.1.2 更新引用此文件的模块

需要检查的文件:

```bash
grep -rl "from.*providers" src/ --include="*.ts" --include="*.tsx"
```

预期修改:
- 将 `import { PROVIDERS } from '../../providers.js'` 改为 `import { PROVIDERS } from '@upup/llm'`
- 或保留使用桥接文件

### Phase 11.2: 迁移 src/hooks/index.ts → @upup/hooks

**当前状态**: 独立文件，包含 rate limiter, cache, validation

**目标**: 删除 `src/hooks/index.ts`，使用 `@upup/hooks`

#### 1.2.1 创建 src/hooks/index.ts 桥接文件

```typescript
// src/hooks/index.ts
/**
 * @deprecated Use @upup/hooks instead
 * Re-exports from @upup/hooks for backward compatibility
 */

export {
  checkRateLimit,
  recordRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  cacheGet,
  cacheSet,
  cacheClear,
  getCacheStats,
  checkApiKeys,
  validateRequiredKeys,
  loadHooksConfig,
  getHooksConfig,
  setHooksEnabled,
  type HooksConfig,
  type RateLimitConfig,
  type CacheConfig,
  type ApiValidationConfig,
  type ApiKeyStatus,
  type CacheStats,
} from '@upup/hooks';
```

#### 1.2.2 更新引用此文件的模块

```bash
grep -rl "from.*hooks/index" src/ --include="*.ts" --include="*.tsx"
```

### Phase 11.3: 清理重复类型定义

#### 1.3.1 清理 src/types.ts

当前 `src/types.ts` 已导入 `@upup/types` 的类型，但可能有重复定义。

检查项:
- `AgentTool` - 应从 `@upup/types` 导入
- `SessionConfig` - 应从 `@upup/types` 导入
- 其他重复类型 - 删除并从 `@upup/types` 导入

#### 1.3.2 清理 src/plugins/types.ts

检查是否有与 `@upup/plugin-sdk` 重复的类型定义。

---

## 2. 具体修改清单

### 2.1 需要更新的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/providers.ts` | REPLACE | 改为重新导出 @upup/llm |
| `src/hooks/index.ts` | REPLACE | 改为重新导出 @upup/hooks |
| `src/types.ts` | CLEANUP | 删除重复类型定义 |

### 2.2 需要检查的引用

```bash
# 检查 providers.ts 引用
grep -rn "from.*providers" src/ --include="*.ts" --include="*.tsx"

# 检查 hooks/index.ts 引用
grep -rn "from.*hooks/index" src/ --include="*.ts" --include="*.tsx"
```

### 2.3 引用 @upup/types 的文件

```bash
grep -rn "@upup/types" src/ --include="*.ts" --include="*.tsx"
```

预期结果:
- `src/types.ts` ✅
- `src/plugins/sdk/index.ts` ✅

---

## 3. 验证结果 (2026-05-11)

| 验证项 | 结果 |
|--------|------|
| bun test | ✅ 1957 pass, 0 fail |
| oscript-workspace-verify | ✅ 16/16 通过 |
| bun run dev | ✅ 启动成功 |

### 关键修复

1. **bunfig.toml linker 模式**: 从 `isolated` 改为 `hoisted`
   - 原因: isolated 模式下包在各自 node_modules，主应用无法找到
   - hoisted 模式下包链接到根 node_modules

---

## 4. 回滚计划

如果需要回滚：

```bash
# 恢复 src/providers.ts
git checkout HEAD -- src/providers.ts

# 恢复 src/hooks/index.ts
git checkout HEAD -- src/hooks/index.ts

# 恢复 bunfig.toml
git checkout HEAD -- bunfig.toml
```

---

## 5. 文件变更摘要

### Before (迁移前)

```
src/
├── types.ts          # 部分使用 @upup/types
├── providers.ts     # 独立实现 (应迁移到 @upup/llm)
└── hooks/
    └── index.ts     # 独立实现 (应迁移到 @upup/hooks)
```

### After (迁移后)

```
src/
├── types.ts          # 完全使用 @upup/types (仅桥接)
├── providers.ts      # 桥接到 @upup/llm (仅重新导出)
└── hooks/
    └── index.ts     # 桥接到 @upup/hooks (仅重新导出)
```

---

## 6. Next Steps

1. ~~Phase 1-10: Packages 创建~~ ✅
2. ~~Phase 11: 源码迁移到 Packages~~ ✅
3. Phase 12: 清理废弃代码 (可选)
4. Phase 13: 发布 Packages (可选)
