/**
 * Tests for FallbackTriggered integration in Agent
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import {
  FallbackTriggeredError,
  ModelFallbackHandler,
  isFallbackError,
  OutputTokenLimitError,
  ContextOverflowError,
  LoopExhaustedError,
  stripThinkingSignatures,
  increaseTokenLimit,
  getDefaultTokenLimit,
  getErrorDetails,
} from './fallback.js';

describe('FallbackTriggeredError', () => {
  it('should create error with correct properties', () => {
    const original = new Error('API rate limit');
    const error = new FallbackTriggeredError('Model failed', original, 'gpt-5.4');

    expect(error.name).toBe('FallbackTriggeredError');
    expect(error.message).toBe('Model failed');
    expect(error.originalError).toBe(original);
    expect(error.failedModel).toBe('gpt-5.4');
  });

  it('should be an instance of Error', () => {
    const error = new FallbackTriggeredError('test', new Error('x'), 'model');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FallbackTriggeredError);
  });
});

describe('OutputTokenLimitError', () => {
  it('should create error with limit and model', () => {
    const error = new OutputTokenLimitError('Token limit exceeded', 8192, 'gpt-5.4');
    expect(error.name).toBe('OutputTokenLimitError');
    expect(error.limit).toBe(8192);
    expect(error.model).toBe('gpt-5.4');
  });
});

describe('ContextOverflowError', () => {
  it('should create error with context length', () => {
    const error = new ContextOverflowError('Context overflow', 200000);
    expect(error.name).toBe('ContextOverflowError');
    expect(error.contextLength).toBe(200000);
  });
});

describe('LoopExhaustedError', () => {
  it('should create error with last error', () => {
    const lastErr = new Error('final failure');
    const error = new LoopExhaustedError('All models exhausted', lastErr);
    expect(error.name).toBe('LoopExhaustedError');
    expect(error.lastError).toBe(lastErr);
  });

  it('should work without last error', () => {
    const error = new LoopExhaustedError('No models available');
    expect(error.name).toBe('LoopExhaustedError');
    expect(error.lastError).toBeUndefined();
  });
});

describe('isFallbackError', () => {
  it('should return true for FallbackTriggeredError', () => {
    expect(isFallbackError(new FallbackTriggeredError('test', new Error(), 'model'))).toBe(true);
  });

  it('should return true for OutputTokenLimitError', () => {
    expect(isFallbackError(new OutputTokenLimitError('test', 100, 'model'))).toBe(true);
  });

  it('should return true for ContextOverflowError', () => {
    expect(isFallbackError(new ContextOverflowError('test', 100))).toBe(true);
  });

  it('should return false for generic Error', () => {
    expect(isFallbackError(new Error('test'))).toBe(false);
  });

  it('should return false for non-Error', () => {
    expect(isFallbackError('string')).toBe(false);
  });
});

describe('getErrorDetails', () => {
  it('should extract FallbackTriggeredError details', () => {
    const details = getErrorDetails(new FallbackTriggeredError('fail', new Error(), 'gpt-5.4'));
    expect(details.type).toBe('FallbackTriggered');
    expect(details.model).toBe('gpt-5.4');
  });

  it('should extract OutputTokenLimitError details', () => {
    const details = getErrorDetails(new OutputTokenLimitError('limit', 8192, 'gpt-4o'));
    expect(details.type).toBe('OutputTokenLimit');
    expect(details.model).toBe('gpt-4o');
  });

  it('should extract ContextOverflowError details', () => {
    const details = getErrorDetails(new ContextOverflowError('overflow', 200000));
    expect(details.type).toBe('ContextOverflow');
  });

  it('should extract LoopExhaustedError details', () => {
    const details = getErrorDetails(new LoopExhaustedError('exhausted'));
    expect(details.type).toBe('LoopExhausted');
  });

  it('should handle generic errors', () => {
    const details = getErrorDetails(new Error('generic'));
    expect(details.type).toBe('Error');
    expect(details.message).toBe('generic');
  });

  it('should handle non-Error values', () => {
    const details = getErrorDetails('string error');
    expect(details.type).toBe('Unknown');
  });
});

describe('ModelFallbackHandler', () => {
  let handler: ModelFallbackHandler;

  beforeEach(() => {
    handler = new ModelFallbackHandler({
      primaryModel: 'primary-model',
      fallbackModels: ['fallback-1', 'fallback-2'],
      maxRetriesPerModel: 2,
      enableTokenLimitRecovery: false,
      enableThinkingStrip: false,
    });
  });

  it('should return primary model as current model', () => {
    expect(handler.getCurrentModel()).toBe('primary-model');
  });

  it('should return all available models', () => {
    const models = handler.getAvailableModels();
    expect(models).toContain('primary-model');
    expect(models).toContain('fallback-1');
    expect(models).toContain('fallback-2');
  });

  it('should succeed with primary model', async () => {
    const callFn = vi.fn().mockResolvedValue({
      response: { content: 'success' },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      model: 'primary-model',
    });

    const result = await handler.executeWithFallback(callFn);
    expect(result.model).toBe('primary-model');
    expect(callFn).toHaveBeenCalledTimes(1);
  });

  it('should fallback to next model on failure', async () => {
    const callFn = vi.fn()
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockResolvedValueOnce({
        response: { content: 'fallback success' },
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        model: 'fallback-1',
      });

    const result = await handler.executeWithFallback(callFn);
    expect(result.model).toBe('fallback-1');
    expect(callFn).toHaveBeenCalledTimes(2);
  });

  it('should throw LoopExhaustedError when all models fail', async () => {
    const callFn = vi.fn().mockRejectedValue(new Error('all fail'));

    await expect(handler.executeWithFallback(callFn)).rejects.toThrow(LoopExhaustedError);
  });

  it('should reset to primary model', () => {
    handler.reset();
    expect(handler.getCurrentModel()).toBe('primary-model');
  });
});

describe('stripThinkingSignatures', () => {
  it('should strip Claude thinking tags', () => {
    const input = 'Hello <thinking>internal reasoning</thinking> World';
    const result = stripThinkingSignatures(input);
    expect(result).toBe('Hello  World');
  });

  it('should handle content without thinking tags', () => {
    const input = 'No thinking here';
    expect(stripThinkingSignatures(input)).toBe('No thinking here');
  });

  it('should clean up extra whitespace', () => {
    const input = 'Hello\n\n\n\nWorld';
    const result = stripThinkingSignatures(input);
    expect(result).toBe('Hello\n\nWorld');
  });
});

describe('Token limit helpers', () => {
  it('should return default token limit for known models', () => {
    expect(getDefaultTokenLimit('gpt-5.4')).toBe(8192);
    expect(getDefaultTokenLimit('gpt-4o')).toBe(16384);
  });

  it('should return 4096 for unknown models', () => {
    expect(getDefaultTokenLimit('unknown-model')).toBe(4096);
  });

  it('should double token limit with cap at 65536', () => {
    expect(increaseTokenLimit(4096)).toBe(8192);
    expect(increaseTokenLimit(32768)).toBe(65536);
    expect(increaseTokenLimit(65536)).toBe(65536);
  });
});
