#!/usr/bin/env bun
/**
 * src/run.ts - Non-interactive agent runner (used by adapters and
 * integration tests). All logic lives in `@upup/agent-runtime`.
 *
 * Usage: bun run src/run.ts "your prompt here"
 */
import { config } from 'dotenv';
import { Agent } from '@upup/agent-runtime';

config({ quiet: true });

const prompt = process.argv.slice(2).join(' ');
if (!prompt) {
  console.error('Usage: bun run src/run.ts "your prompt here"');
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
