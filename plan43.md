# Plan43.md - UpUp CLI 上下选择增强计划

> 更新时间: 2026-05-26
> 版本: 1.0 (初稿)
> 目标: 增强 CLI 上下选择功能，支持命令补全和导航

---

## 一、当前分析

### 1.1 当前命令系统

当前 UpUp CLI 支持以下命令：

```
/status  Show system status
/cost    Show token usage
/doctor  Run system health check
/help    Show help
/clear   Clear conversation
/compact Trigger context compact
/mcp     Show MCP server status
/mcp-add Add an MCP server
/permissions Show permission settings
/model  Show or switch LLM model
```

### 1.2 当前实现

**输入历史导航**:
- ✅ `InputHistoryController` - 管理输入历史
- ✅ `navigateUp()` / `navigateDown()` - 支持上下导航
- ✅ `historyValue` - 获取当前历史值

**选择列表**:
- ✅ `SelectList` (pi-tui) - 内置上下选择
- ✅ `VimSelectList` - Vim 风格选择
- ✅ `onSelect` / `onCancel` - 选择回调

**命令补全**:
- ✅ `getCliCommands()` - 获取匹配命令
- ✅ `matchCommands()` - 命令匹配
- ✅ `registry.searchSkillsFuzzy()` - 技能模糊搜索

### 1.3 缺失功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 命令选择列表 | ⚠️ 基础 | 需要增强 |
| 数字快捷键 | ❌ 缺失 | 1-9 快速选择 |
| Vim 快捷键 | ⚠️ 部分 | j/k 支持 |
| Tab 补全 | ❌ 缺失 | 命令 Tab 补全 |
| 搜索过滤 | ❌ 缺失 | 实时搜索 |

---

## 二、Claude Code 参考

### 2.1 Claude Code 命令选择

```
╔════════════════════════════════════════════════════╗
║  Command Selection (按数字选择)                     ║
╠════════════════════════════════════════════════════╣
║  1. /ask - Ask a question                     ║
║  2. /bulk-edit - Edit multiple files          ║
║  3. /clear - Clear conversation              ║
║  4. /compact - Compact context window        ║
║  5. /config - Change configuration          ║
╠════════════════════════════════════════════════════╣
║  ↑↓ Navigate · Enter Select · Esc Cancel    ║
╚════════════════════════════════════════════════════╝
```

### 2.2 Claude Code 特性

1. **数字快捷键** - 按 1-9 快速选择
2. **Vim 风格** - j/k 上下导航
3. **实时搜索** - 边输入边过滤
4. **模糊匹配** - 支持部分匹配

---

## 三、pi-tui 参考

### 3.1 SelectList API

```typescript
// pi-tui SelectList
const list = new SelectList(items, maxHeight, theme);
list.onSelect = (item) => { /* handle */ };
list.onCancel = () => { /* cancel */ };
```

### 3.2 SelectItem 格式

```typescript
interface SelectItem {
  value: string;      // 唯一标识
  label: string;      // 显示文本
  description?: string; // 描述
}
```

---

## 四、改造计划

### 4.1 P0: 命令选择列表增强

```
┌─────────────────────────────────────────────────────────────────┐
│  Commands                                                       │
├─────────────────────────────────────────────────────────────────┤
│  1. /status  Show system status              [system]         │
│  2. /cost    Show token usage               [system]         │
│  3. /doctor  Run system health check        [system]         │
│  4. /clear  Clear conversation            [system]         │
│  5. /compact Trigger context compact       [system]         │
│  6. /mcp     Show MCP server status        [system]         │
├─────────────────────────────────────────────────────────────────┤
│  7. /dcf     DCF Valuation                [skill]          │
│  8. /fund    Fund Analysis                [skill]          │
├─────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate · 1-9 Select · Enter · Esc                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 P1: 数字快捷键支持

```typescript
// 在 handleInput 中添加数字键处理
for (let i = 1; i <= 9; i++) {
  if (key === String(i)) {
    const item = items[i - 1];
    if (item) onSelect(item);
    return true;
  }
}
```

### 4.3 P1: Vim 风格导航

```typescript
// j/k 键导航
if (key === 'j') {
  list.navigateDown();
  return true;
}
if (key === 'k') {
  list.navigateUp();
  return true;
}
```

### 4.4 P2: 命令搜索过滤

```typescript
// 实时搜索
input.onInput = (text) => {
  const filtered = commands.filter(cmd => 
    cmd.name.includes(text) || 
    cmd.description.includes(text)
  );
  list.setItems(filtered);
};
```

---

## 五、实现步骤

### Step 1: 增强命令选择列表

```typescript
// src/components/command-selector.ts
export class CommandSelector {
  private items: SelectItem[] = [];
  private filtered: SelectItem[] = [];
  private selectedIndex = 0;
  
  constructor(commands: Command[]) {
    this.items = commands.map((cmd, i) => ({
      value: cmd.name,
      label: `${i + 1}. ${cmd.name} - ${cmd.description}`,
      category: cmd.category,
    }));
    this.filtered = this.items;
  }
  
  // 数字快捷键
  handleNumberKey(num: number): boolean {
    const index = num - 1;
    if (index >= 0 && index < this.filtered.length) {
      this.onSelect?.(this.filtered[index]);
      return true;
    }
    return false;
  }
  
  // Vim 导航
  handleVimKey(key: 'j' | 'k'): void {
    if (key === 'j') {
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
    } else {
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    }
  }
  
  // 搜索过滤
  filter(query: string): void {
    this.filtered = this.items.filter(item => 
      item.label.toLowerCase().includes(query.toLowerCase())
    );
    this.selectedIndex = 0;
  }
}
```

### Step 2: 集成到 CLI

```typescript
// src/cli.ts
let commandSelector: CommandSelector | null = null;

// 处理 / 命令时显示选择列表
if (input.startsWith('/')) {
  const commands = getCliCommands(input);
  commandSelector = new CommandSelector(commands);
  commandSelector.onSelect = (item) => {
    // 执行命令
    executeCommand(item.value);
    commandSelector = null;
  };
  tui.setOverlay(commandSelector);
}
```

---

## 六、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/command-selector.ts` | 新建 | 命令选择组件 |
| `src/cli.ts` | 修改 | 集成命令选择 |
| `src/commands/index.ts` | 修改 | 导出命令列表 |

---

## 七、验证命令

```bash
# 构建
bun run build

# 测试
bun test src/cli.test.ts

# 手动验证
./dist/upup
# 输入 / 命令测试选择列表
```

---

## 八、里程碑

| 阶段 | 功能 | 优先级 |
|------|------|------|
| P0 | 命令选择列表基础 | 高 |
| P1 | 数字快捷键 | 高 |
| P1 | Vim 导航 | 中 |
| P2 | 实时搜索 | 低 |
| P2 | 模糊匹配 | 低 |

---

**最后更新**: 2026-05-26
**状态**: 计划中
