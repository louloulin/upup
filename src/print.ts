#!/usr/bin/env bun
import { streamPiAgent } from './runtime/pi/event-stream.js';
import type { AgentEvent } from '@upup/pi-event-adapter';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

export interface PrintOptions {
  prompt: string;
  model?: string;
  sessionId?: string;
  maxIterations?: number;
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
}

export function parsePrintArgs(args: readonly string[]): PrintOptions {
  const promptParts: string[] = [];
  let model: string | undefined;
  let sessionId: string | undefined;
  let maxIterations: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--model' || arg === '-m') {
      model = args[++index];
      if (!model) throw new Error(`${arg} requires a model id`);
      continue;
    }
    if (arg === '--session' || arg === '--session-id') {
      sessionId = args[++index];
      if (!sessionId) throw new Error(`${arg} requires a session id`);
      continue;
    }
    if (arg === '--max-iterations') {
      const raw = args[++index];
      maxIterations = Number(raw);
      if (!raw || !Number.isInteger(maxIterations) || maxIterations < 1) {
        throw new Error('--max-iterations must be a positive integer');
      }
      continue;
    }
    if (arg === '--') {
      promptParts.push(...args.slice(index + 1));
      break;
    }
    promptParts.push(arg);
  }

  const prompt = promptParts.join(' ').trim();
  if (!prompt) throw new Error('A prompt is required');
  return { prompt, ...(model ? { model } : {}), ...(sessionId ? { sessionId } : {}), ...(maxIterations ? { maxIterations } : {}) };
}

export async function runPrint(options: PrintOptions, write: (text: string) => void = process.stdout.write.bind(process.stdout)): Promise<string> {
  let answer = '';
  let streamed = false;
  for await (const event of streamPiAgent(options.prompt, {
    ...(options.model ? { model: options.model } : {}),
    ...(options.maxIterations ? { maxIterations: options.maxIterations } : {}),
    ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}),
    ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}),
  }, options.sessionId ? { sessionId: options.sessionId } : {})) {
    if (event.type === 'done') answer = event.answer;
    if (event.type === 'stream_progress') {
      streamed = true;
      write(event.textContent ?? '');
    }
  }
  if (!streamed && answer) write(answer);
  if (answer && (!streamed || !answer.endsWith('\n'))) write('\n');
  return answer;
}

async function main(): Promise<void> {
  try {
    const options = parsePrintArgs(process.argv.slice(2));
    await runPrint(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`upup print: ${message}\n`);
    process.stderr.write('Usage: bun run src/print.ts [--model <id>] [--session <id>] [--max-iterations <n>] <prompt>\n');
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();

export type { AgentEvent };
