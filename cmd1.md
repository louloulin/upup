# CMD1 - / 命令交互优化

> 基于 pi-tui，模糊搜索，下键滑动，最多10条

---

## 实现状态

| 功能 | 状态 | 验证 |
|------|------|------|
| 模糊搜索 | ✅ | `matchCommands("/fu")` 匹配1条 |
| 限制10条 | ✅ | `slice(0, 10)` 限制为10条 |
| 下键滑动 | ✅ | `onSlashNavigate` 已有 |
| 简约展示 | ✅ | `/name  desc` 格式 |
| 删除图标 | ✅ | CATEGORY_ICONS 已删除 |

---

## 真实验证

```bash
✅ bun run typecheck           # 通过
✅ bun test skills.test.ts     # 21 pass
✅ bun test verify-commands    # 4 pass

验证结果:
  matchCommands("/") 返回 56 条命令
  slice(0, 10) 限制后 10 条
  matchCommands("/fu") 返回 1 条 (模糊匹配)
  展示格式: /status  /cost  /doctor
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
