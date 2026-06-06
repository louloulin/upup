/**
 * src/bundled-runner.ts - Bundled binary entry point (esbuild output target).
 *
 * All logic lives in `@upup/agent-runtime`. This file is a thin shell
 * that loads the global ~/.upup/.env, instantiates the agent, and runs
 * a single prompt. It is bundled with esbuild to create a self-contained
 * agent-bundle.js with no external file dependencies.
 */
import { config } from 'dotenv';
import { Agent } from '@upup/agent-runtime';
import path from 'path';
import { homedir } from 'os';

const globalEnvPath = path.join(homedir(), '.upup', '.env');
try {
  config({ path: globalEnvPath, quiet: true });
} catch {
  // .env not found in global dir, continue
}

const prompt = process.argv.slice(2).join(' ');
if (!prompt) {
  console.error('Usage: bun run agent-bundle.js "your prompt"');
  process.exit(1);
}

const model = process.env.DEFAULT_MODEL || 'deepseek-v4-flash';

(async () => {
  try {
    const agent = await Agent.create({ model });
    const result = await agent.run(prompt);
    console.log(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Error:', msg);
    process.exit(1);
  }
})();
