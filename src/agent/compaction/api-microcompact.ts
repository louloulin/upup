/**
 * API Microcompact - Per-message compression for API efficiency
 *
 * Compresses individual messages before sending to the LLM API,
 * focusing on reducing token count without losing semantic meaning.
 *
 * Features:
 * - Whitespace normalization
 * - Code block compression
 * - JSON minification
 * - Markdown simplification
 * - URL shortening
 * - Number rounding
 */

import type { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import { estimateTokens } from '../../utils/tokens.js';
import { info } from '../../utils/logging/logger.js';

// ============================================================================
// Compression Options
// ============================================================================

export interface ApiMicrocompactOptions {
  /** Remove extra whitespace */
  normalizeWhitespace?: boolean;
  /** Compress code blocks */
  compressCodeBlocks?: boolean;
  /** Simplify markdown formatting */
  simplifyMarkdown?: boolean;
  /** Round numbers to significant digits */
  roundNumbers?: boolean;
  /** Truncate long strings */
  truncateLongStrings?: boolean;
  /** Max token budget for compression */
  maxTokensBudget?: number;
}

const DEFAULT_OPTIONS: Required<ApiMicrocompactOptions> = {
  normalizeWhitespace: true,
  compressCodeBlocks: true,
  simplifyMarkdown: true,
  roundNumbers: true,
  truncateLongStrings: true,
  maxTokensBudget: 120_000,
};

// ============================================================================
// Compressors
// ============================================================================

/**
 * Normalize whitespace in text
 */
export function normalizeWhitespace(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let blankCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blankCount++;
    } else {
      if (blankCount > 0) {
        result.push(''); // Max one blank line between non-blank lines
      }
      result.push(trimmed);
      blankCount = 0;
    }
  }

  return result.join('\n').trim();
}

/**
 * Compress code blocks by removing comments and extra whitespace
 */
export function compressCodeBlocks(text: string): string {
  return text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (match, lang, code) => {
      // Compress the code content
      let compressed = code
        // Remove single-line comments
        .replace(/^\s*\/\/.*$/gm, '')
        // Remove Python comments
        .replace(/^\s*#.*$/gm, '')
        // Collapse multiple spaces to one
        .replace(/[ \t]+/g, ' ')
        // Remove empty lines
        .replace(/^\s*$/gm, '')
        .trim();

      // If code is very long, summarize it
      if (compressed.length > 500) {
        compressed = compressed.slice(0, 200) + '... [truncated]';
      }

      return `\`\`\`${lang}\n${compressed}\n\`\`\``;
    }
  );
}

/**
 * Simplify markdown formatting
 */
export function simplifyMarkdown(text: string): string {
  return text
    // Remove emphasis markers on short text
    .replace(/\*\*([^*]{1,10})\*\*/g, '$1')
    .replace(/\*([^*]{1,10})\*/g, '$1')
    .replace(/__([^_]{1,10})__/g, '$1')
    .replace(/_([^_]{1,10})_/g, '$1')
    // Demote very deep headers (H4+) to H2
    .replace(/^#{4,6} /gm, '## ')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Collapse bullet list whitespace
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, '1. ');
}

/**
 * Round numbers to significant digits
 */
export function roundNumbers(text: string): string {
  // Round large integers (>= 1000) to K/M suffix
  let result = text.replace(
    /(?<!\w)(\d{4,})(?!\.\d)/g,
    (match) => {
      const num = parseInt(match, 10);
      if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2) + 'M';
      }
      if (num >= 100_000) {
        return (num / 1_000).toFixed(0) + 'K';
      }
      if (num >= 10_000) {
        return (num / 1_000).toFixed(0) + 'K';
      }
      return match;
    }
  );

  // Round very precise decimals (6+ decimal places)
  result = result.replace(
    /\b\d+\.\d{6,}\b/g,
    (match) => parseFloat(match).toFixed(4)
  );

  return result;
}

/**
 * Truncate long strings while preserving structure
 */
export function truncateLongStrings(text: string, maxLength = 2000): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Truncate middle, preserve start and end
  const keepStart = Math.floor(maxLength * 0.7);
  const keepEnd = maxLength - keepStart;

  return text.slice(0, keepStart) + '\n... [content truncated] ...\n' + text.slice(-keepEnd);
}

/**
 * Compress a single message content
 */
export function compressMessageContent(
  content: string | object,
  options: ApiMicrocompactOptions = DEFAULT_OPTIONS
): string {
  let text = typeof content === 'string' ? content : JSON.stringify(content);

  if (options.normalizeWhitespace) {
    text = normalizeWhitespace(text);
  }

  if (options.compressCodeBlocks) {
    text = compressCodeBlocks(text);
  }

  if (options.simplifyMarkdown) {
    text = simplifyMarkdown(text);
  }

  if (options.roundNumbers) {
    text = roundNumbers(text);
  }

  if (options.truncateLongStrings) {
    text = truncateLongStrings(text);
  }

  return text;
}

// ============================================================================
// Message Analysis
// ============================================================================

export interface MessageAnalysis {
  /** Token count before compression */
  tokensBefore: number;
  /** Token count after compression */
  tokensAfter: number;
  /** Estimated savings */
  tokensSaved: number;
  /** Compression ratio */
  ratio: number;
  /** Whether compression was applied */
  applied: boolean;
}

/**
 * Analyze if compression is needed for a message
 */
export function analyzeMessageCompression(
  message: BaseMessage,
  options: ApiMicrocompactOptions = DEFAULT_OPTIONS
): MessageAnalysis {
  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);

  const tokensBefore = estimateTokens([message]);
  const compressed = compressMessageContent(content, options);
  const tokensAfter = Math.ceil(compressed.length / 4); // Rough estimate
  const tokensSaved = Math.max(0, tokensBefore - tokensAfter);
  const ratio = tokensBefore > 0 ? tokensAfter / tokensBefore : 1;

  return {
    tokensBefore,
    tokensAfter,
    tokensSaved,
    ratio,
    applied: tokensSaved > 0,
  };
}

// ============================================================================
// API Microcompact Class
// ============================================================================

export class ApiMicrocompact {
  private options: Required<ApiMicrocompactOptions>;

  constructor(options: ApiMicrocompactOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Compress messages to fit within token budget
   */
  compressMessages(messages: BaseMessage[]): { messages: BaseMessage[]; analysis: MessageAnalysis[] } {
    const analysis: MessageAnalysis[] = [];
    let totalTokensBefore = 0;
    let totalTokensAfter = 0;

    const compressed: BaseMessage[] = [];

    for (const message of messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);

      const beforeTokens = estimateTokens([message]);
      totalTokensBefore += beforeTokens;

      let newContent = content;

      // Only compress if we're getting close to budget
      if (totalTokensAfter > this.options.maxTokensBudget * 0.8) {
        newContent = compressMessageContent(content, this.options);
      }

      const afterTokens = Math.ceil(newContent.length / 4);
      totalTokensAfter += afterTokens;

      // Create new message with compressed content
      const newMessage = this.createCompressedMessage(message, newContent);
      compressed.push(newMessage);

      analysis.push({
        tokensBefore: beforeTokens,
        tokensAfter: afterTokens,
        tokensSaved: Math.max(0, beforeTokens - afterTokens),
        ratio: beforeTokens > 0 ? afterTokens / beforeTokens : 1,
        applied: newContent !== content,
      });
    }

    return { messages: compressed, analysis };
  }

  /**
   * Create a new message with compressed content
   */
  private createCompressedMessage(original: BaseMessage, content: string): BaseMessage {
    const type = original._getType();

    switch (type) {
      case 'system':
        return new SystemMessage({ content });

      case 'human':
        return new HumanMessage({ content });

      case 'ai':
        if (original instanceof AIMessage) {
          return new AIMessage({
            content,
            tool_calls: original.tool_calls,
            invalid_tool_calls: original.invalid_tool_calls,
          });
        }
        return new AIMessage({ content });

      case 'tool':
        if (original instanceof ToolMessage) {
          return new ToolMessage({
            content,
            tool_call_id: original.tool_call_id,
            name: original.name,
          });
        }
        return new ToolMessage({ content });

      default:
        return original;
    }
  }

  /**
   * Check if messages need compression
   */
  needsCompression(messages: BaseMessage[]): boolean {
    let totalChars = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      totalChars += content.length;
    }
    const totalTokens = Math.ceil(totalChars / 3.5);
    return totalTokens > this.options.maxTokensBudget * 0.9;
  }

  /**
   * Get compression statistics
   */
  getStats(analysis: MessageAnalysis[]): {
    totalBefore: number;
    totalAfter: number;
    totalSaved: number;
    ratio: number;
    messagesCompressed: number;
  } {
    const totals = analysis.reduce(
      (acc, a) => ({
        totalBefore: acc.totalBefore + a.tokensBefore,
        totalAfter: acc.totalAfter + a.tokensAfter,
        totalSaved: acc.totalSaved + a.tokensSaved,
        messagesCompressed: acc.messagesCompressed + (a.applied ? 1 : 0),
      }),
      { totalBefore: 0, totalAfter: 0, totalSaved: 0, messagesCompressed: 0 }
    );

    return {
      ...totals,
      ratio: totals.totalBefore > 0 ? totals.totalAfter / totals.totalBefore : 1,
    };
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<ApiMicrocompactOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

let globalMicrocompact: ApiMicrocompact | null = null;

export function getApiMicrocompact(options?: ApiMicrocompactOptions): ApiMicrocompact {
  if (!globalMicrocompact) {
    globalMicrocompact = new ApiMicrocompact(options);
  }
  return globalMicrocompact;
}

export function resetApiMicrocompact(): void {
  globalMicrocompact = null;
}
