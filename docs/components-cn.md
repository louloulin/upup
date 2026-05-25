# 组件系统

> TUI (终端用户界面) 组件库

## 概述

UpUp 实现了丰富的 TUI 组件库，用于基于终端的用户界面。这些组件为智能体活动、工具执行和用户交互提供视觉反馈。

```
┌─────────────────────────────────────────────────────────────────────┐
│                       组件系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    组件库                                    │    │
│  │                                                              │    │
│  │  • 聊天组件                                                 │    │
│  │  • 工具组件                                                 │    │
│  │  • 授权组件                                                 │    │
│  │  • 编辑器组件                                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   ChatLog  │      │  ToolEvent  │      │   Approval  │     │
│  │            │      │             │      │             │     │
│  │ • UserQuery│      │ • Progress │      │ • Prompt    │     │
│  │ • AnswerBox│     │ • Complete │      │ • Selector  │     │
│  │ • Browser  │      │ • Error    │      │ • Request   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### ChatLogComponent

显示对话历史的主聊天组件：

```typescript
import { ChatLogComponent } from './chat-log.ts';

const chatLog = new ChatLogComponent(tui);

// 添加用户查询
chatLog.addQuery('分析科技股');

// 开始工具执行
chatLog.startTool(toolCallId, 'Bash', { command: 'ls' });

// 更新工具进度
chatLog.updateToolProgress(toolCallId, '正在读取文件...');

// 完成工具执行
chatLog.completeTool(toolCallId, '→ ls 已完成', 150);

// 最终确认答案
chatLog.finalizeAnswer('分析完成。');
```

### ToolEventComponent

显示工具执行状态：

```typescript
import { ToolEventComponent } from './tool-event.ts';

const tool = new ToolEventComponent(tui, 'Bash', { command: 'ls' });

// 设置活动状态（执行期间）
tool.setActive('正在运行命令...');

// 设置完成状态
tool.setComplete('→ ls 已完成', 150);

// 设置错误状态
tool.setError('命令失败: 权限被拒绝');

// 添加子智能体详情
tool.addSubAgentDetail('→ 子任务 1 已完成');
```

### BrowserSessionComponent

浏览器自动化专用组件：

```typescript
import { BrowserSessionComponent } from './chat-log.ts';

const browser = new BrowserSessionComponent(tui);

// 设置浏览器操作
browser.setStep({ action: 'navigate', url: 'https://example.com' });

// 设置活动状态
browser.setActive('正在加载页面...');

// 设置完成
browser.setComplete('→ 页面已加载', 500);

// 设置授权
browser.setApproval('allow-once');
```

---

## 授权组件

### ApprovalPromptComponent

全屏权限提示：

```typescript
import { ApprovalPromptComponent } from './approval-prompt.ts';

const prompt = new ApprovalPromptComponent('Bash', {
  command: 'rm -rf temp/',
});

prompt.onSelect = (decision) => {
  if (decision === 'allow-session') {
    console.log('工具已授权用于本次会话');
  }
};
```

### ApprovalSelector

行内授权选择器：

```typescript
import { createApprovalSelector } from './select-list.ts';

const selector = createApprovalSelector((decision) => {
  console.log('用户选择:', decision);
});
```

---

## 输入组件

### UserQueryComponent

显示用户输入：

```typescript
import { UserQueryComponent } from './user-query.ts';

const query = new UserQueryComponent('显示A股科技股');
```

### CustomEditorComponent

终端多行文本编辑器：

```typescript
import { CustomEditorComponent } from './custom-editor.ts';

const editor = new CustomEditorComponent(tui, {
  placeholder: '输入您的查询...',
  onSubmit: (text) => {
    console.log('已提交:', text);
  },
});
```

---

## 状态组件

### WorkingIndicator

显示智能体思考/工作状态：

```typescript
import { WorkingIndicatorComponent } from './working-indicator.ts';

const indicator = new WorkingIndicatorComponent(tui);
indicator.start();
indicator.stop();
```

### HintBarComponent

底部状态栏带提示：

```typescript
import { HintBarComponent } from './hint-bar.ts';

const hintBar = new HintBarComponent();
hintBar.setHint('按 Enter 提交, Esc 取消');
```

### DebugPanelComponent

调试信息显示：

```typescript
import { DebugPanelComponent } from './debug-panel.ts';

const debug = new DebugPanelComponent(tui);
debug.showTokens(1500);
debug.showDuration(5000);
debug.showModel('claude-sonnet-4');
```

---

## 边框与装饰

### BorderBox

样式化边框容器：

```typescript
import { BorderBox } from './BorderBox.ts';

const box = new BorderBox(
  [new Text('内容')],
  { style: 'single', paddingX: 1 }
);
```

### AnswerBoxComponent

样式化答案显示：

```typescript
import { AnswerBoxComponent } from './answer-box.ts';

const answer = new AnswerBoxComponent('这是分析结果...');
```

---

## 组件接口

### ToolDisplayComponent

工具相关组件的标准接口：

```typescript
interface ToolDisplayComponent {
  setActive(progressMessage?: string): void;
  setComplete(summary: string, duration: number): void;
  setError(error: string): void;
  setLimitWarning(warning?: string): void;
  setApproval(decision: 'allow-once' | 'allow-session' | 'deny'): void;
  setApprovalPending(onSelect: (decision: 'allow-once' | 'allow-session' | 'deny') => void): void;
  getApprovalCallback?(): ((decision: 'allow-once' | 'allow-session' | 'deny') => void) | null;
  setDenied(path: string, tool: string): void;
  addSubAgentDetail?(message: string): void;
  dispose?(): void;
}
```

---

## 授权状态管理

### 授权回调流程

```typescript
// 1. 工具请求授权
chatLog.startTool(toolCallId, 'Bash', args);

// 2. 检查待处理授权
if (chatLog.hasApprovalPending()) {
  const callback = chatLog.getFirstApprovalCallback();
  if (callback) {
    // 用户选择决策
    callback('allow-session');
  }
}

// 3. 更新组件状态
chatLog.approveTool(toolCallId, 'allow-session');

// 4. 清除所有回调 (全屏接管时)
chatLog.clearAllApprovalCallbacks();
```

---

## 主题支持

组件使用集中式主题系统：

```typescript
import { theme } from '../theme.ts';

// 应用主题颜色
theme.primary('蓝色文本');
theme.success('绿色成功');
theme.error('红色错误');
theme.warning('黄色警告');
theme.muted('灰色次要');
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [权限系统](permission-cn.md)
- [会话管理](session-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
