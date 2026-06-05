/**
 * Tests for StreamingToolExecutor
 */

import { describe, it, expect, vi } from 'bun:test';
import { AIMessageChunk } from '@langchain/core/messages';
import { StreamingToolExecutor, type StreamingToolResult } from './streaming-tool-executor.js';

function makeChunk(toolCalls: Array<{
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  index?: number;
}>): AIMessageChunk {
  return new AIMessageChunk({
    content: '',
    tool_calls: toolCalls.map(tc => ({
      id: tc.id ?? '',
      name: tc.name ?? '',
      args: tc.args ?? {},
      index: tc.index ?? 0,
    })),
  });
}

function makeExecuteFn(results?: Record<string, string>) {
  const defaultResults: Record<string, string> = {
    read_file: 'file contents here',
    web_search: 'search results',
    write_file: 'File written successfully',
    edit_file: 'File edited successfully',
    ...results,
  };

  return vi.fn(async (toolName: string, args: Record<string, unknown>) => {
    const result = defaultResults[toolName] ?? `Result from ${toolName}`;
    return { result, duration: 10, error: undefined };
  });
}

function makeConcurrencyMap(entries: Record<string, boolean> = {}) {
  return new Map(Object.entries({
    read_file: true,
    web_search: true,
    write_file: false,
    edit_file: false,
    ...entries,
  }));
}

describe('StreamingToolExecutor', () => {
  describe('addChunk', () => {
    it('should parse complete tool call from chunk', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());
      const chunk = makeChunk([
        { id: 'call_1', name: 'read_file', args: { path: '/test.txt' }, index: 0 },
      ]);

      const completed = executor.addChunk(chunk);
      expect(completed).toEqual([0]);
      expect(executor.getCallCount()).toBe(1);
    });

    it('should accumulate partial tool calls across chunks', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());

      // First chunk: partial (no id yet)
      const chunk1 = makeChunk([
        { name: 'read_file', args: { path: '/test.txt' }, index: 0 },
      ]);
      const completed1 = executor.addChunk(chunk1);
      expect(completed1).toEqual([]);
      expect(executor.getCallCount()).toBe(1);

      // Second chunk: complete with id
      const chunk2 = makeChunk([
        { id: 'call_1', name: 'read_file', index: 0 },
      ]);
      const completed2 = executor.addChunk(chunk2);
      expect(completed2).toEqual([0]);
    });

    it('should handle multiple tool calls in one chunk', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());

      const chunk = makeChunk([
        { id: 'call_1', name: 'read_file', args: { path: '/a.txt' }, index: 0 },
        { id: 'call_2', name: 'web_search', args: { query: 'test' }, index: 1 },
      ]);

      const completed = executor.addChunk(chunk);
      expect(completed).toEqual([0, 1]);
      expect(executor.getCallCount()).toBe(2);
    });

    it('should return empty array for chunks without tool calls', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());

      const chunk = new AIMessageChunk({ content: 'Hello' });
      const completed = executor.addChunk(chunk);
      expect(completed).toEqual([]);
    });
  });

  describe('allComplete', () => {
    it('should return true when all calls are complete', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());
      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
      ]));
      expect(executor.allComplete()).toBe(true);
    });

    it('should return false when calls are incomplete', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());
      executor.addChunk(makeChunk([
        { name: 'read_file', args: {}, index: 0 },
      ]));
      expect(executor.allComplete()).toBe(false);
    });

    it('should return true when no calls exist', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());
      expect(executor.allComplete()).toBe(true);
    });
  });

  describe('getCompletedCalls', () => {
    it('should return calls in order', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());
      executor.addChunk(makeChunk([
        { id: 'call_2', name: 'web_search', args: {}, index: 1 },
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
      ]));

      const calls = executor.getCompletedCalls();
      expect(calls.length).toBe(2);
      expect(calls[0].index).toBe(0);
      expect(calls[1].index).toBe(1);
    });
  });

  describe('buildToolCalls', () => {
    it('should build LangChain-compatible ToolCall array', () => {
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), makeExecuteFn());
      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: { path: '/test.txt' }, index: 0 },
      ]));

      const toolCalls = executor.buildToolCalls();
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0]).toEqual({
        id: 'call_1',
        name: 'read_file',
        args: { path: '/test.txt' },
      });
    });
  });

  describe('executeAll', () => {
    it('should execute concurrent-safe tools in parallel', async () => {
      const executeFn = makeExecuteFn();
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: { path: '/a.txt' }, index: 0 },
        { id: 'call_2', name: 'web_search', args: { query: 'test' }, index: 1 },
      ]));

      const results = await executor.executeAll();
      expect(results.length).toBe(2);
      expect(executeFn).toHaveBeenCalledTimes(2);
    });

    it('should execute non-concurrent tools sequentially', async () => {
      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (toolName: string) => {
        executionOrder.push(toolName);
        return { result: `Result from ${toolName}`, duration: 10 };
      });

      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'write_file', args: { path: '/a.txt' }, index: 0 },
        { id: 'call_2', name: 'edit_file', args: { path: '/b.txt' }, index: 1 },
      ]));

      const results = await executor.executeAll();
      expect(results.length).toBe(2);
      expect(executionOrder).toEqual(['write_file', 'edit_file']);
    });

    it('should mix concurrent and serial execution', async () => {
      const executeFn = makeExecuteFn();
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
        { id: 'call_2', name: 'write_file', args: {}, index: 1 },
      ]));

      const results = await executor.executeAll();
      expect(results.length).toBe(2);
      // Results sorted by index
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
    });

    it('should handle execution errors', async () => {
      const executeFn = vi.fn(async (toolName: string) => {
        throw new Error('Tool execution failed');
      });

      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
      ]));

      const results = await executor.executeAll();
      expect(results.length).toBe(1);
      expect(results[0].error).toBe('Tool execution failed');
      expect(results[0].result).toContain('Error:');
    });

    it('should not re-execute already started tools', async () => {
      const executeFn = makeExecuteFn();
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
      ]));

      // Execute twice
      await executor.executeAll();
      await executor.executeAll();

      // Should only have been called once
      expect(executeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('finalize', () => {
    it('should complete incomplete calls and execute all', async () => {
      const executeFn = makeExecuteFn();
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      // Add incomplete call
      executor.addChunk(makeChunk([
        { name: 'read_file', args: { path: '/test.txt' }, index: 0 },
      ]));

      expect(executor.allComplete()).toBe(false);

      // Finalize with completion chunk
      const results = await executor.finalize(makeChunk([
        { id: 'call_1', name: 'read_file', index: 0 },
      ]));

      expect(results.length).toBe(1);
      expect(executor.allComplete()).toBe(true);
    });

    it('should force-complete calls without final chunk', async () => {
      const executeFn = makeExecuteFn();
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { name: 'read_file', args: { path: '/test.txt' }, index: 0 },
      ]));

      const results = await executor.finalize();
      expect(results.length).toBe(1);
    });
  });

  describe('getConcurrentSafePromises', () => {
    it('should only return promises for concurrent-safe tools', async () => {
      const executeFn = makeExecuteFn();
      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);

      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
        { id: 'call_2', name: 'write_file', args: {}, index: 1 },
      ]));

      const promises = executor.getConcurrentSafePromises();
      expect(promises.length).toBe(1); // Only read_file

      // Await the promises
      const results = await Promise.all(promises);
      expect(results.length).toBe(1);
      expect(results[0].toolName).toBe('read_file');
    });
  });

  describe('StreamingToolResult', () => {
    it('should include duration in results', async () => {
      const executeFn = vi.fn(async () => ({
        result: 'done',
        duration: 42,
      }));

      const executor = new StreamingToolExecutor(makeConcurrencyMap(), executeFn);
      executor.addChunk(makeChunk([
        { id: 'call_1', name: 'read_file', args: {}, index: 0 },
      ]));

      const results = await executor.executeAll();
      expect(results[0].duration).toBeGreaterThanOrEqual(0);
    });
  });
});
