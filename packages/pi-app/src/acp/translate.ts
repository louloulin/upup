/**
 * Agent Client Protocol (ACP) translation tables.
 *
 * ACP is the JSON-RPC 2.0 dialect editor hosts (Zed, Neovim plugins, custom
 * IDE front-ends) use to drive a coding agent:
 *   - requests  → `{ jsonrpc: "2.0", id, method, params }`
 *   - streaming → `session/update` **notifications** emitted while a
 *                 `session/prompt` request is still in flight
 *
 * `upup --acp` serves that dialect on top of UpUp's Pi session, whose events
 * are already canonical (`UpUpAgentEvent`). This module holds the two pure
 * translation tables; the server stays a thin dispatcher and the tables stay
 * testable without spawning a process.
 *
 * Why this file exists at all: the Pi Native migration deleted the old stdio
 * ACP adapter and pointed `--acp` at Pi's plain RPC mode, which speaks
 * `{ type: "..." }` commands. The flag and its help text kept advertising ACP
 * method names, so every ACP client got `Unknown command: undefined`. This
 * restores the advertised surface.
 *
 * References:
 *   - ACP spec:        https://agentclientprotocol.com/protocol/overview
 *   - Session updates: https://agentclientprotocol.com/protocol/session-updates
 */

/** Method names ACP clients send (editor → agent). */
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

/** ACP protocol version this adapter implements. */
export const ACP_PROTOCOL_VERSION = 1;

/**
 * ACP-exclusive methods, used to auto-detect an ACP client on a shared
 * transport. `initialize` is excluded on purpose: both protocols define it,
 * with different result shapes, so it cannot discriminate between them.
 */
const ACP_EXCLUSIVE_METHODS: ReadonlySet<string> = new Set<string>([
  AcpMethod.NewSession,
  AcpMethod.LoadSession,
  AcpMethod.Prompt,
  AcpMethod.Cancel,
  AcpMethod.Authenticate,
  AcpMethod.SetSessionMode,
]);

export function isAcpMethod(method: string): boolean {
  return (Object.values(AcpMethod) as readonly string[]).includes(method);
}

export function isAcpExclusiveMethod(method: string): boolean {
  return ACP_EXCLUSIVE_METHODS.has(method);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt / new-session parameter shapes
// ─────────────────────────────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Flatten an ACP `session/prompt` payload into the text UpUp prompts with.
 *
 * ACP allows either a bare string or an array of content blocks; only `text`
 * blocks carry prompt text that UpUp can use (images are not part of the
 * finance workflow surface).
 */
export function translateAcpPromptParams(params: Record<string, unknown> | undefined): {
  prompt: string;
  sessionId?: string;
  model?: string;
} {
  if (!params) return { prompt: '' };
  const raw = params.prompt;
  let prompt = '';
  if (typeof raw === 'string') {
    prompt = raw;
  } else if (Array.isArray(raw)) {
    prompt = raw
      .map((block) => (block && typeof block === 'object' && 'text' in block
        ? asString((block as { text?: unknown }).text) ?? ''
        : ''))
      .filter((text) => text.length > 0)
      .join('\n');
  }
  const sessionId = asString(params.sessionId);
  const model = asString(params.model);
  return { prompt, ...(sessionId ? { sessionId } : {}), ...(model ? { model } : {}) };
}

/** Normalise ACP `session/new` params (`cwd` sits at the top level in ACP). */
export function translateAcpNewSessionParams(params: Record<string, unknown> | undefined): {
  cwd?: string;
  mcpServers?: ReadonlyArray<unknown>;
} {
  if (!params) return {};
  const cwd = asString(params.cwd);
  const mcpServers = Array.isArray(params.mcpServers) ? params.mcpServers : undefined;
  return { ...(cwd ? { cwd } : {}), ...(mcpServers ? { mcpServers } : {}) };
}

export interface AcpInitializeResult {
  readonly protocolVersion: number;
  readonly agentCapabilities: {
    readonly loadSession: boolean;
    readonly promptCapabilities: {
      readonly image: boolean;
      readonly audio: boolean;
      readonly embeddedContext: boolean;
    };
  };
  readonly authMethods: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

export function buildAcpInitializeResult(options: {
  readonly authMethods?: ReadonlyArray<{ id: string; name: string }>;
} = {}): AcpInitializeResult {
  return {
    protocolVersion: ACP_PROTOCOL_VERSION,
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: { image: false, audio: false, embeddedContext: true },
    },
    authMethods: options.authMethods ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session updates (agent → editor)
// ─────────────────────────────────────────────────────────────────────────────

export type AcpToolKind = 'read' | 'edit' | 'execute' | 'search' | 'fetch' | 'think' | 'other';
export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type AcpStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export interface AcpTextContent {
  readonly type: 'text';
  readonly text: string;
}

export type AcpSessionUpdate =
  | {
      readonly sessionUpdate: 'tool_call';
      readonly toolCallId: string;
      readonly title: string;
      readonly kind: AcpToolKind;
      readonly status: AcpToolStatus;
      readonly rawInput?: unknown;
    }
  | {
      readonly sessionUpdate: 'tool_call_update';
      readonly toolCallId: string;
      readonly status: AcpToolStatus;
      readonly content?: ReadonlyArray<AcpTextContent>;
      readonly rawOutput?: unknown;
    }
  | { readonly sessionUpdate: 'agent_message_chunk'; readonly content: AcpTextContent }
  | { readonly sessionUpdate: 'agent_thought_chunk'; readonly content: AcpTextContent };

/** Best-effort mapping of an UpUp tool name onto an ACP tool kind. */
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

/**
 * Translate one canonical UpUp event into an ACP `session/update` payload.
 *
 * Events with no ACP equivalent (compaction, session lifecycle) return
 * `undefined`. ACP hosts ignore unknown updates, but dropping them here keeps
 * the wire quieter and the mapping auditable.
 */
export function mapUpUpEventToAcpUpdate(event: {
  readonly type: string;
  readonly [key: string]: unknown;
}): AcpSessionUpdate | undefined {
  switch (event.type) {
    case 'thinking': {
      const text = asString(event.text) ?? '';
      if (!text) return undefined;
      return { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text } };
    }
    case 'text_delta': {
      const text = asString(event.delta) ?? '';
      if (!text) return undefined;
      return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } };
    }
    case 'message_end': {
      // ACP streams deltas; the terminal message would duplicate them. Only
      // surface it when the turn produced no deltas (non-streaming providers).
      const text = asString(event.text) ?? '';
      if (!text || event.streamed === true) return undefined;
      return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } };
    }
    case 'tool_start': {
      const tool = asString(event.toolName) ?? 'unknown';
      return {
        sessionUpdate: 'tool_call',
        toolCallId: asString(event.toolCallId) ?? tool,
        title: tool,
        kind: classifyToolKind(tool),
        status: 'in_progress',
        ...(event.input !== undefined ? { rawInput: event.input } : {}),
      };
    }
    case 'tool_update': {
      const tool = asString(event.toolName) ?? 'unknown';
      const text = asString(event.text) ?? '';
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId: asString(event.toolCallId) ?? tool,
        status: 'in_progress',
        ...(text ? { content: [{ type: 'text' as const, text }] } : {}),
      };
    }
    case 'tool_end': {
      const tool = asString(event.toolName) ?? 'unknown';
      const error = asString(event.error);
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId: asString(event.toolCallId) ?? tool,
        status: error ? 'failed' : 'completed',
        ...(error ? { content: [{ type: 'text' as const, text: error }] } : {}),
      };
    }
    default:
      return undefined;
  }
}

/** Session-level outcome of a `session/prompt`, in ACP terms. */
export function resolveAcpStopReason(finalEvent: { readonly type: string } | undefined): AcpStopReason {
  if (!finalEvent) return 'end_turn';
  if (finalEvent.type === 'session_error') return 'refusal';
  return 'end_turn';
}
