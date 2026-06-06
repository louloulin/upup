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

### 决策 C:Plugin Skill 注册走 manifest,不走代码

```yaml
# plugin manifest (.upup/plugins/<id>/plugin.yaml)
name: my-plugin
version: 0.1.0
skills:
  - name: my-analysis
    description: 跑我的分析
    triggers: [my, ma]
    argumentHint: "<ticker>"
```

加载流程:
1. `src/plugins/loader.ts` 在 `loadPlugin()` 里读 manifest
2. 对每个 manifest skill 调 `registerSkill(skill, 'plugin:' + plugin.id)`
3. 卸载时 `unregisterSkill(name)` 同步 unbridge

### 决策 D:`SkillCommandRegistry` 内部 3 Map → 1 Map + 索引

旧:
```ts
private commands: Map<name, SkillCommandRegistration>
private skills:   Map<name, SkillMetadata>
private skillCommands: Map<name, SkillCommand>
```

新:
```ts
private skills: Map<name, Skill>  // Skill = metadata + command
private byAlias: Map<string, Set<string>>   // trigger → skill name
private byPath:  Map<string, string>        // path → skill name
```

读路径的代码全部走 `get(name)`,索引自动维护。`getSkillsByTrigger(input)`
内部用 `byAlias`。

### 决策 E:删除 `commands/executor.ts` 的 fallback 路径

`src/commands/executor.ts:79-95` 的 `findCommand + execute` fallback 是
"`@upup/commands` 有可能没有它" 的兜底。改后,所有命令都通过 SST 走,
这条 fallback 删掉。如果未来真要支持"没有走 SST 的纯上游命令",
加一个 `registerPluginDynamicCommand` 显式 API 替代。

## 3. 数据流

### 启动
```
cli.startup()
  └─ initializeSkills()                    // 顺序注册 4 类 source
      ├─ registerBuiltinSkills() → 调 registerSkill(s, 'builtin')
      ├─ initInvestmentSkills()  → 调 registerSkill(s, 'investment')
      ├─ getAllBundledSkills() loop → registerSkill(s, 'bundled')
      ├─ discoverSkills() loop → registerSkill(s, 'file-based')
      └─ loadAllPlugins() (新)   → registerSkill(s, 'plugin:<id>')
  └─ getRegisteredCommandCount() → 打印 "✓ 已加载 N 个 skill" (P1.3)
```

### 用户键入 `/`
```
CombinedAutocompleteProvider(listAllCommands(), cwd)
  └─ listAllCommands() = getAllSlashCommands() = @upup/commands
       ├─ SLASH_COMMANDS (静态)
       └─ getDynamicCommands()  ← 我们 registerSkill 时桥接过来的
  └─ 看到 80+ 动态 skill ✅
```

### 用户输入 `/dcf AAPL`
```
handleSlashCommand('dcf', 'AAPL')
  └─ executeSkillCommand('dcf', 'AAPL')  // 优先走本地 SST
      └─ registry.get('dcf') → 命中 → execute
  └─ (fallthrough to upstream executeCommand 也行, 两条都通)
```

### 插件卸载
```
pluginLoader.unload(pluginId)
  └─ for each skill where source === 'plugin:<id>':
       registry.delete(name)
       unbridge.delete(name)
```

## 4. 模块边界(改后)

| 文件 | 角色 | 改/留/新 |
|------|------|----------|
| `src/skills/slash-command.ts` | SST(单一真源) | **改**:3 Map → 1 Map + 索引 |
| `src/skills/commands.ts` | 启动 orchestrator | **改**:4 条 register 路径 → 调 `registerSkill` |
| `src/skills/register.ts` | **新**:`registerSkill(skill, source)` 薄壳 | 新 |
| `src/skills/bridge.ts` | **新**:与 `@upup/commands` 的同步层 | 新 |
| `src/skills/skills-menu.ts` | 显示 + i18n | **改**:硬编码中文化 + 调 SST |
| `src/skills/index.ts` | 公共导出 | **改**:加 `registerSkill` / `unregisterSkill` |
| `src/plugins/loader.ts` | 插件加载 | **改**:读 manifest.skills → 调 `registerSkill` |
| `src/plugins/sdk/index.ts` | 插件 SDK 公共 API | **改**:暴露 `registerSkill` 给插件作者 |
| `src/plugins/types.ts` | 插件类型 | **改**:`PluginManifest.skills` 字段 |
| `src/commands/executor.ts` | 命令执行 | **改**:删 fallback `findCommand` 路径 |
| `src/commands/unified-registry.ts` | 命令列表 thin wrapper | **改**:从 SST 拉 + dedupe |
| `src/i18n/strings.ts` | i18n 表 | **改**:加 `cmd.dynamic_skills_count` 等 ~5 keys |
| `src/skills/registry.test.ts` | SST 测试 | **新**:invariant test + dedupe test |
| `src/skills/bridge.test.ts` | 桥接测试 | **新**:注册 / 卸载 / 重注册 |
| `src/plugins/loader.test.ts` | 插件加载测试 | **改**:加 manifest.skills 用例 |

**零新外部依赖**。`@upup/commands` 已经提供 `registerDynamicCommand` /
`unregisterDynamicCommand`,本 change 只"消费"已有 API。

## 5. 兼容性 / 风险

| 风险 | 缓解 |
|------|------|
| `@upup/commands` 升级后 `registerDynamicCommand` 改名 | 仅依赖包内已有 API,锁版本;半年内不动 `@upup/commands` |
| 同名 skill 冲突(bundled vs file-based) | SST 内部 `set` 覆盖 + 日志;file-based 优先(现状) |
| 插件 manifest.skills 格式写错 | 复用 `manifest.ts` 已有 Zod schema + `validatePluginConfig` |
| `registerSkill` 在 `initializeSkills()` 中途抛错 | try/catch 局部,日志,不 crash 启动(降级到 N-1 skill) |
| i18n 字符串没翻中文 | 强制 `en + zh-CN` 对称(lint 测试已存在) |

## 6. 复用的现有测试基础设施

- `src/skills/executor.test.ts` 已存在
- `src/skills/dependency.test.ts`, `intent-detector.test.ts`,
  `mcp-skills.test.ts`, `plugin-integration.test.ts` 都是 hermetic 单测
- `src/skills/loader.zh-cn.test.ts` 已证明 i18n 测试套路
- `src/agent/locale.test.ts` 的 `cnCharRe` 正则可借来 lint i18n 字符串

不需要新加测试框架,不需要新加 mock 工具。
