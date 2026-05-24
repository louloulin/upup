# CMD1 - / 命令交互优化

> 基于 pi-tui，模糊搜索，下键滑动，最多10条

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

## 实现

### 1. hint-bar.ts - 滑动容器

```typescript
// 使用 pi-tui Scrollable 或自定义滑动
class SuggestionList extends Container {
  private items: Text[] = [];
  private selectedIndex: number = 0;
  private maxDisplay: number = 10;

  setCommands(commands: SlashCommand[]): void {
    this.clear();
    this.items = [];
    const display = commands.slice(0, this.maxDisplay);
    
    for (let i = 0; i < display.length; i++) {
      const cmd = display[i];
      const text = new Text(`  /${cmd.name}  ${cmd.description.slice(0, 18)}`, 0, 0);
      this.items.push(text);
      this.addChild(text);
    }
    this.setSelected(0);
  }

  setSelected(index: number): void {
    // 移除之前的选中
    if (this.items[this.selectedIndex]) {
      const prev = this.items[this.selectedIndex];
      prev.setText(`  ${prev.text.slice(2)}`);
    }
    // 设置新的选中
    this.selectedIndex = index;
    if (this.items[index]) {
      const curr = this.items[index];
      curr.setText(`> ${curr.text.slice(2)}`);
    }
  }

  scrollDown(): void {
    const next = (this.selectedIndex + 1) % this.items.length;
    this.setSelected(next);
  }

  scrollUp(): void {
    const prev = this.selectedIndex <= 0 
      ? this.items.length - 1 
      : this.selectedIndex - 1;
    this.setSelected(prev);
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }
}
```

### 2. cli.ts - 键盘处理

```typescript
// 键盘事件
case 'down':
  if (slashSuggestions.length > 0) {
    suggestionList.scrollDown();
  }
  break;

case 'up':
  if (slashSuggestions.length > 0) {
    suggestionList.scrollUp();
  }
  break;

case 'enter':
  if (slashSuggestions.length > 0) {
    const idx = suggestionList.getSelectedIndex();
    const cmd = slashSuggestions[idx];
    await handleSlashCommand(cmd.name, '');
  }
  break;
```

### 3. 模糊搜索

```typescript
function fuzzySearch(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.slice(1).toLowerCase();
  if (!q) return commands.slice(0, 10);
  
  return commands
    .filter(cmd => {
      const name = cmd.name.toLowerCase();
      return name.includes(q) || isSubsequence(name, q);
    })
    .slice(0, 10);
}
```

---

## 文件

| 文件 | 变更 |
|------|------|
| `src/components/hint-bar.ts` | 新增 SuggestionList 类 |
| `src/cli.ts` | 集成滑动 + 回车 |
| `src/commands/index.ts` | fuzzySearch |

---

**状态**: 待实施
