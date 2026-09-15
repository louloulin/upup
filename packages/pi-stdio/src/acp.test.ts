import { describe, expect, test } from 'bun:test';
import {
  ACP_TO_UPUP_METHOD,
  ACP_PROTOCOL_VERSION,
  AcpMethod,
  buildAcpInitializeResult,
  classifyToolKind,
  isAcpExclusiveMethod,
  isAcpMethod,
  mapAcpMethodToUpup,
  mapUpupEventToAcpUpdate,
  resolveAcpStopReason,
  translateAcpPromptParams,
  translateAcpNewSessionParams,
  UPUP_TO_ACP_METHOD,
} from './acp';

describe('@upup/pi-stdio — ACP method mapping', () => {
  test('maps ACP session/new to UpUp session/create', () => {
    expect(mapAcpMethodToUpup('session/new')).toBe('session/create');
  });

  test('maps ACP session/load to UpUp session/resume', () => {
    expect(mapAcpMethodToUpup('session/load')).toBe('session/resume');
  });

  test('maps ACP session/prompt to UpUp stream (not run) so chunks flow', () => {
    expect(mapAcpMethodToUpup('session/prompt')).toBe('stream');
  });

  test('maps ACP session/cancel to UpUp cancel', () => {
    expect(mapAcpMethodToUpup('session/cancel')).toBe('cancel');
  });

  test('maps ACP initialize to UpUp initialize', () => {
    expect(mapAcpMethodToUpup('initialize')).toBe('initialize');
  });

  test('isAcpMethod returns false for UpUp-native method names', () => {
    expect(isAcpMethod('session/create')).toBe(false);
    expect(isAcpMethod('stream')).toBe(false);
    expect(isAcpMethod('session/new')).toBe(true);
  });

  test('isAcpExclusiveMethod excludes initialize (both protocols define it)', () => {
    expect(isAcpExclusiveMethod('initialize')).toBe(false);
    expect(isAcpExclusiveMethod('session/new')).toBe(true);
    expect(isAcpExclusiveMethod('session/load')).toBe(true);
    expect(isAcpExclusiveMethod('session/prompt')).toBe(true);
    expect(isAcpExclusiveMethod('session/cancel')).toBe(true);
  });

  test('isAcpExclusiveMethod rejects UpUp-native names', () => {
    expect(isAcpExclusiveMethod('session/create')).toBe(false);
    expect(isAcpExclusiveMethod('stream')).toBe(false);
    expect(isAcpExclusiveMethod('run')).toBe(false);
  });

  test('reverse table has no duplicate UpUp targets', () => {
    const seen = new Set<string>();
    for (const upup of Object.values(ACP_TO_UPUP_METHOD)) {
      expect(seen.has(upup)).toBe(false);
      seen.add(upup);
    }
    expect(Object.keys(UPUP_TO_ACP_METHOD).length).toBe(seen.size);
  });

  test('all AcpMethod values are recognised by isAcpMethod', () => {
    for (const value of Object.values(AcpMethod)) {
      expect(typeof value).toBe('string');
    }
    // authenticate / session/set_mode have no UpUp equivalent and are intentionally
    // absent from ACP_TO_UPUP_METHOD; the server rejects them with MethodNotFound.
    expect(isAcpMethod(AcpMethod.Authenticate)).toBe(false);
    expect(isAcpMethod(AcpMethod.SetSessionMode)).toBe(false);
  });

  test('methods without a UpUp equivalent are documented as unmapped', () => {
    const unmapped = Object.values(AcpMethod).filter((value) => !isAcpMethod(value));
    expect(new Set(unmapped)).toEqual(new Set([AcpMethod.Authenticate, AcpMethod.SetSessionMode]));
  });
});

describe('@upup/pi-stdio — ACP tool kind classification', () => {
  test('read-like tools map to read', () => {
    expect(classifyToolKind('read_file')).toBe('read');
    expect(classifyToolKind('cat')).toBe('read');
    expect(classifyToolKind('list_dir')).toBe('read');
  });

  test('write-like tools map to edit', () => {
    expect(classifyToolKind('write_file')).toBe('edit');
    expect(classifyToolKind('edit_file')).toBe('edit');
    expect(classifyToolKind('apply_patch')).toBe('edit');
  });

  test('shell tools map to execute', () => {
    expect(classifyToolKind('bash')).toBe('execute');
    expect(classifyToolKind('run_command')).toBe('execute');
    expect(classifyToolKind('terminal')).toBe('execute');
  });

  test('search tools map to search', () => {
    expect(classifyToolKind('grep')).toBe('search');
    expect(classifyToolKind('web_search')).toBe('search');
  });

  test('fetch tools map to fetch', () => {
    expect(classifyToolKind('fetch_url')).toBe('fetch');
    expect(classifyToolKind('browse')).toBe('fetch');
  });

  test('unknown tools fall back to other', () => {
    expect(classifyToolKind('invest_workflow')).toBe('other');
    expect(classifyToolKind('')).toBe('other');
  });
});

describe('@upup/pi-stdio — UpUp event → ACP session/update', () => {
  test('thinking → agent_thought_chunk', () => {
    const update = mapUpupEventToAcpUpdate({ type: 'thinking', message: 'analyzing...' });
    expect(update).toEqual({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'analyzing...' },
    });
  });

  test('empty thinking produces no update', () => {
    expect(mapUpupEventToAcpUpdate({ type: 'thinking', message: '' })).toBeUndefined();
  });

  test('stream_progress with text → agent_message_chunk', () => {
    const update = mapUpupEventToAcpUpdate({ type: 'stream_progress', textContent: 'hello' });
    expect(update).toEqual({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'hello' },
    });
  });

  test('tool_start → tool_call with kind + in_progress', () => {
    const update = mapUpupEventToAcpUpdate({
      type: 'tool_start',
      tool: 'bash',
      args: { cmd: 'ls' },
      toolCallId: 't1',
    });
    expect(update).toMatchObject({
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'bash',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { cmd: 'ls' },
    });
  });

  test('tool_progress → tool_call_update with content chunk', () => {
    const update = mapUpupEventToAcpUpdate({ type: 'tool_progress', tool: 'bash', toolCallId: 't1', message: 'running' });
    expect(update).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'in_progress',
      content: [{ type: 'text', text: 'running' }],
    });
  });

  test('tool_end → tool_call_update completed with rawOutput', () => {
    const update = mapUpupEventToAcpUpdate({ type: 'tool_end', tool: 'bash', toolCallId: 't1', result: 'ok' });
    expect(update).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      rawOutput: 'ok',
    });
  });

  test('tool_error → tool_call_update failed', () => {
    const update = mapUpupEventToAcpUpdate({ type: 'tool_error', tool: 'bash', toolCallId: 't1', error: 'boom' });
    expect(update).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'failed',
      content: [{ type: 'text', text: 'boom' }],
    });
  });

  test('done → agent_message_chunk', () => {
    const update = mapUpupEventToAcpUpdate({ type: 'done', answer: 'final answer' });
    expect(update).toEqual({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'final answer' },
    });
  });

  test('unmapped events return undefined', () => {
    expect(mapUpupEventToAcpUpdate({ type: 'compaction' })).toBeUndefined();
    expect(mapUpupEventToAcpUpdate({ type: 'memory_recalled' })).toBeUndefined();
    expect(mapUpupEventToAcpUpdate({ type: 'queue_drain' })).toBeUndefined();
  });
});

describe('@upup/pi-stdio — ACP stop reason', () => {
  test('undefined final event → end_turn', () => {
    expect(resolveAcpStopReason(undefined)).toBe('end_turn');
  });

  test('cancelled event → cancelled', () => {
    expect(resolveAcpStopReason({ type: 'cancelled' })).toBe('cancelled');
  });

  test('tool_limit → max_turn_requests', () => {
    expect(resolveAcpStopReason({ type: 'tool_limit' })).toBe('max_turn_requests');
  });

  test('done → end_turn', () => {
    expect(resolveAcpStopReason({ type: 'done' })).toBe('end_turn');
  });
});

describe('@upup/pi-stdio — ACP capability negotiation', () => {
  test('initialize result exposes loadSession and promptCapabilities', () => {
    const result = buildAcpInitializeResult();
    expect(result.protocolVersion).toBe(ACP_PROTOCOL_VERSION);
    expect(result.agentCapabilities.loadSession).toBe(true);
    expect(result.agentCapabilities.promptCapabilities.embeddedContext).toBe(true);
  });

  test('supportsImages flag is forwarded', () => {
    expect(buildAcpInitializeResult({ supportsImages: true }).agentCapabilities.promptCapabilities.image).toBe(true);
    expect(buildAcpInitializeResult().agentCapabilities.promptCapabilities.image).toBe(false);
  });

  test('authMethods default to empty', () => {
    expect(buildAcpInitializeResult().authMethods).toEqual([]);
    const withAuth = buildAcpInitializeResult({ authMethods: [{ id: 'openai', name: 'OpenAI' }] });
    expect(withAuth.authMethods).toHaveLength(1);
  });
});

describe('@upup/pi-stdio — ACP prompt param translation', () => {
  test('string prompt passes through', () => {
    const result = translateAcpPromptParams({ prompt: 'hello', sessionId: 's1', model: 'gpt' });
    expect(result).toEqual({ prompt: 'hello', sessionId: 's1', model: 'gpt' });
  });

  test('content block array is joined with newlines', () => {
    const result = translateAcpPromptParams({
      prompt: [{ type: 'text', text: 'line1' }, { type: 'text', text: 'line2' }],
    });
    expect(result.prompt).toBe('line1\nline2');
  });

  test('missing params yields empty prompt', () => {
    expect(translateAcpPromptParams(undefined)).toEqual({ prompt: '' });
    expect(translateAcpPromptParams({})).toEqual({ prompt: '' });
  });

  test('non-text content blocks are dropped', () => {
    const result = translateAcpPromptParams({ prompt: [{ type: 'image', data: 'x' }, { type: 'text', text: 'keep' }] });
    expect(result.prompt).toBe('keep');
  });
});

describe('@upup/pi-stdio — ACP translateAcpNewSessionParams', () => {
  test('returns empty object for undefined params', () => {
    expect(translateAcpNewSessionParams(undefined)).toEqual({});
  });

  test('returns empty object for empty params', () => {
    expect(translateAcpNewSessionParams({})).toEqual({});
  });

  test('extracts cwd at the top level (ACP shape)', () => {
    expect(translateAcpNewSessionParams({ cwd: '/tmp/isolated', mcpServers: [] })).toEqual({
      cwd: '/tmp/isolated',
      mcpServers: [],
    });
  });

  test('drops mcpServers when not an array', () => {
    const out = translateAcpNewSessionParams({ cwd: '/x', mcpServers: 'oops' });
    expect(out.cwd).toBe('/x');
    expect(out.mcpServers).toBeUndefined();
  });

  test('drops cwd when not a string', () => {
    const out = translateAcpNewSessionParams({ cwd: 42 });
    expect(out.cwd).toBeUndefined();
  });
});
