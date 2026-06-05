/**
 * Message Renderer Module
 *
 * Renders session messages for display in the CLI.
 * Based on Claude Code's Messages.tsx patterns.
 * Now includes support for message chain (parentUuid) and ephemeral filtering.
 */

import type { SessionMessage } from '@upup/types';
import { buildMessageChain, getMessageDepth, type MessageChain } from '../message-chain.js';
import { filterEphemeralMessages } from '../ephemeral-messages.js';

// ============================================================================
// Types
// ============================================================================

export interface RenderOptions {
  showTimestamps: boolean;
  showToolResults: boolean;
  maxContentLength: number;
  syntaxHighlighting: boolean;
  includeEphemeral: boolean;  // NEW: whether to include ephemeral messages
}

export interface RenderableMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp?: number;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
  depth: number;       // NEW: message depth in chain (for indentation)
  parentId?: string;   // NEW: parent message ID
  toolUseId?: string;  // NEW: tool association
}

export interface UserMessageRenderable extends RenderableMessage {
  type: 'user';
}

export interface AssistantMessageRenderable extends RenderableMessage {
  type: 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; input: string }>;
}

export interface ToolMessageRenderable extends RenderableMessage {
  type: 'tool';
  toolName: string;
  toolResult?: string;
}

export interface SystemMessageRenderable extends RenderableMessage {
  type: 'system';
  level?: 'info' | 'warning' | 'error';
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: RenderOptions = {
  showTimestamps: false,
  showToolResults: true,
  maxContentLength: 500,
  syntaxHighlighting: true,
  includeEphemeral: false,  // Default: filter out ephemeral messages
};

// ============================================================================
// Message Renderer
// ============================================================================

export class MessageRenderer {
  private readonly options: RenderOptions;
  private chain: MessageChain | null = null;

  constructor(options: Partial<RenderOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Render all messages with chain support and ephemeral filtering
   */
  render(messages: SessionMessage[]): RenderableMessage[] {
    // Build message chain for depth calculation
    this.chain = buildMessageChain(messages);

    // Filter messages based on options
    const filtered = this.options.includeEphemeral
      ? messages
      : filterEphemeralMessages(messages);

    // Render each message
    return filtered.map(msg => this.renderMessage(msg));
  }

  /**
   * Render a single message with chain metadata
   */
  renderMessage(msg: SessionMessage): RenderableMessage {
    const depth = this.chain ? getMessageDepth(msg.id, this.chain) : 0;

    switch (msg.type) {
      case 'user':
        return this.renderUserMessage(msg, depth);
      case 'assistant':
        return this.renderAssistantMessage(msg, depth);
      case 'tool':
      case 'tool_use':
      case 'tool_result':
        return this.renderToolMessage(msg, depth);
      case 'system':
        return this.renderSystemMessage(msg, depth);
      default:
        return {
          id: msg.id,
          type: 'system',
          content: msg.content || '[Unknown message type]',
          depth,
          parentId: msg.parentUuid,
          toolUseId: msg.toolUseId,
        };
    }
  }

  /**
   * Render user message
   */
  private renderUserMessage(msg: SessionMessage, depth: number): RenderableMessage {
    return {
      id: msg.id,
      type: 'user',
      content: this.truncateContent(msg.content),
      timestamp: msg.timestamp,
      depth,
      parentId: msg.parentUuid,
    };
  }

  /**
   * Render assistant message
   */
  private renderAssistantMessage(msg: SessionMessage, depth: number): AssistantMessageRenderable {
    return {
      id: msg.id,
      type: 'assistant',
      content: this.truncateContent(msg.content),
      timestamp: msg.timestamp,
      depth,
      parentId: msg.parentUuid,
      isStreaming: false,
    };
  }

  /**
   * Render tool message (tool_use, tool_result, or generic tool)
   */
  private renderToolMessage(msg: SessionMessage, depth: number): ToolMessageRenderable {
    return {
      id: msg.id,
      type: 'tool',
      content: this.truncateContent(msg.content),
      timestamp: msg.timestamp,
      toolName: msg.toolName || 'unknown',
      toolResult: msg.toolResult,
      depth,
      parentId: msg.parentUuid,
      toolUseId: msg.toolUseId,
    };
  }

  /**
   * Render system message
   */
  private renderSystemMessage(msg: SessionMessage, depth: number): SystemMessageRenderable {
    return {
      id: msg.id,
      type: 'system',
      content: msg.content || '[System event]',
      timestamp: msg.timestamp,
      depth,
      parentId: msg.parentUuid,
      level: 'info',
    };
  }

  /**
   * Truncate content if too long
   */
  private truncateContent(content: string): string {
    if (content.length <= this.options.maxContentLength) {
      return content;
    }
    return content.slice(0, this.options.maxContentLength - 3) + '...';
  }

  /**
   * Check if a message should be shown (visible content check)
   */
  private isVisibleMessage(msg: SessionMessage): boolean {
    if (!msg.content || msg.content.trim().length === 0) return false;
    if (!this.options.includeEphemeral && msg.isEphemeral) return false;
    return true;
  }

  /**
   * Filter and validate messages
   */
  private isValidMessage(msg: SessionMessage): boolean {
    return this.isVisibleMessage(msg);
  }
}

// ============================================================================
// Module-level Helper Functions
// ============================================================================

/**
 * Render messages with default options
 */
export function renderMessages(messages: SessionMessage[]): RenderableMessage[] {
  const renderer = new MessageRenderer();
  return renderer.render(messages);
}

/**
 * Render messages with custom options
 */
export function renderMessagesWithOptions(
  messages: SessionMessage[],
  options: Partial<RenderOptions>
): RenderableMessage[] {
  const renderer = new MessageRenderer(options);
  return renderer.render(messages);
}

/**
 * Render messages to strings for TUI display
 */
export function renderMessagesToStrings(messages: SessionMessage[]): string[] {
  const renderer = new MessageRenderer();
  return renderer.render(messages).map(msg => messageToString(msg));
}

/**
 * Convert a rendered message to displayable string
 */
export function messageToString(msg: RenderableMessage): string {
  const prefix = getPrefix(msg.type);
  const content = msg.content;

  if (msg.type === 'tool') {
    return `${prefix}[${msg.toolName}] ${content}`;
  }

  return `${prefix} ${content}`;
}

/**
 * Get prefix for message type
 */
function getPrefix(type: RenderableMessage['type']): string {
  switch (type) {
    case 'user':
      return 'You:';
    case 'assistant':
      return '';
    case 'tool':
      return '[Tool]';
    case 'system':
      return '[System]';
  }
}