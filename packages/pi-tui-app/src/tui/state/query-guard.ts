/**
 * QueryGuard State Machine
 *
 * 对标 Loucode src/utils/QueryGuard.ts
 *
 * 同步状态机，用于查询生命周期
 * 与 Store 模式兼容，支持 subscribe/getSnapshot
 *
 * 状态转换图:
 *   idle ────── reserve() ──────► dispatching ────── tryStart() ──────► running
 *    ▲                              │                                       │
 *    │                              │                                       │
 *    │ cancelReservation()          │                                       │ end()
 *    │                              │                                       │ forceEnd()
 *    └──────────────────────────────┴───────────────────────────────────────┘
 */

export type QueryState = 'idle' | 'dispatching' | 'running';

export class QueryGuard {
  private _status: QueryState = 'idle';
  private _generation = 0;
  private _listeners: Set<() => void> = new Set();

  /**
   * 保留查询槽位
   * idle → dispatching
   * 返回 false 如果当前不是 idle 状态
   */
  reserve(): boolean {
    if (this._status !== 'idle') return false;
    this._status = 'dispatching';
    this._notify();
    return true;
  }

  /**
   * 取消保留
   * dispatching → idle
   * 当 processQueueIfReady 没有需要处理的内容时调用
   */
  cancelReservation(): void {
    if (this._status !== 'dispatching') return;
    this._status = 'idle';
    this._notify();
  }

  /**
   * 尝试开始查询
   * idle → running (直接用户提交)
   * dispatching → running (队列处理路径)
   * 返回 generation number 成功，null 如果已在 running 状态
   */
  tryStart(): number | null {
    if (this._status === 'running') return null;
    this._status = 'running';
    ++this._generation;
    this._notify();
    return this._generation;
  }

  /**
   * 结束查询
   * running → idle
   * 返回 true 如果当前 generation 匹配（执行清理）
   * 返回 false 如果 generation 不匹配（忽略过时调用）
   */
  end(generation: number): boolean {
    if (this._generation !== generation) return false;
    if (this._status !== 'running') return false;
    this._status = 'idle';
    this._notify();
    return true;
  }

  /**
   * 强制结束查询
   * 用于 onCancel 等场景，忽略 generation 检查
   * 增加 generation 使得过时的 finally 块检测到不匹配
   */
  forceEnd(): void {
    if (this._status === 'idle') return;
    this._status = 'idle';
    ++this._generation;
    this._notify();
  }

  /**
   * 查询是否活跃 (dispatching 或 running)
   * 同步检查，用于防止重入
   */
  get isActive(): boolean {
    return this._status !== 'idle';
  }

  /**
   * 获取当前状态快照
   */
  getSnapshot(): QueryState {
    return this._status;
  }

  /**
   * 订阅状态变化
   * 返回取消订阅函数
   */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    this._listeners.forEach(fn => fn());
  }
}

/**
 * 创建 QueryGuard 单例
 */
let _instance: QueryGuard | null = null;

export function getQueryGuard(): QueryGuard {
  if (!_instance) {
    _instance = new QueryGuard();
  }
  return _instance;
}

/**
 * 重置 QueryGuard 单例 (用于测试)
 */
export function resetQueryGuard(): void {
  _instance = null;
}
