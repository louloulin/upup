/**
 * AskUserQuestion Tool Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createAskConfirmTool,
  createAskSelectTool,
  createAskMultiSelectTool,
  createAskInputTool,
  createAskResponseTool,
  getAskManager,
  resetAskManager,
} from './ask-tool.js';

describe('AskUserQuestion Tool', () => {
  beforeEach(() => {
    resetAskManager();
  });

  describe('createAskConfirmTool', () => {
    it('should create a confirmation question', async () => {
      const tool = createAskConfirmTool();
      const result = await tool.invoke({
        question: 'Do you want to proceed?',
      });

      expect(result).toContain('❓ Do you want to proceed?');
      expect(result).toContain('[yes] Yes');
      expect(result).toContain('[no] No');
      expect(result).toContain('ask_response');
    });

    it('should include request ID in output', async () => {
      const tool = createAskConfirmTool();
      const result = await tool.invoke({
        question: 'Are you sure?',
      });

      expect(result).toContain('Request ID: elicitation-');
    });
  });

  describe('createAskSelectTool', () => {
    it('should create a single selection question', async () => {
      const tool = createAskSelectTool();
      const result = await tool.invoke({
        question: 'Which environment?',
        options: [
          { value: 'prod', label: 'Production', description: 'Live environment' },
          { value: 'staging', label: 'Staging', description: 'Test environment', recommended: true },
        ],
      });

      expect(result).toContain('❓ Which environment?');
      expect(result).toContain('[1] Production');
      expect(result).toContain('[2] Staging');
      expect(result).toContain('⭐'); // recommended marker
      expect(result).toContain('Live environment');
    });

    it('should support header text', async () => {
      const tool = createAskSelectTool();
      const result = await tool.invoke({
        question: 'Select an action',
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
        header: 'Available actions:',
      });

      expect(result).toContain('Available actions:');
    });

    it('should limit options to 2-4', async () => {
      const tool = createAskSelectTool();

      // Should work with 2 options
      const result2 = await tool.invoke({
        question: 'Choose one',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      });
      expect(result2).toContain('Choose one');

      // Should work with 4 options
      const result4 = await tool.invoke({
        question: 'Choose one',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D' },
        ],
      });
      expect(result4).toContain('Choose one');
    });
  });

  describe('createAskMultiSelectTool', () => {
    it('should create a multi-selection question', async () => {
      const tool = createAskMultiSelectTool();
      const result = await tool.invoke({
        question: 'Select features to enable',
        options: [
          { value: 'auth', label: 'Authentication' },
          { value: 'analytics', label: 'Analytics' },
          { value: 'notifications', label: 'Notifications' },
        ],
      });

      expect(result).toContain('❓ Select features to enable');
      expect(result).toContain('[1] Authentication');
      expect(result).toContain('[2] Analytics');
      expect(result).toContain('separated by commas');
    });

    it('should show selection hints', async () => {
      const tool = createAskMultiSelectTool();
      const result = await tool.invoke({
        question: 'Select options',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        min_selections: 1,
        max_selections: 2,
      });

      expect(result).toContain('Select 1-2 options');
    });

    it('should limit options to 2-6', async () => {
      const tool = createAskMultiSelectTool();

      // Should work with 2 options
      const result2 = await tool.invoke({
        question: 'Select options',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      });
      expect(result2).toContain('Select options');

      // Should work with 6 options
      const result6 = await tool.invoke({
        question: 'Select options',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D' },
          { value: 'e', label: 'E' },
          { value: 'f', label: 'F' },
        ],
      });
      expect(result6).toContain('Select options');
    });
  });

  describe('createAskInputTool', () => {
    it('should create a text input question', async () => {
      const tool = createAskInputTool();
      const result = await tool.invoke({
        question: 'Enter your name',
      });

      expect(result).toContain('❓ Enter your name');
      expect(result).toContain('Enter your response:');
    });

    it('should show placeholder text', async () => {
      const tool = createAskInputTool();
      const result = await tool.invoke({
        question: 'Enter file path',
        placeholder: '/path/to/file.txt',
      });

      expect(result).toContain('/path/to/file.txt');
    });

    it('should show default value', async () => {
      const tool = createAskInputTool();
      const result = await tool.invoke({
        question: 'Enter file path',
        default_value: 'reports/output.txt',
      });

      expect(result).toContain('Default: reports/output.txt');
    });

    it('should indicate multiline mode', async () => {
      const tool = createAskInputTool();
      const result = await tool.invoke({
        question: 'Enter description',
        multiline: true,
      });

      expect(result).toContain('Ctrl+D to submit');
    });
  });

  describe('createAskResponseTool', () => {
    it('should submit a yes/no response', async () => {
      // First create a confirm question
      const confirmTool = createAskConfirmTool();
      const confirmResult = await confirmTool.invoke({ question: 'Proceed?' });

      // Extract request ID
      const idMatch = confirmResult.match(/Request ID: ([\w-]+)/);
      expect(idMatch).toBeTruthy();

      // Submit response
      const responseTool = createAskResponseTool();
      const submitResult = await responseTool.invoke({
        request_id: idMatch![1],
        value: 'yes',
      });

      expect(submitResult).toContain('Response submitted');
      expect(submitResult).toContain('yes');
    });

    it('should submit a selection response', async () => {
      // Create a select question
      const selectTool = createAskSelectTool();
      const selectResult = await selectTool.invoke({
        question: 'Choose one',
        options: [
          { value: 'option1', label: 'Option 1' },
          { value: 'option2', label: 'Option 2' },
        ],
      });

      // Extract request ID
      const idMatch = selectResult.match(/Request ID: ([\w-]+)/);
      expect(idMatch).toBeTruthy();

      // Submit response using value
      const responseTool = createAskResponseTool();
      const submitResult = await responseTool.invoke({
        request_id: idMatch![1],
        value: 'option2',
      });

      expect(submitResult).toContain('Response submitted');
      expect(submitResult).toContain('option2');
    });

    it('should submit multi-select with comma-separated values', async () => {
      // Create a multi-select question
      const multiTool = createAskMultiSelectTool();
      const multiResult = await multiTool.invoke({
        question: 'Select multiple',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ],
      });

      // Extract request ID
      const idMatch = multiResult.match(/Request ID: ([\w-]+)/);
      expect(idMatch).toBeTruthy();

      // Submit multiple values
      const responseTool = createAskResponseTool();
      const submitResult = await responseTool.invoke({
        request_id: idMatch![1],
        value: 'a, c',
      });

      expect(submitResult).toContain('Response submitted');
    });

    it('should skip a question', async () => {
      // Create a question
      const inputTool = createAskInputTool();
      const inputResult = await inputTool.invoke({ question: 'Enter name' });

      // Extract request ID
      const idMatch = inputResult.match(/Request ID: ([\w-]+)/);
      expect(idMatch).toBeTruthy();

      // Skip it
      const responseTool = createAskResponseTool();
      const skipResult = await responseTool.invoke({
        request_id: idMatch![1],
        skip: true,
      });

      expect(skipResult).toContain('skipped');
    });

    it('should return error for missing value', async () => {
      const responseTool = createAskResponseTool();
      const result = await responseTool.invoke({
        request_id: 'non-existent-id',
        // No value or skip
      });

      expect(result).toContain('Error');
      expect(result).toContain('No value provided');
    });

    it('should detect already-submitted response', async () => {
      // Create a question
      const confirmTool = createAskConfirmTool();
      const confirmResult = await confirmTool.invoke({ question: 'Proceed?' });

      // Extract request ID
      const idMatch = confirmResult.match(/Request ID: ([\w-]+)/);
      expect(idMatch).toBeTruthy();
      const requestId = idMatch![1];

      // Submit first time
      const responseTool = createAskResponseTool();
      await responseTool.invoke({ request_id: requestId, value: 'yes' });

      // Try to submit again
      const duplicateResult = await responseTool.invoke({
        request_id: requestId,
        value: 'no',
      });

      expect(duplicateResult).toContain('already submitted');
    });
  });

  describe('AskManager', () => {
    it('should create and manage requests', () => {
      const manager = getAskManager();

      const confirm = manager.createConfirm('Continue?');
      expect(confirm.requestId).toBeTruthy();
      expect(confirm.type).toBe('confirm');
      expect(confirm.formattedPrompt).toContain('Continue?');

      const select = manager.createSelect('Pick one', [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
      ]);
      expect(select.requestId).toBeTruthy();
      expect(select.type).toBe('select');
      expect(select.options).toHaveLength(2);

      const multi = manager.createMultiSelect('Pick many', [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ]);
      expect(multi.requestId).toBeTruthy();
      expect(multi.type).toBe('multi_select');

      const input = manager.createInput('Enter text');
      expect(input.requestId).toBeTruthy();
      expect(input.type).toBe('input');
    });

    it('should handle response submission', () => {
      const manager = getAskManager();

      const confirm = manager.createConfirm('Proceed?');
      manager.submitValue(confirm.requestId, 'yes');

      const response = manager.getResponse(confirm.requestId);
      expect(response).toBeTruthy();
      expect(response!.value).toBe('yes');
      expect(response!.skipped).toBe(false);
    });

    it('should handle skip', () => {
      const manager = getAskManager();

      const input = manager.createInput('Enter name');
      manager.submitSkip(input.requestId);

      const response = manager.getResponse(input.requestId);
      expect(response).toBeTruthy();
      expect(response!.skipped).toBe(true);
    });
  });
});
