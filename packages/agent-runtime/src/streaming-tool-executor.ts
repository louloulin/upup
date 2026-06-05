/**
 * StreamingToolExecutor - Incremental tool call parser + early execution
 *
 * Parses tool_calls from streaming AIMessageChunks incrementally.
 * When a complete tool call is detected (input_json finalized), execution
 * begins immediately without waiting for the rest of the stream to finish.
 * Concurrent-safe tools that complete parsing early can run in parallel.
 *
 * Reference: Claude Code's StreamingToolExecutor
 */

import { AIMessageChunk, type AIMessage } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import { all } from '@upup/utils/concurrency';
import { info, perf } from '@upup/utils/logging';

type ToolCallWithIndex = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  index?: number;
};

export interface StreamingToolCall {
  index: number;
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Whether the full JSON args have been received */
  complete: boolean;
}

export interface StreamingToolResult {
  index: number;
  toolCallId: string;
  toolName: string;
  result: string;
  duration: number;
  error?: string;
}

type ExecuteFn = (toolName: string, args: Record<string, unknown>) => Promise<{ result: string; duration: number; error?: string }>;

interface PendingTool {
  call: StreamingToolCall;
  promise: Promise<StreamingToolResult>;
  resolve: (result: StreamingToolResult) => void;
}

/**
 * Incremental tool call parser that executes tools as soon as they are
 * fully parsed from the streaming response.
 */
export class StreamingToolExecutor {
  private pendingTools: Map<number, PendingTool> = new Map();
  private completedCalls: StreamingToolCall[] = [];
  private readonly concurrencyMap: Map<string, boolean>;
  private readonly executeFn: ExecuteFn;
  private readonly maxConcurrency: number;

  constructor(
    concurrencyMap: Map<string, boolean>,
    executeFn: ExecuteFn,
    maxConcurrency: number = 10,
  ) {
    this.concurrencyMap = concurrencyMap;
    this.executeFn = executeFn;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Feed a streaming chunk and execute any tool calls that become complete.
   * Returns indices of newly completed tool calls.
   */
  addChunk(chunk: AIMessageChunk): number[] {
    const newlyCompleted: number[] = [];

    if (!chunk.tool_calls || chunk.tool_calls.length === 0) {
      return newlyCompleted;
    }

    for (const tcRaw of chunk.tool_calls) {
      const tc = tcRaw as unknown as ToolCallWithIndex;
      const index = tc.index ?? 0;
      const existing = this.pendingTools.get(index);

      if (existing) {
        // Accumulate partial args
        if (tc.args && typeof tc.args === 'object') {
          existing.call.args = { ...existing.call.args, ...tc.args };
        }

        // Check if complete (has id, name, and full args)
        if (tc.id && tc.name && !existing.call.complete) {
          existing.call.id = tc.id;
          existing.call.name = tc.name;

          // Tool call is complete when we get an id + name + args
          existing.call.complete = true;
          newlyCompleted.push(index);
          this.completedCalls.push(existing.call);

          info('tools', `Tool call parsed early: ${tc.name} [${index}]`);
        }
      } else {
        // New tool call
        const call: StreamingToolCall = {
          index,
          id: tc.id ?? '',
          name: tc.name ?? '',
          args: (tc.args as Record<string, unknown>) ?? {},
          complete: !!(tc.id && tc.name),
        };

        let resolveResult!: (result: StreamingToolResult) => void;
        const promise = new Promise<StreamingToolResult>(resolve => {
          resolveResult = resolve;
        });

        this.pendingTools.set(index, { call, promise, resolve: resolveResult });

        if (call.complete) {
          newlyCompleted.push(index);
          this.completedCalls.push(call);
          info('tools', `Tool call parsed: ${call.name} [${index}]`);
        }
      }
    }

    return newlyCompleted;
  }

  /**
   * Get all pending tool promises for concurrent execution.
   * Only returns promises for tools that are safe to run concurrently.
   */
  getConcurrentSafePromises(): Promise<StreamingToolResult>[] {
    const promises: Promise<StreamingToolResult>[] = [];

    for (const [index, pending] of this.pendingTools) {
      if (!pending.call.complete) continue;
      const isSafe = this.concurrencyMap.get(pending.call.name) ?? false;
      if (isSafe) {
        promises.push(this.executeIfNotStarted(pending));
      }
    }

    return promises;
  }

  /**
   * Execute all completed tool calls that haven't started yet.
   * Concurrent-safe tools run in parallel; others run sequentially.
   */
  async executeAll(): Promise<StreamingToolResult[]> {
    const results: StreamingToolResult[] = [];
    const concurrentBatch: Promise<StreamingToolResult>[] = [];
    const serialBatch: PendingTool[] = [];

    for (const [index, pending] of this.pendingTools) {
      if (!pending.call.complete) continue;

      const isSafe = this.concurrencyMap.get(pending.call.name) ?? false;
      if (isSafe) {
        concurrentBatch.push(this.executeIfNotStarted(pending));
      } else {
        serialBatch.push(pending);
      }
    }

    // Run concurrent batch
    if (concurrentBatch.length > 0) {
      const concurrentResults = await Promise.allSettled(concurrentBatch);
      for (const r of concurrentResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        }
      }
    }

    // Run serial batch
    for (const pending of serialBatch) {
      const result = await this.executeIfNotStarted(pending);
      results.push(result);
    }

    // Sort by index
    results.sort((a, b) => a.index - b.index);
    return results;
  }

  /**
   * Get completed tool calls in order.
   */
  getCompletedCalls(): StreamingToolCall[] {
    return [...this.completedCalls].sort((a, b) => a.index - b.index);
  }

  /**
   * Get total count of parsed tool calls.
   */
  getCallCount(): number {
    return this.pendingTools.size;
  }

  /**
   * Check if all tool calls are complete and executed.
   */
  allComplete(): boolean {
    for (const pending of this.pendingTools.values()) {
      if (!pending.call.complete) return false;
    }
    return true;
  }

  /**
   * Finalize: feed any remaining chunk data and execute all pending tools.
   * Called after the stream ends.
   */
  async finalize(lastChunk?: AIMessageChunk): Promise<StreamingToolResult[]> {
    if (lastChunk) {
      this.addChunk(lastChunk);
    }

    // Mark any incomplete calls as complete with what we have
    for (const pending of this.pendingTools.values()) {
      if (!pending.call.complete) {
        pending.call.complete = true;
        this.completedCalls.push(pending.call);
      }
    }

    return this.executeAll();
  }

  /**
   * Build ToolCall array from completed calls (compatible with LangChain).
   */
  buildToolCalls(): ToolCall[] {
    return this.completedCalls
      .sort((a, b) => a.index - b.index)
      .map(call => ({
        id: call.id,
        name: call.name,
        args: call.args,
      }));
  }

  private startedTools: Set<number> = new Set();

  private async executeIfNotStarted(pending: PendingTool): Promise<StreamingToolResult> {
    if (this.startedTools.has(pending.call.index)) {
      return pending.promise;
    }

    this.startedTools.add(pending.call.index);

    const startTime = Date.now();
    try {
      const { result, duration, error } = await this.executeFn(pending.call.name, pending.call.args);
      const streamResult: StreamingToolResult = {
        index: pending.call.index,
        toolCallId: pending.call.id,
        toolName: pending.call.name,
        result,
        duration: duration || (Date.now() - startTime),
        error,
      };
      pending.resolve(streamResult);
      perf('tools', `Executed: ${pending.call.name}`, streamResult.duration);
      return streamResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const streamResult: StreamingToolResult = {
        index: pending.call.index,
        toolCallId: pending.call.id,
        toolName: pending.call.name,
        result: `Error: ${errorMessage}`,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
      pending.resolve(streamResult);
      return streamResult;
    }
  }
}
