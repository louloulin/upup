/**
 * UpUp Canonical Event Adapter (Pi6 Phase 2).
 *
 * Single production implementation that maps the Pi canonical event stream
 * (`@upup/pi-runtime`'s `UpUpAgentEvent`) to:
 *
 *   1. The stdio/gateway JSON-RPC `ServerEvent` shape consumed by external
 *      clients (stdio server, gateway runner, bridge).
 *
 * Before this package, the same Pi→server mapping was duplicated in four
 * places (`event-stream.ts`, `gateway/agent-runner.ts`, `stdio/server.ts`
 * with two near-identical adapters). Phase 2 collapses those four adapters
 * into this single source of truth. All entry points (CLI, Gateway, stdio,
 * Bridge, controllers) consume it via `@upup/pi-event-adapter`.
 *
 * Contract version: `upup.pi.events.v1` (declared by `@upup/pi-runtime`).
 */

import type {
  UpUpAgentEvent,
} from '@upup/pi-runtime';

// ---------------------------------------------------------------------------
// Public contract: stdio/gateway `ServerEvent` shape (preserved verbatim from
// `src/stdio/protocol.ts` consumer expectations).
// ---------------------------------------------------------------------------

export interface ServerEvent {
  type:
    | 'thinking'
    | 'tool_start'
    | 'tool_progress'
    | 'tool_end'
    | 'tool_error'
    | 'tool_limit'
    | 'tool_approval'
    | 'tool_denied'
    | 'context_cleared'
    | 'memory_recalled'
    | 'memory_flush'
    | 'queue_drain'
    | 'microcompact'
    | 'compaction'
    | 'stream_progress'
    | 'done';
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Mapping rules (single source of truth).
// ---------------------------------------------------------------------------

/**
 * Map one Pi canonical event to the stdio/gateway `ServerEvent` shape.
 *
 * Returns `null` when the event has no server equivalent. The stdio server
 * previously had two near-identical adapters — this function unifies them.
 */
export function mapPiEventToServer(event: UpUpAgentEvent): ServerEvent | null {
  switch (event.type) {
    case 'thinking':
      return { type: 'thinking', message: event.text };

    case 'text_delta': {
      const delta = event.delta ?? '';
      return {
        type: 'stream_progress',
        charDelta: delta.length,
        mode: 'responding',
        content: delta,
      };
    }

    case 'tool_start':
      return {
        type: 'tool_start',
        tool: event.toolName,
        args: (event.input ?? {}) as Record<string, unknown>,
        toolCallId: event.toolCallId,
      };

    case 'tool_update':
      return { type: 'tool_progress', tool: event.toolName, message: event.text };

    case 'tool_end':
      return event.error
        ? {
            type: 'tool_error',
            tool: event.toolName,
            error: event.error,
            toolCallId: event.toolCallId,
          }
        : {
            type: 'tool_end',
            tool: event.toolName,
            args: {},
            result: '',
            duration: 0,
            toolCallId: event.toolCallId,
          };

    case 'run_end':
      return {
        type: 'done',
        answer: event.answer,
        toolCalls: [],
        iterations: event.iterations,
        totalTime: event.totalTime,
        tokenUsage: event.tokenUsage,
      };

    case 'compaction_start':
      return { type: 'compaction', phase: 'start' };

    case 'compaction_end':
      return { type: 'compaction', phase: 'end', success: event.success };

    default:
      return null;
  }
}

/**
 * Adapter stream — yields server events for every Pi event that has a
 * server equivalent. Use this for stdio/JSON-RPC and gateway HTTP/SSE
 * bridges.
 */
export async function* adaptPiEventsToServer(
  source: Iterable<UpUpAgentEvent> | AsyncIterable<UpUpAgentEvent>,
): AsyncGenerator<ServerEvent, void, void> {
  for await (const event of source) {
    const mapped = mapPiEventToServer(event);
    if (mapped) yield mapped;
  }
}

/**
 * Contract version of the event adapter. Mirrors `@upup/pi-runtime`'s
 * `PI_EVENTS_CONTRACT` so consumers can compare against the runtime
 * capability contract during capability negotiation.
 */
export const PI_EVENT_ADAPTER_CONTRACT = 'upup.pi.events.v1' as const;
export type PiEventAdapterContract = typeof PI_EVENT_ADAPTER_CONTRACT;

/**
 * Test/contract helper: assert a Pi event has a server mapping.
 */
export function hasServerMapping(event: UpUpAgentEvent): boolean {
  return mapPiEventToServer(event) !== null;
}

// ---------------------------------------------------------------------------
// Coverage audit.
//
// The helper above works on a single event. Phase 2 also needs a way to
// assert that every event type in the Pi canonical stream has been considered
// by the adapter, even if the final decision is "no mapping".
//
// `auditAdapterCoverage` consumes the union of all Pi event types via a
// list of representative fixtures and reports whether each fixture was
// mapped. This is used by `verify:pi5` contract tests to catch the silent
// regression where a new Pi event type is added but the adapter forgets to
// handle it.
// ---------------------------------------------------------------------------

export interface AdapterCoverageReport {
  /** Every Pi event type that has a non-null server mapping. */
  mappedToServer: readonly string[];
  /** Every Pi event type that has no server mapping (intentionally dropped). */
  droppedFromServer: readonly string[];
  /** True when both lists contain at least one mapped event. */
  hasAnyServerMapping: boolean;
}

export function auditAdapterCoverage(
  fixtures: readonly UpUpAgentEvent[],
): AdapterCoverageReport {
  const mappedToServer = new Set<string>();
  const droppedFromServer = new Set<string>();
  for (const event of fixtures) {
    if (hasServerMapping(event)) mappedToServer.add(event.type);
    else droppedFromServer.add(event.type);
  }
  return {
    mappedToServer: [...mappedToServer].sort(),
    droppedFromServer: [...droppedFromServer].sort(),
    hasAnyServerMapping: mappedToServer.size > 0,
  };
}

// ---------------------------------------------------------------------------
// AgentSessionEvent → UpUpAgentEvent mapping.
//
// This is the upstream half of the canonical event chain: the Pi library
// emits `AgentSessionEvent` from `@earendil-works/pi-coding-agent`, and the
// runtime surfaces it as `UpUpAgentEvent` so that consumers (CLI, Gateway,
// stdio, Bridge, controllers) only depend on the upstream-defined contract.
//
// Before this package, the conversion was inlined in `agent-session-factory.ts`
// as `eventToUpUpEvent` (60+ lines). Phase 2 moves it into the canonical
// adapter so that any future Pi runtime integration (test fixtures, custom
// runtimes, replay tools) can reuse the exact same field-by-field semantics.
//
// `mapAgentSessionEventToUpUp` returns `undefined` when the upstream event
// has no UpUp representation (caller drops it).
// ---------------------------------------------------------------------------

import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

/**
 * Extract text from a Pi message-shaped value (which may be a tool result
 * with `content: Array<{type, text}>`). Returns the empty string when the
 * value is not shaped like a Pi message.
 */
export function extractTextFromPiMessage(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) {
    return '';
  }
  return result.content
    .filter((part: unknown): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('\n');
}

export function mapAgentSessionEventToUpUp(
  sessionId: string,
  event: AgentSessionEvent,
): UpUpAgentEvent | undefined {
  switch (event.type) {
    case 'agent_start':
      return { type: 'agent_start', sessionId };
    case 'turn_start':
      return { type: 'turn_start', sessionId };
    case 'message_update':
      if (event.assistantMessageEvent.type === 'text_delta') {
        return { type: 'text_delta', sessionId, delta: event.assistantMessageEvent.delta };
      }
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        return { type: 'thinking', sessionId, text: event.assistantMessageEvent.delta };
      }
      return undefined;
    case 'message_end': {
      const message = event.message as { role?: string; content?: unknown; stopReason?: string };
      return {
        type: 'message_end',
        sessionId,
        role: message.role ?? 'unknown',
        text: extractTextFromPiMessage(message),
        stopReason: message.stopReason,
      };
    }
    case 'tool_execution_start':
      return {
        type: 'tool_start',
        sessionId,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: event.args,
      };
    case 'tool_execution_update':
      return {
        type: 'tool_update',
        sessionId,
        toolName: event.toolName,
        text: extractTextFromPiMessage(event.partialResult),
      };
    case 'tool_execution_end':
      return {
        type: 'tool_end',
        sessionId,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        error: event.isError ? extractTextFromPiMessage(event.result) : undefined,
      };
    case 'compaction_start':
      return { type: 'compaction_start', sessionId, reason: event.reason };
    case 'compaction_end':
      return {
        type: 'compaction_end',
        sessionId,
        success: !event.errorMessage && !event.aborted,
        error: event.errorMessage,
      };
    case 'agent_end': {
      const failed = event.messages.find((message) =>
        message.role === 'assistant' &&
        ('stopReason' in message) &&
        (message.stopReason === 'error' || message.stopReason === 'aborted'),
      );
      return failed && 'errorMessage' in failed && typeof failed.errorMessage === 'string'
        ? { type: 'session_error', sessionId, error: failed.errorMessage }
        : { type: 'agent_end', sessionId };
    }
    case 'turn_end':
      return { type: 'turn_end', sessionId };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// UpUpToolContract → Pi ToolDefinition bridge.
//
// `toPiTool` converts an UpUp-side tool contract (permission profile,
// policy audit, financial details, tool context) into a Pi runtime
// `ToolDefinition` (execution mode, async execute, audit, approval flow).
//
// Before this contract was lifted out, the bridge was inlined inside
// `agent-session-factory.ts` as a 60-line function. Moving it into the
// adapter package makes the UpUp→Pi tool boundary explicit and testable,
// and lets future extension authors register their own bridges without
// depending on the runtime composition root.
// ---------------------------------------------------------------------------

import type { ToolDefinition, InlineExtension, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  canUseTool,
  createToolContext,
  requiresApproval,
  type UpUpAgentSpec,
  type UpUpCreateSessionOptions,
  type UpUpToolContract,
  type UpUpToolPolicyAudit,
} from '@upup/pi-runtime';

export function toPiTool<TInput, TResult>(
  spec: UpUpAgentSpec,
  tool: UpUpToolContract<TInput, TResult>,
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    promptSnippet: tool.description,
    parameters: tool.parameters,
    executionMode: tool.maxConcurrent === 1 ? 'sequential' : 'parallel',
    async execute(toolCallId, params, signal, onUpdate) {
      const auditId = createToolContext(spec, toolCallId, signal ?? new AbortController().signal).auditId;
      const policyAudit = (
        decision: UpUpToolPolicyAudit['decision'],
        reason: string,
      ): UpUpToolPolicyAudit => ({
        auditId,
        tool: tool.name,
        safetyLevel: tool.safetyLevel,
        permissionProfile: spec.permissions.id,
        decision,
        reason,
        recordedAt: new Date().toISOString(),
      });
      if (!canUseTool(spec.permissions, tool.safetyLevel)) {
        return {
          content: [{ type: 'text', text: `Tool ${tool.name} is denied by permission profile ${spec.permissions.id}` }],
          details: { auditId, policyAudit: policyAudit('denied', 'safety level is not allowed by the permission profile') },
          isError: true,
        };
      }
      if (requiresApproval(spec.permissions, tool.safetyLevel)) {
        const approved = requestToolApproval
          ? await requestToolApproval({
            tool: tool.name,
            input: params,
            safetyLevel: tool.safetyLevel,
            auditId,
            permissionProfile: spec.permissions.id,
          })
          : false;
        if (!approved) {
          return {
            content: [{ type: 'text', text: `Tool ${tool.name} requires explicit approval before execution` }],
            details: { auditId, policyAudit: policyAudit('approval_denied', requestToolApproval ? 'approval callback denied execution' : 'no approval callback was configured') },
            isError: true,
          };
        }
        const approvalAudit = policyAudit('approval_granted', 'approval callback granted execution');
        const context = createToolContext(spec, toolCallId, signal ?? new AbortController().signal, (update) => {
          onUpdate?.({ content: [{ type: 'text', text: update.text }], details: {} });
        });
        const result = await tool.execute(params as TInput, context);
        return {
          content: [{ type: 'text', text: result.text }],
          details: { ...(result.details ?? {}), auditId: result.details?.auditId ?? auditId, policyAudit: approvalAudit },
        };
      }
      const context = createToolContext(spec, toolCallId, signal ?? new AbortController().signal, (update) => {
        onUpdate?.({ content: [{ type: 'text', text: update.text }], details: {} });
      });
      const result = await tool.execute(params as TInput, context);
      return {
        content: [{ type: 'text', text: result.text }],
        details: {
          ...(result.details ?? {}),
          auditId: result.details?.auditId ?? auditId,
          policyAudit: policyAudit('allowed', 'safety level is allowed without per-call approval'),
        },
      };
    },
  };
}



// ---------------------------------------------------------------------------
// Finance extension factory (InlineExtension bridge).
//
// Kept in the main entry because it only depends on the same imports as
// `toPiTool`. The companion Pi model resolution bridge lives in a
// separate sub-module (`./pi-model-bridge.js`) so consumers that only
// need the adapter event helpers do not pay for `@earendil-works/pi-ai`.
// ---------------------------------------------------------------------------

export interface FinanceExtensionOptions {
  spec: UpUpAgentSpec;
  tools: readonly UpUpToolContract[];
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'];
}

export function createFinanceExtension(options: FinanceExtensionOptions): InlineExtension {
  const { spec, tools, requestToolApproval } = options;
  return {
    name: `upup-finance-${spec.id}`,
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      for (const tool of tools) pi.registerTool(toPiTool(spec, tool, requestToolApproval));
    },
  };
}
export * from './stream';
