---
name: upup-tui
description: UpUp TUI界面开发。用于理解Ink CLI组件、命令状态管理、焦点管理、覆盖层、渲染流程。当需要修改CLI界面、添加新组件、处理用户输入时触发。
---

# UpUp TUI - 终端界面 Skill

## 概述

UpUp使用Ink（React for CLI）构建交互式终端界面，支持实时更新、命令补全、覆盖层等。

## 目录结构

```
src/tui/
├── main.ts             # 主渲染器
├── index.ts           # 导出
├── cli-integration.ts # CLI集成
├── command-input.ts    # 命令输入
├── command-state-manager.ts
├── focus-manager.ts    # 焦点管理
├── overlay-coordinator.ts # 覆盖层协调
├── components/        # Ink组件
├── hooks/             # React hooks
├── overlays/         # 覆盖层
├── state/             # 状态管理
└── keybindings/      # 按键绑定
```

## 核心组件

### 1. Main Renderer (`main.ts`)

```typescript
// 主渲染循环
export function renderTUI(state: TUIState): React.ReactNode {
  return (
    <Box>
      <Header />
      <MessageList messages={state.messages} />
      <CommandInput />
    </Box>
  );
}
```

### 2. Command Input (`command-input.ts`)

处理用户命令输入、编辑、历史。

```typescript
interface CommandInputProps {
  onSubmit: (cmd: string) => void
  onCancel: () => void
  history: string[]
}
```

### 3. Focus Manager (`focus-manager.ts`)

管理组件焦点和键盘导航。

```typescript
const focusManager = new FocusManager();

// 设置焦点
focusManager.setFocus('command-input');

// 获取下一个焦点
focusManager.getNextFocus(currentFocus);
```

## 状态管理

### TUIState

```typescript
interface TUIState {
  mode: 'input' | 'agent-running' | 'overlay'
  messages: Message[]
  commandHistory: string[]
  currentCommand: string
  agentStatus: 'idle' | 'running' | 'paused'
}
```

### 状态更新

```typescript
// 使用useReducer
const [state, dispatch] = useReducer(tuiReducer, initialState);

// 动作类型
type TUIAction = 
  | { type: 'SET_COMMAND'; command: string }
  | { type: 'APPEND_MESSAGE'; message: Message }
  | { type: 'SET_AGENT_STATUS'; status: AgentStatus }
  | { type: 'SHOW_OVERLAY'; overlay: Overlay }
  | { type: 'HIDE_OVERLAY' }
```

## 覆盖层系统

### OverlayCoordinator

```typescript
const coordinator = new OverlayCoordinator();

// 显示覆盖层
coordinator.show({
  type: 'select',
  title: 'Select Model',
  options: models,
  onSelect: (model) => {...}
});

// 堆叠管理
coordinator.stack(['model-select', 'help']);
```

### 覆盖层类型

| Type | Use Case |
|------|----------|
| `select` | 模型选择、选项选择 |
| `input` | 文件名输入、确认 |
| `confirm` | 确认对话框 |
| `help` | 帮助信息 |
| `error` | 错误提示 |

## 命令处理

### 命令状态管理

```typescript
const stateManager = new CommandStateManager();

// 解析命令
const parsed = stateManager.parse('/model gpt-5.4');

// 执行命令
await stateManager.execute(parsed);
```

### 内置命令

| Command | Description |
|---------|-------------|
| `/model [name]` | 切换模型 |
| `/clear` | 清除会话 |
| `/help` | 显示帮助 |
| `/exit` | 退出 |
| `/skill [name]` | 执行技能 |
| `/copy` | 复制答案 |
| `/save` | 保存结果 |

## 键盘绑定

### 定义

```typescript
const keybindings: KeyBinding[] = [
  { key: 'ctrl+c', action: 'cancel' },
  { key: 'ctrl+l', action: 'clear' },
  { key: 'up', action: 'history-prev' },
  { key: 'down', action: 'history-next' },
  { key: 'tab', action: 'complete' },
  { key: 'escape', action: 'close-overlay' },
];
```

### 实现

```typescript
// 使用useInput Hook
useInput((input, key) => {
  const binding = findBinding(input, key);
  if (binding) {
    dispatch({ type: binding.action });
  }
}, { isActive: state.mode === 'input' });
```

## 组件库

### Box

Flexbox布局容器。

```typescript
<Box flexDirection="column" gap={1}>
  <Text>Header</Text>
  <Box>Content</Box>
</Box>
```

### Text

文本显示。

```typescript
<Text color="cyan" bold>
  Hello World
</Text>
```

### 其他组件

- `Spinner`: 加载动画
- `ProgressBar`: 进度条
- `Table`: 表格
- `List`: 列表
- `Select`: 下拉选择

## 实时更新

### Agent事件流

```typescript
agent.on('tool_start', ({ tool }) => {
  dispatch({ type: 'SHOW_TOOL', tool });
});

agent.on('tool_end', ({ tool, result }) => {
  dispatch({ type: 'HIDE_TOOL', tool });
  dispatch({ type: 'APPEND_RESULT', result });
});

agent.on('thinking', ({ content }) => {
  dispatch({ type: 'UPDATE_THINKING', content });
});
```

## CLI集成

### 与Agent连接

```typescript
// src/tui/cli-integration.ts

export function createTUI(agent: Agent): TUI {
  const tui = new TUI();
  
  // 绑定Agent事件到TUI
  agent.on('tool_start', tui.onToolStart.bind(tui));
  agent.on('answer_start', tui.onAnswerStart.bind(tui));
  
  return tui;
}
```

## 最佳实践

### 性能优化

1. 使用`React.memo`避免不必要的重渲染
2. 虚拟列表处理大量消息
3. 批量状态更新

### 可访问性

1. 键盘导航支持
2. 清晰的焦点指示
3. 错误状态视觉提示

### 测试

```typescript
import { render } from 'ink';
import { TUI } from './tui';

test('renders command input', () => {
  const { getByText } = render(
    <TUI onSubmit={jest.fn()} />
  );
  
  expect(getByText('>')).toBeDefined();
});
```
