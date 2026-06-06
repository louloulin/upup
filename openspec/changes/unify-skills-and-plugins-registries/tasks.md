# Tasks: Unify Skills + Plugins Registries

## Phase A — P0 修复: `/cmd` 看到动态 skill(最小可发布)

- [x] A1 在 `src/skills/bridge.ts`(新)里写 20 行薄壳,把每个 skill
      publish 到 `@upup/commands` 的 `registerDynamicCommand()`
- [x] A2 在 `src/skills/commands.ts` 的 `initializeSkills()` 末尾调
      `bridge.publishAll()` 一次性同步
- [x] A3 在 `src/commands/unified-registry.ts` 的 `listAllCommands()`
      改为:`getAllSlashCommands() + getDynamicCommands()`,
      dedupe 以本地 SST 为真源(同名上游静态命令让位)
- [x] A4 加测试 `src/skills/bridge.test.ts`:注册 N 个 skill 后,
      `getDynamicCommands()` 长度 === N
- [x] A5 加测试 `src/skills/dedupe.test.ts`:同名时本地胜出 + 日志
- [x] A6 跑 `bun test` + `bun run typecheck` 全绿
- [x] A7 手动 smoke:`initializeSkills()` 返回 267, `getBridgeCount()` = 149
      (从原来 0 提升到 149 动态 skill 进入 /cmd autocomplete)

## Phase B — 架构清理: SST 3 Map → 1 Map + 索引 [DEFERRED → follow-up change]

- [ ] B1 在 `src/skills/slash-command.ts` 把
      `commands / skills / skillCommands` 3 个 Map 合并成
      `skills: Map<name, Skill>`
- [ ] B2 派生 `byAlias: Map<trigger, Set<name>>` 和
      `byPath: Map<path, name>` 索引,set/delete 时自动维护
- [ ] B3 把所有读路径(`getSkillCommand` / `getSkillsByTrigger` /
      `search` 等)统一走 `get(name)` + 索引
- [ ] B4 跑全套测试,任何 break 立刻修;不允许"先 break 后修"

> **延期原因**: Phase B 是高 blast radius 重构(影响所有读/写 registry
> 的代码),且当前 3-Map 架构工作正常。已记录在 Design Doc 的
> "Follow-up" 章节,作为独立 change 处理。

## Phase C — 统一注册入口: `registerSkill(skill, source)`

- [x] C1 新建 `src/skills/register.ts`,导出
      `registerSkill(skill, source)` + `unregisterSkill(name)` +
      `reRegisterSkill(skill, source)` 三个纯函数
- [x] C2 `registerSkill` 内部:
      - 强类型 source (`'builtin' | 'investment' | 'bundled' | 'file-based' | 'plugin:<id>'`)
      - 自动 `set source / registeredAt / checksum`(可选)
      - 单次调 `registry.set(name, enriched)` + `bridge.publish(enriched)`
      - try/catch 局部,失败日志,不让启动 crash
- [ ] C3 重构 `src/skills/commands.ts` 的 4 条 register 路径,全部
      改调 `registerSkill(skill, source)`,删除手抄逻辑  [PARTIAL —
      4 paths 保持原状兼容, registerSkill 暴露给 plugin SDK / tests 用;
      完整重构留作后续 change 以减小 blast radius]
- [x] C4 (合并到 F 测试套件)

## Phase D — 插件 ↔ Skill 桥(plugin 作者可以注册 skill)

- [x] D1 在 `src/plugins/types.ts` 的 `PluginManifest` 加
      `skills?: PluginSkillEntry[]` 字段
- [x] D2 在 `src/plugins/loader.ts` 的 `loadPlugin()` 里读
      `manifest.skills`,逐个 `registerSkill(skill, 'plugin:<id>')`
- [x] D3 在 `src/plugins/loader.ts` 的 `unloadPlugin()` 里清理 plugin
      自己的 skills
- [x] D4 在 `src/plugins/sdk/index.ts` 暴露
      `registerSkill(skill): void` 给插件作者(运行时 API,非 manifest)
- [ ] D5 加测试 `src/plugins/loader.test.ts`: [deferred — same
      coverage provided by registry.test.ts structural invariants]
- [ ] D6 文档: [deferred — covered in Design Doc 即可

## Phase E — 清理 + 体验

- [x] E1 删除 `src/commands/executor.ts` 的
      `findCommand + execute` fallback(单一执行路径)
- [x] E2 在 `src/cli.ts` 的 `initializeSkills()` 之后加
      "✓ 已加载 N 个 skill" 反馈
- [x] E3 i18n 化 `src/skills/skills-menu.ts` 4 个硬编码字符串
- [x] E4 在 `src/i18n/strings.ts` 加 6 个新 cmd.* key (EN + zh-CN 对称)
- [x] E5 由现有 i18n.test.ts 覆盖(对称性自动测试)

## Phase F — Invariant + 回归测试

- [x] F1 加 `src/skills/registry.test.ts` (7 个 structural invariant
      test — 因为 source 数会随环境变化,改成结构性断言更稳)
- [x] F2 加 `src/skills/bridge.test.ts` (8 个 test,含 publishAll/
      unregister/同 register 的覆盖)
- [x] F3 端到端: smoke 脚本验证 `initializeSkills()` → 267,
      `getBridgeCount()` = 149, `getDynamicCommands().length` = 149
      (149 动态 skill 进入 /cmd autocomplete, 改前是 0)

## Phase G — 文档 + 收尾

- [ ] G1 更新 `src/skills/README.md`(如有)反映新架构
- [ ] G2 更新 `docs/superpowers/specs/` 加一份
      `2026-06-06-skills-plugins-architecture.md`(写完归档后)
- [ ] G3 跑完整 gate:`bun run typecheck` + `bun test` + `bun run lint`
- [ ] G4 写 verification report
- [ ] G5 走 `comet-verify` → `comet-archive`

## 依赖关系

```
A1 ─► A2 ─► A3 ─► A4,A5 ─► A6 ─► A7
A* 完成才能给用户用(早交付)

B 独立(架构清理,可以在 A 之后任意时间做)

C 依赖 B(C 写之前 B 的统一读路径先到位)

D 依赖 C(插件要调 registerSkill)

E1-E5 独立,可以和 B/C/D 平行做

F 依赖 A,B,C,D(测试要在所有改动到位后写)

G 依赖 F
```

## 估算

- Phase A: 1-2 天
- Phase B: 1 天
- Phase C: 1 天
- Phase D: 1-2 天
- Phase E: 0.5 天
- Phase F: 1 天
- Phase G: 0.5 天

**总计**:5-8 天(medium scope,符合 proposal 里的范围估算)

## 显式不做(留给 follow-up change)

- ❌ Skill marketplace / npm 打包
- ❌ Skill 热加载 / 文件监听
- ❌ Skill composition(自动串联多个 skill)
- ❌ Skill 评分 / 排行(虽然 `recent-usage.ts` 已有数据)
- ❌ Skill description i18n(只 i18n 自己的 UI 字符串)
- ❌ `src/skills/bundled/` 目录重组
- ❌ 把 `SkillCommandRegistry` 拆成独立 npm 包
- ❌ 修改 `@upup/commands` 包本身(本 change 只消费)
