# Skills + Plugins 架构 — 全面分析与后续规划

**Date**: 2026-06-06
**Change**: `unify-skills-and-plugins-registries` (后续)
**Status**: 实施中

## 1. 全面代码盘点

### 1.1 已完成（上一轮 commit `196071b4`）

| 模块 | 状态 | 行数 |
|---|---|---|
| `src/skills/bridge.ts` | 新增 | 125 |
| `src/skills/register.ts` | 新增 | 166 |
| `src/skills/bridge.test.ts` | 8 个测试 | 140 |
| `src/skills/dedupe.test.ts` | 7 个测试 | 133 |
| `src/skills/registry.test.ts` | 7 个测试 | 84 |
| `src/commands/unified-registry.ts` | 重写 | 115 |
| `src/commands/executor.ts` | 删 fallback | -47 |
| `src/plugins/types.ts` | +PluginSkillEntry | +48 |
| `src/plugins/loader.ts` | +skill 注册/清理 | +96 |
| `src/plugins/sdk/index.ts` | re-export registerSkill | +4 |
| `src/skills/slash-command.ts` | +unregister(name) | +45 |
| `src/cli.ts` | +"Loaded N skills" | +9 |
| `src/i18n/strings.ts` | +6 cmd.* keys | +21 |
| `src/skills/skills-menu.ts` | 4 硬编码 i18n 化 | ±10 |
| `src/types/upup-commands.d.ts` | +registerDynamicCommand 声明 | +32 |

**P0 已修**：`/cmd` autocomplete 从 0 个动态 skill 提升到 149 个（initializeSkills 返回 267，bridge 同步 149 个 user-invocable）。

### 1.2 仍存在的问题（按优先级）

#### P1 — 立即要补

1. **外部 `@upup/plugin-sdk` PluginAPI 没有 `registerSkill`**
   - 当前只在内部 `src/plugins/types.ts` 的 `UpUpPluginApi` 上加了
   - 外部 plugin 作者 import `@upup/plugin-sdk` 看不到这个方法
   - 影响：plugin 作者要 fork SDK 才能用 skill 注册
   - 修复：在 `packages/plugin-sdk/src/index.ts` 加 `registerSkill` 到 `PluginAPI`

2. **`description.zh-CN` 解析了但 UI 不读**
   - `loader.ts` 把 `description.zh-CN` 解析到 `SkillMetadata.descriptionZhCn`
   - 但 `skills-menu.ts` / autocomplete 仍然只显示英文 `description`
   - 影响：zh-CN 用户的发现性差了一半
   - 修复：根据 `getLocale()` 自动选 zh-CN 描述

3. **缺 `/skills` 列表命令**
   - 用户没有方式查看"我装了哪些 skill" + "用了多少次"
   - `recent-usage.ts` 已经有 7-day half-life 评分数据，**完全没暴露给 UI**
   - 影响：用户对自己安装的 skill 没有全景视图
   - 修复：加 `/skills` 命令，复用 registry + recent-usage

4. **没有示例 plugin**
   - `registerSkill` API 加了，但仓库里没有任何示例
   - 影响：plugin 作者不知道 manifest.skills 怎么写
   - 修复：在 `.upup/plugins/` 加一个 example-skill-plugin

5. **`PluginSkillEntry` 缺 Zod 运行时校验**
   - 当前 `manifest.ts` 用 JSON schema 字符串校验，**不是 Zod**
   - 插件作者写错字段名（`argumentHint` vs `argument-hint`）只在运行时才报错
   - 修复：补 Zod schema 解析 manifest.skills

#### P2 — 中期改进

6. **Plugin skill 权限模型**
   - 当前 `registerSkill` 没区分 "read-only" vs "network access" vs "shell exec"
   - `PluginSecurity.permissions` 存在但 skill 没用到
   - 修复：skill manifest 加 `permissions?: string[]`，运行时 gate

7. **Skill hot-reload**
   - `SKILL.md` 改了需要重启 CLI 才生效
   - 修复：`fs.watch` 监听 + 自动 re-register

8. **Skill marketplace**
   - 当前 skill 只能本地或项目内
   - 未来：远程 registry + 签名验证 + 版本管理

9. **Skill 评分/排序 UI**
   - `getAllRecentScores()` 返回了 Map<string, number>
   - 但 `/skills` 命令（要加）应该按评分排序
   - autocomplete 暂未集成排序

#### P3 — 长期方向

10. **Skill composition（A 股分析 = 技术 + 资金 + 基本面自动串联）**
11. **AI-generated skills**（自然语言 → SKILL.md）
12. **Plugin hot-reload**（已加载 plugin 改代码不需要重启）
13. **Skill A/B testing**（多个版本对比效果）

### 1.3 行业对标（更新）

| 维度 | Claude Code | Codex CLI | upup 改前 | upup 改后 | upup 后续（本轮） |
|---|---|---|---|---|---|
| Skill 单一注册表 | ✅ | ✅ | ❌ | ✅ | ✅ |
| `/cmd` 看到所有 skill | ✅ | ✅ | ❌ (0) | ✅ (149) | ✅ (149) |
| Plugin 注册 skill (manifest) | ✅ | ✅ | ❌ | ✅ | ✅ |
| Plugin 注册 skill (runtime API) | ✅ | ✅ | ❌ | ✅ (内部) | ✅ (内部 + 外部 SDK) |
| 启动 "Loaded N skills" | ✅ | ✅ | ❌ | ✅ | ✅ |
| Skill description i18n | ✅ | ✅ | ❌ | ⚠️ data 有 UI 无 | ✅ (本轮补) |
| `/skills` 列表命令 | ✅ | ✅ | ❌ | ❌ | ✅ (本轮补) |
| 示例 plugin | ✅ | ✅ | ❌ | ❌ | ✅ (本轮补) |
| Plugin skill Zod 校验 | ✅ | ✅ | ❌ | ⚠️ JSON schema | ✅ (本轮补) |
| Skill 权限 | ✅ | ✅ | ❌ | ❌ | ⏸️ P2 |
| Skill hot-reload | ❌ | ❌ | ❌ | ❌ | ⏸️ P2 |
| Skill marketplace | ✅ | ❌ | ❌ | ❌ | ⏸️ P3 |
| Skill composition | ⚠️ | ❌ | ❌ | ❌ | ⏸️ P3 |

**改后 upup 已对齐 Claude Code 的核心能力**（P0 修复完成）。本轮目标是**补齐**两个 UX 短板（i18n picker + /skills 命令）和**补完插件故事**（外部 SDK + 示例 + Zod）。

### 1.4 插件系统深度分析

`src/plugins/` 共 4100+ 行，5 个 adapter。当前**只**补了 skill 注册能力。其它能力：

| Adapter/能力 | 状态 | 是否需要类似"统一入口" |
|---|---|---|
| `registerTool` | ✅ 完整 | — |
| `registerHook` | ✅ 完整 | — |
| `registerChannel` | ✅ 完整 | — |
| `registerService` | ✅ 完整 | — |
| `registerDataSource` | ✅ 完整 | — |
| `registerCommand` | ✅ 完整 | — |
| `registerSkill` | ✅ 本轮完成 (内部 + 外部) | ✅ (本轮补外部) |
| `registerLlmProvider` | ❌ 没有 | 🔮 未来 |
| `registerMcpServer` | ⚠️ 通过 channel | 🔮 未来 |

**架构判断**：插件系统已经很完整（7 个 register 入口），skill 补完后短期不需要再加。**未来方向**是 plugin hot-reload + 远程 marketplace + 多 plugin 隔离（sandbox）。

### 1.5 复用现有代码（最小新代码原则）

本轮所有新功能都**严格复用**现有模块：

| 新功能 | 复用的现有模块 |
|---|---|
| `/skills` 命令 | `getSkillCommandRegistry()` + `recent-usage.ts` 的 `getAllRecentScores()` + `t()` |
| description i18n | `SkillMetadata.descriptionZhCn`（loader 已解析）+ `getLocale()` |
| 外部 SDK registerSkill | 内部 `registerSkill` 的镜像 |
| 示例 plugin | 现有 `upup.plugin.json` schema + 现有 `registerSkill` API |
| Zod 校验 | 复用 manifest.ts 的 schema 模式（Zod 还没引入，先用 type guard） |

**零新外部依赖**。

## 2. 本轮实施计划

| 步骤 | 任务 | 估时 | 风险 |
|---|---|---|---|
| 2.1 | 外部 `PluginAPI.registerSkill` 暴露 | 0.5h | 低 |
| 2.2 | Skill description i18n 接入 | 0.5h | 低 |
| 2.3 | `/skills` 列表命令 | 1h | 中 |
| 2.4 | 示例 plugin (manifest + runtime) | 0.5h | 低 |
| 2.5 | PluginSkillEntry Zod 校验 | 0.5h | 中 |
| 2.6 | 测试 (4-5 个新文件) | 1h | 低 |
| 2.7 | 跑 gates + commit | 0.5h | — |

**总计**: 4-5 小时。**不**做 Phase B (3-Map 重构)，**不**做 hot-reload，**不**做 marketplace。

## 3. 验收标准

- [ ] `bun run typecheck` clean
- [ ] `bun test` 与 baseline 23 fail 一致（0 回归）
- [ ] `/skills` 命令列出 149 个 skill + 按评分排序
- [ ] zh-CN locale 下 skill description 显示中文
- [ ] 示例 plugin 在 `.upup/plugins/example-skill-plugin/` 可被加载
- [ ] 外部 `@upup/plugin-sdk` PluginAPI 类型包含 registerSkill
- [ ] 全部新功能有对应测试

## 4. 显式不做（留给 follow-up）

- Phase B 3-Map 重构（独立 change，blast radius 大）
- Skill hot-reload（需要 fs.watch 架构）
- Skill marketplace（需要签名 + 服务器）
- Plugin sandbox 多进程隔离（需要 worker_threads 改造）
- Skill 权限模型（需要 manifest schema 大改）
- AI-generated skills（需要 LLM 集成到 build pipeline）

## 5. 未来 roadmap（参考）

```
2026-Q3: Skill composition (A 股分析 = tech + flow + fundamental auto-chained)
2026-Q3: Plugin hot-reload (no restart on code change)
2026-Q4: Skill marketplace (remote registry + signed SKILL.md)
2026-Q4: Skill 权限模型 (permissions per skill in manifest)
2027-Q1: AI-generated skills (自然语言描述 → SKILL.md)
2027-Q1: Plugin sandbox (worker_threads + capability token)
```
