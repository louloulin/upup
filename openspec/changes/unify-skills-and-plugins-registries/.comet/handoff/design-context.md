# Comet Design Handoff

- Change: unify-skills-and-plugins-registries
- Phase: design
- Mode: compact
- Context hash: 4ff71238b9b6b6373a37fcd9632439252be945dc73bdcb4766686f982a355a74

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/unify-skills-and-plugins-registries/proposal.md

- Source: openspec/changes/unify-skills-and-plugins-registries/proposal.md
- Lines: 1-96
- SHA256: 6d5f7203535fa133fc40648c7b79104e9416d511c9289219aa442ace3ec1c1b7

[TRUNCATED]

```md
# 提案:Unify Skills + Plugins Registries & Surface Dynamic Skills in `/cmd`

**Change**: `unify-skills-and-plugins-registries`
**Workflow**: full
**Date**: 2026-06-06
**Author**: codex

---

## 背景(Why)

`upup` 已经积累 80+ 投资分析技能(`dcf`, `a-share-analysis`, `technical-analysis`,
`value-investing`, `dividend-analysis`, `momentum-investing` 等),分布在
4 类来源里(builtin / bundled / file-based / agent commands),都通过
`initializeSkills()` 在启动时注册到**本地** `SkillCommandRegistry`
(`src/skills/slash-command.ts`)。然而 `/cmd` 这个 slash 下拉补全走的是
另一个上游注册表——`@upup/commands` 包的 `SLASH_COMMANDS` + `getDynamicCommands()`。

**问题现象**:用户在 CLI 键入 `/` 看到的是 `@upup/commands` 里的静态命令,
**看不到** 那 80+ 动态 skill。直接输入 `/dcf` 仍能跑(因为
`handleSlashCommand()` 优先尝试 `executeSkillCommand()` 走本地 registry),但
**tab 补全 = 0,发现性 = 0**,等于"代码里有这个功能,用户不知道"。

进一步探索还发现:

- **双注册表长期不同步**(本地 + 上游)。任何加 skill 的改动都只写一边,
  另一边靠 fallback 兜底。架构债。
- **插件系统**(`src/plugins/`, 4100+ 行,5 个 adapter)能注册 tool /
  service / hook,**但不能注册 skill**。插件作者想加 skill 必须 fork 代码。
- **4 条手抄的 register 路径**(`builtinSkills` / `investmentSkills` /
  `bundledSkills` / `fileBasedSkills`)各有自己的小逻辑,加新来源要改 4 处。
- `SkillCommandRegistry` 内部又分 3 个 Map(`commands` / `skills` /
  `skillCommands`),查询心智负担重。
- `src/commands/executor.ts:79-95` 保留了一条"先 `executeCommand`,
  失败再 `findCommand`"的 fallback,执行路径不唯一。
- 启动后**没有** "已加载 N 个 skill" 的反馈,盲盒感。

## 目标(Goals)

1. **`/cmd` 下拉能直接看到所有动态 skill**(包括 bundled / file-based /
   agent / plugin 提供的)。这是用户点名的最直接痛点。
2. **`SkillCommandRegistry` 成为单一真源**。`@upup/commands` 包只做"展示
   桥",不再持有自己的 skill 副本,dedupe 以 skill 为准。
3. **插件可以注册 skill**。在 `plugin.manifest` 加 `skills: [...]`,
   走 plugin SDK 的 `registerSkill(skillMetadata)` API。无需 fork 代码。
4. **统一的 `registerSkill(skill, source)` 入口**,替换 4 条手抄路径。
5. **加 invariant test**:`discoverSkills().length === getRegisteredCommandCount()`。
   任何脱节立刻 CI 红。
6. **i18n 覆盖 `skills-menu.ts` 里残留的硬编码中文**(顺手,小动作)。

## 非目标(Non-Goals)

明确**不做**,留给后续 change:

- Skill marketplace / npm 打包 / 远程注册源(需要权限模型)
- Skill 热加载 / 文件系统监听
- Skill composition(A 股分析 = 技术 + 资金 + 基本面 自动串联)
- Skill 评分 / 排行(虽然 `recent-usage.ts` 已有数据)
- Skill metadata i18n(description 跟随 locale)
- `src/skills/bundled/` 目录重组(独立 change)
- 把 `SkillCommandRegistry` 拆成微服务/独立 npm 包(过度工程)
- 删除 `@upup/commands` 包(它是上游依赖,此 change 只"消费"它)

## 范围(Scope)

| 优先级 | 来源 | 改动 |
|--------|------|------|
| **P0** | 探索发现 | `/cmd` autocomplete 看不到 80+ 动态 skill |
| **P1.4** | 探索发现 | 双注册表(本地 + `@upup/commands`)长期不同步 |
| **P1.5** | 探索发现 | 4 条手抄 register 路径 |
| **P1.7** | 探索发现 | 插件系统无法注册 skill |
| **P1.8** | 探索发现 | `commands/executor.ts` 双路径 fallback |
| **P1.6** | 探索发现 | `SkillCommandRegistry` 内部 3 Map 心智负担 |
| **P2.9** | 探索发现 | `skills-menu.ts` 残留硬编码中文 |
| **P2.10** | 探索发现 | 缺 invariant test |

## 行业对标

| 维度 | Claude Code | Codex CLI | upup(改后) |
|------|-------------|-----------|------------|
```

Full source: openspec/changes/unify-skills-and-plugins-registries/proposal.md

## openspec/changes/unify-skills-and-plugins-registries/design.md

- Source: openspec/changes/unify-skills-and-plugins-registries/design.md
- Lines: 1-205
- SHA256: e8b1c622d2a6cc5701f9b958ce602c2c22a59e8cdb2600965f5b028829b61a0b

[TRUNCATED]

```md
# 设计:Unify Skills + Plugins Registries

**Change**: `unify-skills-and-plugins-registries`
**Date**: 2026-06-06

---

## 1. 架构总览(改后)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Skill Sources (4 类)                          │
│  builtin / bundled / file-based(~/.upup/skills/) / plugin manifest  │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ 全部走统一入口
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│   registerSkill(skill, source)                                       │
│   ─ src/skills/register.ts (新, 30 行薄壳)                          │
│   - 强类型 source                                                    │
│   - 自动 set source / detectedAt / checksum                          │
│   - 单一调用点 = 唯一可信入口                                        │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│   SkillCommandRegistry (本地, 单一真源)                              │
│   ─ src/skills/slash-command.ts (改, 内部 3 Map → 1 Map + 索引)     │
│   - skills: Map<string, SkillMetadata + SkillCommand>               │
│   - nameIndex / aliasIndex / pathIndex (派生, 由 skills Map 维护)   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │  启动 + 每次 register 时 push
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│   展示桥: registerDynamicCommand (来自 @upup/commands)               │
│   ─ src/skills/bridge.ts (新, 20 行)                                 │
│   - 每个 skill → 一个 SlashCommand shim                              │
│   - execute 转回本地 registry                                        │
│   - dedupe: 本地为真源, 上游同名静态命令让位                          │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│   @upup/commands 全局注册表 (SLASH_COMMANDS + getDynamicCommands)  │
│   ─ 已经被 CombinedAutocompleteProvider 消费 (src/cli.ts:537)       │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. 关键架构决策(Why)

### 决策 A:`SkillCommandRegistry` 是单一真源(SST)

**为什么不让 `@upup/commands` 做真源?**
- `@upup/commands` 是上游 npm 包,改它要走版本 + 发布流程,周期长
- 上游包的 schema 是"通用 slash command" (`name/desc/aliases/handler`),
  不够装 skill metadata (triggers / model / argumentHint / userInvocable)
- 本地 SST 让插件作者走 plugin SDK 时也只面对一个 API

**为什么不让 SST 完全独立(不桥接上游)?**
- `CombinedAutocompleteProvider` 已经在用 `getAllSlashCommands()`,
  改它的输入源需要 fork pi-tui 或写 provider 适配器,代价更大
- 桥是 ~20 行的薄壳,数据流可读,出问题容易定位

### 决策 B:统一入口 `registerSkill(skill, source)`

替换现有的 4 条手抄路径(builtin / investment / bundled / file-based),
每条路径只负责把数据转成 `Skill` 形状,**不负责注册逻辑**。注册逻辑只
在 `registerSkill` 一处。

伪代码:
```ts
// src/skills/register.ts (新)
export function registerSkill(skill: Skill, source: SkillSource): void {
  const enriched = { ...skill, source, registeredAt: Date.now() };
  registry.set(skill.name, enriched);   // 单一 set
  bridge.publish(enriched);            // 自动同步到 @upup/commands
  log.debug('skill:registered', { name: skill.name, source });
}
```

```

Full source: openspec/changes/unify-skills-and-plugins-registries/design.md

## openspec/changes/unify-skills-and-plugins-registries/tasks.md

- Source: openspec/changes/unify-skills-and-plugins-registries/tasks.md
- Lines: 1-147
- SHA256: 21c1ce0a8f80e20b3ce97064d39fb009c66eb6dc80eb510bc3e05650c1855c20

[TRUNCATED]

```md
# Tasks: Unify Skills + Plugins Registries

## Phase A — P0 修复: `/cmd` 看到动态 skill(最小可发布)

- [ ] A1 在 `src/skills/bridge.ts`(新)里写 20 行薄壳,把每个 skill
      publish 到 `@upup/commands` 的 `registerDynamicCommand()`
- [ ] A2 在 `src/skills/commands.ts` 的 `initializeSkills()` 末尾调
      `bridge.publishAll()` 一次性同步
- [ ] A3 在 `src/commands/unified-registry.ts` 的 `listAllCommands()`
      改为:`getAllSlashCommands() + getDynamicCommands()`,
      dedupe 以本地 SST 为真源(同名上游静态命令让位)
- [ ] A4 加测试 `src/skills/bridge.test.ts`:注册 N 个 skill 后,
      `getDynamicCommands()` 长度 === N
- [ ] A5 加测试 `src/skills/dedupe.test.ts`:同名时本地胜出 + 日志
- [ ] A6 跑 `bun test` + `bun run typecheck` 全绿
- [ ] A7 手动 smoke:`bun start` → 键入 `/` → 下拉看到 80+ skill

## Phase B — 架构清理: SST 3 Map → 1 Map + 索引

- [ ] B1 在 `src/skills/slash-command.ts` 把
      `commands / skills / skillCommands` 3 个 Map 合并成
      `skills: Map<name, Skill>`
- [ ] B2 派生 `byAlias: Map<trigger, Set<name>>` 和
      `byPath: Map<path, name>` 索引,set/delete 时自动维护
- [ ] B3 把所有读路径(`getSkillCommand` / `getSkillsByTrigger` /
      `search` 等)统一走 `get(name)` + 索引
- [ ] B4 跑全套测试,任何 break 立刻修;不允许"先 break 后修"

## Phase C — 统一注册入口: `registerSkill(skill, source)`

- [ ] C1 新建 `src/skills/register.ts`,导出
      `registerSkill(skill, source)` + `unregisterSkill(name)` +
      `reRegisterSkill(skill, source)` 三个纯函数
- [ ] C2 `registerSkill` 内部:
      - 强类型 source (`'builtin' | 'investment' | 'bundled' | 'file-based' | 'plugin:<id>'`)
      - 自动 `set source / registeredAt / checksum`(可选)
      - 单次调 `registry.set(name, enriched)` + `bridge.publish(enriched)`
      - try/catch 局部,失败日志,不让启动 crash
- [ ] C3 重构 `src/skills/commands.ts` 的 4 条 register 路径,全部
      改调 `registerSkill(skill, source)`,删除手抄逻辑
- [ ] C4 加 `src/skills/register.test.ts`:4 类 source 各跑一个 case

## Phase D — 插件 ↔ Skill 桥(plugin 作者可以注册 skill)

- [ ] D1 在 `src/plugins/types.ts` 的 `PluginManifest` 加
      `skills?: SkillManifestEntry[]` 字段(Zod schema 复用 `src/skills/types.ts` 的字段)
- [ ] D2 在 `src/plugins/loader.ts` 的 `loadPlugin()` 里读
      `manifest.skills`,逐个 `registerSkill(skill, 'plugin:<id>')`
- [ ] D3 在 `src/plugins/loader.ts` 的 `unloadPlugin()` 里
      `unregisterSkill(name)`(限定 source 是这个 plugin 自己的)
- [ ] D4 在 `src/plugins/sdk/index.ts` 暴露
      `registerSkill(skill): void` 给插件作者(运行时 API,非 manifest)
- [ ] D5 加测试 `src/plugins/loader.test.ts`:
      - 加载带 skills 的 manifest → SST 命中
      - 卸载 → SST 清除
      - 重新加载 → SST 重新出现
- [ ] D6 文档:在 `packages/plugin-sdk/README.md`(如有)加一段
      "Plugin Authoring — Registering Skills"

## Phase E — 清理 + 体验

- [ ] E1 删除 `src/commands/executor.ts:79-95` 的
      `findCommand + execute` fallback(单一执行路径)
- [ ] E2 在 `src/cli.ts:328` 的 `initializeSkills()` 之后加一行
      "✓ 已加载 N 个 skill"(用 `getRegisteredCommandCount()`)
- [ ] E3 i18n 化 `src/skills/skills-menu.ts` 残留硬编码中文:
      - `getCliSkillSuggestion` 里的 "提示:考虑使用..."
      - `formatSkillSuggestions` 里的 "🎯 Skill Suggestions:"
      - "Use /<skill-name> to invoke a skill."
- [ ] E4 在 `src/i18n/strings.ts` 加 ~5 个新 key (EN + zh-CN 对称)
      - `cmd.skills_loaded` = "✓ Loaded {n} skills" / "✓ 已加载 {n} 个技能"
      - `cmd.suggestion_hint` = "💡 Try /{name} to {desc}"
      - `cmd.suggestions_title` = "🎯 Skill Suggestions"
      - `cmd.invoke_hint` = "Use /<name> to invoke"
      - `cmd.dedupe_warn` = "Static command /{name} shadowed by skill"
- [ ] E5 lint test 确保新 key 走 `cnCharRe` 正则(`src/agent/locale.test.ts` 已有套路)

## Phase F — Invariant + 回归测试

- [ ] F1 加 `src/skills/registry.test.ts` 的 invariant test:
```

Full source: openspec/changes/unify-skills-and-plugins-registries/tasks.md

