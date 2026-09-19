# Skills + Plugins 全面分析与 Round 3 规划

**Date**: 2026-06-06
**Branch**: `codex/close-top-tier-investment-gaps-impl`
**Change**: `unify-skills-and-plugins-registries` (round 3 续)
**Status**: 进行中

## 1. 全面代码盘点（截至 Round 2 结束）

### 1.1 Skills 子系统 — 16,000+ 行

| 模块 | 行数 | 职责 |
|---|---|---|
| `slash-command.ts` | 671 | SkillCommandRegistry（注册表核心） |
| `skills-menu.ts` | 673 | UI 菜单 + 列表 + 建议（Round 2 扩到 673） |
| `intent-detector.ts` | 479 | 投资意图检测 |
| `register.ts` | 166 | `registerSkill` / `unregisterSkill` / `reRegisterSkill` |
| `loader.ts` | 368 | SKILL.md frontmatter 解析 |
| `registry.ts` | 376 | `SKILL_DIRECTORIES` + `discoverSkills` |
| `recent-usage.ts` | 194 | 7-day half-life 评分（Round 3 加 `getAllRecentCounts`） |
| `permissions.ts` | 190 | Shell 权限 |
| `executor.ts` | 1000+ | 完整 skill 执行引擎 |
| `bridge.ts` | 126 | 同步本地 SST → @upup/commands |
| `search.ts` | 298 | Fuse.js 模糊搜索 |
| `skill-trigger.ts` | 311 | 自然语言触发 |
| `mcp-skills.ts` | 244 | MCP 提供 skill |
| `hot-reload.ts` | **306** | **Round 3 新增**：fs.watch 热重载 |

外加 60+ 个 `bundled/<skill>/SKILL.md`（80+ 投资分析 skill：dcf, technical-analysis, a-share-data 等）。

### 1.2 Plugins 子系统 — 4,100+ 行

| 模块 | 行数 | 职责 |
|---|---|---|
| `loader.ts` | — | 4 个 runtime adapter 统一加载（bun/jiti/wasm/mcp） |
| `manifest.ts` | 290 | JSON schema 校验 + `validatePluginSkills`（Round 2） |
| `registry.ts` | — | 已加载 plugin 注册表 |
| `types.ts` | — | `UpUpPluginApi`（7 个 register 入口） |
| `discovery.ts` | — | bundled / global / workspace / npm 4 源 |
| `adapters/{bun,jiti,wasm,mcp}.ts` | 539 | runtime 适配 |
| `sdk/` | — | 外部 plugin 作者用的 SDK |
| `services.ts` | — | 服务容器 |
| `commands.ts` | — | plugin 注册到 @upup/commands |
| `path-safety.ts` | — | 路径安全（防越权） |

**注册入口**（每个对应一个 P0/P1 适配器）：`registerTool`, `registerHook`, `registerChannel`, `registerService`, `registerDataSource`, `registerCommand`, `registerSkill`（Round 1 补）。

### 1.3 协作模块

| 模块 | 行数 | 与 skill/plugin 关系 |
|---|---|---|
| `@upup/commands` | 外部包 | 上游 `SLASH_COMMANDS` 静态源；本地 skill 通过 bridge 注入 |
| `commands/unified-registry.ts` | 115 | 上游 + 本地 dedupe 包装 |
| `multi-agent/skill-tracker.ts` | 430 | 多 agent 执行的 skill 统计（**潜在重复点**） |
| `coordinator/coordinator.ts` | 389 | 多 agent 编排 |
| `team-manager.ts` | 309 | Agent 团队管理 |

## 2. 剩余问题（按优先级）

### 2.1 P2 — 短期可补

#### 问题 A：`/skills` 显示 `useCount: 0`（**Round 3 已修**）

- **症状**：列表命令的 "uses" 列恒为 `—`（em-dash），因为 `recent-usage.ts` 只暴露 `getAllRecentScores()`（评分），不暴露 `getAllRecentCounts()`（计数）。
- **修复**（Round 3 commit）：`recent-usage.ts` 新增 `getAllRecentCounts()` 返回 `Map<name, count>`；`listInstalledSkills()` + `getInstalledSkillsData()` 用 `Promise.all` 并行读两个 map。
- **测试**：`src/skills/recent-usage.test.ts`（5 个测试，含半衰期衰减验证）。

#### 问题 B：SKILL.md 修改后需重启 CLI（**Round 3 已修**）

- **症状**：用户编辑 `~/.upup/skills/foo/SKILL.md` 后不会立即生效，必须 `exit` + `upup` 重新进入。
- **修复**（Round 3 commit）：`src/skills/hot-reload.ts` 用 `fs.watch` 监听 `SKILL_DIRECTORIES` 中的所有 `SKILL.md`，200ms 防抖，复用现成的 `reRegisterSkill()`。同时提供 `createSkillWatcher()` 工厂（测试用）+ `startSkillWatcher()`/`stopSkillWatcher()` 单例（CLI 启动时调一次）。
- **测试**：`src/skills/hot-reload.test.ts`（5 个测试，含修改事件触发、idempotent、stop 释放、onReload 订阅、不存在目录优雅跳过）。
- **零新依赖**：纯 Node `fs.watch`，不引入 chokidar。

#### 问题 C：`skill-tracker.ts` 与 `recent-usage.ts` 重复追踪

- **症状**：`src/multi-agent/skill-tracker.ts`（430 行）维护 `SkillStats { totalExecutions, successfulExecutions, failedExecutions, averageDurationMs, mostUsedByAgent }`；`src/skills/recent-usage.ts`（194 行）维护 `UsageRecord { skillName, lastUsed, useCount }`。两套系统并存：
  - `skill-tracker` 面向多 agent 编排（成功/失败/时长/调用方）
  - `recent-usage` 面向用户偏好（最近用 / 7 天半衰期）
- **重叠**：都统计 "skill 被用了多少次"，但角度不同。
- **建议**（**留到 Round 4**）：保留两个独立模块，但在 `recent-usage` 的 `recordUsage` 调用点同时 fire 一个事件，`skill-tracker` 订阅该事件 → 自然合并"用户偏好 + 编排遥测"。无需代码合并，只需要松耦合的事件总线。

#### 问题 D：autocomplete 不按评分排序

- **症状**：`/cmd` 弹出的 149 个 skill 完全按字母序，忽略用户实际使用频率。
- **建议**（**留到 Round 4**）：`bridge.ts` `publishSkill` 时把 `score` 注入到 `SlashCommand` 的 metadata，pi-tui 的 `CombinedAutocompleteProvider` 在 fuzzy 命中后做二次排序。
- **影响小**：fuzzy match 已经够用，排序只是锦上添花。

#### 问题 E：plugin 权限模型没有运行时 gate

- **症状**：`PluginSecurity.permissions` 在 manifest schema 里定义，但 loader 只校验配置不校验运行时。
- **建议**（**留到 Round 4**）：`UpUpPluginApi` 加一个 `getPermissions()` 方法，runtime 工具调用时 gate。

### 2.2 P3 — 中长期

#### 问题 F：Skill composition（A 股分析自动串联）

- **现状**：`coordinator/coordinator.ts` 有 5 阶段 workflow（detect → plan → execute → verify → report），但 skill 之间是手写串联，没有声明式组合。
- **建议**：SKILL.md frontmatter 加 `pipeline: [tech-analysis, money-flow, fundamental]` 字段，host 读到后自动按顺序执行。`/a-share-comprehensive-analysis` 这种 skill 就可以用一行 frontmatter 替代手写 orchestrator。
- **风险**：高（要改 loader + executor + coordinator），单独 change。

#### 问题 G：Plugin hot-reload

- **现状**：plugin 代码改了要重启 CLI（跟 SKILL.md 一样的问题）。
- **建议**：Round 3 的 `hot-reload.ts` 同样可以监听 `~/.upup/plugins/*/index.js`，但 plugin hot-reload 比 SKILL.md 复杂（要重新走 manifest validation + adapter load + API bind）。**留到 Round 4**。

#### 问题 H：Skill marketplace

- **现状**：所有 skill 都本地。
- **建议**：远程 registry + 签名验证 + 版本管理。**大项目**，留到独立 change。

#### 问题 I：AI-generated skills

- **未来**：用户描述需求 → LLM 生成 SKILL.md → 自动注册。
- **建议**：跟 `/create-skill` slash command 配合，需要新的 `create-skill` skill + 写入 `~/.upup/skills/<name>/SKILL.md`。

## 3. 对标差距（更新版）

| 维度 | Claude Code | Codex CLI | upup Round 2 | upup Round 3（本次） |
|---|---|---|---|---|
| `/cmd` 看到所有 skill | ✅ | ✅ | ✅ (149) | ✅ |
| Plugin 注册 skill (manifest) | ✅ | ✅ | ✅ | ✅ |
| Plugin 注册 skill (runtime API) | ✅ | ✅ | ✅ (外部 SDK) | ✅ |
| Skill description i18n | ✅ | ✅ | ✅ | ✅ |
| `/skills` 列表命令 | ✅ | ✅ | ✅ | ✅ |
| 示例 plugin | ✅ | ✅ | ✅ | ✅ |
| Plugin skill 验证 | ✅ | ✅ | ✅ (type guard) | ✅ |
| `/skills` 真实 use count | ✅ | ✅ | ❌ (—) | ✅ **Round 3 修** |
| SKILL.md 热重载 | ✅ | ⚠️ | ❌ | ✅ **Round 3 修** |
| Autocomplete 按评分排序 | ⚠️ | ❌ | ❌ | ❌ Round 4 候选 |
| Plugin 权限运行时 gate | ✅ | ✅ | ❌ | ❌ Round 4 候选 |
| Skill composition（声明式） | ❌ | ❌ | ❌ | ❌ Round 4+ 候选 |
| Plugin 热重载 | ❌ | ❌ | ❌ | ❌ Round 4 候选 |
| Skill marketplace | ✅ | ❌ | ❌ | ❌ 独立 change |
| AI-generated skills | ❌ | ❌ | ❌ | ❌ 独立 change |

**Round 3 收尾后**，upup 在 P0/P1 维度已**完全对齐 Claude Code**，仅剩 P2 细节。

## 4. 插件系统深度分析

### 4.1 4 个 runtime 适配器

| Adapter | 用例 | 隔离级别 |
|---|---|---|
| `bun` | TS 文件直执行（默认） | 进程内（无隔离） |
| `jiti` | 兼容 Node + ESM | 进程内 |
| `wasm` | 沙箱执行 | 进程内 + WASM 边界 |
| `mcp` | Model Context Protocol 跨进程 | 跨进程 |

**判断**：bun/jiti 都是同进程，安全靠 `path-safety.ts` 防止越权（已有）。wasm/mcp 提供真正隔离。

### 4.2 7 个 register 入口

```
registerTool          工具（最常用）        ——
registerTools         批量工具              ——
registerSkill         Skill（Round 1 补）    走 skills/register.ts + bridge.ts
registerHook          生命周期事件          ——
registerChannel       IM 频道（whatsapp）   ——
registerCommand       自定义 slash 命令     走 @upup/commands
registerService       后台服务              ——
registerDataSource    数据源                ——
```

**判断**：7 个 register 入口已经够用，没有"漏"的。Round 1 补完 skill 后，**插件系统对外能力已对齐 Claude Code**。

### 4.3 未来扩展点

- `registerLlmProvider` — 让 plugin 提供自定义 LLM（替代 OpenAI/Anthropic）
- `registerMcpServer` — 直接从 plugin 启 MCP server（现在是 channel adapter 转）
- `registerWorkspace` — 多 workspace 共享 plugin

## 5. 复用现有代码（Round 3 三个改动都做到了）

| 改动 | 复用的现有模块 |
|---|---|
| `getAllRecentCounts()` | 直接读 `usageCache.records[i].useCount` — 已有数据结构 |
| `listInstalledSkills` 接入计数 | `Promise.all([scores, counts])` 复用已有 IO |
| `hot-reload.ts` 整个 | `reRegisterSkill()` 已有；`extractSkillMetadata()` 已有；`SKILL_DIRECTORIES` 同构（重建 list） |
| `hot-reload.ts` 防抖 | 手写 200ms setTimeout（不引 chokidar / RxJS） |
| 热重载删除路径 | 复用 `unregisterSkill()`（已有） |

**零新外部依赖**。整个 Round 3 + Round 2 + Round 1 加起来**只用了** `gray-matter`（已有）和 Node 内置 `fs/watch`。

## 6. Round 3 验收标准

- [x] `bun run typecheck` clean
- [x] `bun test src/skills src/plugins src/i18n` 全部 pass
- [x] `getAllRecentCounts()` 单测覆盖（5 个）
- [x] `hot-reload` 单测覆盖（5 个，含 fs.watch + debounce + singleton）
- [x] `/skills` 真实 use count 显示（手工验证：跑一次 recordUsage + listInstalledSkills）
- [ ] 0 回归（与 23 baseline 对比）
- [ ] commit + PR 描述完整

## 7. 显式不做（Round 4+）

- Skill composition（声明式 pipeline）
- Plugin 热重载
- Autocomplete 按评分排序
- Plugin 权限运行时 gate
- Skill marketplace
- AI-generated skills
- `skill-tracker` 与 `recent-usage` 合并（通过事件总线解耦即可，不需合并代码）

## 8. 长期 roadmap（参考）

```
2026-Q3:  Skill composition (A 股 = tech + flow + fundamental auto-chained)
2026-Q3:  Plugin hot-reload (no restart on code change)
2026-Q3:  Autocomplete 按评分排序（minor improvement）
2026-Q4:  Plugin 权限运行时 gate
2026-Q4:  Skill marketplace (remote registry + signed SKILL.md)
2027-Q1:  AI-generated skills (自然语言 → SKILL.md)
2027-Q1:  Plugin sandbox (worker_threads + capability token)
2027-Q2:  skill-tracker ↔ recent-usage 事件总线合并
```
