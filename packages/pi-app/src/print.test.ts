import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { parsePrintArgs, runPrint } from './print';

describe('Pi-native print entry', () => {
  test('parses prompt and runtime options without creating another agent loop', () => {
    expect(parsePrintArgs(['--model', 'deepseek-v4-flash', '--session', 'cli:print', '--max-iterations', '4', '分析', '600519'])).toEqual({
      prompt: '分析 600519',
      model: 'deepseek-v4-flash',
      sessionId: 'cli:print',
      maxIterations: 4,
    });
  });

  test('supports an explicit prompt terminator', () => {
    expect(parsePrintArgs(['--model', 'gpt-5.4', '--', '--not-a-flag', '继续研究'])).toEqual({
      prompt: '--not-a-flag 继续研究',
      model: 'gpt-5.4',
    });
  });

  test('rejects missing or invalid options', () => {
    expect(() => parsePrintArgs([])).toThrow('A prompt is required');
    expect(() => parsePrintArgs(['--max-iterations', '0', 'test'])).toThrow('positive integer');
    expect(() => parsePrintArgs(['--model'])).toThrow('requires a model id');
  });

  test('runs a prompt through the Pi stream and returns the final answer', async () => {
    const provider = fauxProvider({ provider: 'upup-print-fixture', models: [{ id: 'print-fixture-model', reasoning: false }] });
    provider.setResponses([fauxAssistantMessage([fauxText('Pi print 已完成。')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(provider.provider);
    let output = '';
    const answer = await runPrint({
      prompt: '执行 print fixture',
      modelInstance: provider.getModel(),
      modelRuntime,
      maxIterations: 1,
    }, (text) => { output += text; });
    expect(answer).toBe('Pi print 已完成。');
    expect(output).toContain('Pi print 已完成。');
  });
});
