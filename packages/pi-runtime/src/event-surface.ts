/**
 * UpUp Pi event surface — the single owner of "which Pi extension events UpUp
 * subscribes to, and what UpUp does with each one".
 *
 * Pi exposes 36 canonical events on `ExtensionAPI.on()`. Before this module
 * UpUp subscribed to 6 of them, which meant the runtime produced a large
 * amount of already-paid-for signal (turn/message/provider/tool lifecycle,
 * compaction, model selection, input, user bash) that nothing consumed.
 *
 * Two rules keep this honest rather than coverage theatre:
 *
 *  1. **Every event is recorded.** The audit record is real product surface
 *     for a financial assistant: it is the traceable "what did the agent do,
 *     with which model, at what cost, and where did it fail" trail. Events
 *     that UpUp also *acts* on declare a behavior; the rest are observation
 *     only and say so in `UPUP_EVENT_SURFACE`.
 *  2. **Handlers never throw.** Pi's extension runner treats a throwing
 *     handler as a session-level failure, so every handler is wrapped: an
 *     exception becomes an audit record (`outcome: 'error'`) and the session
 *     continues. A monitoring hook must never be able to break a research run.
 *
 * Events already owned by another extension (`session_before_compact` by
 * `@upup/pi-runtime`'s finance session policy and `@upup/pi-finance-sdk`;
 * `tool_call`/`tool_result` by the policy + tool-error bridge) are observed
 * here, never re-implemented — two competing handlers would make the outcome
 * depend on load order.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** The 36 canonical Pi extension events, in Pi's own declaration order. */
export const PI_CANONICAL_EVENT_NAMES = [
  'project_trust',
  'resources_discover',
  'session_start',
  'session_info_changed',
  'session_before_switch',
  'session_before_fork',
  'session_before_compact',
  'session_compact',
  'session_compact_failed',
  'session_shutdown',
  'session_before_tree',
  'session_tree',
  'context',
  'before_provider_request',
  'before_provider_headers',
  'after_provider_response',
  'before_agent_start',
  'agent_start',
  'agent_end',
  'agent_settled',
  'ui_prompt_start',
  'ui_prompt_end',
  'turn_start',
  'turn_end',
  'message_start',
  'message_update',
  'message_end',
  'tool_execution_start',
  'tool_execution_update',
  'tool_execution_end',
  'model_select',
  'thinking_level_select',
  'tool_call',
  'tool_result',
  'user_bash',
  'input',
] as const;

export type PiCanonicalEventName = (typeof PI_CANONICAL_EVENT_NAMES)[number];

/** Coarse grouping used by the audit trail, guards and `report:pi7`. */
export type UpUpEventRole =
  | 'trust'
  | 'resources'
  | 'session'
  | 'context'
  | 'provider'
  | 'agent'
  | 'turn'
  | 'message'
  | 'tool'
  | 'model'
  | 'input'
  | 'ui';

export interface UpUpEventSpec {
  readonly name: PiCanonicalEventName;
  readonly role: UpUpEventRole;
  /** What UpUp does with this event. `observe:` means audit only. */
  readonly upupUse: string;
  /** True when `createUpUpEventSurfaceExtension` registers real behavior, not just audit. */
  readonly behavior: boolean;
}

export const UPUP_EVENT_SURFACE: readonly UpUpEventSpec[] = [
  { name: 'project_trust', role: 'trust', upupUse: 'observe: 记录 cwd 信任询问（UpUp 绝不代 Pi 自动信任一个仓库）', behavior: false },
  { name: 'resources_discover', role: 'resources', upupUse: 'act: 把 $UPUP_HOME/{skills,prompts,themes} 与 <cwd>/.upup/* 注册为 Pi 资源', behavior: true },
  { name: 'session_start', role: 'session', upupUse: 'act: 按 cwd/ticker 命名 session 并记录启动原因', behavior: true },
  { name: 'session_info_changed', role: 'session', upupUse: 'act: 记录 session 名变更（dossier / sop 归因）', behavior: true },
  { name: 'session_before_switch', role: 'session', upupUse: 'observe: 切换原因（new/resume）与目标文件', behavior: false },
  { name: 'session_before_fork', role: 'session', upupUse: 'act: 记录 fork 血缘（entryId/position），研究分支可追溯', behavior: true },
  { name: 'session_before_compact', role: 'session', upupUse: 'observe: compaction 由 finance-session-policy / finance-sdk 接管，这里只记录准备阶段规模', behavior: false },
  { name: 'session_compact', role: 'session', upupUse: 'act: 记录 compaction 前后 token，计入上下文损耗', behavior: true },
  { name: 'session_compact_failed', role: 'session', upupUse: 'act: 记录压缩失败原因（fail-closed 可见）', behavior: true },
  { name: 'session_shutdown', role: 'session', upupUse: 'act: flush 审计缓冲并落盘会话统计', behavior: true },
  { name: 'session_before_tree', role: 'session', upupUse: 'act: 用当前 ticker/plan 标注分支摘要 label', behavior: true },
  { name: 'session_tree', role: 'session', upupUse: 'observe: 树导航（newLeafId/oldLeafId）', behavior: false },
  { name: 'context', role: 'context', upupUse: 'act: 统计每轮上下文消息与 toolResult 占比（上下文预算）', behavior: true },
  { name: 'before_provider_request', role: 'provider', upupUse: 'act: 记录请求体规模并按 phase 归因', behavior: true },
  { name: 'before_provider_headers', role: 'provider', upupUse: 'act: 注入 x-upup-session/plan/phase/package 归因头', behavior: true },
  { name: 'after_provider_response', role: 'provider', upupUse: 'act: 记录状态码与 429/5xx → provider 健康统计', behavior: true },
  { name: 'before_agent_start', role: 'agent', upupUse: 'observe: prompt 规模（改写由 brand-extension 负责）', behavior: false },
  { name: 'agent_start', role: 'agent', upupUse: 'act: agent loop 计时开始', behavior: true },
  { name: 'agent_end', role: 'agent', upupUse: 'act: 记录消息数与耗时', behavior: true },
  { name: 'agent_settled', role: 'agent', upupUse: 'act: 整轮（含重试/压缩）结束后落审计', behavior: true },
  { name: 'ui_prompt_start', role: 'ui', upupUse: 'act: 阻塞式弹窗开始，统计等待用户时长', behavior: true },
  { name: 'ui_prompt_end', role: 'ui', upupUse: 'act: 弹窗结束与等待时长', behavior: true },
  { name: 'turn_start', role: 'turn', upupUse: 'act: turn 序号与开始时间', behavior: true },
  { name: 'turn_end', role: 'turn', upupUse: 'act: turn 工具结果数与耗时', behavior: true },
  { name: 'message_start', role: 'message', upupUse: 'act: 按 role 统计消息', behavior: true },
  { name: 'message_update', role: 'message', upupUse: 'act: 流式增量计数（吞吐观测）', behavior: true },
  { name: 'message_end', role: 'message', upupUse: 'act: 检测无来源数字（禁止编造数字）并落审计', behavior: true },
  { name: 'tool_execution_start', role: 'tool', upupUse: 'act: 工具开始计时', behavior: true },
  { name: 'tool_execution_update', role: 'tool', upupUse: 'act: 工具进度更新计数', behavior: true },
  { name: 'tool_execution_end', role: 'tool', upupUse: 'act: 工具延迟/错误率 → 金融工具 SLA', behavior: true },
  { name: 'model_select', role: 'model', upupUse: 'act: 持久化到 $UPUP_HOME/settings.json（/model 不再只写内存）', behavior: true },
  { name: 'thinking_level_select', role: 'model', upupUse: 'act: 持久化 thinking level', behavior: true },
  { name: 'tool_call', role: 'tool', upupUse: 'observe: policy 链已接管；此处只记录拦截结果', behavior: false },
  { name: 'tool_result', role: 'tool', upupUse: 'observe: 链式 middleware 已接管；此处只记录结果规模', behavior: false },
  { name: 'user_bash', role: 'input', upupUse: 'act: 审计用户手工 shell 命令（合规轨迹）', behavior: true },
  { name: 'input', role: 'input', upupUse: 'act: 展开 @watchlist / $TICKER 简写（action=transform）', behavior: true },
];

/** Audit record for one Pi event. Never contains model or user message text. */
export interface PiEventAuditRecord {
  readonly at: number;
  readonly event: PiCanonicalEventName;
  readonly role: UpUpEventRole;
  readonly outcome: 'ok' | 'error';
  readonly durationMs?: number;
  readonly sessionId?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly errorMessage?: string;
}

/** Pi's `ExtensionAPI.on` narrowed to what the surface actually needs. */
export interface PiEventSurfaceLike {
  on(event: string, handler: (event: unknown, context: unknown) => unknown): void;
}

export type UpUpEventHandler = (event: never, context: unknown) => unknown;

export interface UpUpEventSurfaceOptions {
  /**
   * Extra behavior handlers, keyed by event. They run after the audit wrapper;
   * their return value is forwarded to Pi (so `resources_discover`, `input`,
   * `message_end`, `session_before_tree`, … keep their result contracts).
   */
  readonly behaviors?: Partial<Record<PiCanonicalEventName, UpUpEventHandler>>;
  /** Audit trail sink. Omit to disable recording. */
  readonly sink?: (record: PiEventAuditRecord) => void;
  /** Last-resort hook for handler failures (e.g. stderr in a TTY). */
  readonly onHandlerError?: (event: PiCanonicalEventName, error: unknown) => void;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
  /** Per-event field extractors that add structured audit fields. */
  readonly describe?: Partial<Record<PiCanonicalEventName, (event: unknown, context: unknown) => Record<string, unknown> | undefined>>;
}

export interface UpUpEventMountResult {
  readonly mounted: readonly PiCanonicalEventName[];
  /** Events with a registered behavior handler in this mount. */
  readonly behaviorBacked: readonly PiCanonicalEventName[];
  /** Events mounted for audit only (either declared observe-only, or no handler supplied). */
  readonly auditOnly: readonly PiCanonicalEventName[];
}

const SPEC_BY_NAME = new Map<PiCanonicalEventName, UpUpEventSpec>(UPUP_EVENT_SURFACE.map((spec) => [spec.name, spec]));

/** Role of an event (falls back to `session` for unknown future Pi events). */
export function upupEventRole(name: string): UpUpEventRole {
  return SPEC_BY_NAME.get(name as PiCanonicalEventName)?.role ?? 'session';
}

/** Human-readable summary of the surface, used by `/sop`-style commands and `report:pi7`. */
export function describeUpUpEventSurface(): {
  readonly total: number;
  readonly behaviorBacked: number;
  readonly observeOnly: number;
  readonly byRole: Readonly<Record<UpUpEventRole, number>>;
} {
  const byRole = {} as Record<UpUpEventRole, number>;
  let behaviorBacked = 0;
  for (const spec of UPUP_EVENT_SURFACE) {
    byRole[spec.role] = (byRole[spec.role] ?? 0) + 1;
    if (spec.behavior) behaviorBacked += 1;
  }
  return {
    total: UPUP_EVENT_SURFACE.length,
    behaviorBacked,
    observeOnly: UPUP_EVENT_SURFACE.length - behaviorBacked,
    byRole,
  };
}

function readSessionId(context: unknown): string | undefined {
  const manager = (context as { sessionManager?: { getSessionId?: () => unknown } } | undefined)?.sessionManager;
  const id = typeof manager?.getSessionId === 'function' ? manager.getSessionId() : undefined;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Mount the whole UpUp event surface onto a Pi extension API.
 *
 * Returns which events were mounted, which carry real behavior, and which are
 * audit-only, so `check:pi-extension-coverage` and `report:pi7` can assert the
 * surface stays complete instead of trusting a prose claim.
 */
export function mountUpUpEventSurface(
  pi: PiEventSurfaceLike,
  options: UpUpEventSurfaceOptions = {},
): UpUpEventMountResult {
  const now = options.now ?? Date.now;
  const sink = options.sink;
  const mounted: PiCanonicalEventName[] = [];
  const behaviorBacked: PiCanonicalEventName[] = [];
  const auditOnly: PiCanonicalEventName[] = [];

  for (const name of PI_CANONICAL_EVENT_NAMES) {
    const spec = SPEC_BY_NAME.get(name);
    const behavior = options.behaviors?.[name];
    const describe = options.describe?.[name];
    mounted.push(name);
    if (behavior) behaviorBacked.push(name);
    else auditOnly.push(name);

    // The wrapper is intentionally synchronous-safe: it records the audit
    // record and forwards any result the behavior produced. Pi's `on()`
    // accepts `Promise<void> | void`, so returning a promise here is fine.
    const handler = (event: unknown, context: unknown): unknown => {
      const started = now();
      let fields: Record<string, unknown> | undefined;
      try {
        fields = describe?.(event, context);
      } catch (error) {
        // A broken descriptor must not break the event either.
        options.onHandlerError?.(name, error);
      }
      try {
        const result = behavior ? behavior(event as never, context) : undefined;
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          return (result as Promise<unknown>).then(
            (settled) => {
              sink?.({ at: now(), event: name, role: spec?.role ?? 'session', outcome: 'ok', durationMs: now() - started, sessionId: readSessionId(context), ...(fields ? { fields } : {}) });
              return settled;
            },
            (error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              sink?.({ at: now(), event: name, role: spec?.role ?? 'session', outcome: 'error', durationMs: now() - started, sessionId: readSessionId(context), ...(fields ? { fields } : {}), errorMessage: message });
              options.onHandlerError?.(name, error);
              return undefined;
            },
          );
        }
        sink?.({ at: now(), event: name, role: spec?.role ?? 'session', outcome: 'ok', durationMs: now() - started, sessionId: readSessionId(context), ...(fields ? { fields } : {}) });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sink?.({ at: now(), event: name, role: spec?.role ?? 'session', outcome: 'error', durationMs: now() - started, sessionId: readSessionId(context), ...(fields ? { fields } : {}), errorMessage: message });
        options.onHandlerError?.(name, error);
        return undefined;
      }
    };

    pi.on(name, handler);
  }

  return { mounted, behaviorBacked, auditOnly };
}

/** Mount the surface on a real Pi `ExtensionAPI`. */
export function mountUpUpEventSurfaceOnPi(
  pi: ExtensionAPI,
  options: UpUpEventSurfaceOptions = {},
): UpUpEventMountResult {
  return mountUpUpEventSurface(pi as unknown as PiEventSurfaceLike, options);
}
