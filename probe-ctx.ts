import { Type } from 'typebox';
import { createAgentSession, DefaultResourceLoader, createEventBus } from '@earendil-works/pi-coding-agent';

const cwd = process.cwd();
const events = createEventBus();
const report: Record<string, unknown> = {};
const resourceLoader = new DefaultResourceLoader({
  cwd, agentDir: cwd, eventBus: events,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  extensionFactories: [{
    name: 'probe', factory: (pi: any) => {
      pi.registerTool({ name: 'probe_ctx', label: 'Probe', description: 'probe', parameters: Type.Object({}), async execute(_id: string, _p: unknown, _s: unknown, _u: unknown, ctx: any) {
        report.hasSessionManager = Boolean(ctx?.sessionManager);
        report.appendCustomEntryUndefined = typeof ctx?.sessionManager?.appendCustomEntry;
        report.buildSessionContextUndefined = typeof ctx?.sessionManager?.buildSessionContext;
        report.getEntries = typeof ctx?.sessionManager?.getEntries;
        report.piAppendEntry = typeof pi.appendEntry;
        report.piKeys = Object.keys(pi).sort();
        return { content: [{ type: 'text', text: 'ok' }], details: { auditId: 'x' } };
      } });
    },
  }],
});
await resourceLoader.reload();
const { session } = await createAgentSession({ cwd, resourceLoader, noTools: 'builtin' });
await session.prompt('Call the probe_ctx tool with no arguments, then reply DONE.');
await session.waitForIdle();
console.log(JSON.stringify(report, null, 1));
session.dispose();
