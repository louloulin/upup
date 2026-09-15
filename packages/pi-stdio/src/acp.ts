/**
 * Agent Client Protocol (ACP) adapter for the UpUp stdio server.
 *
 * ACP is the JSON-RPC 2.0 protocol used by editor hosts (Zed, Neovim plugins,
 * etc.) to drive a coding agent. It is transport-compatible with UpUp's stdio
 * server (`@upup/pi-stdio`): both speak length-delimited JSON-RPC over stdio,
 * but they use different method names and different event shapes.
 *
 * This module provides the two pure translation tables the server needs:
 *   1. `mapAcpMethodToUpup`      — request method name ACP → UpUp
 *   2. `mapUpupEventToAcpUpdate` — server event UpUp → ACP session/update payload
 *
 * Keeping the translation pure makes it testable without spawning a server and
 * lets the stdio server stay a thin dispatcher.
 *
 * References:
 *   - ACP spec:        https://agentclientprotocol.com/protocol/overview
 *   - Session updates: https://agentclientprotocol.com/protocol/session-updates
 */

/** Method names used by ACP clients (editor → agent). */
export const AcpMethod = {
  Initialize: 'initialize',
  Authenticate: 'authenticate',
  NewSession: 'session/new',
  LoadSession: 'session/load',
  Prompt: 'session/prompt',
  Cancel: 'session/cancel',
  SetSessionMode: 'session/set_mode',
} as const;

export type AcpMethodName = (typeof AcpMethod)[keyof typeof AcpMethod];

/**
 * ACP request method → UpUp stdio method (`JsonRpcMethod` values).
 *
 * ACP has no dedicated "stream" method: prompt streaming is expressed through
 * `session/update` notifications emitted while the `session/prompt` request is
 * still in flight. UpUp models that as its streaming run, so we map Prompt to
 * `stream` rather than `run`.
 */
export const ACP_TO_UPUP_METHOD: Readonly<Record<string, string>> = {
  [AcpMethod.Initialize]: 'initialize',
  [AcpMethod.NewSession]: 'session/create',
  [AcpMethod.LoadSession]: 'session/resume',
  [AcpMethod.Prompt]: 'stream',
  [AcpMethod.Cancel]: 'cancel',
};

/** Reverse table, used when echoing capabilities / diagnostics. */
export const UPUP_TO_ACP_METHOD: Readonly<Record<string, string>> = Object.freeze(
  Object.entries(ACP_TO_UPUP_METHOD).reduce<Record<string, string>>((acc, [acp, upup]) => {
    if (!(upup in acc)) acc[upup] = acp;
    return acc;
  }, {}),
);

export function mapAcpMethodToUpup(method: string): string | undefined {
  return ACP_TO_UPUP_METHOD[method];
}

export function isAcpMethod(method: string): boolean {
  return method in ACP_TO_UPUP_METHOD;
}

/**
 * Methods that exist ONLY in ACP, and can therefore be used to auto-detect an
 * ACP client. `initialize` is intentionally excluded: both protocols define it,
 * with different result shapes, so it cannot discriminate between them.
 */
const ACP_EXCLUSIVE_METHODS = new Set<string>([
  AcpMethod.NewSession,
  AcpMethod.LoadSession,
  AcpMethod.Prompt,
  AcpMethod.Cancel,
  AcpMethod.Authenticate,
  AcpMethod.SetSessionMode,
]);

export function isAcpExclusiveMethod(method: string): boolean {
  return ACP_EXCLUSIVE_METHODS.has(method);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session updates (agent → editor)
// ─────────────────────────────────────────────────────────────────────────────

export type AcpToolKind = 'read' | 'edit' | 'execute' | 'search' | 'fetch' | 'think' | 'other';
export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type AcpStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export interface AcpContentBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface AcpToolCallUpdate {
  readonly sessionUpdate: 'tool_call' | 'tool_call_update';
  readonly toolCallId: string;
  readonly title?: string;
  readonly kind?: AcpToolKind;
  readonly status?: AcpToolStatus;
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
  readonly content?: ReadonlyArray<AcpContentBlock>;
}

export interface AcpMessageChunk {
  readonly sessionUpdate: 'agent_message_chunk';
  readonly content: AcpContentBlock;
}

export interface AcpThoughtChunk {
  readonly sessionUpdate: 'agent_thought_chunk';
  readonly content: AcpContentBlock;
}

export type AcpSessionUpdate =
  | AcpToolCallUpdate
  | AcpMessageChunk
  | AcpThoughtChunk;

/** Best-effort mapping of an UpUp tool name to an ACP tool kind. */
export function classifyToolKind(toolName: string): AcpToolKind {
  const name = toolName.toLowerCase();
  if (/(^|_)(read|cat|view|open_file|list_dir)/.test(name)) return 'read';
  if (/(^|_)(write|edit|patch|apply|create_file)/.test(name)) return 'edit';
  if (/(^|_)(bash|exec|shell|run|terminal)/.test(name)) return 'execute';
  if (/(^|_)(search|grep|find|glob|query)/.test(name)) return 'search';
  if (/(^|_)(fetch|http|browse|download|web)/.test(name)) return 'fetch';
  if (/(^|_)(think|plan|reason)/.test(name)) return 'think';
  return 'other';
}

interface UpupEventLike {
  readonly type: string;
  readonly [key: string]: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Translate one UpUp server event into zero or one ACP `session/update` payload.
 *
 * Events without an ACP equivalent (compaction, memory, queue drain) return
 * `undefined`; ACP hosts ignore unknown updates, but dropping them here keeps
 * the wire quieter and makes the mapping auditable.
 */
export function mapUpupEventToAcpUpdate(event: UpupEventLike): AcpSessionUpdate | undefined {
  switch (event.type) {
    case 'thinking': {
      const text = asString(event.message) ?? asString(event.text) ?? '';
      if (text.length === 0) return undefined;
      return { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text } };
    }
    case 'stream_progress': {
      // @upup/pi-event-adapter emits the delta under `content`; ACP-mode callers
      // may also pass `textContent`. Accept either so the adapter is robust to
      // both producers.
      const text = asString(event.content) ?? asString(event.textContent) ?? '';
      if (text.length === 0) return undefined;
      return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } };
    }
    case 'tool_start': {
      const tool = asString(event.tool) ?? asString(event.toolName) ?? 'unknown';
      const toolCallId = asString(event.toolCallId) ?? tool;
      return {
        sessionUpdate: 'tool_call',
        toolCallId,
        title: tool,
        kind: classifyToolKind(tool),
        status: 'in_progress',
        ...(event.args !== undefined ? { rawInput: event.args } : {}),
      };
    }
    case 'tool_progress': {
      const tool = asString(event.tool) ?? asString(event.toolName) ?? 'unknown';
      const toolCallId = asString(event.toolCallId) ?? tool;
      const message = asString(event.message) ?? '';
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId,
        status: 'in_progress',
        ...(message.length > 0 ? { content: [{ type: 'text' as const, text: message }] } : {}),
      };
    }
    case 'tool_end': {
      const tool = asString(event.tool) ?? asString(event.toolName) ?? 'unknown';
      const toolCallId = asString(event.toolCallId) ?? tool;
      const result = asString(event.result) ?? '';
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId,
        status: 'completed',
        ...(result.length > 0 ? { rawOutput: result } : {}),
      };
    }
    case 'tool_error': {
      const tool = asString(event.tool) ?? asString(event.toolName) ?? 'unknown';
      const toolCallId = asString(event.toolCallId) ?? tool;
      const error = asString(event.error) ?? 'tool failed';
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId,
        status: 'failed',
        content: [{ type: 'text', text: error }],
      };
    }
    case 'done': {
      const answer = asString(event.answer) ?? '';
      if (answer.length === 0) return undefined;
      return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } };
    }
    default:
      return undefined;
  }
}

/** Session-level outcome of a `session/prompt` request in ACP terms. */
export function resolveAcpStopReason(finalEvent: UpupEventLike | undefined): AcpStopReason {
  if (!finalEvent) return 'end_turn';
  if (finalEvent.type === 'cancelled' || finalEvent.type === 'aborted') return 'cancelled';
  if (finalEvent.type === 'tool_limit') return 'max_turn_requests';
  return 'end_turn';
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability negotiation
// ─────────────────────────────────────────────────────────────────────────────

export interface AcpPromptCapabilities {
  readonly image: boolean;
  readonly audio: boolean;
  readonly embeddedContext: boolean;
}

export interface AcpAgentCapabilities {
  readonly loadSession: boolean;
  readonly promptCapabilities: AcpPromptCapabilities;
}

export interface AcpInitializeResult {
  readonly protocolVersion: number;
  readonly agentCapabilities: AcpAgentCapabilities;
  readonly authMethods: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

/** ACP protocol version this adapter targets. */
export const ACP_PROTOCOL_VERSION = 1;

export function buildAcpInitializeResult(options: {
  readonly supportsImages?: boolean;
  readonly authMethods?: ReadonlyArray<{ id: string; name: string }>;
} = {}): AcpInitializeResult {
  return {
    protocolVersion: ACP_PROTOCOL_VERSION,
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: {
        image: options.supportsImages ?? false,
        audio: false,
        embeddedContext: true,
      },
    },
    authMethods: options.authMethods ?? [],
  };
}

/** ACP params for `session/prompt` → UpUp stream params. */
export function translateAcpPromptParams(params: Record<string, unknown> | undefined): {
  prompt: string;
  sessionId?: string;
  model?: string;
} {
  if (!params) return { prompt: '' };
  const sessionId = asString(params.sessionId);
  const model = asString(params.model);
  const rawPrompt = params.prompt;
  let prompt = '';
  if (typeof rawPrompt === 'string') {
    prompt = rawPrompt;
  } else if (Array.isArray(rawPrompt)) {
    prompt = rawPrompt
      .map((block) => {
        if (block && typeof block === 'object' && 'text' in block) {
          const text = (block as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .filter((text) => text.length > 0)
      .join('\n');
  }
  return {
    prompt,
    ...(sessionId ? { sessionId } : {}),
    ...(model ? { model } : {}),
  };
}

/** ACP params for `session/new` → UpUp `session/create` params.
 *
 * ACP allows `cwd` at the top level of `session/new`. UpUp's native schema
 * wraps it inside `context.projectPath`. Normalise so the server can apply
 * a single, predictable fallback chain.
 */
export function translateAcpNewSessionParams(params: Record<string, unknown> | undefined): {
  cwd?: string;
  mcpServers?: ReadonlyArray<unknown>;
} {
  if (!params) return {};
  const cwd = asString(params.cwd);
  const mcpServers = Array.isArray(params.mcpServers) ? params.mcpServers : undefined;
  const result: { cwd?: string; mcpServers?: ReadonlyArray<unknown> } = {};
  if (cwd) result.cwd = cwd;
  if (mcpServers) result.mcpServers = mcpServers;
  return result;
}
