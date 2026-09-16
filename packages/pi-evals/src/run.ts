/**
 * Pi-native evaluation runner for UpUp
 *
 * Usage:
 *   bun run packages/pi-evals/src/run.ts                     # Run on all questions
 *   bun run packages/pi-evals/src/run.ts --sample 10         # Random sample of 10
 *   bun run packages/pi-evals/src/run.ts --provider minimax --model MiniMax-M3
 *   bun run packages/pi-evals/src/run.ts --help
 *
 * Model precedence: explicit `--provider`/`--model` > `.upup/settings.json`
 * `provider`+`modelId` > Pi catalog defaults. When a provider is known (either
 * via CLI or persisted settings) the runner forwards the canonical
 * `provider:model` string so Pi resolves both target and judge against the
 * same credentials. With no provider signal the bare model id is forwarded.
 */

import 'dotenv/config';
import { ProcessTerminal, TuiMainScreen } from '@earendil-works/pi-tui';
import { callStructuredLlm, getConfiguredModelId, getConfiguredProvider, type PromptRunner } from '@upup/utils';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PiEventStreamPort } from '@upup/pi-app';
import { EvalProgress, EvalCurrentQuestion, EvalStats, EvalRecentResults } from './components/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface Example {
  inputs: { question: string };
  outputs: { answer: string };
}

interface EvaluationResult {
  key: string;
  score: number;
  comment: string;
}

export interface EvalCliArgs {
  readonly help: boolean;
  readonly sampleSize: number | undefined;
  readonly provider: string | undefined;
  readonly model: string | undefined;
}

export interface ResolvedEvalModel {
  readonly provider: string;
  readonly model: string;
  readonly modelString: string;
}

const EVAL_HELP = `UpUp finance evaluation runner

Usage:
  bun run packages/pi-evals/src/run.ts [flags]

Flags:
  --sample N            Randomly sample N questions from the dataset
  --provider P          Override the LLM provider (e.g. minimax, openai)
  --model M             Override the LLM model id (e.g. MiniMax-M3, gpt-5.4)
  -h, --help            Show this help and exit

Model precedence: --provider/--model > .upup/settings.json > Pi catalog default.
Both target (agent) and judge (LLM-as-judge) calls run on the resolved model.
`;

// ============================================================================
// CSV Parser - handles multi-line quoted fields
// ============================================================================

function parseCSV(csvContent: string): Example[] {
  const examples: Example[] = [];
  const lines = csvContent.split('\n');
  
  let i = 1; // Skip header row
  
  while (i < lines.length) {
    const result = parseRow(lines, i);
    if (result) {
      const { row, nextIndex } = result;
      if (row.length >= 2 && row[0].trim()) {
        examples.push({
          inputs: { question: row[0] },
          outputs: { answer: row[1] }
        });
      }
      i = nextIndex;
    } else {
      i++;
    }
  }
  
  return examples;
}

function parseRow(lines: string[], startIndex: number): { row: string[]; nextIndex: number } | null {
  if (startIndex >= lines.length || !lines[startIndex].trim()) {
    return null;
  }
  
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let lineIndex = startIndex;
  let charIndex = 0;
  
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    
    while (charIndex < line.length) {
      const char = line[charIndex];
      const nextChar = line[charIndex + 1];
      
      if (char === '"' && nextChar === '"' && inQuotes) {
        currentField += '"';
        charIndex += 2;
      } else if (char === '"') {
        inQuotes = !inQuotes;
        charIndex++;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField);
        currentField = '';
        charIndex++;
      } else {
        currentField += char;
        charIndex++;
      }
    }
    
    if (inQuotes) {
      currentField += '\n';
      lineIndex++;
      charIndex = 0;
    } else {
      fields.push(currentField);
      return { row: fields, nextIndex: lineIndex + 1 };
    }
  }
  
  if (currentField) {
    fields.push(currentField);
  }
  return { row: fields, nextIndex: lineIndex };
}

// ============================================================================
// CLI arg parsing + model resolution (exported for tests)
// ============================================================================

function readFlagValue(args: readonly string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (next === undefined || next.startsWith('--') || next === '-h') return undefined;
  return next;
}

export function parseEvalArgs(args: readonly string[]): EvalCliArgs {
  const help = args.includes('--help') || args.includes('-h');
  const sampleRaw = readFlagValue(args, '--sample');
  const sampleSize = sampleRaw !== undefined ? Number.parseInt(sampleRaw, 10) : undefined;
  const provider = readFlagValue(args, '--provider');
  const model = readFlagValue(args, '--model');
  return {
    help,
    sampleSize: sampleSize !== undefined && Number.isFinite(sampleSize) ? sampleSize : undefined,
    provider,
    model,
  };
}

export function resolveEvalModel(args: EvalCliArgs): ResolvedEvalModel {
  const provider = args.provider ?? getConfiguredProvider();
  const model = args.model ?? getConfiguredModelId();
  const providerAlreadyPrefixed = model.includes(':') && (
    model.startsWith(`${provider}:`) || model.toLowerCase().startsWith('openai-compatible')
  );
  const modelString = providerAlreadyPrefixed || model.includes(':')
    ? model
    : `${provider}:${model}`;
  return { provider, model: model.split(':').pop() ?? model, modelString };
}

// ============================================================================
// Sampling utilities
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// Target function - wraps UpUp agent
// ============================================================================

async function target(eventStream: PiEventStreamPort, inputs: { question: string }, model: string): Promise<{ answer: string }> {
  let answer = '';

  for await (const event of eventStream.stream(inputs.question, { model, maxIterations: 10 })) {
    if (event.type === 'run_end') {
      answer = event.answer;
    }
  }
  
  return { answer };
}

// ============================================================================
// Correctness evaluator - LLM-as-judge
// ============================================================================

const EvaluatorOutputSchema = z.object({
  score: z.number().min(0).max(1),
  comment: z.string(),
});


async function correctnessEvaluator({
  outputs,
  referenceOutputs,
  promptRunner,
  model,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
  promptRunner: PromptRunner;
  model: string;
}): Promise<EvaluationResult> {
  const actualAnswer = (outputs?.answer as string) || '';
  const expectedAnswer = (referenceOutputs?.answer as string) || '';

  const prompt = `You are evaluating the correctness of an AI assistant's answer to a financial question.

Compare the actual answer to the expected answer. The actual answer is considered correct if it conveys the same key information as the expected answer. Minor differences in wording, formatting, or additional context are acceptable as long as the core facts are correct.

Expected Answer:
${expectedAnswer}

Actual Answer:
${actualAnswer}

Evaluate and provide:
- score: 1 if the answer is correct (contains the key information), 0 if incorrect
- comment: brief explanation of why the answer is correct or incorrect`;

  try {
    const result = await callStructuredLlm(prompt, EvaluatorOutputSchema, { model, runner: promptRunner });
    return {
      key: 'correctness',
      score: result.score,
      comment: result.comment,
    };
  } catch (error) {
    return {
      key: 'correctness',
      score: 0,
      comment: `Evaluator error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Eval runner factory
// ============================================================================

export interface EvaluationRunnerOptions {
  readonly sampleSize?: number;
  readonly model: string;
  readonly provider: string;
}

export function createEvaluationRunner(
  eventStream: PiEventStreamPort,
  promptRunner: PromptRunner,
  options: EvaluationRunnerOptions,
) {
  const { sampleSize, model, provider } = options;
  return async function* runEvaluation(): AsyncGenerator<unknown, void> {
    const csvPath = path.join(__dirname, 'dataset', 'finance_agent.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    let examples = parseCSV(csvContent);
    const totalCount = examples.length;

    if (sampleSize && sampleSize < examples.length) {
      examples = shuffleArray(examples).slice(0, sampleSize);
    }

    const datasetName = sampleSize
      ? `upup-finance-eval-sample-${sampleSize}-${Date.now()}`
      : 'upup-finance-eval';

    yield {
      type: 'init',
      total: examples.length,
      datasetName: sampleSize ? `finance_agent (sample ${sampleSize}/${totalCount})` : 'finance_agent',
    };

    const experimentName = `upup-eval-${Date.now().toString(36)}`;

    for (const example of examples) {
      const question = example.inputs.question;

      yield {
        type: 'question_start',
        question,
      };

      const startTime = Date.now();
      const outputs = await target(eventStream, example.inputs, model);
      const endTime = Date.now();

      const evalResult = await correctnessEvaluator({
        inputs: example.inputs,
        outputs,
        promptRunner,
        referenceOutputs: example.outputs,
        model,
      });

      const resultPath = path.join(process.cwd(), '.upup', `${experimentName}.jsonl`);
      fs.mkdirSync(path.dirname(resultPath), { recursive: true });
      fs.appendFileSync(resultPath, `${JSON.stringify({ datasetName, question, provider, model, outputs, reference: example.outputs, evaluation: evalResult, startTime, endTime })}\n`);

      yield {
        type: 'question_end',
        question,
        score: typeof evalResult.score === 'number' ? evalResult.score : 0,
        comment: evalResult.comment || '',
      };
    }

    yield {
      type: 'complete',
      experimentName,
    };
  };
}

// ============================================================================
// Main entry point
// ============================================================================

export async function runEvaluationCli(
  eventStream: PiEventStreamPort,
  promptRunner: PromptRunner,
  args: readonly string[] = process.argv.slice(2),
  deps: { stdout?: (chunk: string) => void; stderr?: (chunk: string) => void } = {},
): Promise<void> {
  const stderr = deps.stderr ?? ((chunk: string) => process.stderr.write(chunk));

  const parsed = parseEvalArgs(args);
  if (parsed.help) {
    const stdout = deps.stdout ?? ((chunk: string) => process.stdout.write(chunk));
    stdout(EVAL_HELP);
    return;
  }

  const resolved = resolveEvalModel(parsed);
  stderr(`[eval] model: ${resolved.modelString} (provider: ${resolved.provider})\n`);

  const runEvaluation = createEvaluationRunner(eventStream, promptRunner, {
    sampleSize: parsed.sampleSize,
    model: resolved.modelString,
    provider: resolved.provider,
  });

  // Pi native: the legacy EvalApp Ink UI was deleted with packages/pi-tui-app.
  // We now consume the generator directly and print progress to stderr so
  // it stays runnable in CI / scripted contexts without dragging in an Ink
  // renderer that duplicates Pi's own terminal surface.
  for await (const event of runEvaluation()) {
    if (!event) continue;
    const e = event as { type: string; [key: string]: unknown };
    switch (e.type) {
      case 'init':
        stderr(`[eval] init: total=${e.total as number} dataset=${e.datasetName as string}\n`);
        break;
      case 'question_start':
        stderr(`[eval] question: ${(e.question as string).slice(0, 80)}...\n`);
        break;
      case 'question_end':
        stderr(`[eval] result: score=${e.score as number} ${(e.comment as string).slice(0, 80)}\n`);
        break;
      case 'complete':
        stderr(`[eval] complete: experiment=${e.experimentName as string}\n`);
        break;
    }
  }
}
