// Real e2e: instantiate the SDK + run a finance prompt. This proves
// createUpUpSession works against the full UpUp stack (PI AgentSession,
// finance SDK, MCP). Failures surface as process exit code 1.
import { createUpUpSession } from '@upup/sdk';

const prompt = process.argv.slice(2).join(' ').trim() || '/invest 600519.SH';

const handle = await createUpUpSession({
  profile: 'researcher',
  onEvent: (event) => {
    switch (event.type) {
      case 'ready':
        process.stderr.write(`[ready] session=${event.sessionId}\n`);
        return;
      case 'message':
        process.stderr.write(`[message] role=${event.message.role} content=${event.message.content.slice(0, 80)}\n`);
        return;
      case 'tool_call':
        process.stderr.write(`[tool:call] ${event.tool}\n`);
        return;
      case 'tool_result':
        process.stderr.write(`[tool:result] ${event.tool} isError=${event.isError}\n`);
        return;
      case 'thinking':
        process.stderr.write(`[thinking] ${event.text.slice(0, 80)}\n`);
        return;
      case 'done':
        process.stderr.write(`[done] reason=${event.reason}\n`);
        return;
      case 'error':
        process.stderr.write(`[error] ${event.error instanceof Error ? event.error.message : String(event.error)}\n`);
        return;
      default:
        return;
    }
  },
});

try {
  await handle.prompt(prompt);
  await handle.waitForIdle();
  process.stderr.write(`[e2e] session=${handle.id} spec=${handle.spec.id}\n`);
  process.stderr.write(`[e2e] tools available: ${handle.getAvailableToolNames().slice(0, 6).join(', ')}...\n`);
} finally {
  await handle.close();
}
