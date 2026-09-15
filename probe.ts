import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { registerPiCapabilityHost } from '@upup/pi-capability-registry';

export type PiToolResult<TDetails = Record<string, unknown> | undefined> = AgentToolResult<TDetails> & { isError?: boolean };

function result(id: string, value: unknown, extra: Record<string, unknown> = {}): PiToolResult {
  const { isError, ...details } = extra;
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}), details: { auditId: id, ...details } };
}
function nativeResult(id: string, query: string, value: unknown, details: Record<string, unknown> = {}): PiToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: { auditId: id, query, ...details } };
}

const p = Type.Object({ a: Type.String() });
type Ctx = { sessionManager?: { getEntries(): readonly unknown[] } };

export default function ext(pi: ExtensionAPI): void {
  pi.registerTool({ name: 'k1', label: 'L', description: 'd', parameters: p, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'aborted' }, { isError: true });
    try { return result(id, { a: params.a }); } catch (error) { return result(id, { error: String(error) }, { isError: true }); }
  } });
  pi.registerTool({ name: 'k2', label: 'L', description: 'd', parameters: p, async execute(id, params, signal) {
    if (signal?.aborted) return nativeResult(id, 'q', { error: 'aborted' }, { isError: true });
    return nativeResult(id, 'q', { a: params.a });
  } });
  pi.registerTool({ name: 'k3', label: 'L', description: 'd', parameters: p, async execute(id, params, signal) {
    if (signal?.aborted) return { content: [{ type: 'text' as const, text: 'aborted' }], isError: true, details: undefined };
    return { content: [{ type: 'text' as const, text: 'ok' }], details: { auditId: id } };
  } });
  pi.registerTool({ name: 'k4', label: 'L', description: 'd', parameters: p, async execute(id, params, signal, _u, context) {
    if (signal?.aborted) return { content: [{ type: 'text' as const, text: 'a' }], isError: true };
    void (context?.sessionManager as Ctx['sessionManager'])?.getEntries();
    return { content: [{ type: 'text' as const, text: 'ok' }], details: { auditId: id } };
  } });
  registerPiCapabilityHost<{ readonly contract: string; readonly packageName: string; readonly packageVersion: string; readonly sessionId: string; readonly capabilities: readonly string[] } & { providers: { tools: { getToolDefinitions(r: unknown): readonly unknown[] } } }>(pi, 'x', (host) => { void host.providers.tools; });
}
