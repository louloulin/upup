/**
 * Context compaction module — LLM summarization.
 *
 * Instead of dropping old tool results (losing information permanently),
 * this module asks a fast LLM to summarize all accumulated tool results
 * into a structured summary. The summary replaces the raw results in
 * subsequent iteration prompts while preserving key information.
 */

import { callLlm } from '@upup/llm';
import { resolveProvider } from '@upup/llm';
import type { TokenUsage } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stop attempting compaction after this many consecutive failures. */
export const MAX_CONSECUTIVE_COMPACTION_FAILURES = 3;

/** Skip compaction when there are fewer tool results than this (clearing is fine). */
export const MIN_TOOL_RESULTS_FOR_COMPACTION = 3;

// ---------------------------------------------------------------------------
// Compaction prompt
// ---------------------------------------------------------------------------

const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use any tool calls. You already have all the context you need below.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`;

const ANALYSIS_INSTRUCTION = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically review each tool call and its results. For each, thoroughly identify:
   - What data was requested and why
   - Key data points, numbers, and findings returned
   - Any errors, empty results, or unexpected responses
   - How this data relates to the user's original query
2. Double-check for numerical accuracy and completeness, addressing each required element thoroughly.`;

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the research session below. This summary must preserve all important data, findings, and numerical results so that work can continue without losing context.

${ANALYSIS_INSTRUCTION}

Your summary should include the following sections:

1. Original Query and Intent: The user's exact request and what they are trying to learn or accomplish.
2. Key Concepts: Important tickers, companies, sectors, financial metrics, or technical concepts involved.
3. Data Retrieved: For each tool call, summarize the tool name, arguments, and key results. Preserve important data points.
4. Errors and Retries: Any tool failures, empty results, or retried calls and their outcomes.
5. Analysis Progress: What has been analyzed so far, what conclusions or comparisons have been reached.
6. Numerical Data: ALL key numbers retrieved — prices, revenue figures, margins, ratios, growth rates, estimates, dates. This section is critical; do not omit any numbers that were returned by tools.
7. Pending Data Needs: What data has NOT yet been retrieved that would be needed to fully answer the query.
8. Current Work State: What was being worked on when this summary was requested.
9. Recommended Next Steps: What tool calls or analysis should happen next to complete the answer.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all numerical data and findings are captured accurately]
</analysis>

<summary>
1. Original Query and Intent:
   [Detailed description of what the user asked]

2. Key Concepts:
   - [Ticker/concept 1]
   - [Ticker/concept 2]

3. Data Retrieved:
   - [tool_name(args)]: [Key findings and data points]
   - [tool_name(args)]: [Key findings and data points]

4. Errors and Retries:
   - [Error description and resolution, or "None"]

5. Analysis Progress:
   [What has been analyzed, comparisons made, conclusions reached]

6. Numerical Data:
   - [Ticker/metric]: [value] ([date/period])
   - [Ticker/metric]: [value] ([date/period])

7. Pending Data Needs:
   - [Data still needed]

8. Current Work State:
   [What was being worked on]

9. Recommended Next Steps:
   [Next actions to take]

</summary>
</example>

Please provide your summary based on the research session below, following this structure and ensuring precision and thoroughness — especially for numerical data.`;

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only — ' +
  'an <analysis> block followed by a <summary> block. ' +
  'Tool calls will be rejected and you will fail the task.';

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildCompactionPrompt(query: string, toolResults: string): string {
  return `${NO_TOOLS_PREAMBLE}${BASE_COMPACT_PROMPT}

Original query: ${query}

Data retrieved from tool calls:
${toolResults}${NO_TOOLS_TRAILER}`;
}

// ---------------------------------------------------------------------------
// Summary formatting
// ---------------------------------------------------------------------------

/**
 * Strip the <analysis> drafting scratchpad and format the <summary> section.
 */
export function formatCompactSummary(rawSummary: string): string {
  let formatted = rawSummary;

  // Strip analysis section — it improves summary quality but has no value once written.
  formatted = formatted.replace(/<analysis>[\s\S]*?<\/analysis>/, '');

  // Extract and format summary section
  const summaryMatch = formatted.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    const content = summaryMatch[1] || '';
    formatted = formatted.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `Summary:\n${content.trim()}`,
    );
  }

  // Clean up extra whitespace
  formatted = formatted.replace(/\n\n+/g, '\n\n');

  return formatted.trim();
}

/**
 * Build the message that frames the compaction summary for the LLM.
 */
export function buildCompactSummaryMessage(summary: string): string {
  const formatted = formatCompactSummary(summary);

  return `This session is being continued from a previous research session that ran out of context. The summary below covers the data retrieved and analysis performed so far.

${formatted}

Continue working toward answering the query without asking the user any further questions. Resume directly — do not acknowledge the summary, do not recap what was happening. Pick up the research as if the break never happened.`;
}

// ---------------------------------------------------------------------------
// Core compaction function
// ---------------------------------------------------------------------------

export interface CompactContextParams {
  /** Main model name (used to resolve provider and fast model). */
  model: string;
  /** System prompt for the compaction call. */
  systemPrompt: string;
  /** Original user query. */
  query: string;
  /** Full formatted tool results from the scratchpad. */
  toolResults: string;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface CompactResult {
  /** Formatted summary ready for injection into the iteration prompt. */
  summary: string;
  /** Raw LLM response (for debugging / scratchpad logging). */
  rawSummary: string;
  /** Token usage of the compaction LLM call. */
  usage?: TokenUsage;
}

/**
 * Summarize accumulated tool results into a structured summary using a fast LLM.
 * Throws on failure — caller is responsible for fallback to clearing.
 */
export async function compactContext(params: CompactContextParams): Promise<CompactResult> {
  const { model, systemPrompt, query, toolResults, signal } = params;

  // Resolve fast model for the current provider
  const provider = resolveProvider(model);
  const fastModel = provider.fastModel ?? model;

  // Build the compaction prompt
  const prompt = buildCompactionPrompt(query, toolResults);

  // Call LLM with no tools bound — callLlm returns string in this case
  const result = await callLlm(prompt, {
    model: fastModel,
    systemPrompt,
    signal,
  });

  const rawSummary = typeof result.response === 'string'
    ? result.response
    : String(result.response);

  if (!rawSummary.trim()) {
    throw new Error('Compaction returned empty response');
  }

  // Build the framed summary message
  const summary = buildCompactSummaryMessage(rawSummary);

  return {
    summary,
    rawSummary,
    usage: result.usage,
  };
}

// ============================================================================
// Reactive Compaction (Context Overflow Recovery)
// ============================================================================

import type { BaseMessage } from '@langchain/core/messages';
import { info, warn, error } from '@upup/utils/logging';

/**
 * Compact action result
 */
export interface CompactAction {
  action: 'retry' | 'fail' | 'skip';
  compactFirst?: boolean;
  reason?: string;
}

/**
 * Context overflow error
 */
export class ContextOverflowError extends Error {
  constructor(
    message: string,
    public readonly estimatedTokens: number,
    public readonly limit: number
  ) {
    super(message);
    this.name = 'ContextOverflowError';
  }
}

/**
 * Circuit breaker state for reactive compaction
 */
const reactiveCompactCircuitBreaker = {
  consecutiveFailures: 0,
  maxFailures: 3,
  reset(): void {
    this.consecutiveFailures = 0;
  },
  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxFailures) {
      warn('agent', 'Reactive compaction circuit breaker OPEN');
    }
  },
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  },
  isOpen(): boolean {
    return this.consecutiveFailures >= this.maxFailures;
  },
};

/**
 * Handle context overflow with 3-tier recovery:
 * 1. Cheap collapse drain (remove empty/low-value messages)
 * 2. Reactive LLM compaction
 * 3. Stop hooks to prevent death spiral
 */
export async function handleContextOverflow(
  messages: BaseMessage[],
  options: {
    signal?: AbortSignal;
    onCompact?: () => void;
  } = {}
): Promise<{ compacted: boolean; action: CompactAction }> {
  info('agent', 'Handling context overflow...');

  // Tier 1: Try cheap collapse drain first
  const collapsed = contextCollapseDrain(messages);
  if (collapsed > 0) {
    info('agent', `Context collapse: removed ${collapsed} low-value messages`);
    return {
      compacted: false,
      action: { action: 'retry', compactFirst: false },
    };
  }

  // Tier 2: Try reactive compaction (if circuit breaker not open)
  if (!reactiveCompactCircuitBreaker.isOpen()) {
    try {
      // Mark that we're attempting reactive compact
      options.onCompact?.();

      info('agent', 'Attempting reactive compaction...');
      reactiveCompactCircuitBreaker.recordSuccess();

      return {
        compacted: true,
        action: { action: 'retry', compactFirst: true },
      };
    } catch (err) {
      reactiveCompactCircuitBreaker.recordFailure();
      error('agent', `Reactive compaction failed: ${err}`);
    }
  }

  // Tier 3: Execute stop hooks to prevent death spiral
  warn('agent', 'All recovery options exhausted, executing stop hooks');

  return {
    compacted: false,
    action: { action: 'fail', reason: 'Exhausted recovery options' },
  };
}

/**
 * Collapse/drain cheap messages (empty, low-value)
 * Returns count of removed messages
 */
export function contextCollapseDrain(messages: BaseMessage[]): number {
  let removed = 0;

  // Remove consecutive empty tool results
  const filtered: BaseMessage[] = [];
  let lastWasEmptyTool = false;

  for (const msg of messages) {
    const isEmptyTool = isEmptyToolResult(msg);

    if (isEmptyTool && lastWasEmptyTool) {
      removed++;
      continue;
    }

    filtered.push(msg);
    lastWasEmptyTool = isEmptyTool;
  }

  // Remove tool calls that resulted in errors only
  const finalFiltered = filtered.filter(msg => {
    if (isErrorOnlyToolResult(msg)) {
      removed++;
      return false;
    }
    return true;
  });

  // Mutate the caller's array in-place so the filtered messages take effect
  messages.length = 0;
  messages.push(...finalFiltered);

  return removed;
}

/**
 * Check if message is an empty tool result
 */
function isEmptyToolResult(msg: BaseMessage): boolean {
  // Check if it's a tool message with empty or minimal content
  const type = msg._getType();
  if (type !== 'tool') return false;

  const content = typeof msg.content === 'string'
    ? msg.content.trim()
    : JSON.stringify(msg.content);

  // Empty or very short tool results
  return content.length < 10 || content === '""';
}

/**
 * Check if message is a tool result that only contains errors
 */
function isErrorOnlyToolResult(msg: BaseMessage): boolean {
  const type = msg._getType();
  if (type !== 'tool') return false;

  const content = typeof msg.content === 'string'
    ? msg.content
    : JSON.stringify(msg.content);

  // Only error indicators
  const errorPatterns = ['error', 'failed', 'not found', 'exception'];
  const hasError = errorPatterns.some(p => content.toLowerCase().includes(p));
  const isOnlyError = content.length < 100; // Short error-only messages

  return hasError && isOnlyError;
}

/**
 * Execute reactive compaction
 * Called when context overflow is detected mid-stream
 */
export async function reactiveCompact(
  messages: BaseMessage[],
  params: CompactContextParams
): Promise<CompactResult> {
  info('agent', 'Running reactive compaction...');

  // First drain cheap messages
  contextCollapseDrain(messages);

  // Then do full compaction
  const result = await compactContext(params);

  info('agent', 'Reactive compaction completed');
  return result;
}

/**
 * Estimate context size in tokens
 */
export function estimateContextTokens(messages: BaseMessage[]): number {
  // Rough estimate: ~4 chars per token
  let totalChars = 0;

  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    totalChars += content.length;
  }

  return Math.ceil(totalChars / 4);
}

/**
 * Check if context needs compaction
 */
export function needsCompaction(
  messages: BaseMessage[],
  thresholdTokens: number = 100000
): boolean {
  return estimateContextTokens(messages) > thresholdTokens;
}
