import { describe, expect, test } from 'bun:test';
import { parseEvalArgs, resolveEvalModel, runEvaluationCli } from './run';
import type { PiEventStreamPort } from '@upup/pi-app';
import type { PromptRunner } from '@upup/utils';

function makeEventStream(answers: string[]): PiEventStreamPort {
  let i = 0;
  return {
    async *stream(_prompt: string, _opts: { model: string; maxIterations: number }) {
      yield { type: 'run_end', answer: answers[i++] ?? '' };
    },
  } as unknown as PiEventStreamPort;
}

const noopRunner: PromptRunner = (async () => JSON.stringify({ score: 1, comment: 'ok' })) as unknown as PromptRunner;

describe('parseEvalArgs', () => {
  test('returns empty shape for no args', () => {
    expect(parseEvalArgs([])).toEqual({ help: false, sampleSize: undefined, provider: undefined, model: undefined });
  });

  test('parses --help and -h', () => {
    expect(parseEvalArgs(['--help']).help).toBe(true);
    expect(parseEvalArgs(['-h']).help).toBe(true);
  });

  test('parses --sample N', () => {
    expect(parseEvalArgs(['--sample', '5']).sampleSize).toBe(5);
    expect(parseEvalArgs(['--sample', '0']).sampleSize).toBe(0);
    expect(parseEvalArgs(['--sample', '12']).sampleSize).toBe(12);
  });

  test('ignores --sample without value', () => {
    expect(parseEvalArgs(['--sample']).sampleSize).toBeUndefined();
    expect(parseEvalArgs(['--sample', '--provider', 'x']).sampleSize).toBeUndefined();
  });

  test('parses --provider and --model', () => {
    expect(parseEvalArgs(['--provider', 'minimax', '--model', 'MiniMax-M3'])).toEqual({
      help: false,
      sampleSize: undefined,
      provider: 'minimax',
      model: 'MiniMax-M3',
    });
  });

  test('parses flags regardless of order', () => {
    expect(parseEvalArgs(['--model', 'gpt-5.4', '--sample', '3', '--provider', 'openai'])).toEqual({
      help: false,
      sampleSize: 3,
      provider: 'openai',
      model: 'gpt-5.4',
    });
  });
});

describe('resolveEvalModel', () => {
  test('explicit --provider and --model wins', () => {
    const resolved = resolveEvalModel({ help: false, sampleSize: undefined, provider: 'minimax', model: 'MiniMax-M3' });
    expect(resolved.provider).toBe('minimax');
    expect(resolved.model).toBe('MiniMax-M3');
    expect(resolved.modelString).toBe('minimax:MiniMax-M3');
  });

  test('falls back to .upup/settings.json when no explicit flags', () => {
    const resolved = resolveEvalModel({ help: false, sampleSize: undefined, provider: undefined, model: undefined });
    expect(resolved.modelString).toMatch(/^[a-z0-9_-]+:[A-Za-z0-9._-]+$/);
  });

  test('explicit --model keeps provider from settings.json', () => {
    const resolved = resolveEvalModel({ help: false, sampleSize: undefined, provider: undefined, model: 'gpt-5.4' });
    expect(resolved.model).toBe('gpt-5.4');
    expect(resolved.modelString.endsWith(':gpt-5.4')).toBe(true);
  });

  test('does not double-prefix when model already has a provider prefix', () => {
    const resolved = resolveEvalModel({ help: false, sampleSize: undefined, provider: 'openai', model: 'minimax:MiniMax-M3' });
    expect(resolved.modelString).toBe('minimax:MiniMax-M3');
  });
});

describe('runEvaluationCli', () => {
  test('--help prints usage and never streams', async () => {
    const stderr: string[] = [];
    const stdout: string[] = [];
    const stream = makeEventStream([]);
    const writes = { stderr: (c: string) => stderr.push(c), stdout: (c: string) => stdout.push(c) };
    await runEvaluationCli(stream, noopRunner, ['--help'], writes);
    expect(stdout.join('')).toContain('UpUp finance evaluation runner');
    expect(stderr.join('')).toBe('');
  });

  test('-h is alias for --help', async () => {
    const stdout: string[] = [];
    const writes = { stdout: (c: string) => stdout.push(c), stderr: () => {} };
    await runEvaluationCli(makeEventStream([]), noopRunner, ['-h'], writes);
    expect(stdout.join('')).toContain('Usage');
  });

  test('prints resolved model banner and runs eval', async () => {
    const stderr: string[] = [];
    const writes = { stderr: (c: string) => stderr.push(c), stdout: () => {} };
    const stream = makeEventStream(['stubbed answer']);
    await runEvaluationCli(stream, noopRunner, ['--sample', '1', '--provider', 'minimax', '--model', 'MiniMax-M3'], writes);
    const log = stderr.join('');
    expect(log).toMatch(/\[eval\] model: minimax:MiniMax-M3 \(provider: minimax\)/);
    expect(log).toMatch(/\[eval\] init: total=1/);
    expect(log).toMatch(/\[eval\] result: score=1/);
    expect(log).toMatch(/\[eval\] complete:/);
  });
});
