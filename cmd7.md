# TUI 性能问题分析与改造计划 (cmd7.md)

> 基于 Loucode Claude Code TUI 架构分析，全面分析 TUI 卡住问题
> 版本: 2.1 | 创建: 2026-05-29 | 更新: 2026-05-29

---

## 🎯 目标

**全面分析 UpUp TUI 卡顿根因，对标 Loucode Claude Code 架构，制定系统优化方案**

---

## 🔴 TUI 卡住问题快速诊断

### 核心问题: Agent 事件与 UI 渲染脱节

```typescript
// 问题: Agent 事件没有触发 UI 渲染
for await (const event of agent.run(query)) {
  // 事件被处理，但 UI 没有更新
  chatLog.addChild(new Text(event.message));
  // ❌ 缺少: tui.requestRender()
}
```

### 快速修复 (已写入 Phase 0)

1. **cli-integration.ts**: 移除防抖，改为 `setImmediate`
2. **cli.ts**: 在 Agent 事件循环中添加 `tui.requestRender()`

---

## 📚 Loucode Claude Code TUI 架构分析

### 1. FullscreenLayout 架构 (FullscreenLayout.tsx)

Loucode 的 FullscreenLayout 是整个 TUI 的布局核心，采用了以下关键设计：

```typescript
// 核心布局结构
<PromptOverlayProvider>
  <Box flexDirection="column" overflow="hidden">  // 主区域
    <StickyPromptHeader />                      // 粘性头部（滚动时显示当前输入）
    <ScrollBox stickyScroll={true}>             // 虚拟滚动容器
      {scrollable}                              // 可滚动内容
      {overlay}                                 // 覆盖层
    </ScrollBox>
    <NewMessagesPill />                         // 新消息提示
    <Box position="absolute">{bottomFloat}</Box> // 浮动内容
  </Box>
  <Box flexDirection="column">                  // 底部区域
    <SuggestionsOverlay />                      // 建议浮层
    <DialogOverlay />                           // 对话浮层
    <Box>{bottom}</Box>                         // 底部固定内容
  </Box>
  <ModalContext>                                // 模态上下文
    {modal}
  </ModalContext>
</PromptOverlayProvider>
```

**关键设计要点**：

1. **Flexbox 布局**: 使用 Ink 的 Box 组件进行布局管理
2. **滚动追踪**: 通过 `ScrollChromeContext` 追踪滚动状态
3. **粘性头部**: 滚动时显示当前用户输入
4. **新消息提示**: 使用 `useSyncExternalStore` 高效订阅滚动变化
5. **模态系统**: 通过 Context 传递模态状态

### 2. VirtualMessageList 虚拟化实现 (VirtualMessageList.tsx)

Loucode 的虚拟化列表是其高性能的核心：

```typescript
export function VirtualMessageList({
  messages,
  scrollRef,
  columns,
  itemKey,
  renderItem,
  // ...
}): React.ReactNode {
  // 增量 key 数组 - 避免每次重建
  const keysRef = useRef<string[]>([]);

  // 使用 useVirtualScroll hook
  const {
    range,           // [start, end) 可见范围
    topSpacer,       // 顶部间隔
    bottomSpacer,    // 底部间隔
    measureRef,      // 高度测量回调
    offsets,         // 每个元素的位置偏移
    getItemTop,      // 获取元素顶部位置
    scrollToIndex,   // 滚动到指定索引
  } = useVirtualScroll(scrollRef, keys, columns);

  // 只渲染 range 范围内的元素
  return (
    <Box>
      <Box height={topSpacer} />  {/* 顶部间隔撑起位置 */}
      {messages.slice(range[0], range[1]).map((msg, idx) => (
        <Box ref={measureRef(itemKey(msg))}>
          {renderItem(msg, range[0] + idx)}
        </Box>
      ))}
      <Box height={bottomSpacer} />  {/* 底部间隔撑起高度 */}
    </Box>
  );
}
```

### 3. useVirtualScroll Hook 核心实现 (useVirtualScroll.ts)

这是 Loucode 性能优化的核心：

```typescript
// 关键参数
const DEFAULT_ESTIMATE = 3;     // 未测量项的估计高度
const OVERSCAN_ROWS = 80;        // overscan 行数
const SCROLL_QUANTUM = 40;       // 滚动量化（减少重新渲染）
const PESSIMISTIC_HEIGHT = 1;    // 最悲观的估计高度
const MAX_MOUNTED_ITEMS = 300;  // 最大挂载项数
const SLIDE_STEP = 25;          // 增量挂载步长

// 核心机制
export function useVirtualScroll(scrollRef, itemKeys, columns) {
  const heightCache = useRef(new Map<string, number>());  // 高度缓存
  const itemRefs = useRef(new Map<string, DOMElement>()); // DOM 引用

  // 使用 useSyncExternalStore 高效订阅滚动
  const subscribe = useCallback(
    (listener) => scrollRef.current?.subscribe(listener) ?? NOOP,
    [scrollRef]
  );

  // 量化滚动位置 - 减少不必要的重渲染
  const snapshot = useSyncExternalStore(subscribe, () => {
    const s = scrollRef.current;
    if (!s) return NaN;
    const target = s.getScrollTop() + s.getPendingDelta();
    const bin = Math.floor(target / SCROLL_QUANTUM);  // 量化到 bin
    return s.isSticky() ? ~bin : bin;
  });

  // 计算可见范围
  const viewportH = scrollRef.current?.getViewportHeight() ?? 0;
  const scrollTop = scrollRef.current?.getScrollTop() ?? 0;

  // 计算 range 和 spacers
  const start = Math.max(0, Math.floor(scrollTop / DEFAULT_ESTIMATE) - OVERSCAN_ROWS);
  const end = Math.min(itemKeys.length, start + viewportH + 2 * OVERSCAN_ROWS);

  // 测量回调 - 缓存真实高度
  const measureRef = (key: string) => (el: DOMElement | null) => {
    if (el) {
      const height = el.yogaNode?.getComputedHeight();
      if (height) heightCache.set(key, height);
    }
  };

  return { range: [start, end], topSpacer: start * DEFAULT_ESTIMATE, ... };
}
```

### 4. ScrollBox 组件 (ScrollBox.tsx)

```typescript
function ScrollBox({ children, stickyScroll, ...style }): React.ReactNode {
  const domRef = useRef<DOMElement>(null);
  const [, forceRender] = useState(0);
  const listenersRef = useRef(new Set<() => void>());

  // 直接操作 DOM - 绕过 React
  function scrollMutated(el: DOMElement): void {
    markDirty(el);  // 标记脏区域
    markCommitStart();
    notify();       // 通知订阅者

    // 微任务延迟 - 合并同一批次内的滚动
    queueMicrotask(() => {
      scheduleRenderFrom(el);
    });
  }

  useImperativeHandle(ref, () => ({
    scrollTo(y) {
      const el = domRef.current;
      if (!el) return;
      el.stickyScroll = false;
      el.pendingScrollDelta = undefined;
      el.scrollTop = Math.max(0, Math.floor(y));
      scrollMutated(el);
    },
    scrollBy(dy) {
      el.pendingScrollDelta = (el.pendingScrollDelta ?? 0) + Math.floor(dy);
      scrollMutated(el);
    },
    scrollToBottom() {
      el.stickyScroll = true;
      markDirty(el);
      notify();
      forceRender(n => n + 1);  // 强制重渲染
    },
    isSticky() { /* ... */ },
    subscribe(listener) { /* ... */ },
  }));
}
```

### 5. Loucode 性能优化关键点

| 优化点 | Loucode 实现 | UpUp 当前状态 |
|--------|-------------|-------------|
| **虚拟化** | useVirtualScroll + Spacer | ❌ 无虚拟化，所有组件渲染 |
| **滚动量化** | SCROLL_QUANTUM=40 减少重渲染 | ❌ 每次滚动都触发 requestRender |
| **增量 key 数组** | keysRef 增量更新 | ❌ 每次重建 |
| **高度缓存** | Map<string, number> | ⚠️ 部分缓存（ChatLog, ToolEvent） |
| **DOM 直接操作** | scrollMutated 绕过 React | ❌ 依赖 React 状态 |
| **微任务合并** | queueMicrotask 批量处理 | ⚠️ setTimeout 节流（32ms） |
| **useSyncExternalStore** | 高效订阅滚动变化 | ❌ 无订阅机制 |
| **WeakMap 缓存** | promptTextCache WeakMap | ❌ 无 |

---

## 🔍 UpUp TUI 问题分析

### 问题 1: 全量渲染瓶颈 (Critical)

**位置**: `src/cli.ts` 第 500+ 行

```typescript
agentRunner.onChange = () => {
  // 每次变化都触发 UI 更新
  throttledRender();  // 虽然有节流，但仍有大量调用
};

// 全局 onChange 回调 (~30fps)
const onChange = () => {
  workingIndicator.setState(agentRunner.workingState);
  throttledRender();  // 每 32ms 最多一次
  refreshError();
};
```

**影响**:
- `requestRender()` 导致整个 Container 树重新渲染
- pi-tui 的差分渲染虽有优化，但 Container 仍需遍历所有子组件
- 组件数量越多，渲染时间越长

### 问题 2: 组件无限增长 (Critical)

**位置**: `src/components/chat-log.ts`

```typescript
addQuery(query: string) {
  const queryComponent = new UserQueryComponent(query, this.theme);
  queryComponent.setVisibleLines(this.visibleLines);
  this.addChild(queryComponent);  // 每次添加新组件
}

startTool(toolCallId: string, toolName: string, args: Record<string, unknown>) {
  const component = new ToolDisplayComponent(this.tui, toolName, args);
  component.setActive();
  this.addChild(component);  // 每次创建新组件
  this.toolById.set(toolCallId, component);
  return component;
}
```

**影响**:
- 每个工具调用创建新 ToolDisplayComponent
- 每个用户查询创建新 UserQueryComponent
- 组件数量无限制增长，O(n) 渲染时间
- 内存占用持续增长

### 问题 3: ChatLogComponent 架构问题 (High)

**位置**: `src/components/chat-log.ts`

```typescript
export class ChatLogComponent extends Container {
  private readonly toolById = new Map<string, ToolDisplayComponent>();
  private readonly toolGroup: ToolDisplayComponent[] = [];

  render(): string[] {
    // 每次渲染都调用所有子组件的 render()
    const lines: string[] = [];
    for (const child of this.children) {
      lines.push(...child.render(width));  // O(n) 复杂度
    }
    return lines;
  }
}
```

**影响**:
- 继承 pi-tui Container，但无虚拟化
- 所有组件都在渲染树中
- 大量组件时渲染性能下降

### 问题 4: requestRender() 调用泛滥 (High)

**位置**: `src/cli.ts` (全文件 50+ 处调用)

```typescript
// 实际统计：cli.ts 中有 50+ 处 requestRender() 调用
tui.requestRender();  // 第 332, 338, 354, 360, 397, 503, ...
                      // 第 536-543 (throttledRender), 598, 607, ...
```

**影响**:
- 虽然有节流（32ms），但事件频率可能超过阈值
- 每次调用都可能触发完整渲染
- 难以追踪哪些调用是必要的

### 问题 5: 缺少增量渲染 (High)

**位置**: 整体架构

```typescript
// 当前：每次 render() 都重新生成所有内容
render(width: number): string[] {
  const lines: string[] = [];
  for (const child of this.children) {
    lines.push(...child.render(width));  // 所有子组件都要重新渲染
  }
  return lines;
}
```

**影响**:
- 没有脏标记机制
- 没有增量更新
- 没有局部刷新

### 问题 6: 滚动性能问题 (Medium)

**位置**: `src/components/chat-log.ts`

```typescript
scrollUp(): void {
  this.scrollOffset = Math.max(0, this.scrollOffset - 3);
  this.invalidate();  // 触发全量重渲染
}

scrollDown(): void {
  this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 3);
  this.invalidate();  // 触发全量重渲染
}
```

**影响**:
- 每次滚动都触发 `invalidate()` → `requestRender()`
- 没有滚动量化（Loucode 使用 40 行量子）
- 频繁的重新渲染

---

## 📊 UpUp vs Loucode 架构对比

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         UpUp vs Loucode TUI 架构对比                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         Loucode Claude Code                            │    │
│  │  ├── useVirtualScroll ✅ - 虚拟化，只渲染可见项                         │    │
│  │  ├── SCROLL_QUANTUM=40 ✅ - 滚动量化，减少重渲染                        │    │
│  │  ├── heightCache Map ✅ - 高度缓存                                      │    │
│  │  ├── queueMicrotask ✅ - 微任务合并                                     │    │
│  │  ├── useSyncExternalStore ✅ - 高效订阅                                │    │
│  │  ├── WeakMap 缓存 ✅ - 自动 GC                                          │    │
│  │  ├── incremental keysRef ✅ - 增量更新                                  │    │
│  │  └── stickyScroll 追踪 ✅ - 底部吸附                                     │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         UpUp TUI (当前)                                │    │
│  │  ├── ❌ 无虚拟化 - 所有组件渲染                                         │    │
│  │  ├── ❌ 无滚动量化 - 每次滚动都 requestRender                           │    │
│  │  ├── ⚠️ 部分缓存 - ChatLog/ToolEvent 有缓存，但不完整                  │    │
│  │  ├── ⚠️ setTimeout 节流 - 32ms，效率不如微任务                         │    │
│  │  ├── ❌ 无订阅机制 - 直接调用 requestRender                             │    │
│  │  ├── ❌ 无 WeakMap - 手动缓存管理                                       │    │
│  │  └── ❌ 全量渲染 - invalidate 触发全量重新渲染                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 优化方案

### 方案 1: 虚拟化 ChatLog (P0)

**目标**: 只渲染可见区域内的组件，参考 Loucode 的 useVirtualScroll

```typescript
// src/components/virtualized-chat-log.ts
export class VirtualizedChatLog implements Component {
  private items: ChatItem[] = [];
  private readonly VISIBLE_ESTIMATE = 3;    // Loucode: DEFAULT_ESTIMATE = 3
  private readonly OVERSCAN = 20;           // Loucode: OVERSCAN_ROWS = 80 (按比例)
  private readonly SCROLL_QUANTUM = 10;     // Loucode: 40 行
  private readonly MAX_MOUNTED = 100;       // Loucode: 300

  private _range: [number, number] = [0, 30];
  private _offset: number = 0;
  private heightCache: Map<string, number> = new Map();

  private getVisibleRange(scrollTop: number, viewportHeight: number): [number, number] {
    const start = Math.max(0, Math.floor(scrollTop / this.VISIBLE_ESTIMATE) - this.OVERSCAN);
    const end = Math.min(this.items.length, start + viewportHeight + 2 * this.OVERSCAN);
    return [start, Math.min(end, this.MAX_MOUNTED)];
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const [start, end] = this._range;

    // 顶部 Spacer - Loucode 使用这种方式
    for (let i = 0; i < start; i++) {
      const height = this.heightCache.get(this.items[i].id) || this.VISIBLE_ESTIMATE;
      lines.push(...this.renderSpacer(height));
    }

    // 可见项
    for (let i = start; i < end; i++) {
      lines.push(...this.items[i].render(width));
    }

    // 底部 Spacer
    for (let i = end; i < this.items.length; i++) {
      const height = this.heightCache.get(this.items[i].id) || this.VISIBLE_ESTIMATE;
      lines.push(...this.renderSpacer(height));
    }

    return lines;
  }

  private renderSpacer(height: number): string[] {
    return [''.padEnd(height, '─')];  // 占位符
  }

  // 滚动量化 - 减少重渲染
  onScroll(scrollTop: number, viewportHeight: number): void {
    const bin = Math.floor(scrollTop / this.SCROLL_QUANTUM);
    const newRange = this.getVisibleRange(scrollTop, viewportHeight);

    // 只有 range 变化才 invalidate
    if (newRange[0] !== this._range[0] || newRange[1] !== this._range[1]) {
      this._range = newRange;
      this.invalidate();
    }
  }

  // 高度测量 - 缓存真实高度
  measureItem(id: string, height: number): void {
    this.heightCache.set(id, height);
  }
}
```

### 方案 2: 滚动量化 + 订阅机制 (P1)

**目标**: 参考 Loucode 的 useSyncExternalStore 模式

```typescript
// src/tui/scroll-subscription.ts
type ScrollSnapshot = {
  scrollTop: number;
  isSticky: boolean;
  pendingDelta: number;
};

class ScrollSubscriber {
  private listeners = new Set<(snapshot: ScrollSnapshot) => void>();
  private snapshot: ScrollSnapshot = { scrollTop: 0, isSticky: true, pendingDelta: 0 };
  private readonly QUANTUM = 10;  // 滚动量化

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(snapshot: ScrollSnapshot): void {
    // 量化 - 只有跨越 QUANTUM 才通知
    const newBin = Math.floor(snapshot.scrollTop / this.QUANTUM);
    const oldBin = Math.floor(this.snapshot.scrollTop / this.QUANTUM);

    if (newBin !== oldBin || snapshot.isSticky !== this.snapshot.isSticky) {
      this.snapshot = snapshot;
      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  getSnapshot(): ScrollSnapshot {
    return this.snapshot;
  }
}

// 使用
const scrollSubscriber = new ScrollSubscriber();

chatLog.setScrollCallback((scrollTop, viewportHeight) => {
  scrollSubscriber.notify({ scrollTop, isSticky: true, pendingDelta: 0 });
});

scrollSubscriber.subscribe(() => {
  // 只有量化后触发
  chatLog.onScroll(/* ... */);
});
```

### 方案 3: 增量更新 + 脏标记 (P2)

**目标**: 只更新变化的组件

```typescript
// src/components/incremental-chat-log.ts
export class IncrementalChatLog implements Component {
  private items: ChatItem[] = [];
  private dirty: Set<string> = new Set();
  private _cachedLines: string[] = [];
  private _cachedWidth: number = 0;

  // 标记单个项为脏
  markDirty(id: string): void {
    this.dirty.add(id);
  }

  // 批量标记
  markDirtyRange(start: number, end: number): void {
    for (let i = start; i < end; i++) {
      this.dirty.add(this.items[i].id);
    }
  }

  render(width: number): string[] {
    // 缓存命中
    if (!this.dirty.size && this._cachedWidth === width && this._cachedLines.length > 0) {
      return this._cachedLines;
    }

    const lines: string[] = [];

    if (this.dirty.size === 0) {
      // 无脏项，直接返回缓存
      return this._cachedLines;
    }

    // 只渲染脏项
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (this.dirty.has(item.id)) {
        lines.push(...item.render(width));
        this.dirty.delete(item.id);
      } else {
        // 复用缓存
        lines.push(...this.getCachedLines(item.id));
      }
    }

    // 更新缓存
    this._cachedLines = lines;
    this._cachedWidth = width;

    return lines;
  }

  invalidate(): void {
    // 所有项标记为脏
    for (const item of this.items) {
      this.dirty.add(item.id);
    }
  }
}
```

### 方案 4: 组件池 (P3)

**目标**: 复用已完成组件

```typescript
// src/components/component-pool.ts
export class ComponentPool<T extends Component> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (component: T) => void;

  constructor(createFn: () => T, resetFn: (component: T) => void) {
    this.createFn = createFn;
    this.resetFn = resetFn;
  }

  acquire(): T {
    return this.pool.pop() || this.createFn();
  }

  release(component: T): void {
    this.resetFn(component);
    this.pool.push(component);
  }

  get size(): number {
    return this.pool.length;
  }
}

// ToolDisplayComponent 池
const toolDisplayPool = new ComponentPool(
  () => new ToolDisplayComponent(/* default args */),
  (comp) => {
    comp.reset();
  }
);

// 使用
startTool(toolName: string) {
  const component = toolDisplayPool.acquire();
  component.init(toolName);
  this.addChild(component);
  return component;
}

endTool(component: ToolDisplayComponent) {
  // 延迟回收
  setTimeout(() => {
    this.removeChild(component);
    toolDisplayPool.release(component);
  }, 5000);
}
```

---

## 📅 实施计划

### Phase 1: 滚动量化 + 订阅 (P0)

| 任务 | 文件 | 优先级 | 状态 |
|------|------|--------|------|
| 实现 ScrollSubscriber 类 | `src/tui/scroll-subscription.ts` | P0 | ⏳ |
| 改造 ChatLog 滚动 | `src/components/chat-log.ts` | P0 | ⏳ |
| 集成到 cli.ts | `src/cli.ts` | P0 | ⏳ |

### Phase 2: 增量更新 (P1)

| 任务 | 文件 | 优先级 | 状态 |
|------|------|--------|------|
| 实现脏标记机制 | `src/components/incremental-chat-log.ts` | P1 | ⏳ |
| 改造 render() 方法 | `src/components/chat-log.ts` | P1 | ⏳ |
| 添加缓存验证 | `src/components/*.ts` | P1 | ⏳ |

### Phase 3: 虚拟化 (P2)

| 任务 | 文件 | 优先级 | 状态 |
|------|------|--------|------|
| 实现 VirtualizedChatLog | `src/components/virtualized-chat-log.ts` | P2 | ⏳ |
| 实现 Spacer 渲染 | `src/components/virtualized-chat-log.ts` | P2 | ⏳ |
| 高度测量回调 | `src/components/virtualized-chat-log.ts` | P2 | ⏳ |

### Phase 4: 组件池 (P3)

| 任务 | 文件 | 优先级 | 状态 |
|------|------|--------|------|
| 实现 ComponentPool | `src/components/component-pool.ts` | P3 | ⏳ |
| 改造 ToolDisplayComponent | `src/components/tool-display.ts` | P3 | ⏳ |
| 改造 UserQueryComponent | `src/components/user-query.ts` | P3 | ⏳ |

---

## 📁 改造文件清单

```
src/
├── components/
│   ├── virtualized-chat-log.ts   # Phase 3: 虚拟化 ChatLog
│   ├── incremental-chat-log.ts  # Phase 2: 增量更新
│   ├── component-pool.ts        # Phase 4: 组件池
│   ├── chat-log.ts              # 修改: 集成滚动量化 + 增量更新
│   ├── tool-display.ts          # 修改: 组件池支持 + 增量更新
│   └── user-query.ts            # 修改: 组件池支持
│
├── tui/
│   ├── scroll-subscription.ts    # Phase 1: 滚动订阅机制
│   └── index.ts                 # 导出
│
└── cli.ts                       # 修改: 集成新渲染机制
```

---

## 🧪 验收标准

### Phase 1: 滚动量化 + 订阅

- [ ] ScrollSubscriber 类正常工作
- [ ] 滚动时 requestRender() 调用减少 >70%
- [ ] 滚动流畅度提升

### Phase 2: 增量更新

- [ ] 脏标记机制工作
- [ ] 只更新变化的组件
- [ ] render() 调用减少 >50%

### Phase 3: 虚拟化

- [ ] 只渲染可见范围组件
- [ ] 内存占用减少 >50%
- [ ] 长对话滚动性能提升

### Phase 4: 组件池

- [ ] 组件复用成功
- [ ] GC 压力降低
- [ ] 无内存泄漏

---

## 📊 预期效果

| 指标 | 当前 | 优化后 | Loucode 对标 |
|------|------|--------|-------------|
| 渲染帧率 | ~30fps | 60fps | ✅ 60fps |
| 组件数量 | 无限制 | ≤100 | ✅ 有限制 |
| 内存占用 | 持续增长 | 稳定 | ✅ 稳定 |
| GC 压力 | 高 | 低 | ✅ 低 |
| 滚动流畅 | 卡顿 | 流畅 | ✅ 流畅 |
| 滚动量化 | 无 | 10行量子 | ✅ 40行量子 |
| 虚拟化 | 无 | ✅ | ✅ |

---

## 📚 参考文档

- `/Users/louloulin/Documents/linchong/claw/loucode/src/components/FullscreenLayout.tsx` - Loucode 布局
- `/Users/louloulin/Documents/linchong/claw/loucode/src/components/VirtualMessageList.tsx` - 虚拟列表
- `/Users/louloulin/Documents/linchong/claw/loucode/src/hooks/useVirtualScroll.ts` - 虚拟滚动 Hook
- `/Users/louloulin/Documents/linchong/claw/loucode/src/ink/components/ScrollBox.tsx` - 滚动容器
- `cmd6.md` - UpUp TUI 架构 (v8.1)

---

## 🔴 TUI 卡住问题深度诊断 (新增)

### 症状

**TUI 界面在 agent 运行时会卡住、响应慢、渲染不流畅**

### 根因分析

#### 1. 渲染架构问题

**Claude Code 使用 React + Ink 的声明式渲染**
- 每个组件是纯函数，props 变化自动触发重渲染
- 渲染循环由 React reconciler 统一管理
- 无需手动的 start/stop 循环

**UpUp (pi-tui) 当前实现的问题**
```typescript
// src/tui/main.ts - 手动渲染模式
export class TUIMain {
  start(): void {
    if (this.tui) {
      this.tui.start();  // 问题: 这个循环实现不明确
    }
  }
}
```

#### 2. 事件流架构问题

**Claude Code 的事件流**
```
User Input → REPL.tsx → QueryEngine → Agent → ToolExecutor → UI Updates
                ↑                                                    ↓
                └────────── State Store (订阅/通知) ────────────────┘
```

Claude Code 关键设计:
- 状态驱动: AppState 是唯一数据源
- 发布-订阅: 状态变化自动触发 UI 更新
- 异步迭代器: Agent.run() 是 AsyncGenerator，yield 事件驱动 UI

**UpUp 问题代码 (src/tui/cli-integration.ts)**
```typescript
const scheduleRender = () => {
  if (_renderScheduled) {
    _pendingRender = true;
    return;
  }
  _renderScheduled = true;
  Promise.resolve().then(() => {
    // 问题: microtask 队列可能被阻塞
    tui.requestRender();
  });
};
```

#### 3. Agent 事件与 UI 脱节

**Claude Code 集成**
```typescript
// Agent.run() yields events, which are consumed and rendered immediately
for await (const event of agent.run(query)) {
  switch (event.type) {
    case 'thinking':
      state.updateThinking(event.message);
      break;
    case 'tool_start':
      state.addTool(event.tool, event.args);
      break;
  }
  repl.rerender(app);  // 立即重新渲染
}
```

**UpUp 问题 (src/tui/components/chat-log.ts)**
```typescript
function renderEvent(chatLog, display, itemStatus) {
  chatLog.addChild(new Text(...));
  // 缺少: tui.requestRender() 或类似的调用
}
```

---

### 具体卡住场景分析

| 场景 | Claude Code 处理 | UpUp 问题 |
|------|-----------------|----------|
| Agent 长时间运行工具 | 工具状态实时更新 | UI 可能冻结 |
| 流式输出 | 逐字符渲染 | 可能不响应 |
| 多个事件同时到达 | 批量更新 + diff | 事件丢失 |
| 用户输入 | 即时响应 | 可能被阻塞 |
| 工具执行完成 | 即时通知 UI | 需要手动调用 requestRender |

---

## 💡 解决方案

### Phase 0: 紧急修复 (1-2天)

#### 1. 修复 `throttledRender` 节流逻辑

**文件**: `src/cli.ts` (第 533-543 行)

**当前问题**:
```typescript
function throttledRender(): void {
  if (renderPending) return;  // 问题: 如果已经在等待，会丢失渲染
  renderPending = true;
  setTimeout(() => {
    renderPending = false;
    tui.requestRender();
  }, RENDER_THROTTLE_MS);
}
```

**修复方案**:
```typescript
let _needsRenderAfterPending = false;

function throttledRender(): void {
  if (renderPending) {
    _needsRenderAfterPending = true;  // 标记需要再次渲染
    return;
  }
  renderPending = true;
  _needsRenderAfterPending = false;
  setImmediate(() => {  // 使用 setImmediate 替代 setTimeout
    tui.requestRender();
    renderPending = false;
    // 如果在等待期间有新的渲染请求，立即处理
    if (_needsRenderAfterPending) {
      throttledRender();
    }
  });
}
```

#### 2. 在关键事件点直接调用 `tui.requestRender()`

**问题**: 某些关键事件点（如工具开始/结束）需要立即渲染，而不是等待节流

**修复**: 在 `renderEvent()` 函数末尾添加 `tui.requestRender()`

**文件**: `src/cli.ts` - `renderEvent` 函数 (第 211 行开始)

```typescript
function renderEvent(
  chatLog: ChatLogComponent,
  display: { event: any; id: string; completed?: boolean; endEvent?: any },
  itemStatus: string,
  agentRunner?: AgentRunnerController,
) {
  const event = display.event;

  if (event.type === 'tool_start') {
    const toolStart = event as ToolStartEvent;
    const component = chatLog.startTool(display.id, toolStart.tool, toolStart.args);
    // 关键: 工具开始时立即渲染，让用户看到进度
    tui.requestRender();  // 添加这一行
    return;
  }

  if (event.type === 'tool_end') {
    const done = event as ToolEndEvent;
    const component = chatLog.getToolById(display.id);
    if (component) {
      component.setComplete(done.result, done.duration);
      tui.requestRender();  // 工具完成时也立即渲染
    }
    return;
  }

  // ... 其他事件处理

  // 在函数末尾也添加渲染请求
  tui.requestRender();
}
```

#### 3. 修复 `cli-integration.ts` 的渲染逻辑

**文件**: `src/tui/cli-integration.ts`

```typescript
// 修改前: 使用 Promise.resolve() 可能被阻塞
const scheduleRender = () => {
  if (_renderScheduled) {
    _pendingRender = true;
    return;
  }
  Promise.resolve().then(() => tui.requestRender());
};

// 修改后: 使用 setImmediate
const scheduleRender = () => {
  if (!_renderScheduled) {
    _renderScheduled = true;
    setImmediate(() => {
      _renderScheduled = false;
      tui.requestRender();
    });
  }
};
```

### Phase 1: 滚动量化 + 订阅 (P0)

---

*文档版本: 2.1*
*创建时间: 2026-05-29*
*更新: 2026-05-29*
*状态: Phase 0-1 待实施*