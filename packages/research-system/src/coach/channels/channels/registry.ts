/**
 * Coach 推送渠道注册表 — 聚合多个 PushChannel 并发广播。
 *
 * 设计(来自 v3 design.md § 3.3.2):
 *   - 单一入口: broadcast(payload) 并发推送,聚合结果
 *   - 失败隔离: 单渠道失败不阻断其他渠道(KAIROS cron 场景)
 *   - 简单 API: register / unregister / list / enabled
 *   - 编译开关: 受 isChannelsCompiledIn() 控制(整体可 DCE)
 */
import type { PushChannel, PushPayload, PushResult } from './types.js';
import { isChannelsCompiledIn } from './types.js';

export interface BroadcastReport {
  /** 总耗时 */
  totalMs: number;
  /** 每个渠道的发送结果,key = channel.name */
  results: Record<string, PushResult>;
  /** 至少一个渠道成功 */
  anyOk: boolean;
  /** 启用的渠道数 */
  enabledCount: number;
  /** 注册的渠道总数 */
  registeredCount: number;
}

export class ChannelRegistry {
  private readonly channels: PushChannel[] = [];
  private readonly builtInEnabled: boolean;

  constructor(opts: { enabled?: boolean } = {}) {
    this.builtInEnabled = opts.enabled ?? isChannelsCompiledIn();
  }

  /** 注册一个渠道(同名会被替换,后注册赢) */
  register(channel: PushChannel): this {
    const existing = this.channels.findIndex((c) => c.name === channel.name);
    if (existing >= 0) this.channels[existing] = channel;
    else this.channels.push(channel);
    return this;
  }

  /** 注销一个渠道,返回是否真的删除了 */
  unregister(name: string): boolean {
    const idx = this.channels.findIndex((c) => c.name === name);
    if (idx < 0) return false;
    this.channels.splice(idx, 1);
    return true;
  }

  /** 列出所有已注册的渠道(顺序 = 注册顺序) */
  list(): PushChannel[] {
    return [...this.channels];
  }

  /** 启用的渠道(编译开关 + channel.isEnabled() 都满足) */
  enabled(): PushChannel[] {
    if (!this.builtInEnabled) return [];
    return this.channels.filter((c) => {
      try { return c.isEnabled(); } catch { return false; }
    });
  }

  /** 整体是否启用(默认是 isChannelsCompiledIn) */
  isCompiledIn(): boolean {
    return this.builtInEnabled;
  }

  /** 并发广播。失败渠道不会阻断其他渠道,所有结果都汇总。 */
  async broadcast(payload: PushPayload): Promise<BroadcastReport> {
    const t0 = Date.now();
    const targets = this.enabled();
    if (targets.length === 0) {
      return {
        totalMs: Date.now() - t0,
        results: {},
        anyOk: false,
        enabledCount: 0,
        registeredCount: this.channels.length,
      };
    }
    const settled = await Promise.allSettled(targets.map((c) => c.send(payload)));
    const results: Record<string, PushResult> = {};
    let anyOk = false;
    for (let i = 0; i < targets.length; i++) {
      const name = targets[i].name;
      const s = settled[i];
      if (s.status === 'fulfilled') {
        results[name] = s.value;
        if (s.value.ok) anyOk = true;
      } else {
        results[name] = { ok: false, error: (s.reason as Error)?.message ?? String(s.reason), latencyMs: 0 };
      }
    }
    return {
      totalMs: Date.now() - t0,
      results,
      anyOk,
      enabledCount: targets.length,
      registeredCount: this.channels.length,
    };
  }
}
