import { Type } from 'typebox';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';

declare module '@earendil-works/pi-agent-core' {
  interface AgentToolResult<T> {
    readonly isError?: boolean;
  }
}

const p = Type.Object({ a: Type.String() });

function ok(pi: { registerTool(t: { execute(...): Promise<AgentToolResult<unknown>> }): void }) {
  pi.registerTool({
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: { a: 1 } })
  });
  pi.registerTool({
    execute: async () => ({ content: [{ type: 'text', text: 'aborted' }], isError: true, details: undefined })
  });
  pi.registerTool({
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: { auditId: 'x' } })
  });
  pi.registerTool({
    execute: async (id: string, params: { a: string }) => {
      void id; void params;
      return { content: [{ type: 'text', text: 'ok' }], details: { auditId: 'a' }, isError: true };
    }
  });
}
void ok; void p;
export {};
