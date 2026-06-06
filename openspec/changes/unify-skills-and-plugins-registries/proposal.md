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
| Skill 单一注册表 | ✅ | ✅ | ✅(本 change 目标) |
| `/cmd` 看到所有 skill | ✅ | ✅ | ✅(本 change 目标) |
| Plugin 注册 skill | ✅(manifest) | ✅(manifest) | ✅(本 change 目标) |
| 启动显示"已加载 N 个" | ✅ | ✅ | ✅(本 change 目标) |

## 复用的现有能力(零新外部依赖)

- `@upup/commands` 的 `registerDynamicCommand()` / `unregisterDynamicCommand()` 已有 API
  (本 change 只是消费它,不是改它)
- `src/i18n/strings.ts` 已有 `t()` 单点入口,补几行 key 即可覆盖
- `src/skills/executor.ts:createSkillCommand` 已经做 "bundled → skill" 转换
- `src/plugins/sdk/` 已经有 `registerTool` / `registerHook` 等能力注册入口
  ,加一个 `registerSkill` 即可
- 现有 `SkillCommandRegistry` 已经是本地真源,只缺一个"展示桥"
- 现有 80+ skill 的 metadata schema 兼容 Claude Code / Codex 命名约定,
  不需要 break change
