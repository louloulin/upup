# TUI 架构改造计划 v2.1

> 基于 Codex Rust TUI + Claude Code Rust 的深度分析，彻底改造 Dexter TUI
> 版本: 2.1 | 创建: 2026-05-29 | 更新: 2026-05-29

---

## 📊 Codex Rust TUI 核心架构分析

### 1. Frame Rate Limiting (帧率限制)

Codex TUI 使用精确的 120 FPS 限制，避免无效重绘：

```rust
// Codex: frame_rate_limiter.rs
pub const MIN_FRAME_INTERVAL: Duration = Duration::from_nanos(8_333_334); // ≈120 FPS

pub struct FrameRateLimiter {
    last_emitted_at: Option<Instant>,
}

impl FrameRateLimiter {
    pub fn clamp_deadline(&self, requested: Instant) -> Instant {
        // 确保请求不会超过 120 FPS
        requested.max(last_emitted_at + MIN_FRAME_INTERVAL)
    }
}
```

**Dexter 当前问题**:
- 使用 32ms setTimeout 节流 (≈31 FPS)
- 无法精确控制帧率
- 无法合并同一批次内的多个渲染请求

### 2. Frame Requester (帧请求器)

Codex 的 FrameRequester 是异步任务，支持请求合并：

```rust
// Codex: frame_requester.rs
pub struct FrameRequester {
    frame_schedule_tx: mpsc::UnboundedSender<Instant>,
}

impl FrameRequester {
    pub fn schedule_frame(&self) {
        // 发送时间戳，异步任务合并请求
        let _ = self.frame_schedule_tx.send(Instant::now());
    }
    
    pub fn schedule_frame_in(&self, dur: Duration) {
        let _ = self.frame_schedule_tx.send(Instant::now() + dur);
    }
}

// 异步调度器
async fn run(mut self) {
    loop {
        tokio::select! {
            draw_at = self.receiver.recv() => {
                // 合并请求，只发送最早的
                next_deadline = Some(next_deadline.min(draw_at));
                continue;
            }
            _ = deadline => {
                // 到达时间点，发送一次渲染通知
                let _ = self.draw_tx.send(());
            }
        }
    }
}
```

### 3. Event Broker (事件代理)

```rust
// Codex: event_stream.rs
pub struct EventBroker<S: EventSource> {
    state: Mutex<EventBrokerState<S>>,
    resume_events_tx: watch::Sender<()>,
}

// 支持暂停/恢复事件流
pub fn pause_events(&self) {
    *state = EventBrokerState::Paused; // 释放 stdin
}

pub fn resume_events(&self) {
    *state = EventBrokerState::Start; // 重建事件源
}
```

### 4. TUI 主循环

```rust
// Codex: tui.rs
pub fn draw(&mut self, height: u16, draw_fn: impl FnOnce(&mut Frame)) -> Result<()> {
    stdout().sync_update(|_| {
        // 1. 更新视口
        Self::update_inline_viewport(terminal, height)?;
        
        // 2. 刷新待处理历史行
        Self::flush_pending_history_lines(terminal, &mut pending)?;
        
        // 3. 调用绘制函数
        terminal.draw(|frame| draw_fn(frame))
    })
}
```

---

## 🔴 Dexter TUI 当前问题

| 问题 | 当前实现 | Codex 方案 | 优先级 |
|------|---------|-----------|--------|
| 帧率控制 | 32ms setTimeout | 120 FPS 精确限制 | P0 |
| 渲染请求合并 | 简陋的 pending 标记 | 异步任务 + 时间戳合并 | P0 |
| 事件流管理 | 无 | EventBroker 暂停/恢复 | P1 |
| 终端模式 | 不完整 | Crossterm raw mode + alternate screen | P1 |
| 滚动性能 | 全量渲染 | 虚拟化 | P2 |

---

## 🎯 改造方案

### Phase 0: 帧率限制 + 渲染请求合并 (P0)

#### 0.1 实现 FrameRateLimiter

```typescript
// src/tui/renderer/frame-rate-limiter.ts
export const MIN_FRAME_INTERVAL = 8.333; // ≈120 FPS (ms)

export class FrameRateLimiter {
    private lastEmittedAt: number = 0;
    
    clampDeadline(requested: number): number {
        const minAllowed = this.lastEmittedAt + MIN_FRAME_INTERVAL;
        return Math.max(requested, minAllowed);
    }
    
    markEmitted(at: number): void {
        this.lastEmittedAt = at;
    }
    
    shouldEmit(): boolean {
        return performance.now() >= this.lastEmittedAt + MIN_FRAME_INTERVAL;
    }
}
```

#### 0.2 实现 FrameRequester

```typescript
// src/tui/renderer/frame-requester.ts
export class FrameRequester {
    private pendingFrames: number[] = [];
    private scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly rateLimiter = new FrameRateLimiter();
    
    scheduleFrame(): void {
        const now = performance.now();
        const clamped = this.rateLimiter.clampDeadline(now);
        
        // 合并请求：只保留最早的时间点
        if (this.pendingFrames.length === 0 || clamped < this.pendingFrames[0]) {
            this.pendingFrames.unshift(clamped);
        }
        
        this.schedule();
    }
    
    private schedule(): void {
        if (this.scheduledTimeout) return;
        
        const next = this.pendingFrames[0] || performance.now() + MIN_FRAME_INTERVAL;
        const delay = Math.max(0, next - performance.now());
        
        this.scheduledTimeout = setTimeout(() => {
            this.scheduledTimeout = null;
            this.flush();
        }, delay);
    }
    
    private flush(): void {
        if (this.pendingFrames.length === 0) return;
        
        const now = performance.now();
        const frameTime = this.pendingFrames.shift()!;
        
        if (frameTime <= now) {
            // 到达时间点，触发渲染
            this.rateLimiter.markEmitted(now);
            this.emit();
        } else {
            // 还需等待，重新调度
            this.pendingFrames.unshift(frameTime);
            this.schedule();
        }
    }
    
    private emit(): void {
        // 通知 TUI 重绘
        tui.requestRender();
        
        // 处理下一个待处理的帧
        if (this.pendingFrames.length > 0) {
            this.schedule();
        }
    }
}
```

### Phase 1: 事件流管理 (P1)

#### 1.1 实现 EventBroker

```typescript
// src/tui/event/event-broker.ts
type EventCallback = (event: TuiEvent) => void;

export interface TuiEvent {
    type: 'key' | 'resize' | 'paste' | 'draw';
    data?: any;
}

export class EventBroker {
    private listeners: Set<EventCallback> = new Set();
    private paused: boolean = false;
    private eventBuffer: TuiEvent[] = [];
    
    subscribe(callback: EventCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    
    emit(event: TuiEvent): void {
        if (this.paused) {
            this.eventBuffer.push(event);
            return;
        }
        this.listeners.forEach(cb => cb(event));
    }
    
    pause(): void {
        this.paused = true;
    }
    
    resume(): void {
        this.paused = false;
        // 刷新缓冲区
        this.eventBuffer.forEach(event => {
            this.listeners.forEach(cb => cb(event));
        });
        this.eventBuffer = [];
    }
}
```

### Phase 2: 虚拟化滚动 (P2)

#### 2.1 实现 VirtualContainer

```typescript
// src/tui/components/virtual-container.ts
export interface VirtualItem {
    id: string;
    height: number;
    measured: boolean;
}

export class VirtualContainer implements Component {
    private items: VirtualItem[] = [];
    private heightCache: Map<string, number> = new Map();
    private visibleRange: [number, number] = [0, 0];
    private scrollTop: number = 0;
    
    private readonly ESTIMATE_HEIGHT = 3;
    private readonly OVERSCAN = 20;
    private readonly MAX_MOUNTED = 100;
    
    addItem(id: string): void {
        this.items.push({ id, height: this.ESTIMATE_HEIGHT, measured: false });
        this.updateVisibleRange();
    }
    
    removeItem(id: string): void {
        const index = this.items.findIndex(item => item.id === id);
        if (index !== -1) {
            this.items.splice(index, 1);
            this.heightCache.delete(id);
            this.updateVisibleRange();
        }
    }
    
    measureItem(id: string, height: number): void {
        const item = this.items.find(item => item.id === id);
        if (item) {
            item.height = height;
            item.measured = true;
            this.heightCache.set(id, height);
        }
    }
    
    setScrollTop(scrollTop: number): void {
        this.scrollTop = scrollTop;
        this.updateVisibleRange();
    }
    
    private updateVisibleRange(): void {
        const start = Math.max(0, 
            Math.floor(this.scrollTop / this.ESTIMATE_HEIGHT) - this.OVERSCAN
        );
        const end = Math.min(
            this.items.length,
            start + Math.ceil(this.visibleHeight / this.ESTIMATE_HEIGHT) + 2 * this.OVERSCAN
        );
        this.visibleRange = [start, Math.min(end, this.MAX_MOUNTED)];
    }
    
    render(width: number): string[] {
        const [start, end] = this.visibleRange;
        const lines: string[] = [];
        
        // 顶部 spacer
        let topHeight = 0;
        for (let i = 0; i < start; i++) {
            topHeight += this.heightCache.get(this.items[i].id) || this.ESTIMATE_HEIGHT;
        }
        lines.push(...this.renderSpacer(topHeight));
        
        // 可见项
        for (let i = start; i < end; i++) {
            lines.push(...this.renderItem(this.items[i], width));
        }
        
        // 底部 spacer
        let bottomHeight = 0;
        for (let i = end; i < this.items.length; i++) {
            bottomHeight += this.heightCache.get(this.items[i].id) || this.ESTIMATE_HEIGHT;
        }
        lines.push(...this.renderSpacer(bottomHeight));
        
        return lines;
    }
}
```

### Phase 3: 集成到 cli.ts (P1)

---

## 📁 改造文件清单

```
src/tui/
├── renderer/
│   ├── index.ts                    # 导出
│   ├── frame-rate-limiter.ts      # Phase 0: 帧率限制
│   ├── frame-requester.ts          # Phase 0: 渲染请求合并
│   └── incremental-renderer.ts     # Phase 0: 增量渲染
├── event/
│   ├── index.ts
│   ├── event-broker.ts             # Phase 1: 事件代理
│   └── event-types.ts              # Phase 1: 事件类型
├── components/
│   ├── virtual-container.ts         # Phase 2: 虚拟容器
│   └── chat-log.ts                 # 修改: 集成虚拟化
├── cli-integration.ts              # 修改: 使用新的渲染系统
└── main.ts                         # 修改: 集成新组件
```

---

## 📊 预期效果对比

| 指标 | 当前 | 改造后 | Codex 对标 |
|------|------|--------|------------|
| 帧率限制 | ~31 FPS (32ms) | 120 FPS | ✅ 120 FPS |
| 渲染请求合并 | 简陋 | 异步合并 | ✅ 时间戳合并 |
| 内存占用 | 持续增长 | 稳定 (≤100项) | ✅ 有限制 |
| 滚动性能 | 全量渲染 | 虚拟化 | ✅ 可见项渲染 |

---

## 🧪 验收标准

### Phase 0

- [ ] FrameRateLimiter 精确限制 120 FPS
- [ ] FrameRequester 正确合并渲染请求
- [ ] 不再出现多余的 requestRender 调用
- [ ] 滚动时帧率稳定在 60+ FPS

### Phase 1

- [ ] EventBroker 正确管理事件流
- [ ] 支持暂停/恢复事件处理
- [ ] 外部程序调用期间不丢失事件

### Phase 2

- [ ] VirtualContainer 只渲染可见项
- [ ] 内存占用稳定
- [ ] 长对话滚动流畅

---

## 🔄 实施进度

| Phase | 任务 | 状态 | 完成度 |
|-------|------|------|--------|
| 0.1 | FrameRateLimiter | ✅ 完成 | 100% |
| 0.2 | FrameRequester | ⏳ 待实施 | 0% |
| 1.1 | EventBroker | ⏳ 待实施 | 0% |
| 2.1 | VirtualContainer | ⏳ 待实施 | 0% |
| 3.1 | 集成到 cli.ts | ⏳ 待实施 | 0% |

**总体完成度: 10%**

---

## 📚 参考文档

- `/Users/louloulin/Documents/linchong/claw/codex/codex-rs/tui/src/tui/frame_rate_limiter.rs` - Codex 帧率限制
- `/Users/louloulin/Documents/linchong/claw/codex/codex-rs/tui/src/tui/frame_requester.rs` - Codex 帧请求器
- `/Users/louloulin/Documents/linchong/claw/codex/codex-rs/tui/src/tui/event_stream.rs` - Codex 事件流
- `/Users/louloulin/Documents/linchong/claw/codex/codex-rs/tui/src/tui.rs` - Codex TUI 主循环

---

*文档版本: 2.1*
*创建时间: 2026-05-29*
*更新: 2026-05-29*
*状态: Phase 0-1 准备实施*
