import { Type } from 'typebox';
import { createAgentSession, DefaultResourceLoader, createEventBus } from '@earendil-works/pi-coding-agent';

const cwd = process.cwd();
const events = createEventBus();
const MARK = '__upupToolError';
const seen: unknown[] = [];

const resourceLoader = new DefaultResourceLoader({
  cwd, agentDir: cwd, eventBus: events,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  extensionFactories: [{
    name: 'probe-bridge', factory: (pi: any) => {
      pi.on('tool_result', (event: any) => {
        seen.push({ tool: event.toolName, details: event.details, isError: event.isError });
        if (event?.details && typeof event.details === 'object' && (event.details as any)[MARK] === true) return { isError: true };
        return undefined;
      });
      pi.registerTool({ name: 'probe_fail', label: 'Probe', description: 'probe', parameters: Type.Object({}), async execute() {
        return { content: [{ type: 'text', text: 'upup failure text' }], isError: true, details: { auditId: 'a1', source: 'upup' } };
      } });
      pi.registerTool({ name: 'probe_ok', label: 'Probe', description: 'probe', parameters: Type.Object({}), async execute() {
        return { content: [{ type: 'text', text: 'ok text' }], details: { auditId: 'a2' } };
      } });
    },
  }],
  extensionsOverride: (base: any) => {
    for (const ext of base.extensions) {
      for (const [name, registered] of ext.tools) {
        const original = registered.definition.execute;
        registered.definition = { ...registered.definition, execute: async (id: string, params: any, signal: any, onUpdate: any, ctx: any) => {
          const result = await original(id, params, signal, onUpdate, ctx);
          if (result && (result as any).isError === true) {
            const { isError, ...rest } = result as any;
            return { ...rest, details: { ...(rest.details ?? {}), [MARK]: true } };
          }
          return result;
        } };
        void name;
      }
    }
    return base;
  },
});
await resourceLoader.reload();
const { session } = await createAgentSession({ cwd, resourceLoader, noTools: 'builtin' });
await session.prompt('Call the probe_fail tool with no arguments, and also call probe_ok with no arguments. Then reply with the single word DONE.');
await session.waitForIdle();
const msgs = session.messages as any[];
console.log('toolResults:', JSON.stringify(msgs.filter((m) => m.role === 'toolResult').map((m) => ({ tool: m.toolName, isError: m.isError, content: m.content?.[0]?.text, details: m.details })), null, 1));
console.log('handler saw:', JSON.stringify(seen));
session.dispose();
