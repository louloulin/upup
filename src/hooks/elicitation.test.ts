/**
 * Unit tests for Elicitation Hooks
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  ElicitationManager,
  createElicitationRequestHook,
  createChoiceValidationHook,
  formatElicitationPrompt,
  parseElicitationResponse,
  getElicitationManager,
  resetElicitationManager,
  type ElicitationRequest,
  type ElicitationResponse,
  type ElicitationChoice,
} from './elicitation.js';

describe('ElicitationManager', () => {
  let manager: ElicitationManager;

  beforeEach(() => {
    resetElicitationManager();
    manager = new ElicitationManager();
  });

  describe('Request creation', () => {
    test('createRequest generates unique ID', () => {
      const request = manager.createRequest({
        question: 'What is your name?',
        type: 'text',
        sessionId: 'test-session',
      });

      expect(request.id).toBeDefined();
      expect(request.id).toMatch(/^elicitation-/);
    });

    test('createRequest includes all params', () => {
      const choices: ElicitationChoice[] = [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ];

      const request = manager.createRequest({
        question: 'Choose one',
        type: 'choice',
        choices,
        defaultValue: 'a',
        timeout: 5000,
        sessionId: 'test-session',
      });

      expect(request.question).toBe('Choose one');
      expect(request.type).toBe('choice');
      expect(request.choices).toEqual(choices);
      expect(request.defaultValue).toBe('a');
      expect(request.timeout).toBe(5000);
      expect(request.sessionId).toBe('test-session');
    });

    test('getRequest retrieves pending request', () => {
      const created = manager.createRequest({
        question: 'Test?',
        type: 'confirm',
        sessionId: 'test',
      });

      const retrieved = manager.getRequest(created.id);
      expect(retrieved).toEqual(created);
    });

    test('getRequest returns undefined for non-existent', () => {
      const result = manager.getRequest('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('Response handling', () => {
    test('submitResponse stores and removes pending', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      const response: ElicitationResponse = {
        requestId: request.id,
        value: 'user input',
        skipped: false,
        timestamp: Date.now(),
      };

      manager.submitResponse(response);

      expect(manager.getResponse(request.id)).toEqual(response);
      expect(manager.getRequest(request.id)).toBeUndefined();
    });

    test('submitValue creates response from value', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      manager.submitValue(request.id, 'typed input');

      const response = manager.getResponse(request.id);
      expect(response?.value).toBe('typed input');
      expect(response?.skipped).toBe(false);
    });

    test('submitSkip uses default value', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        defaultValue: 'default',
        sessionId: 'test',
      });

      manager.submitSkip(request.id);

      const response = manager.getResponse(request.id);
      expect(response?.value).toBe('default');
      expect(response?.skipped).toBe(true);
    });

    test('submitSkip uses empty string if no default', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      manager.submitSkip(request.id);

      const response = manager.getResponse(request.id);
      expect(response?.value).toBe('');
      expect(response?.skipped).toBe(true);
    });
  });

  describe('Wait for response', () => {
    test('waitForResponse resolves when response received', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      // Submit response after a small delay
      setTimeout(() => {
        manager.submitValue(request.id, 'async response');
      }, 10);

      const response = await manager.waitForResponse(request.id, 1000);
      expect(response.value).toBe('async response');
    });

    test('waitForResponse resolves immediately if already responded', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      manager.submitValue(request.id, 'immediate');

      const response = await manager.waitForResponse(request.id);
      expect(response.value).toBe('immediate');
    });

    test('waitForResponse rejects on timeout', async () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      await expect(manager.waitForResponse(request.id, 50)).rejects.toThrow('timed out');
    });
  });

  describe('Pending request management', () => {
    test('getPendingRequests returns all pending', () => {
      manager.createRequest({ question: 'Q1', type: 'text', sessionId: 'test' });
      manager.createRequest({ question: 'Q2', type: 'text', sessionId: 'test' });

      const pending = manager.getPendingRequests();
      expect(pending).toHaveLength(2);
    });

    test('cancelRequest removes pending', () => {
      const request = manager.createRequest({
        question: 'Test?',
        type: 'text',
        sessionId: 'test',
      });

      const result = manager.cancelRequest(request.id);
      expect(result).toBe(true);
      expect(manager.getRequest(request.id)).toBeUndefined();
    });

    test('cancelRequest returns false for non-existent', () => {
      const result = manager.cancelRequest('non-existent');
      expect(result).toBe(false);
    });

    test('clearPending removes all', () => {
      manager.createRequest({ question: 'Q1', type: 'text', sessionId: 'test' });
      manager.createRequest({ question: 'Q2', type: 'text', sessionId: 'test' });

      manager.clearPending();

      expect(manager.getPendingRequests()).toHaveLength(0);
    });
  });
});

describe('Singleton functions', () => {
  test('getElicitationManager returns same instance', () => {
    resetElicitationManager();
    const mgr1 = getElicitationManager();
    const mgr2 = getElicitationManager();

    expect(mgr1).toBe(mgr2);
  });

  test('resetElicitationManager clears instance', () => {
    const mgr1 = getElicitationManager();
    resetElicitationManager();
    const mgr2 = getElicitationManager();

    expect(mgr1).not.toBe(mgr2);
  });
});

describe('Built-in hooks', () => {
  test('createElicitationRequestHook returns correct structure', () => {
    const hook = createElicitationRequestHook();

    expect(hook.id).toBe('elicitation-request-handler');
    expect(hook.event).toBe('ElicitationRequest');
    expect(hook.type).toBe('function');
    expect(typeof hook.handler).toBe('function');
  });

  test('createChoiceValidationHook returns correct structure', () => {
    const hook = createChoiceValidationHook();

    expect(hook.id).toBe('elicitation-choice-validation');
    expect(hook.event).toBe('ElicitationResponse');
    expect(hook.type).toBe('function');
    expect(typeof hook.handler).toBe('function');
  });

  test('choice validation accepts valid choices', async () => {
    const hook = createChoiceValidationHook();

    const request: ElicitationRequest = {
      id: 'test',
      question: 'Choose one',
      type: 'choice',
      choices: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      sessionId: 'test',
    };

    const response: ElicitationResponse = {
      requestId: 'test',
      value: 'a',
      skipped: false,
      timestamp: Date.now(),
    };

    const result = await hook.handler({ request, response }, null);

    expect(result.valid).toBe(true);
  });

  test('choice validation rejects invalid choice', async () => {
    const hook = createChoiceValidationHook();

    const request: ElicitationRequest = {
      id: 'test',
      question: 'Choose one',
      type: 'choice',
      choices: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      sessionId: 'test',
    };

    const response: ElicitationResponse = {
      requestId: 'test',
      value: 'c', // Invalid choice
      skipped: false,
      timestamp: Date.now(),
    };

    const result = await hook.handler({ request, response }, null);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid selection');
  });

  test('confirm validation accepts yes/no', async () => {
    const hook = createChoiceValidationHook();

    const request: ElicitationRequest = {
      id: 'test',
      question: 'Continue?',
      type: 'confirm',
      sessionId: 'test',
    };

    const yesResponse: ElicitationResponse = {
      requestId: 'test',
      value: 'yes',
      skipped: false,
      timestamp: Date.now(),
    };

    const noResponse: ElicitationResponse = {
      requestId: 'test',
      value: 'no',
      skipped: false,
      timestamp: Date.now(),
    };

    const yesResult = await hook.handler({ request, response: yesResponse }, null);
    const noResult = await hook.handler({ request, response: noResponse }, null);

    expect(yesResult.valid).toBe(true);
    expect(noResult.valid).toBe(true);
  });

  test('confirm validation rejects invalid input', async () => {
    const hook = createChoiceValidationHook();

    const request: ElicitationRequest = {
      id: 'test',
      question: 'Continue?',
      type: 'confirm',
      sessionId: 'test',
    };

    const response: ElicitationResponse = {
      requestId: 'test',
      value: 'maybe', // Invalid
      skipped: false,
      timestamp: Date.now(),
    };

    const result = await hook.handler({ request, response }, null);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('yes/no');
  });
});

describe('formatElicitationPrompt', () => {
  test('formats choice elicitation', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Which color?',
      type: 'choice',
      choices: [
        { value: 'red', label: 'Red', recommended: true },
        { value: 'blue', label: 'Blue' },
      ],
      sessionId: 'test',
    };

    const prompt = formatElicitationPrompt(request);

    expect(prompt).toContain('Which color?');
    expect(prompt).toContain('1. Red');
    expect(prompt).toContain('2. Blue');
    expect(prompt).toContain('recommended');
  });

  test('formats confirm elicitation', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Proceed?',
      type: 'confirm',
      sessionId: 'test',
    };

    const prompt = formatElicitationPrompt(request);

    expect(prompt).toContain('Proceed?');
    expect(prompt).toContain('1. Yes');
    expect(prompt).toContain('2. No');
  });

  test('includes timeout if specified', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Quick!',
      type: 'confirm',
      timeout: 30000,
      sessionId: 'test',
    };

    const prompt = formatElicitationPrompt(request);

    expect(prompt).toContain('30s');
  });
});

describe('parseElicitationResponse', () => {
  test('parses number for choice type', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Choose',
      type: 'choice',
      choices: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      sessionId: 'test',
    };

    expect(parseElicitationResponse(request, '1')).toBe('a');
    expect(parseElicitationResponse(request, '2')).toBe('b');
  });

  test('parses comma-separated for multi-select', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Select multiple',
      type: 'select',
      choices: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
      ],
      multiSelect: true,
      sessionId: 'test',
    };

    expect(parseElicitationResponse(request, '1, 3')).toEqual(['a', 'c']);
    expect(parseElicitationResponse(request, '2 1')).toEqual(['b', 'a']);
  });

  test('returns default for empty input', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Enter name',
      type: 'text',
      defaultValue: 'Anonymous',
      sessionId: 'test',
    };

    expect(parseElicitationResponse(request, '')).toBe('Anonymous');
  });

  test('returns null for invalid choice', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Choose',
      type: 'choice',
      choices: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      sessionId: 'test',
    };

    expect(parseElicitationResponse(request, '5')).toBeNull();
    expect(parseElicitationResponse(request, 'abc')).toBeNull();
  });

  test('parses text input', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Enter name',
      type: 'text',
      sessionId: 'test',
    };

    expect(parseElicitationResponse(request, 'John Doe')).toBe('John Doe');
  });

  test('parses priority input', () => {
    const request: ElicitationRequest = {
      id: 'test',
      question: 'Rank them',
      type: 'priority',
      sessionId: 'test',
    };

    expect(parseElicitationResponse(request, '3, 1, 2')).toBe('3, 1, 2');
  });
});
