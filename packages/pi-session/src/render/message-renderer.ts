/**
 * Pi native message renderer (Sprint 3 cleanup).
 *
 * The previous renderer built its own message chain + ephemeral filter
 * by hand. Both responsibilities now live in Pi:
 *   - chain       → core/messages.ts + core/compaction
 *   - ephemeral   → Pi AgentSession ephemeral-messages filter
 *
 * This thin module keeps the public `renderMessages` / `renderMessagesWithOptions`
 * / `renderMessagesToStrings` signatures stable so callers in `default.ts`,
 * bridge / gateway adapters, and the legacy TUI port don't need to change.
 * The actual transformation is a depth-aware pass-through; Pi's
 * InteractiveMode handles the visual layout.
 */

export interface RenderOptions {
  showTimestamps: boolean;
  showToolResults: boolean;
  maxContentLength: number;
}

export interface RenderableMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp?: number;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
  depth: number;
  parentId?: string;
  toolUseId?: string;
}

export interface AssistantMessageRenderable extends RenderableMessage {
  type: 'assistant';
  thinking?: string;
}

export interface ToolMessageRenderable extends RenderableMessage {
  type: 'tool';
}

export interface SystemMessageRenderable extends RenderableMessage {
  type: 'system';
}

export class MessageRenderer {
  private readonly options: RenderOptions;

  constructor(options: Partial<RenderOptions> = {}) {
    this.options = {
      showTimestamps: options.showTimestamps ?? true,
      showToolResults: options.showToolResults ?? true,
      maxContentLength: options.maxContentLength ?? 100_000,
    };
  }

  render(messages: unknown[]): RenderableMessage[] {
    return messages.map((m, idx) => toRenderable(m, idx, this.options));
  }

  renderMessage(msg: unknown): RenderableMessage {
    return toRenderable(msg, 0, this.options);
  }
}

function extractContent(msg: Record<string, unknown> | unknown): string {
  if (msg && typeof msg === 'object' && 'content' in msg) {
    const c = (msg as { content: unknown }).content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((p) => (typeof p === 'object' && p && 'text' in p ? String((p as { text: unknown }).text ?? '') : String(p))).join('');
  }
  return '';
}

function toRenderable(msg: unknown, fallbackDepth: number, _opts: RenderOptions): RenderableMessage {
  if (!msg || typeof msg !== 'object') {
    return { id: `r-${fallbackDepth}`, type: 'system', content: '', depth: fallbackDepth };
  }
  const m = msg as Record<string, unknown>;
  const type = String(m.type ?? 'system');
  const depth = typeof m.depth === 'number' ? m.depth : fallbackDepth;
  const base: RenderableMessage = {
    id: String(m.id ?? `r-${fallbackDepth}`),
    type: (type === 'user' || type === 'assistant' || type === 'tool') ? type : 'system',
    content: extractContent(m),
    depth,
    ...(typeof m.timestamp === 'number' ? { timestamp: m.timestamp } : {}),
    ...(typeof m.parentId === 'string' ? { parentId: m.parentId } : {}),
  };
  return base;
}

export function renderMessages(messages: unknown[]): RenderableMessage[] {
  const renderer = new MessageRenderer();
  return renderer.render(messages);
}

export function renderMessagesWithOptions(messages: unknown[], options: Partial<RenderOptions>): RenderableMessage[] {
  const renderer = new MessageRenderer(options);
  return renderer.render(messages);
}

export function renderMessagesToStrings(messages: unknown[]): string[] {
  return renderMessages(messages).map((m) => m.content);
}
