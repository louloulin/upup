import { describe, expect, test } from 'bun:test';
import { Type } from 'typebox';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type ExtensionAPI,
  type ExtensionFactory,
} from '@earendil-works/pi-coding-agent';
import {
  createPiToolErrorBridgeExtension,
  PI_TOOL_ERROR_MARKER,
  wrapPiExtensionToolResults,
} from '@upup/pi-runtime';

type PiToolResult = {
  content: readonly { type: string; text: string }[];
  details?: Record<string, unknown>;
  isError?: boolean;
};

/**
 * Contract: an UpUp extension tool that returns `{ content, isError: true }`
 * must reach Pi as a *failed* tool call.
 *
 * Pi's agent loop sources `isError` from only two places: a thrown
 * `execute()`, or an `afterToolCall` / `tool_result` hook returning
 * `{ isError: true }`. UpUp's extension tools author the flag inline, so
 * `@upup/pi-runtime` installs a two-part bridge:
 *
 *   1. `wrapPiExtensionToolResults` runs as the ResourceLoader's
 *      `extensionsOverride` and rewrites a failing result into a
 *      `details[PI_TOOL_ERROR_MARKER] = true` marker.
 *   2. `createPiToolErrorBridgeExtension` subscribes to `tool_result` and
 *      re-asserts `{ isError: true }`, stripping the marker.
 *
 * Without either half, a fail-closed policy denial (e.g. `place_trade_order`,
 * approval_denied) would be reported to the model as a *successful* tool call
 * — the highest-impact correctness bug in the extension surface.
 */
describe('Pi tool-error bridge contract', () => {
  const failingTool: ExtensionFactory = (pi: ExtensionAPI) => {
    pi.registerTool({
      name: 'probe_failure',
      label: 'Probe Failure',
      description: 'Always fails; verifies the UpUp isError bridge.',
      parameters: Type.Object({}),
      async execute() {
        return {
          content: [{ type: 'text' as const, text: 'upup failure text' }],
          isError: true,
          details: { auditId: 'audit-1', source: 'contract-test' },
        };
      },
    });
  };

  test('half 1: extensionsOverride marks a failing result for the tool_result hook', async () => {
    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(),
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      noExtensions: true,
      extensionsOverride: wrapPiExtensionToolResults,
      extensionFactories: [failingTool],
    });
    await resourceLoader.reload();
    const session = await createAgentSession({
      cwd: process.cwd(),
      sessionManager: SessionManager.inMemory(),
      resourceLoader,
      noTools: 'builtin',
    });
    try {
      const definition = session.session.getToolDefinition('probe_failure');
      expect(definition).toBeDefined();
      const executed = (await definition!.execute('probe-1', {}, undefined, undefined, {} as never)) as PiToolResult;

      // The extension still authored a failure; the bridge moved the flag.
      expect(executed.details?.[PI_TOOL_ERROR_MARKER]).toBe(true);
      expect(executed.details?.auditId).toBe('audit-1');
      expect(executed.details?.source).toBe('contract-test');
      expect(executed.isError).toBeUndefined();
      expect(executed.content[0]?.text).toBe('upup failure text');
    } finally {
      session.session.dispose();
    }
  });

  test('half 2: the tool_result hook re-asserts isError and strips the marker', async () => {
    const handlers: Array<(event: unknown, ctx: unknown) => unknown> = [];
    const fakePi = {
      on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
        if (event === 'tool_result') handlers.push(handler);
      },
    } as unknown as ExtensionAPI;

    createPiToolErrorBridgeExtension()(fakePi);
    expect(handlers.length).toBe(1);

    const hook = handlers[0]!;
    // Exactly the event shape AgentSession emits (see agent-session.js afterToolCall).
    const marked = await hook(
      {
        type: 'tool_result',
        toolName: 'probe_failure',
        toolCallId: 'probe-1',
        input: {},
        content: [{ type: 'text', text: 'upup failure text' }],
        details: { auditId: 'audit-1', source: 'contract-test', [PI_TOOL_ERROR_MARKER]: true },
        isError: false,
      },
      {},
    );
    expect(marked).toMatchObject({
      isError: true,
      details: { auditId: 'audit-1', source: 'contract-test' },
    });
    expect((marked as { details: Record<string, unknown> }).details[PI_TOOL_ERROR_MARKER]).toBeUndefined();

    // A healthy result must pass through untouched, so the bridge never
    // converts successful tool calls into failures.
    const healthy = await hook(
      {
        type: 'tool_result',
        toolName: 'probe_ok',
        toolCallId: 'probe-2',
        input: {},
        content: [{ type: 'text', text: 'ok' }],
        details: { auditId: 'audit-2' },
        isError: false,
      },
      {},
    );
    expect(healthy).toBeUndefined();
  });

  test('a policy-denied UpUp tool reaches callers as a failed result', async () => {
    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(),
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      noExtensions: true,
      extensionsOverride: wrapPiExtensionToolResults,
      extensionFactories: [failingTool],
    });
    await resourceLoader.reload();
    const session = await createAgentSession({
      cwd: process.cwd(),
      sessionManager: SessionManager.inMemory(),
      resourceLoader,
      noTools: 'builtin',
    });
    try {
      // Pi's registry holds the wrapped definition; the marker must be present
      // so AgentSession's afterToolCall can flip isError for the model.
      const definition = session.session.getToolDefinition('probe_failure')!;
      const executed = (await definition.execute('probe-3', {}, undefined, undefined, {} as never)) as PiToolResult;
      expect((executed.details as Record<string, unknown>)[PI_TOOL_ERROR_MARKER]).toBe(true);
    } finally {
      session.session.dispose();
    }
  });
});
