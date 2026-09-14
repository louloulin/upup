#!/usr/bin/env bun
import { getPiNativeApp } from './default.js';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
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

type EventStream = ReturnType<ReturnType<typeof getPiNativeApp>['getEventStream']>;

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
    if (arg !== undefined) promptParts.push(arg);
  }

  const prompt = promptParts.join(' ').trim();
  if (!prompt) throw new Error('A prompt is required');
  return { prompt, ...(model ? { model } : {}), ...(sessionId ? { sessionId } : {}), ...(maxIterations ? { maxIterations } : {}) };
}

export async function runPrint(
  options: PrintOptions,
  write: (text: string) => void = process.stdout.write.bind(process.stdout),
  eventStream: EventStream = getPiNativeApp().getEventStream(),
): Promise<string> {
  let answer = '';
  let streamed = false;
  for await (const event of eventStream.stream(options.prompt, {
    ...(options.model ? { model: options.model } : {}),
    ...(options.maxIterations ? { maxIterations: options.maxIterations } : {}),
    ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}),
    ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}),
  }, options.sessionId ? { sessionId: options.sessionId } : {})) {
    if (event.type === 'run_end') answer = event.answer;
    if (event.type === 'text_delta') {
      streamed = true;
      write(event.delta);
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
    process.stderr.write('Usage: bun run packages/pi-app/src/print.ts [--model <id>] [--session <id>] [--max-iterations <n>] <prompt>\n');
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
