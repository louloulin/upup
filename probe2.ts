import { Type, type TSchema, type Static } from 'typebox';
import type { ExtensionAPI, InlineExtension, ToolDefinition, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core';

export type PiToolResult = AgentToolResult<unknown> & { isError?: boolean };

export interface PiToolRegistration<TParams extends TSchema = TSchema> {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TParams;
  readonly executionMode?: 'sequential' | 'parallel';
  execute(
    toolCallId: string,
    params: Static<TParams>,
    signal: AbortSignal | undefined,
    onUpdate?: AgentToolUpdateCallback<unknown>,
    ctx?: ExtensionContext,
  ): Promise<PiToolResult>;
}

export type UpUpExtensionApi = Omit<ExtensionAPI, 'registerTool'> & {
  registerTool<TParams extends TSchema>(tool: PiToolRegistration<TParams>): void;
};

const p = Type.Object({ a: Type.String() });

function body(pi: UpUpExtensionApi): void {
  pi.registerTool({ name: 'k1', label: 'L', description: 'd', parameters: p, async execute(id, params, signal) {
    if (signal?.aborted) return { content: [{ type: 'text' as const, text: 'aborted' }], isError: true, details: undefined };
    return { content: [{ type: 'text' as const, text: JSON.stringify(params.a) }], details: { auditId: id, nested: { x: 1 } } };
  } });
  pi.registerTool({ name: 'k2', label: 'L', description: 'd', parameters: p, executionMode: 'sequential', async execute(id, params, signal, _u, ctx) {
    void ctx?.sessionManager;
    if (signal?.aborted) return { content: [{ type: 'text' as const, text: 'a' }], isError: true };
    try { return { content: [{ type: 'text' as const, text: 'ok' }], details: { auditId: id } }; }
    catch (error) { return { content: [{ type: 'text' as const, text: String(error) }], isError: true }; }
  } });
  pi.on('session_start', () => {});
}

// Pi must accept our narrowed factory where it expects an ExtensionFactory.
const ext: InlineExtension = { name: 'probe', factory: body };
void ext;
const nativeFactory = (pi: ExtensionAPI): void => body(pi);
void nativeFactory;
export default body;
