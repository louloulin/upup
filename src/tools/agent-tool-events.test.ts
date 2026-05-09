/**
 * Tests for AgentTool event forwarding and SubagentRunner event callback
 */

import { describe, it, expect } from 'bun:test';
import { formatSubagentEvent } from './agent-tool.js';
import type { AgentEvent } from '../agent/types.js';

describe('formatSubagentEvent', () => {
  it('formats thinking events', () => {
    const event = { type: 'thinking', message: 'Analyzing the data' } as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result).toContain('thinking:');
    expect(result).toContain('Analyzing');
  });

  it('truncates long thinking messages', () => {
    const longMsg = 'A'.repeat(200);
    const event = { type: 'thinking', message: longMsg } as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result.length).toBeLessThan(100);
  });

  it('formats tool_start events', () => {
    const event = { type: 'tool_start', tool: 'read_file', args: { path: '/test.txt' } } as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result).toContain('read_file');
    expect(result).toContain('→');
  });

  it('formats tool_end events with duration', () => {
    const event = {
      type: 'tool_end',
      tool: 'web_search',
      args: {},
      result: 'Found 10 results',
      duration: 2500,
    } as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result).toContain('web_search');
    expect(result).toContain('2500ms');
    expect(result).toContain('Found 10');
  });

  it('formats tool_error events', () => {
    const event = {
      type: 'tool_error',
      tool: 'write_file',
      error: 'Permission denied',
    } as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result).toContain('write_file');
    expect(result).toContain('Permission denied');
  });

  it('returns empty for stream_progress', () => {
    const event = { type: 'stream_progress', charDelta: 5, mode: 'responding' as const } as AgentEvent;
    expect(formatSubagentEvent(event)).toBe('');
  });

  it('returns empty for done events', () => {
    const event = { type: 'done', answer: 'done' } as AgentEvent;
    expect(formatSubagentEvent(event)).toBe('');
  });

  it('formats compaction end events', () => {
    const event = {
      type: 'compaction',
      phase: 'end',
      success: true,
      preCompactTokens: 10000,
      postCompactTokens: 5000,
    } as AgentEvent;
    expect(formatSubagentEvent(event)).toContain('compacted');
  });

  it('returns empty for compaction start events', () => {
    const event = {
      type: 'compaction',
      phase: 'start',
    } as AgentEvent;
    expect(formatSubagentEvent(event)).toBe('');
  });

  it('returns empty for unknown event types', () => {
    const event = { type: 'memory_flush', phase: 'start' } as AgentEvent;
    expect(formatSubagentEvent(event)).toBe('');
  });

  it('formats tool_end events without duration', () => {
    const event = {
      type: 'tool_end',
      tool: 'read_file',
      args: {},
      result: 'file contents here',
    } as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result).toContain('read_file');
    expect(result).toContain('file contents');
    expect(result).not.toContain('ms');
  });

  it('formats tool_end events with non-string result', () => {
    const event = {
      type: 'tool_end',
      tool: 'calculator',
      args: {},
      result: { answer: 42 },
      duration: 100,
    } as unknown as AgentEvent;
    const result = formatSubagentEvent(event);
    expect(result).toContain('calculator');
    expect(result).toContain('100ms');
  });
});
