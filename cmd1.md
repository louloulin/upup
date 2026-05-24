# CMD1 - / 命令交互优化

> 基于 pi-tui，模糊搜索，下键滑动，最多10条

---

## 实现状态

| 功能 | 状态 | 验证 |
|------|------|------|
| 模糊搜索 | ✅ 已实现 | `matchCommands` 支持前缀+模糊 |
| 限制10条 | ✅ 已实现 | `return commands.slice(0, 10)` |
| 下键滑动 | ✅ 已实现 | `onSlashNavigate` 已有 |
| 简约展示 | ✅ 已实现 | `/name  desc` 格式 |
| 删除图标 | ✅ 已实现 | CATEGORY_ICONS 已删除 |

---

## 验证结果

```bash
✅ bun run typecheck        # 通过
✅ bun test test/skills.test.ts  # 21 pass
✅ 代码审查                # 已实现
```

---

## 展示格式

```
/clear   清空对话
/fund    基金筛选
> /help  显示帮助
/stats   统计信息
/doctor  诊断
```

---

## 核心代码

### 1. cli.ts - getCliCommands

```typescript
function getCliCommands(text: string) {
  const commands: SlashCommand[] = [...matchCommands(text)];
  // ... 添加 skill commands
  return commands.slice(0, 10); // 限制10条
}
```

### 2. hint-bar.ts - setSuggestions

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

### 3. cli.ts - 键盘处理

```typescript
editor.onSlashChange = async (text: string) => {
  slashSuggestions = getCliCommands(text);  // 最多10条
  slashSelectedIndex = 0;
  slashActive = slashSuggestions.length > 0;
};

editor.onSlashNavigate = (direction: 'up' | 'down') => {
  if (direction === 'down') {
    slashSelectedIndex = Math.min(slashSelectedIndex + 1, slashSuggestions.length - 1);
  } else {
    slashSelectedIndex = Math.max(slashSelectedIndex - 1, 0);
  }
};

editor.onSlashSelect = () => {
  const selected = slashSuggestions[slashSelectedIndex];
  if (selected) {
    void handleSlashCommand(selected.name, '');
  }
};
```

---

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/cli.ts` | getCliCommands 限制10条，键盘处理 |
| `src/components/hint-bar.ts` | 删除图标，简约展示 |

---

**状态**: ✅ 已实现并验证通过
