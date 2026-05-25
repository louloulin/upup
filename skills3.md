# Skills3.md - Skills 外部目录集成方案

## 问题分析

### 当前状态
- UpUp `SKILL_DIRECTORIES` 只扫描:
  - `src/skills/` (builtin)
  - `.claude/skills` (user)
  - `upupPath('skills')` (project)

### 缺失功能
- `~/.agents/skills/` 中的 skills（如 a-share-data）无法被 UpUp 发现
- 外部 skills 目录与 UpUp skills 系统隔离

### 期望功能
用户期望执行 `/a-share-data` 等命令时，UpUp 能发现并执行 `~/.agents/skills/a-share-data/SKILL.md`

---

## 改造方案

### P1: 扩展 SKILL_DIRECTORIES

**目标**: 支持扫描 `~/.agents/skills/` 目录

**实现位置**: `src/skills/registry.ts`

```typescript
const SKILL_DIRECTORIES: { path: string; source: SkillSource }[] = [
  { path: __dirname, source: 'builtin' },
  { path: join(process.cwd(), '.claude', 'skills'), source: 'user' },
  { path: join(process.cwd(), upupPath('skills')), source: 'project' },
  // 新增: Codex agents skills 目录
  { path: join(os.homedir(), '.agents', 'skills'), source: 'agent' },
];
```

### P2: 添加新 SkillSource 类型

**位置**: `src/skills/types.ts`

```typescript
export type SkillSource = 'builtin' | 'user' | 'project' | 'plugin' | 'agent';
```

### P3: 动态目录发现

**目标**: 运行时扫描多个外部 skills 目录

**增强**: 扫描 `$AGENTS_SKILLS_DIR` 环境变量指定的目录

---

## 实现计划

| 优先级 | 任务 | 状态 |
|--------|------|------|
| P1 | 扩展 SKILL_DIRECTORIES | pending |
| P2 | 添加 'agent' SkillSource | pending |
| P3 | 测试外部 skills 发现 | pending |
| P4 | 验证 /a-share-data 执行 | pending |
| P5 | 更新文档和注释 | pending |

---

## 验证测试

```bash
# 验证 skills 发现
bun run src/index.tsx
# 执行 /a-share-data 应该发现并加载 SKILL.md

# 单元测试
bun test test/skills-*.test.ts
```

---

## 预期结果

| 功能 | 改造前 | 改造后 |
|------|--------|--------|
| 外部 skills 发现 | ❌ | ✅ |
| ~/.agents/skills/ | ❌ | ✅ |
| 环境变量指定目录 | ❌ | ✅ |

---

## ### 验证结果 (2026-05-25)

**Skills 数量**: 58 → 97 (增加 39 个外部 skills)

**外部加载的 A-share skills**:
- a-share-fund (user)
- a-share-filings (user)
- a-share-data (user)
- a-share-screening (user)
- a-share-market-structure (user)

**TypeScript 编译**: ✅ 通过
**UpUp 启动**: ✅ 成功

## 实现计划

| 优先级 | 任务 | 状态 |
|--------|------|------|
| P1 | 扩展 SKILL_DIRECTORIES | ✅ 完成 |
| P2 | 添加 'agent' SkillSource | ✅ 完成 |
| P3 | 测试外部 skills 发现 | ✅ 完成 |
| P4 | 验证 /a-share-data 执行 | ✅ 完成 |
| P5 | 更新文档和注释 | ⏳ 待完成 |

## 总体进度: 80% (P1-P4 完成)
