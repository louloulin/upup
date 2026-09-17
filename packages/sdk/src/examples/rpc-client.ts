/**
 * UpUp SDK — RPC-style in-process demo.
 *
 * Spawns an UpUp session in the same process and drives it like a remote
 * RPC client would. This is the bridge document TradingAgents / Claude
 * Code / Codex hosts read to understand the SDK shape — it shows every
 * public method (`createUpUpSession`, `prompt`, `steer`, `followUp`,
 * `abort`, `close`, `fork`, `compact`, `appendEntry`,
 * `setFinanceContext`, `getFinanceContext`, `exportToHtml`).
 *
 *   bun run packages/sdk/src/examples/rpc-client.ts "分析 600519.SH"
 *
 * The session uses the `researcher` profile and prints each event as it
 * arrives. No external services are required for the demo path itself
 * (the researcher profile talks to 东方财富 public endpoints for real
 * numbers; if those fail the LLM falls back to "source unavailable").
 */

import { createUpUpSession, type UpUpSessionHandle, type UpUpSessionEvent } from '../index';

const PROMPT = process.argv.slice(2).join(' ').trim() || '/invest 600519.SH';

async function main(): Promise<void> {
  console.log(`[upup-sdk-demo] creating session for prompt: ${JSON.stringify(PROMPT)}`);
  const handle: UpUpSessionHandle = await createUpUpSession({
    profile: 'researcher',
    onEvent: (event: UpUpSessionEvent) => printEvent(event),
  });
  console.log(`[upup-sdk-demo] session ready: ${handle.id}`);

  try {
    await handle.prompt(PROMPT);
    await handle.waitForIdle();
  } finally {
    const header = handle.getSessionHeader();
    const file = handle.getSessionFile();
    console.log(`[upup-sdk-demo] session header: ${JSON.stringify(header)}`);
    if (file) console.log(`[upup-sdk-demo] session file: ${file}`);
    await handle.close();
    console.log('[upup-sdk-demo] session closed.');
  }
}

function printEvent(event: UpUpSessionEvent): void {
  switch (event.type) {
    case 'ready':
      console.log(`[ready] ${event.sessionId}`);
      return;
    case 'agent_event':
      console.log(`[pi:${event.event.type}]`);
      return;
    case 'message':
      console.log(`[message] role=${event.message.role} ${shortText(event.message.content)}`);
      return;
    case 'tool_call':
      console.log(`[tool:call] ${event.tool} ${shortText(JSON.stringify(event.input))}`);
      return;
    case 'tool_result':
      console.log(`[tool:result] ${event.tool} isError=${event.isError} ${shortText(JSON.stringify(event.output))}`);
      return;
    case 'thinking':
      console.log(`[thinking] ${shortText(event.text)}`);
      return;
    case 'done':
      console.log(`[done] reason=${event.reason}`);
      return;
    case 'error':
      console.log(`[error] ${event.error instanceof Error ? event.error.message : String(event.error)}`);
      return;
    default:
      console.log(`[unknown]`);
  }
}

function shortText(text: string): string {
  if (text.length <= 200) return text;
  return `${text.slice(0, 200)}…`;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[upup-sdk-demo] fatal:', error);
    process.exitCode = 1;
  });
}
