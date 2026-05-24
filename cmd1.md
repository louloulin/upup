# CMD1 - / 命令交互优化

> 基于 pi-tui，模糊搜索，下键滑动，最多10条

---

## 实现状态

| 功能 | 状态 |
|------|------|
| 模糊搜索 | ✅ 已实现 |
| 限制10条 | ✅ 已实现 |
| 下键滑动 | ✅ 已实现 |
| 简约展示 | ✅ 已实现 |
| 删除图标 | ✅ 已实现 |

---

## 问题

- 输入 `/` 显示所有命令
- 无模糊匹配
- 无滑动选择

## 方案

```
/ + 下键 → 滑动选择(循环) → 最多10条 → 回车
```

### 展示格式

```
/clear   清空对话
/fund    基金筛选
> /help  显示帮助
/stats   统计信息
/doctor  诊断
```

---

## 已实现

### 1. cli.ts - getCliCommands

```typescript
// 限制返回最多10条
function getCliCommands(text: string) {
  // ...模糊搜索逻辑
  return commands.slice(0, 10); // 限制10条
}
```

### 2. hint-bar.ts - setSuggestions

```typescript
// 简约展示，删除图标，限制10条
setSuggestions(commands: SlashCommand[], selectedIndex: number): void {
  this.clear();
  this.showingSuggestions = true;
  const display = commands.slice(0, 10); // Limit to 10
  for (let i = 0; i < display.length; i++) {
    const cmd = display[i];
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? '> ' : '  ';
    const name = cmd.name;
    const desc = cmd.description.slice(0, 20);
    this.addChild(new Text(`${prefix}/${name}  ${desc}`, 0, 0));
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

**状态**: ✅ 已实现
