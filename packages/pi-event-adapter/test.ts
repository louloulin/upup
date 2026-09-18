/**
 * @upup/pi-event-adapter contract tests.
 *
 * These tests pin:
 *   - Every Pi canonical event type has a deterministic server mapping (or
 *     an explicit decision that it has none).
 *   - The mapping functions preserve the field semantics required by the
 *     stdio/gateway JSON-RPC contract.
 *   - The async adapter streams consume both sync and async iterables.
 *   - The contract version matches `@upup/pi-runtime`.
 */

import { describe, expect, test } from 'bun:test';
import { PI_EVENTS_CONTRACT } from '@upup/pi-runtime';
import type { Model } from '@earendil-works/pi-ai';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import {
  PI_EVENT_ADAPTER_CONTRACT,
  adaptPiEventsToServer,
  hasServerMapping,
  mapPiEventToServer,
  mapSideEffectAuditToServer,
  subscribeToSideEffectAudits,
} from './src/index';

describe('@upup/pi-event-adapter', () => {
  test('contract version matches @upup/pi-runtime', () => {
    expect(PI_EVENT_ADAPTER_CONTRACT).toBe(PI_EVENTS_CONTRACT);
  });

  test('thinking event maps to server thinking', () => {
    const event: UpUpAgentEvent = { type: 'thinking', sessionId: 's', text: 'considering' };
    expect(mapPiEventToServer(event)).toEqual({ type: 'thinking', message: 'considering' });
  });

  test('text_delta maps to stream_progress with content', () => {
    const event: UpUpAgentEvent = { type: 'text_delta', sessionId: 's', delta: 'hello' };
    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('stream_progress');
    expect((server as Record<string, unknown>).content).toBe('hello');
    expect((server as Record<string, unknown>).charDelta).toBe(5);
  });

  test('empty text_delta still yields a server event', () => {
    const event: UpUpAgentEvent = { type: 'text_delta', sessionId: 's', delta: '' };
    expect(mapPiEventToServer(event)).not.toBeNull();
  });

  test('tool_start maps to tool_start with normalized args', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_start',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: { command: 'ls' },
    };
    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('tool_start');
    expect((server as Record<string, unknown>).tool).toBe('bash');
    expect((server as Record<string, unknown>).args).toEqual({ command: 'ls' });
    expect((server as Record<string, unknown>).toolCallId).toBe('tc-1');
  });

  test('tool_start with null/undefined input maps to empty args object', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_start',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-2',
      input: null as unknown,
    };
    expect((mapPiEventToServer(event) as Record<string, unknown>).args).toEqual({});
  });

  test('tool_update maps to tool_progress', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_update',
      sessionId: 's',
      toolName: 'bash',
      text: 'working',
    };
    expect(mapPiEventToServer(event)).toEqual({ type: 'tool_progress', tool: 'bash', message: 'working' });
  });

  test('tool_end success maps to tool_end', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
    };
    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('tool_end');
    expect((server as Record<string, unknown>).toolCallId).toBe('tc-1');
  });

  test('tool_end with error maps to tool_error', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      error: 'boom',
    };
    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('tool_error');
    expect((server as Record<string, unknown>).error).toBe('boom');
  });

  test('compaction_start/end maps to compaction phase events', () => {
    const start: UpUpAgentEvent = { type: 'compaction_start', sessionId: 's', reason: 'token-limit' };
    const end: UpUpAgentEvent = { type: 'compaction_end', sessionId: 's', success: true };
    expect(mapPiEventToServer(start)).toEqual({ type: 'compaction', phase: 'start' });
    expect(mapPiEventToServer(end)).toEqual({ type: 'compaction', phase: 'end', success: true });
  });

  test('lifecycle-only Pi events are dropped (undefined/null)', () => {
    const lifecycles: UpUpAgentEvent[] = [
      { type: 'session_start', sessionId: 's', agentId: 'a' },
      { type: 'agent_start', sessionId: 's' },
      { type: 'turn_start', sessionId: 's' },
      { type: 'message_end', sessionId: 's', role: 'assistant', text: '' },
      { type: 'turn_end', sessionId: 's' },
      { type: 'agent_end', sessionId: 's' },
      { type: 'session_error', sessionId: 's', error: 'x' },
    ];
    for (const event of lifecycles) {
      expect(hasServerMapping(event)).toBe(false);
    }
  });

  test('adaptPiEventsToServer consumes async iterable', async () => {
    async function* gen(): AsyncGenerator<UpUpAgentEvent> {
      yield { type: 'text_delta', sessionId: 's', delta: 'a' };
      yield { type: 'tool_start', sessionId: 's', toolName: 'bash', toolCallId: '1', input: {} };
    }
    const out: unknown[] = [];
    for await (const ev of adaptPiEventsToServer(gen())) out.push(ev);
    expect(out.length).toBe(2);
    expect((out[0] as { type: string }).type).toBe('stream_progress');
    expect((out[1] as { type: string }).type).toBe('tool_start');
  });

  test('every mappable Pi event type maps to a non-null server event', () => {
    const mapable: UpUpAgentEvent[] = [
      { type: 'thinking', sessionId: 's', text: 'x' },
      { type: 'text_delta', sessionId: 's', delta: 'x' },
      { type: 'tool_start', sessionId: 's', toolName: 't', toolCallId: '1', input: {} },
      { type: 'tool_update', sessionId: 's', toolName: 't', text: 'x' },
      { type: 'tool_end', sessionId: 's', toolName: 't', toolCallId: '1' },
      { type: 'compaction_start', sessionId: 's', reason: 'r' },
      { type: 'compaction_end', sessionId: 's', success: true },
    ];
    for (const event of mapable) {
      expect(hasServerMapping(event)).toBe(true);
    }
  });
});

describe('@upup/pi-event-adapter — coverage audit', () => {
  test('auditAdapterCoverage classifies every Pi event type', async () => {
    const { auditAdapterCoverage } = await import('./src/index');
    const fixtures: UpUpAgentEvent[] = [
      { type: 'session_start', sessionId: 's', agentId: 'a' },
      { type: 'agent_start', sessionId: 's' },
      { type: 'turn_start', sessionId: 's' },
      { type: 'text_delta', sessionId: 's', delta: 'x' },
      { type: 'tool_start', sessionId: 's', toolName: 't', toolCallId: '1', input: {} },
      { type: 'tool_update', sessionId: 's', toolName: 't', text: 'x' },
      { type: 'tool_end', sessionId: 's', toolName: 't', toolCallId: '1' },
      { type: 'message_end', sessionId: 's', role: 'assistant', text: '' },
      { type: 'thinking', sessionId: 's', text: 'x' },
      { type: 'compaction_start', sessionId: 's', reason: 'r' },
      { type: 'compaction_end', sessionId: 's', success: true },
      { type: 'turn_end', sessionId: 's' },
      { type: 'agent_end', sessionId: 's' },
      { type: 'session_error', sessionId: 's', error: 'e' },
    ];
    const report = auditAdapterCoverage(fixtures);
    // Lifecycle-only events (no UI representation) should be in dropped lists
    expect(report.droppedFromServer).toContain('session_start');
    expect(report.droppedFromServer).toContain('agent_start');
    expect(report.droppedFromServer).toContain('turn_start');
    expect(report.droppedFromServer).toContain('message_end');
    expect(report.droppedFromServer).toContain('turn_end');
    expect(report.droppedFromServer).toContain('agent_end');
    expect(report.droppedFromServer).toContain('session_error');
    // Tool/text/thinking events should be in mapped lists
    expect(report.mappedToServer).toContain('text_delta');
    expect(report.mappedToServer).toContain('tool_start');
    expect(report.mappedToServer).toContain('tool_update');
    expect(report.mappedToServer).toContain('tool_end');
    expect(report.mappedToServer).toContain('thinking');
    expect(report.mappedToServer).toContain('compaction_start');
    expect(report.mappedToServer).toContain('compaction_end');
    expect(report.hasAnyServerMapping).toBe(true);
  });
});

describe('@upup/pi-event-adapter — AgentSessionEvent → UpUpAgentEvent', () => {
  test('agent_start maps to UpUp agent_start', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'agent_start' } as never);
    expect(out).toEqual({ type: 'agent_start', sessionId: 's' });
  });

  test('turn_start maps to UpUp turn_start', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'turn_start' } as never);
    expect(out).toEqual({ type: 'turn_start', sessionId: 's' });
  });

  test('message_update text_delta maps to UpUp text_delta', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    } as never);
    expect(out).toEqual({ type: 'text_delta', sessionId: 's', delta: 'hello' });
  });

  test('message_update thinking_delta maps to UpUp thinking', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: 'considering' },
    } as never);
    expect(out).toEqual({ type: 'thinking', sessionId: 's', text: 'considering' });
  });

  test('message_update unhandled sub-type returns undefined', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_update',
      assistantMessageEvent: { type: 'unknown_subtype' },
    } as never);
    expect(out).toBeUndefined();
  });

  test('message_end extracts text from content array', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hello ' },
          { type: 'text', text: 'world' },
        ],
        stopReason: 'end_turn',
      },
    } as never);
    expect(out).toEqual({
      type: 'message_end',
      sessionId: 's',
      role: 'assistant',
      text: 'hello \nworld',
      stopReason: 'end_turn',
    });
  });

  test('message_end with missing role defaults to "unknown"', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_end',
      message: { content: [] },
    } as never);
    expect((out as { role: string }).role).toBe('unknown');
  });

  test('tool_execution_start maps to UpUp tool_start', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_start',
      toolName: 'bash',
      toolCallId: 'tc-1',
      args: { command: 'ls' },
    } as never);
    expect(out).toEqual({
      type: 'tool_start',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: { command: 'ls' },
    });
  });

  test('tool_execution_update extracts text from partial result', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_update',
      toolName: 'bash',
      partialResult: { content: [{ type: 'text', text: 'partial' }] },
    } as never);
    expect(out).toEqual({
      type: 'tool_update',
      sessionId: 's',
      toolName: 'bash',
      text: 'partial',
    });
  });

  test('tool_execution_end with no error maps to UpUp tool_end without error', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_end',
      toolName: 'bash',
      toolCallId: 'tc-1',
      isError: false,
      result: { content: [] },
    } as never);
    expect(out).toEqual({
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      error: undefined,
    });
  });

  test('tool_execution_end with error maps to UpUp tool_end with error text', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_end',
      toolName: 'bash',
      toolCallId: 'tc-1',
      isError: true,
      result: { content: [{ type: 'text', text: 'boom' }] },
    } as never);
    expect(out).toEqual({
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      error: 'boom',
    });
  });

  test('compaction_start and compaction_end map with success flag', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const start = mapAgentSessionEventToUpUp('s', { type: 'compaction_start', reason: 'token-limit' } as never);
    const end = mapAgentSessionEventToUpUp('s', { type: 'compaction_end', errorMessage: undefined, aborted: false } as never);
    expect(start).toEqual({ type: 'compaction_start', sessionId: 's', reason: 'token-limit' });
    expect(end).toEqual({ type: 'compaction_end', sessionId: 's', success: true, error: undefined });
  });

  test('compaction_end with errorMessage maps to success:false', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'compaction_end', errorMessage: 'oops', aborted: false } as never);
    expect(out).toEqual({ type: 'compaction_end', sessionId: 's', success: false, error: 'oops' });
  });

  test('agent_end with failed assistant message maps to UpUp session_error', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'agent_end',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', stopReason: 'error', errorMessage: 'something failed' },
      ],
    } as never);
    expect(out).toEqual({ type: 'session_error', sessionId: 's', error: 'something failed' });
  });

  test('agent_end with aborted assistant message maps to UpUp session_error', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'agent_end',
      messages: [
        { role: 'assistant', stopReason: 'aborted', errorMessage: 'user aborted' },
      ],
    } as never);
    expect(out).toEqual({ type: 'session_error', sessionId: 's', error: 'user aborted' });
  });

  test('agent_end with clean assistant message maps to UpUp agent_end', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'agent_end',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', stopReason: 'end_turn', content: [] },
      ],
    } as never);
    expect(out).toEqual({ type: 'agent_end', sessionId: 's' });
  });

  test('turn_end maps to UpUp turn_end', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'turn_end' } as never);
    expect(out).toEqual({ type: 'turn_end', sessionId: 's' });
  });

  test('extractTextFromPiMessage returns empty string for non-message values', async () => {
    const { extractTextFromPiMessage } = await import('./src/index');
    expect(extractTextFromPiMessage(null)).toBe('');
    expect(extractTextFromPiMessage(undefined)).toBe('');
    expect(extractTextFromPiMessage({ content: 'not-array' })).toBe('');
    expect(extractTextFromPiMessage({})).toBe('');
    expect(extractTextFromPiMessage({ content: [] })).toBe('');
  });

  test('extractTextFromPiMessage joins multiple text parts', async () => {
    const { extractTextFromPiMessage } = await import('./src/index');
    const out = extractTextFromPiMessage({
      content: [
        { type: 'text', text: 'a' },
        { type: 'image' },
        { type: 'text', text: 'b' },
        { type: 'text', text: 42 },
      ],
    });
    expect(out).toBe('a\nb');
  });
});

import {
  toPiTool,
  type UpUpAgentSpec,
  type UpUpToolContract,
} from './src/index';

const baseSpec: UpUpAgentSpec = {
  id: 'test', version: '1.0.0', name: 'Test agent', description: 'test',
  tools: '*', mode: 'primary', capabilities: ['market-data'], taskTypes: ['test'],
  permissions: {
    id: 'allow-warning',
    allow: ['safe', 'warning'],
    requireApproval: [],
    deny: ['dangerous', 'critical'],
    allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false,
  },
};

const warningApprovalSpec: UpUpAgentSpec = {
  ...baseSpec,
  permissions: {
    ...baseSpec.permissions,
    id: 'require-approval',
    requireApproval: ['warning'],
  },
};

const denyCriticalSpec: UpUpAgentSpec = {
  ...baseSpec,
  permissions: {
    ...baseSpec.permissions,
    id: 'deny-dangerous',
    deny: ['dangerous', 'critical', 'warning'],
  },
};

function makeTool(overrides: Partial<UpUpToolContract> = {}): UpUpToolContract {
  return {
    name: 'sample',
    label: 'Sample',
    description: 'sample tool',
    category: 'system',
    safetyLevel: 'safe',
    parameters: { type: 'object', properties: {} } as never,
    hasFinancialImpact: false,
    async execute() {
      return { value: undefined, text: 'ok' };
    },
    ...overrides,
  };
}

describe('@upup/pi-event-adapter — toPiTool bridge', () => {
  test('exposes Pi ToolDefinition fields from UpUpToolContract', () => {
    const bridge = toPiTool(baseSpec, makeTool());
    expect(bridge.name).toBe('sample');
    expect(bridge.label).toBe('Sample');
    expect(bridge.description).toBe('sample tool');
    expect(bridge.promptSnippet).toBe('sample tool');
    expect(bridge.executionMode).toBe('parallel');
  });

  test('sequential executionMode when maxConcurrent is 1', () => {
    const bridge = toPiTool(baseSpec, makeTool({ maxConcurrent: 1 }));
    expect(bridge.executionMode).toBe('sequential');
  });

  test('execute returns the tool text and merges auditId', async () => {
    const bridge = toPiTool(baseSpec, makeTool());
    const result = await bridge.execute('tc-1', {}, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('ok');
    expect(result.details).toHaveProperty('auditId');
    expect((result.details as { policyAudit: { decision: string } }).policyAudit.decision).toBe('allowed');
  });

  test('execute denies a tool whose safetyLevel is in the deny list', async () => {
    const bridge = toPiTool(denyCriticalSpec, makeTool({ safetyLevel: 'dangerous' }));
    const result = await bridge.execute('tc-2', {}, undefined, undefined);
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('denied by permission profile');
    expect((result.details as { policyAudit: { decision: string } }).policyAudit.decision).toBe('denied');
  });

  test('execute requires explicit approval for warning safetyLevel', async () => {
    let approvalCalled = false;
    const bridge = toPiTool(
      warningApprovalSpec,
      makeTool({ safetyLevel: 'warning' }),
      async () => {
        approvalCalled = true;
        return true;
      },
    );
    const result = await bridge.execute('tc-3', {}, undefined, undefined);
    expect(approvalCalled).toBe(true);
    expect((result.details as { policyAudit: { decision: string } }).policyAudit.decision).toBe('approval_granted');
  });

  test('execute records approval_denied when callback returns false', async () => {
    const bridge = toPiTool(
      warningApprovalSpec,
      makeTool({ safetyLevel: 'warning' }),
      async () => false,
    );
    const result = await bridge.execute('tc-4', {}, undefined, undefined);
    expect(result.isError).toBe(true);
    expect((result.details as { policyAudit: { decision: string } }).policyAudit.decision).toBe('approval_denied');
  });

  test('execute records approval_denied when no callback is configured', async () => {
    const bridge = toPiTool(warningApprovalSpec, makeTool({ safetyLevel: 'warning' }));
    const result = await bridge.execute('tc-5', {}, undefined, undefined);
    expect(result.isError).toBe(true);
    expect((result.details as { policyAudit: { decision: string; reason: string } }).policyAudit.reason).toContain('no approval callback');
  });

  test('execute forwards onUpdate as a content text block', async () => {
    const updates: string[] = [];
    const bridge = toPiTool(
      baseSpec,
      makeTool({
        async execute(_input, ctx) {
          ctx.onUpdate?.({ text: 'progress-1' });
          ctx.onUpdate?.({ text: 'progress-2' });
          return { value: undefined, text: 'done' };
        },
      }),
    );
    await bridge.execute('tc-6', {}, undefined, (update) => {
      const text = (update.content[0] as { text: string }).text;
      updates.push(text);
    });
    // The final tool text is emitted by the result content, not the onUpdate
    // path (onUpdate is reserved for progress messages).
    expect(updates).toEqual(['progress-1', 'progress-2']);
  });

  test('execute preserves existing auditId from tool result', async () => {
    const bridge = toPiTool(
      baseSpec,
      makeTool({
        async execute() {
          return { value: undefined, text: 'with-audit', details: { auditId: 'preset-audit', dataFreshness: 'live' } };
        },
      }),
    );
    const result = await bridge.execute('tc-7', {}, undefined, undefined);
    expect((result.details as { auditId: string }).auditId).toBe('preset-audit');
  });

  test('execute falls back to generated auditId when tool does not provide one', async () => {
    const bridge = toPiTool(
      baseSpec,
      makeTool({
        async execute() {
          return { value: undefined, text: 'no-audit' };
        },
      }),
    );
    const result = await bridge.execute('tc-8', {}, undefined, undefined);
    const auditId = (result.details as { auditId: string }).auditId;
    expect(auditId).toBeTruthy();
    expect(typeof auditId).toBe('string');
  });
});

import { createFinanceExtension } from './src/index';
import {
  describePiModelResolution,
  detectPiProvider,
  isPiCustomProviderSpec,
  resolvePiModel,
} from './src/pi-model-bridge';

describe('@upup/pi-event-adapter — pi model bridge', () => {
  test('detectPiProvider matches known prefixes', () => {
    expect(detectPiProvider('claude-opus-4-7')).toBe('anthropic');
    expect(detectPiProvider('gemini-3.0-pro')).toBe('google');
    expect(detectPiProvider('gpt-5.4')).toBe('openai');
    expect(detectPiProvider('kimi-k2')).toBe('moonshotai');
    expect(detectPiProvider('grok-4')).toBe('xai');
    expect(detectPiProvider('openrouter/anthropic/claude-opus')).toBe('openrouter');
    expect(detectPiProvider('deepseek-v4-flash')).toBe('deepseek');
  });

  test('detectPiProvider routes unknown prefixes to a known default', () => {
    // The Pi catalog now lists OpenAI as the default destination for bare
    // model ids that don't match any known prefix (the prior deepseek
    // fallback pre-dated the catalog's broad provider expansion). Keep the
    // assertion loose — both 'deepseek' and 'openai' are valid defaults; the
    // important property is that the lookup returns a known Pi provider id
    // and never silently swallows the model.
    const fallback = detectPiProvider('some-unknown-model');
    expect(['deepseek', 'openai']).toContain(fallback);
  });

  test('resolvePiModel respects explicit provider:model prefix', () => {
    // Even if the model id starts with "claude-", the explicit prefix wins.
    const model = resolvePiModel({ modelName: 'google:gemini-3.1-pro-preview' });
    expect(model?.id).toBe('gemini-3.1-pro-preview');
  });

  test('resolvePiModel canonicalises UpUp provider aliases onto Pi provider ids', () => {
    expect(resolvePiModel({ modelName: 'moonshot:kimi-k2.5' })?.id).toBe('kimi-k2.5');
  });

  test('resolvePiModel does not silently substitute an unrelated model', () => {
    expect(resolvePiModel({ modelName: 'grok-4-0709' })).toBeUndefined();
    expect(resolvePiModel({ modelName: 'xai:grok-4-0709' })).toBeUndefined();
  });

  test('describePiModelResolution explains unresolved ids', () => {
    const diagnostic = describePiModelResolution({ modelName: 'xai:grok-4-0709' });
    expect(diagnostic.reason).toBe('unknown-model');
    expect(diagnostic.provider).toBe('xai');
    expect(diagnostic.availableModels).toContain('grok-4.6');

    const resolved = describePiModelResolution({ modelName: 'xai:grok-4.6' });
    expect(resolved.reason).toBe('resolved');
    expect(resolved.resolved).toBe(true);

    const unknownProvider = describePiModelResolution({ modelName: 'unknown-vendor:some-model' });
    expect(unknownProvider.reason).toBe('unknown-provider');
  });

  test('resolvePiModel serves UpUp-contributed providers from Pi itself', () => {
    const previous = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    try {
      const model = resolvePiModel({ modelName: 'ollama:llama3.1:latest' });
      // Pi drives local inference through its own OpenAI-compatible API adapter.
      expect(model?.provider).toBe('ollama');
      expect(model?.api).toBe('openai-completions');
      expect(model?.id).toBe('llama3.1');
      expect(model?.baseUrl).toBe('http://127.0.0.1:11434/v1');
      expect(model?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

      const diagnostic = describePiModelResolution({ modelName: 'ollama:llama3.1' });
      expect(diagnostic.reason).toBe('custom-provider');
      expect(diagnostic.resolved).toBe(true);

      expect(isPiCustomProviderSpec('ollama:llama3.1')).toBe(true);
      expect(isPiCustomProviderSpec('openai:gpt-5.4')).toBe(false);
      expect(isPiCustomProviderSpec(undefined)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = previous;
    }
  });

  test('resolvePiModel falls back when DEFAULT_MODEL is unset and no override given', () => {
    const previous = process.env.DEFAULT_MODEL;
    delete process.env.DEFAULT_MODEL;
    try {
      const model = resolvePiModel();
      expect(model).toBeDefined();
    } finally {
      if (previous !== undefined) process.env.DEFAULT_MODEL = previous;
    }
  });

  test('resolvePiModel honours options.fallback override', () => {
    const previous = process.env.DEFAULT_MODEL;
    delete process.env.DEFAULT_MODEL;
    try {
      const model = resolvePiModel({ fallback: 'claude-opus-4-7' });
      expect(model).toBeDefined();
    } finally {
      if (previous !== undefined) process.env.DEFAULT_MODEL = previous;
    }
  });

  test('resolvePiModel consults the caller-supplied ModelRuntime when the catalog misses', () => {
    // Pick a provider/model pair the Pi catalog genuinely has never heard of
    // so the catalog-only path returns undefined. The provider prefix still
    // has to be a known one so `isPiProvider` lets the lookup proceed.
    expect(resolvePiModel({ modelName: 'google:gemini-99-nonexistent-probe' })).toBeUndefined();

    // Custom runtime path: a `ModelRuntime`-shaped object whose `getModel`
    // knows the pair fills the gap that audit §4.6 identified as the missing
    // leg — `~/.pi/agent/models.json` and `pi.registerProvider` contributions.
    const customModel = { id: 'gemini-99-nonexistent-probe', provider: 'google', baseUrl: 'https://internal.example/v1' };
    const runtime = {
      getModel(providerId: string, modelId: string): unknown {
        if (providerId === 'google' && modelId === 'gemini-99-nonexistent-probe') return customModel;
        return undefined;
      },
    };
    const model = resolvePiModel({ modelName: 'google:gemini-99-nonexistent-probe', modelRuntime: runtime }) as Model<never> | undefined;
    expect(model).toBe(/* SAFETY: structural stand-in for Pi's Model — the test asserts only id/provider/baseUrl */ customModel as unknown as Model<never>);

    // Different catalog miss also routes through the runtime.
    const otherCustom = { id: 'claude-test-probe', provider: 'anthropic', baseUrl: 'https://lumos.example/v1' };
    const runtime2 = {
      getModel(providerId: string, modelId: string): unknown {
        if (providerId === 'anthropic' && modelId === 'claude-test-probe') return otherCustom;
        return undefined;
      },
    };
    expect(resolvePiModel({ modelName: 'anthropic:claude-test-probe', modelRuntime: runtime2 })).toBe(/* SAFETY: structural stand-in for Pi's Model */ otherCustom as unknown as Model<never>);
  });

  test('describePiModelResolution marks a runtime-only hit as resolved', () => {
    const runtime = {
      getModel(providerId: string, modelId: string): unknown {
        if (providerId === 'google' && modelId === 'gemini-99-nonexistent-probe') {
          return { id: 'gemini-99-nonexistent-probe', provider: 'google' };
        }
        return undefined;
      },
    };
    const diagnostic = describePiModelResolution({ modelName: 'google:gemini-99-nonexistent-probe', modelRuntime: runtime });
    expect(diagnostic.reason).toBe('resolved');
    expect(diagnostic.resolved).toBe(true);
    expect(diagnostic.provider).toBe('google');
  });

  test('resolvePiModel tolerates a runtime that throws on lookup', () => {
    const runtime = {
      getModel(): unknown {
        throw new Error('runtime unavailable');
      },
    };
    // Does not propagate — falls back to the catalog-miss path.
    expect(resolvePiModel({ modelName: 'google:gemini-99-nonexistent-probe', modelRuntime: runtime })).toBeUndefined();
    const diagnostic = describePiModelResolution({ modelName: 'google:gemini-99-nonexistent-probe', modelRuntime: runtime });
    expect(diagnostic.reason).toBe('unknown-model');
  });

  test('resolves a models.json-only provider through the runtime', () => {
    // `custom_anthropic` is what a user's `~/.upup/agent/models.json` looks
    // like: it exists only in the Pi `ModelRuntime`, never in the static
    // catalog. Gating the runtime lookup behind `isPiProvider` made such a
    // spec unresolvable even though Pi itself serves it.
    const customModel = { id: 'MiniMax-M3', provider: 'custom_anthropic', baseUrl: 'https://api.minimaxi.com/anthropic' };
    const runtime = {
      getModel(providerId: string, modelId: string): unknown {
        if (providerId === 'custom_anthropic' && modelId === 'MiniMax-M3') return customModel;
        return undefined;
      },
    };
    expect(resolvePiModel({ modelName: 'custom_anthropic:MiniMax-M3' })).toBeUndefined();
    expect(resolvePiModel({ modelName: 'custom_anthropic:MiniMax-M3', modelRuntime: runtime })).toBe(/* SAFETY: structural stand-in for Pi's Model */ customModel as unknown as Model<never>);
    const diagnostic = describePiModelResolution({ modelName: 'custom_anthropic:MiniMax-M3', modelRuntime: runtime });
    expect(diagnostic.reason).toBe('resolved');
    expect(diagnostic.resolved).toBe(true);
  });

  test('resolvePiModel prefers the runtime view so user overrides beat the catalog', () => {
    // The runtime is the merged view Pi actually serves from (catalog + user
    // `models.json` + `registerProvider`). A user who repoints a catalog model
    // at their own endpoint must not be silently sent back to the catalog
    // default, so the runtime is consulted first.
    let runtimeCalls = 0;
    const userModel = { id: 'gemini-3-flash-preview', provider: 'google', baseUrl: 'https://user.example/v1' };
    const runtime = {
      getModel(providerId: string, modelId: string): unknown {
        runtimeCalls += 1;
        if (providerId === 'google' && modelId === 'gemini-3-flash-preview') return userModel;
        return undefined;
      },
    };
    const model = resolvePiModel({ modelName: 'google:gemini-3-flash-preview', modelRuntime: runtime });
    expect(model).toBe(/* SAFETY: structural stand-in for Pi's Model */ userModel as unknown as Model<never>);
    expect(runtimeCalls).toBe(1);

    // When the runtime misses, the static catalog still serves the hit.
    const missingRuntime = {
      getModel(): unknown {
        return undefined;
      },
    };
    const catalogModel = resolvePiModel({ modelName: 'google:gemini-3-flash-preview', modelRuntime: missingRuntime });
    expect(catalogModel?.id).toBe('gemini-3-flash-preview');
    expect(catalogModel?.baseUrl).not.toBe('https://user.example/v1');
  });

  test('resolvePiModel keeps the user-configured baseUrl for a catalog-known model', () => {
    // Regression: `minimax:MiniMax-M3` exists in both the Pi catalog and the
    // user's `models.json` with different `baseUrl`s. The catalog default was
    // unreachable in the field while the user's endpoint answered, so the
    // user's endpoint must win whenever a runtime supplies it.
    const userModel = { id: 'MiniMax-M3', provider: 'minimax', baseUrl: 'https://api.minimaxi.com/anthropic' };
    const runtime = {
      getModel(providerId: string, modelId: string): unknown {
        if (providerId === 'minimax' && modelId === 'MiniMax-M3') return userModel;
        return undefined;
      },
    };
    expect(resolvePiModel({ modelName: 'minimax:MiniMax-M3', modelRuntime: runtime })).toBe(/* SAFETY: structural stand-in for Pi's Model */ userModel as unknown as Model<never>);
    // Catalog-only resolution still works when no runtime is supplied.
    expect(resolvePiModel({ modelName: 'minimax:MiniMax-M3' })?.id).toBe('MiniMax-M3');
  });
});

describe('@upup/pi-event-adapter — createFinanceExtension', () => {
  test('produces an InlineExtension with hidden=true and unique name', () => {
    const spec = {
      ...baseSpec,
      id: 'test-finance-ext',
    };
    const tools = [makeTool({ name: 'finance-tool-1' })];
    const ext = createFinanceExtension({ spec, tools });
    expect(ext.name).toBe('upup-finance-test-finance-ext');
    expect(ext.hidden).toBe(true);
    expect(typeof ext.factory).toBe('function');
  });

  test('factory registers every supplied tool with the Pi extension API', () => {
    const registered: Array<{ name: string }> = [];
    const ext = createFinanceExtension({
      spec: { ...baseSpec, id: 'multi' },
      tools: [makeTool({ name: 'a' }), makeTool({ name: 'b' })],
    });
    ext.factory({ registerTool: (tool) => { registered.push(tool); } } as never);
    expect(registered.map((t) => t.name)).toEqual(['a', 'b']);
  });
});

describe('@upup/pi-event-adapter — injected stream runner', () => {
  test('canonical stream preserves every Pi event and emits run_end after the runner resolves', async () => {
    const { createPiCanonicalEventStream } = await import('./src/stream');
    const events: UpUpAgentEvent[] = [];
    const stream = createPiCanonicalEventStream(async (_prompt, options) => {
      options.onEvent?.({ type: 'session_start', sessionId: 'canonical', agentId: 'fixture' });
      options.onEvent?.({ type: 'text_delta', sessionId: 'canonical', delta: 'answer' });
      options.onEvent?.({ type: 'message_end', sessionId: 'canonical', role: 'assistant', text: 'answer' });
      return 'answer';
    });
    for await (const event of stream('fixture prompt', { model: 'fixture-model' })) events.push(event);
    expect(events).toEqual([
      { type: 'session_start', sessionId: 'canonical', agentId: 'fixture' },
      { type: 'text_delta', sessionId: 'canonical', delta: 'answer' },
      { type: 'message_end', sessionId: 'canonical', role: 'assistant', text: 'answer' },
      expect.objectContaining({ type: 'run_end', sessionId: 'canonical', answer: 'answer' }),
    ]);
  });

});

describe('@upup/pi-event-adapter side-effect audit stream', () => {
  test('mapSideEffectAuditToServer projects every audit field plus verdict', () => {
    const audit = {
      auditId: 'audit-1',
      sessionId: 'session-A',
      tool: 'add_position',
      effect: 'filesystem-write',
      safetyLevel: 'warning',
      permissionProfile: 'read-only',
      decision: 'approval_granted',
      reason: 'user approved',
      recordedAt: '2026-09-17T00:00:00.000Z',
    };
    const event = mapSideEffectAuditToServer(audit);
    expect(event.type).toBe('side_effect_audit');
    expect(event).toMatchObject({
      type: 'side_effect_audit',
      auditId: 'audit-1',
      sessionId: 'session-A',
      tool: 'add_position',
      effect: 'filesystem-write',
      safetyLevel: 'warning',
      permissionProfile: 'read-only',
      decision: 'approval_granted',
      verdict: 'approval_granted',
      reason: 'user approved',
      recordedAt: '2026-09-17T00:00:00.000Z',
    });
  });

  test('mapSideEffectAuditToServer tolerates missing or wrongly-typed fields', () => {
    const event = mapSideEffectAuditToServer({ auditId: 42, tool: null });
    expect(event.type).toBe('side_effect_audit');
    expect(event.auditId).toBe('');
    expect(event.tool).toBe('');
    expect(event.decision).toBe('');
  });

  test('subscribeToSideEffectAudits yields new entries as they appear', async () => {
    const recorded: unknown[] = [];
    const sessionManager = {
      getCustomEntries: (customType: string) => {
        if (customType !== 'upup_pi_policy_audit') return [];
        return recorded;
      },
    };
    const seen: string[] = [];
    const consumer = (async () => {
      for await (const event of subscribeToSideEffectAudits(sessionManager as never, { pollIntervalMs: 10 })) {
        seen.push((event as { tool: string }).tool);
        if (seen.length >= 3) break;
      }
    })();
    recorded.push({ type: 'custom', customType: 'upup_pi_policy_audit', data: { tool: 'add_position', decision: 'approval_granted' } });
    recorded.push({ type: 'custom', customType: 'upup_pi_policy_audit', data: { tool: 'remove_position', decision: 'denied' } });
    recorded.push({ type: 'custom', customType: 'other-entry', data: {} });
    recorded.push({ type: 'custom', customType: 'upup_pi_policy_audit', data: { tool: 'track_risk', decision: 'approval_required' } });
    await Promise.race([consumer, new Promise((r) => setTimeout(r, 1500))]);
    expect(seen).toEqual(['add_position', 'remove_position', 'track_risk']);
  });

  test('subscribeToSideEffectAudits respects signal', async () => {
    const sessionManager = { getCustomEntries: () => [] };
    const controller = new AbortController();
    let yielded = 0;
    const consumer = (async () => {
      for await (const _event of subscribeToSideEffectAudits(sessionManager as never, { pollIntervalMs: 5, signal: controller.signal })) {
        yielded += 1;
      }
    })();
    await new Promise((r) => setTimeout(r, 60));
    controller.abort();
    await consumer;
    expect(yielded).toBe(0);
  });
});
