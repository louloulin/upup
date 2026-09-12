/**
 * Bundled agent runner for Paperclip adapter
 *
 * This file is bundled with esbuild to create a self-contained agent-bundle.js
 * that has NO external file dependencies.
 *
 * Usage: bun run agent-bundle.js "your prompt"
 */

import { config } from 'dotenv';
import { streamPiAgent } from './runtime/pi/event-stream.js';
import path from 'path';
import { homedir } from 'os';

// Load .env from global ~/.upup/ directory
const globalEnvPath = path.join(homedir(), '.upup', '.env');
try {
  config({ path: globalEnvPath, quiet: true });
} catch {
  // .env not found in global dir, continue
}

// Also check current directory .env
try {
  config({ path: '.env', quiet: true });
} catch {
  // .env not found in current dir, continue
}

// Load API key and provider settings from global ~/.upup/settings.json
const globalSettingsPath = path.join(homedir(), '.upup', 'settings.json');
try {
  const fs = require('fs');
  if (fs.existsSync(globalSettingsPath)) {
    const settings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf-8'));
    if (settings.apiKey && !process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      // Set environment variable from global config
      if (settings.provider === 'deepseek') {
        process.env.DEEPSEEK_API_KEY = settings.apiKey;
      } else if (settings.provider === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = settings.apiKey;
      }
    }
  }
} catch {
  // Continue without global settings
}

// Get prompt from command line
const prompt = process.argv.slice(2).join(' ');
if (!prompt) {
  console.error('Usage: bun run agent-bundle.js "your prompt here"');
  process.exit(1);
}

// Get model from environment or use default
const model = process.env.DEFAULT_MODEL || 'deepseek-v4-flash';

async function main() {
  const startTime = Date.now();

  // Emit start event
  console.log(JSON.stringify({
    type: 'acpx.result',
    summary: 'Agent started',
    stopReason: 'started',
  }));

  try {
    const stream = streamPiAgent(prompt, { model });

    for await (const event of stream) {
      switch (event.type) {
        case 'thinking':
          console.log(JSON.stringify({
            type: 'acpx.text_delta',
            text: event.message,
            channel: 'thought',
          }));
          break;

        case 'tool_start':
          console.log(JSON.stringify({
            type: 'acpx.tool_call',
            name: event.tool,
            toolCallId: event.toolCallId,
            status: 'pending',
            text: JSON.stringify(event.args),
          }));
          break;

        case 'tool_end':
          console.log(JSON.stringify({
            type: 'acpx.tool_call',
            name: event.tool,
            toolCallId: event.toolCallId,
            status: 'completed',
            text: event.result.slice(0, 500),
          }));
          break;

        case 'tool_error':
          console.log(JSON.stringify({
            type: 'acpx.error',
            message: event.error,
            code: 'tool_error',
          }));
          break;

        case 'done':
          const totalTime = Date.now() - startTime;
          console.log(JSON.stringify({
            type: 'acpx.result',
            summary: event.answer.slice(0, 500),
            stopReason: `completed_after_${event.iterations}_iterations`,
            usage: event.tokenUsage,
            totalTimeMs: totalTime,
          }));
          // Exit with success code
          process.exit(0);
          break;
      }
    }
  } catch (error) {
    const err = error as Error;
    console.log(JSON.stringify({
      type: 'acpx.error',
      message: err.message,
      code: 'agent_error',
    }));
    // Exit with error code
    process.exit(1);
  }
}

main();
