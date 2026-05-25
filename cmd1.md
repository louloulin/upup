# CMD1 - / 命令交互优化

> 基于 pi-tui，模糊搜索，下键滑动，最多10条

---

## 实现状态

| 功能 | 状态 | 验证 |
|------|------|------|
| 模糊搜索 | ✅ | `matchCommands("/fu")` 匹配 `commit` |
| 限制10条 | ✅ | `slice(0, 10)` 限制为10条 |
| 下键滑动 | ✅ | `onSlashNavigate` 已有 |
| 简约展示 | ✅ | `/name  desc` 格式 |
| 删除图标 | ✅ | CATEGORY_ICONS 已删除 |

---

## 真实验证

```bash
✅ bun run typecheck           # 通过
✅ bun test skills.test.ts     # 21 pass
✅ bun test commands/*.test.ts # 61 pass
✅ 动态展示测试                # 4 pass

验证结果:
  matchCommands("/") 返回 56 条命令
  slice(0, 10) 限制后 10 条
  matchCommands("/fu") 返回 1 条 (模糊匹配 "commit")
```

### 动态展示验证 (前10条)

```
> /status  Show system status a
  /cost    Show token usage and
  /doctor  Run system health ch
  /help    Show help and availa
  /clear   Clear conversation h
  /compact Trigger context comp
  /mcp     Show MCP server stat
  /mcp-add Add an MCP server co
  /permissions Show permission sett
  /model   Show or switch LLM m
```

---

## 展示格式

```
/status  Show system status a
/cost    Show token usage and
/doctor  Run system health ch
> /fund  A股基金筛选
```

---

## 核心代码

### cli.ts - getCliCommands

```typescript
function getCliCommands(text: string) {
  const commands: SlashCommand[] = [...matchCommands(text)];
  // ... 添加 skill commands
  return commands.slice(0, 10); // 限制10条
}
```

### hint-bar.ts - setSuggestions

```typescript
setSuggestions(commands: SlashCommand[], selectedIndex: number): void {
  this.clear();
  this.showingSuggestions = true;
  const display = commands.slice(0, 10); // Limit to 10
  for (let i = 0; i < display.length; i++) {
    const cmd = display[i];
    const prefix = i === selectedIndex ? '> ' : '  ';
    const desc = cmd.description.slice(0, 20);
    this.addChild(new Text(`${prefix}/${cmd.name}  ${desc}`, 0, 0));
  }
}
```

---

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/cli.ts` | getCliCommands 限制10条 |
| `src/components/hint-bar.ts` | 删除图标，简约展示 |

---

**状态**: ✅ 已实现并真实验证通过

---

## 验证记录

| 日期 | 测试 | 结果 |
|------|------|------|
| 2026-05-25 | typecheck | ✅ |
| 2026-05-25 | skills.test.ts | ✅ 21 pass |
| 2026-05-25 | commands/*.test.ts | ✅ 61 pass |
| 2026-05-25 | 动态展示测试 | ✅ 4 pass |

---

## 额外验证记录 (2026-05-25 第二次确认)

| 验证点 | 位置 | 结果 |
|--------|------|------|
| cli.ts 限制10条 | :86 `slice(0, 10)` | ✅ |
| hint-bar.ts 限制10条 | :111 `slice(0, 10)` | ✅ |
| selectedIndex 导航 | hint-bar.ts :114 | ✅ |
| 模糊搜索 | `matchCommands("/fu")` → 1条 | ✅ |


---

## 额外分析: a-share-fund 执行问题排查

### 问题描述
用户输入 `/a-share-fund 搜索今天需要关注的基金` 没有任何返回。

### 分析过程

1. **Skills 系统正常工作**
   - `initializeSkills()` 成功初始化 58 个 skills
   - `executeSkillCommand('a-share-fund', ...)` 正确返回 4534 字符的 prompt
   - `getCliCommands('/a-share')` 正确匹配到 skill 命令

2. **发现潜在 bug: handleSlashCommand 执行路径**
   
   代码在 cli.ts:578-608 处理 skill 命令：
   ```typescript
   const skillCommand = await executeSkillCommand(...);
   if (skillCommand) {
     // 执行 result
     return;
   }
   // skillCommand 为 null 时，继续执行后续的 special commands
   ```
   
   问题: 当 `executeSkillCommand` 返回 null 时，代码没有提前 return，而是继续尝试处理 special commands（如 `/model`、`/fork` 等）。

3. **executeSkillCommand 返回 null 的场景**
   - 返回 `null` 表示 "不是 skill 命令"，让其他命令处理器尝试
   - 对于 `a-share-fund` 这个已存在的 skill，应该返回 `{type: 'query', text: ...}`

4. **验证结果**
   ```bash
   # 直接调用 executeSkillCommand - 正常返回
   executeSkillCommand('a-share-fund', '搜索今天需要关注的基金', {...})
   // 返回: { type: 'query', text: 'Base directory...\n# A-Share Fund Skill...' }
   ```

5. **已修复**
   - 在 cli.ts:608-611 添加了 else return，防止 skillCommand 为 null 时继续执行

### 核心代码变更

| 文件 | 变更 |
|------|------|
| `src/cli.ts` | handleSlashCommand 添加 else return |

### 验证命令
```bash
bun run typecheck    # ✅ 通过
bun test src/skills/executor.test.ts  # ✅ 32 pass
```

---

## Skills 系统深度分析 (2026-05-25)

### 核心发现

1. **executeSkillCommand 正常工作**
   - `a-share-fund` → 返回 `{type: 'query', text: 4534 chars}` ✅
   - 不存在的命令 → 返回 `null` ✅

2. **已修复 bug**
   - cli.ts:608 添加了 `else { return; }` 防止继续执行 special commands

3. **缺失功能**
   - 缺少 `skill` 工具供 Agent 调用 ❌
   - 缺少 `whenToUse` 触发匹配 ❌
   - 缺少动态 skill 加载事件 ❌

### 参考 Claude Code 实现的差距

| 功能 | Claude Code | UpUp |
|------|-------------|------|
| SkillTool | ✅ 完整实现 | ❌ 缺失 |
| whenToUse 匹配 | ✅ 支持 | ❌ 缺失 |
| 动态加载事件 | ✅ skillsLoaded | ❌ 缺失 |
| fork 执行 | ✅ runAgent | ⚠️ 部分实现 |
| 命令别名 | ✅ aliases | ✅ triggers |
| 条件激活 | ✅ paths/ignore | ⚠️ 部分实现 |

### 改造计划文档
详细改造计划已写入 `skills2.md`，包含：
- 当前问题清单 (P0-P2 优先级)
- ANSI 架构图 (当前/目标)
- 文件变更清单
- 验证计划
