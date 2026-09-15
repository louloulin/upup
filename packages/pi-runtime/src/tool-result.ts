import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ExtensionAPI, ExtensionFactory, LoadExtensionsResult } from '@earendil-works/pi-coding-agent';

/**
 * Symbol used to flag tool results whose `isError` was set by the upstream
 * UpUp extension rather than by throwing from `execute`.
 *
 * Pi's agent loop only honors `isError` when surfaced through a thrown
 * `execute()` or an `afterToolCall` / `tool_result` hook returning
 * `{ isError: true }`. UpUp's extensions use the more ergonomic
 * `return { content, isError: true, details }` shape, so we strip `isError`
 * in `extensionsOverride`, attach the marker to `details`, and re-assert it
 * from this `tool_result` bridge extension.
 */
export const PI_TOOL_ERROR_MARKER = '__upupPiToolError' as const;

/** Optional isError flag added to Pi's AgentToolResult via a back-channel. */
export type PiToolResultDetails = Record<string, unknown> & {
  readonly [PI_TOOL_ERROR_MARKER]?: true;
};

/**
 * Ergonomic tool-result type for UpUp extension tools.
 *
 * Pi's `AgentToolResult<TDetails>` does not declare `isError`; the agent loop
 * only reads that flag from a thrown `execute()` or a `tool_result` hook. UpUp
 * extensions author the flag inline (`return { content, isError: true, details }`)
 * which is clearer and keeps `details` alongside the failure, so this alias
 * permits it and `wrapPiExtensionToolResults` bridges it into Pi's protocol.
 */
export type PiToolResult<TDetails = unknown> = AgentToolResult<TDetails> & {
  readonly isError?: boolean;
};

type AnyToolDefinition = {
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: ((partialResult: AgentToolResult<unknown>) => void) | undefined,
    ctx: unknown,
  ) => Promise<AgentToolResult<unknown>>;
};

/**
 * Wrap every registered tool's `execute` so that an `{isError: true}` return
 * is converted into a details-level marker (`PI_TOOL_ERROR_MARKER = true`).
 * The marker is later read by `createPiToolErrorBridgeExtension` to re-assert
 * `isError: true` through the only channel Pi honors at runtime.
 */
export function wrapPiExtensionToolResults(base: LoadExtensionsResult): LoadExtensionsResult {
  for (const extension of base.extensions) {
    for (const registered of extension.tools.values()) {
      const definition = registered.definition as unknown as AnyToolDefinition;
      const original = definition.execute;
      registered.definition = {
        ...(registered.definition as unknown as Record<string, unknown>),
        execute: async (
          toolCallId: string,
          params: unknown,
          signal: AbortSignal | undefined,
          onUpdate: ((partialResult: AgentToolResult<unknown>) => void) | undefined,
          ctx: unknown,
        ): Promise<AgentToolResult<unknown>> => {
          const result = await original.call(registered.definition, toolCallId, params, signal, onUpdate, ctx);
          if (result && (result as { isError?: unknown }).isError === true) {
            const { isError: _isError, details, ...rest } = result as AgentToolResult<unknown> & { isError: boolean };
            const baseDetails = (details && typeof details === 'object' ? details : {}) as Record<string, unknown>;
            return {
              ...rest,
              details: { ...baseDetails, [PI_TOOL_ERROR_MARKER]: true },
            };
          }
          return result;
        },
      } as unknown as typeof registered.definition;
    }
  }
  return base;
}

/**
 * Inline extension that translates the `__upupPiToolError` marker on
 * `tool_result` events back into the `{isError: true}` shape Pi's agent loop
 * forwards to the model and `tool_execution_end` listeners.
 *
 * Without this bridge, `place_trade_order`, approval-denied paths, and any
 * other fail-closed policy denials would appear as *successful* tool calls
 * to the LLM — a high-impact correctness bug.
 */
export function createPiToolErrorBridgeExtension(): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on('tool_result', (event: unknown) => {
      const details = (event as { details?: unknown }).details;
      if (
        details &&
        typeof details === 'object' &&
        (details as Record<string, unknown>)[PI_TOOL_ERROR_MARKER] === true
      ) {
        const stripped = { ...(details as Record<string, unknown>) };
        delete stripped[PI_TOOL_ERROR_MARKER];
        return { isError: true, details: stripped };
      }
      return undefined;
    });
  };
}
