import { describe, expect, test } from 'bun:test';

import {
  ACP_PROTOCOL_VERSION,
  AcpMethod,
  buildAcpInitializeResult,
  classifyToolKind,
  isAcpExclusiveMethod,
  isAcpMethod,
  mapUpUpEventToAcpUpdate,
  resolveAcpStopReason,
  translateAcpNewSessionParams,
  translateAcpPromptParams,
} from './translate';

describe('ACP method surface', () => {
  test('recognises ACP methods and rejects Pi RPC command types', () => {
    for (const method of Object.values(AcpMethod)) {
      expect(isAcpMethod(method)).toBe(true);
    }
    // Pi's own RPC surface uses `type`, not `method`; these must not be
    // mistaken for ACP methods, and vice versa.
    for (const type of ['prompt', 'new_session', 'get_state', 'bash']) {
      expect(isAcpMethod(type)).toBe(false);
    }
  });

  test('only ACP-exclusive methods can auto-detect an ACP client', () => {
    expect(isAcpExclusiveMethod('session/new')).toBe(true);
    expect(isAcpExclusiveMethod('session/prompt')).toBe(true);
    // `initialize` exists in both protocols with different result shapes, so
    // it cannot discriminate.
    expect(isAcpExclusiveMethod('initialize')).toBe(false);
  });

  test('initialize advertises the protocol version editor hosts negotiate on', () => {
    const result = buildAcpInitializeResult();
    expect(result.protocolVersion).toBe(ACP_PROTOCOL_VERSION);
    expect(result.agentCapabilities.loadSession).toBe(true);
    expect(result.authMethods).toEqual([]);
  });
});

describe('ACP prompt translation', () => {
  test('flattens a content-block prompt into text', () => {
    const { prompt } = translateAcpPromptParams({
      sessionId: 's1',
      prompt: [{ type: 'text', text: '分析' }, { type: 'text', text: '600519.SH' }],
    });
    expect(prompt).toBe('分析\n600519.SH');
  });

  test('accepts a bare string prompt', () => {
    expect(translateAcpPromptParams({ prompt: 'hello' }).prompt).toBe('hello');
  });

  test('carries sessionId and model through, and omits them when absent', () => {
    const full = translateAcpPromptParams({ prompt: 'x', sessionId: 's1', model: 'gpt-5.4' });
    expect(full).toEqual({ prompt: 'x', sessionId: 's1', model: 'gpt-5.4' });
    // `undefined` keys would serialise as nulls and confuse strict hosts.
    expect(Object.keys(translateAcpPromptParams({ prompt: 'x' }))).toEqual(['prompt']);
  });

  test('yields an empty prompt for malformed input rather than throwing', () => {
    expect(translateAcpPromptParams(undefined).prompt).toBe('');
    expect(translateAcpPromptParams({ prompt: 42 }).prompt).toBe('');
    expect(translateAcpPromptParams({ prompt: [{ notText: 1 }] }).prompt).toBe('');
  });
});

describe('ACP session/new translation', () => {
  test('hoists cwd to the top level and keeps mcpServers', () => {
    expect(translateAcpNewSessionParams({ cwd: '/repo', mcpServers: [{ name: 'x' }] }))
      .toEqual({ cwd: '/repo', mcpServers: [{ name: 'x' }] });
  });

  test('omits keys the client did not send', () => {
    expect(translateAcpNewSessionParams(undefined)).toEqual({});
    expect(translateAcpNewSessionParams({})).toEqual({});
  });
});

describe('ACP session updates', () => {
  test('maps thinking to a thought chunk', () => {
    expect(mapUpUpEventToAcpUpdate({ type: 'thinking', text: 'considering' }))
      .toEqual({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'considering' } });
  });

  test('maps text deltas to message chunks', () => {
    expect(mapUpUpEventToAcpUpdate({ type: 'text_delta', delta: '贵州' }))
      .toEqual({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '贵州' } });
  });

  test('maps a full tool lifecycle: start → update → end/failure', () => {
    expect(mapUpUpEventToAcpUpdate({
      type: 'tool_start', toolName: 'financial_search', toolCallId: 't1', input: { ticker: '600519.SH' },
    })).toEqual({
      sessionUpdate: 'tool_call', toolCallId: 't1', title: 'financial_search',
      kind: 'search', status: 'in_progress', rawInput: { ticker: '600519.SH' },
    });

    expect(mapUpUpEventToAcpUpdate({
      type: 'tool_update', toolName: 'financial_search', toolCallId: 't1', text: 'fetching',
    })).toEqual({
      sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'in_progress',
      content: [{ type: 'text', text: 'fetching' }],
    });

    expect(mapUpUpEventToAcpUpdate({
      type: 'tool_end', toolName: 'financial_search', toolCallId: 't1',
    })).toEqual({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });

    expect(mapUpUpEventToAcpUpdate({
      type: 'tool_end', toolName: 'financial_search', toolCallId: 't1', error: 'boom',
    })).toEqual({
      sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'failed',
      content: [{ type: 'text', text: 'boom' }],
    });
  });

  test('drops lifecycle events ACP has no equivalent for', () => {
    for (const type of ['session_start', 'turn_start', 'turn_end', 'agent_end', 'compaction_start']) {
      expect(mapUpUpEventToAcpUpdate({ type })).toBeUndefined();
    }
  });

  test('does not emit an empty chunk', () => {
    expect(mapUpUpEventToAcpUpdate({ type: 'text_delta', delta: '' })).toBeUndefined();
    expect(mapUpUpEventToAcpUpdate({ type: 'thinking', text: '' })).toBeUndefined();
  });

  test('classifies tool kinds for the editor UI', () => {
    expect(classifyToolKind('read_file')).toBe('read');
    expect(classifyToolKind('write_file')).toBe('edit');
    expect(classifyToolKind('bash')).toBe('execute');
    expect(classifyToolKind('financial_search')).toBe('search');
    expect(classifyToolKind('web_fetch')).toBe('fetch');
    expect(classifyToolKind('invest_workflow_phase')).toBe('other');
  });

  test('resolves stop reasons from the final event', () => {
    expect(resolveAcpStopReason(undefined)).toBe('end_turn');
    expect(resolveAcpStopReason({ type: 'run_end' })).toBe('end_turn');
    expect(resolveAcpStopReason({ type: 'session_error' })).toBe('refusal');
  });
});
