/**
 * AskUserQuestion Tool - Interactive User Questions
 *
 * Provides tools for asking users structured questions:
 * - ask_confirm: Yes/No confirmation
 * - ask_select: Single selection from options
 * - ask_multi_select: Multiple selection from options
 * - ask_input: Free text input
 *
 * Reference: Claude Code's AskUserQuestion / Loucode's elicitation system
 *
 * Uses BorderBox for consistent border styling
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';
import { getElicitationManager, ElicitationRequest, ElicitationResponse, ElicitationChoice } from '../../hooks/elicitation.js';
import { BorderBox } from '../../components/BorderBox.js';
import { Text } from '@earendil-works/pi-tui';
import { theme } from '../../theme.js';

// ============================================================================
// Types
// ============================================================================

export type AskType = 'confirm' | 'select' | 'multi_select' | 'input';

export interface AskQuestionResult {
  requestId: string;
  question: string;
  type: AskType;
  options?: ElicitationChoice[];
  formattedPrompt: string;
}

// ============================================================================
// Ask Manager
// ============================================================================

/**
 * Manages ask/elicitation requests and user input
 */
export class AskManager {
  private manager = getElicitationManager();

  /**
   * Create a confirmation question
   */
  createConfirm(question: string, options?: { timeout?: number }): AskQuestionResult {
    const request = this.manager.createRequest({
      question,
      type: 'confirm',
      choices: [
        { value: 'yes', label: 'Yes', description: 'Confirm the action' },
        { value: 'no', label: 'No', description: 'Cancel the action' },
      ],
      sessionId: process.env.SESSION_ID || 'default',
      timeout: options?.timeout,
    });

    const formattedPrompt = this.formatConfirmPrompt(request);
    return {
      requestId: request.id,
      question,
      type: 'confirm',
      formattedPrompt,
    };
  }

  /**
   * Create a single selection question
   */
  createSelect(
    question: string,
    choices: ElicitationChoice[],
    options?: { timeout?: number; header?: string }
  ): AskQuestionResult {
    const request = this.manager.createRequest({
      question,
      type: 'select',
      choices,
      sessionId: process.env.SESSION_ID || 'default',
      timeout: options?.timeout,
    });

    const formattedPrompt = this.formatSelectPrompt(request, options?.header);
    return {
      requestId: request.id,
      question,
      type: 'select',
      options: choices,
      formattedPrompt,
    };
  }

  /**
   * Create a multi-selection question
   */
  createMultiSelect(
    question: string,
    choices: ElicitationChoice[],
    options?: { timeout?: number; header?: string; minSelections?: number; maxSelections?: number }
  ): AskQuestionResult {
    const request = this.manager.createRequest({
      question,
      type: 'select',
      choices,
      multiSelect: true,
      sessionId: process.env.SESSION_ID || 'default',
      timeout: options?.timeout,
    });

    const formattedPrompt = this.formatMultiSelectPrompt(request, options?.header, options?.minSelections, options?.maxSelections);
    return {
      requestId: request.id,
      question,
      type: 'multi_select',
      options: choices,
      formattedPrompt,
    };
  }

  /**
   * Create a free text input question
   */
  createInput(
    question: string,
    options?: { placeholder?: string; defaultValue?: string; timeout?: number; multiline?: boolean }
  ): AskQuestionResult {
    const request = this.manager.createRequest({
      question,
      type: 'text',
      placeholder: options?.placeholder,
      defaultValue: options?.defaultValue,
      sessionId: process.env.SESSION_ID || 'default',
      timeout: options?.timeout,
    });

    const formattedPrompt = this.formatInputPrompt(request, options?.multiline);
    return {
      requestId: request.id,
      question,
      type: 'input',
      formattedPrompt,
    };
  }

  /**
   * Submit a response to a request
   */
  submitValue(requestId: string, value: string | string[]): void {
    this.manager.submitValue(requestId, value);
  }

  /**
   * Submit skip/cancel response
   */
  submitSkip(requestId: string): void {
    this.manager.submitSkip(requestId);
  }

  /**
   * Get response for a request
   */
  getResponse(requestId: string): ElicitationResponse | undefined {
    return this.manager.getResponse(requestId);
  }

  /**
   * Format confirm prompt for terminal display using BorderBox
   */
  private formatConfirmPrompt(request: ElicitationRequest): string {
    const lines: string[] = [];

    // Header box with question
    const headerBox = new BorderBox(
      [new Text(theme.primary(`❓ ${request.question}`), 0, 0)],
      { style: 'double', paddingX: 1, paddingY: 0 }
    );
    lines.push(headerBox.render(60).join('\n'));

    // Choices
    if (request.choices) {
      for (const choice of request.choices) {
        lines.push(`  [${choice.value}] ${choice.label}`);
        if (choice.description) {
          lines.push(`        ${choice.description}`);
        }
      }
    }

    // Footer
    const footerBox = new BorderBox(
      [new Text(theme.muted('Enter your choice (yes/no): '), 0, 0)],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );
    lines.push(footerBox.render(60).join('\n'));

    return lines.join('\n');
  }

  /**
   * Format select prompt for terminal display using BorderBox
   */
  private formatSelectPrompt(request: ElicitationRequest, header?: string): string {
    const lines: string[] = [];

    // Header with question
    const headerItems: Text[] = [new Text(theme.primary(`❓ ${request.question}`), 0, 0)];
    if (header) {
      headerItems.push(new Text(theme.muted(header), 0, 0));
    }
    const headerBox = new BorderBox(headerItems, { style: 'double', paddingX: 1, paddingY: 0 });
    lines.push(headerBox.render(60).join('\n'));

    // Choices
    if (request.choices) {
      for (let i = 0; i < request.choices.length; i++) {
        const choice = request.choices[i];
        const recommended = choice.recommended ? ' ⭐' : '';
        lines.push(`  [${i + 1}] ${choice.label}${recommended}`);
        if (choice.description) {
          lines.push(`       ${choice.description}`);
        }
      }
    }

    // Footer
    const footerBox = new BorderBox(
      [new Text(theme.muted('Enter your choice (number): '), 0, 0)],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );
    lines.push(footerBox.render(60).join('\n'));

    return lines.join('\n');
  }

  /**
   * Format multi-select prompt for terminal display using BorderBox
   */
  private formatMultiSelectPrompt(
    request: ElicitationRequest,
    header?: string,
    minSelections?: number,
    maxSelections?: number
  ): string {
    const lines: string[] = [];

    // Header with question
    const headerItems: Text[] = [new Text(theme.primary(`❓ ${request.question}`), 0, 0)];
    if (header) {
      headerItems.push(new Text(theme.muted(header), 0, 0));
    }
    const headerBox = new BorderBox(headerItems, { style: 'double', paddingX: 1, paddingY: 0 });
    lines.push(headerBox.render(60).join('\n'));

    // Choices
    if (request.choices) {
      for (let i = 0; i < request.choices.length; i++) {
        const choice = request.choices[i];
        lines.push(`  [${i + 1}] ${choice.label}`);
        if (choice.description) {
          lines.push(`       ${choice.description}`);
        }
      }
    }

    // Hint
    let hint = 'Enter numbers separated by commas (e.g., 1,3,5)';
    if (minSelections || maxSelections) {
      if (minSelections && maxSelections && minSelections === maxSelections) {
        hint = `Select exactly ${minSelections} option(s)`;
      } else if (minSelections && maxSelections) {
        hint = `Select ${minSelections}-${maxSelections} options`;
      } else if (minSelections) {
        hint = `Select at least ${minSelections} option(s)`;
      } else if (maxSelections) {
        hint = `Select up to ${maxSelections} option(s)`;
      }
    }

    // Footer with hint
    const footerBox = new BorderBox(
      [
        new Text(theme.muted(hint), 0, 0),
        new Text('', 0, 0),
        new Text(theme.muted('Enter your choices: '), 0, 0),
      ],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );
    lines.push(footerBox.render(60).join('\n'));

    return lines.join('\n');
  }

  /**
   * Format input prompt for terminal display using BorderBox
   */
  private formatInputPrompt(request: ElicitationRequest, multiline?: boolean): string {
    const lines: string[] = [];

    // Header with question
    const headerBox = new BorderBox(
      [new Text(theme.primary(`❓ ${request.question}`), 0, 0)],
      { style: 'double', paddingX: 1, paddingY: 0 }
    );
    lines.push(headerBox.render(60).join('\n'));

    // Placeholder and default value
    const infoItems: Text[] = [];
    if (request.placeholder) {
      infoItems.push(new Text(theme.muted(request.placeholder), 0, 0));
    }
    if (request.defaultValue) {
      infoItems.push(new Text(theme.muted(`(Default: ${request.defaultValue})`), 0, 0));
    }
    if (infoItems.length > 0) {
      const infoBox = new BorderBox(infoItems, { style: 'single', paddingX: 1, paddingY: 0 });
      lines.push(infoBox.render(60).join('\n'));
    }

    // Footer with prompt
    const promptText = multiline
      ? 'Enter your response (Ctrl+D to submit, Ctrl+C to cancel): '
      : 'Enter your response: ';
    const footerBox = new BorderBox(
      [new Text(theme.muted(promptText), 0, 0)],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );
    lines.push(footerBox.render(60).join('\n'));

    return lines.join('\n');
  }
}

// Singleton
let askManager: AskManager | null = null;

export function getAskManager(): AskManager {
  if (!askManager) {
    askManager = new AskManager();
  }
  return askManager;
}

export function resetAskManager(): void {
  askManager = null;
}

// ============================================================================
// Tool Schemas
// ============================================================================

export const ASK_CONFIRM_DESCRIPTION = `
Ask the user a yes/no confirmation question.

## When to Use

- Before executing destructive actions (delete, overwrite)
- Confirming user intent for critical operations
- Getting user approval for multi-step workflows

## Options

- **question**: The confirmation question to ask (required)
- **timeout**: Optional timeout in milliseconds

## Example

Confirm before deleting a file:
- question: "Are you sure you want to delete all test files?"
`;

export const AskConfirmSchema = z.object({
  question: z.string().describe('The confirmation question to ask'),
  timeout: z.number().optional().describe('Optional timeout in milliseconds'),
});

export const ASK_SELECT_DESCRIPTION = `
Ask the user to select one option from a list.

## When to Use

- Choosing between different approaches
- Selecting one item from available options
- Making a single choice decision

## Options

- **question**: The question to ask (required)
- **options**: Array of options with value and label (required, 2-4 options)
- **header**: Optional header text for context
- **timeout**: Optional timeout in milliseconds

## Options Format

Each option should have:
- **value**: Unique identifier for the option
- **label**: Human-readable label
- **description**: Optional description
- **recommended**: Optional boolean to mark recommended option

## Example

Select a deployment environment:
- question: "Which environment should we deploy to?"
- options:
  - { value: "prod", label: "Production", description: "Live production environment" }
  - { value: "staging", label: "Staging", description: "Pre-production testing", recommended: true }
  - { value: "dev", label: "Development", description: "Local development" }
`;

export const AskSelectSchema = z.object({
  question: z.string().describe('The question to ask'),
  options: z
    .array(
      z.object({
        value: z.string().describe('Unique option identifier'),
        label: z.string().describe('Human-readable label'),
        description: z.string().optional().describe('Optional description'),
        recommended: z.boolean().optional().describe('Mark as recommended option'),
      })
    )
    .min(2)
    .max(4)
    .describe('Array of options (2-4 options)'),
  header: z.string().optional().describe('Optional header text for context'),
  timeout: z.number().optional().describe('Optional timeout in milliseconds'),
});

export const ASK_MULTI_SELECT_DESCRIPTION = `
Ask the user to select multiple options from a list.

## When to Use

- Selecting multiple items for batch operations
- Choosing multiple features or options
- Enabling multiple configurations at once

## Options

- **question**: The question to ask (required)
- **options**: Array of options with value and label (required, 2-6 options)
- **header**: Optional header text for context
- **min_selections**: Minimum number of required selections
- **max_selections**: Maximum number of allowed selections
- **timeout**: Optional timeout in milliseconds

## Options Format

Each option should have:
- **value**: Unique identifier for the option
- **label**: Human-readable label
- **description**: Optional description

## Example

Select multiple analysis features:
- question: "Which analysis features should we enable?"
- options:
  - { value: "sentiment", label: "Sentiment Analysis" }
  - { value: "entities", label: "Entity Extraction" }
  - { value: "topics", label: "Topic Modeling" }
- min_selections: 1
- max_selections: 3
`;

export const AskMultiSelectSchema = z.object({
  question: z.string().describe('The question to ask'),
  options: z
    .array(
      z.object({
        value: z.string().describe('Unique option identifier'),
        label: z.string().describe('Human-readable label'),
        description: z.string().optional().describe('Optional description'),
      })
    )
    .min(2)
    .max(6)
    .describe('Array of options (2-6 options)'),
  header: z.string().optional().describe('Optional header text for context'),
  min_selections: z.number().optional().describe('Minimum number of required selections'),
  max_selections: z.number().optional().describe('Maximum number of allowed selections'),
  timeout: z.number().optional().describe('Optional timeout in milliseconds'),
});

export const ASK_RESPONSE_DESCRIPTION = `
Submit a response to a pending ask question.

## When to Use

- After using ask_confirm, ask_select, ask_multi_select, or ask_input
- When the user has provided their answer
- To submit skip/cancel if the user wants to skip

## Options

- **request_id**: The request ID from the ask tool (required)
- **value**: The user's response value (required)
  - For ask_confirm: "yes" or "no"
  - For ask_select: the option value or number
  - For ask_multi_select: comma-separated values or numbers
  - For ask_input: the text response
- **skip**: Set to true to skip/cancel the question (optional)

## Example

Submit a yes/no answer:
- request_id: "elicitation-123"
- value: "yes"

Submit a selection:
- request_id: "elicitation-456"
- value: "option1"

Skip a question:
- request_id: "elicitation-789"
- skip: true
`;

export const AskResponseSchema = z.object({
  request_id: z.string().describe('The request ID from the ask tool'),
  value: z.string().optional().describe('The user response value'),
  skip: z.boolean().optional().describe('Skip/cancel the question'),
});

export const ASK_INPUT_DESCRIPTION = `
Ask the user for free-form text input.

## When to Use

- Getting custom values from the user
- Collecting user preferences or settings
- Receiving text that doesn't fit predefined options

## Options

- **question**: The question to ask (required)
- **placeholder**: Optional placeholder text to show user
- **default_value**: Optional default value if user skips
- **multiline**: Whether to allow multiline input (default: false)
- **timeout**: Optional timeout in milliseconds

## Example

Get a custom file path:
- question: "Where should we save the report?"
- placeholder: "Enter file path (e.g., reports/weekly.md)"
- default_value: "reports/weekly.md"
`;

export const AskInputSchema = z.object({
  question: z.string().describe('The question to ask'),
  placeholder: z.string().optional().describe('Optional placeholder text'),
  default_value: z.string().optional().describe('Optional default value if user skips'),
  multiline: z.boolean().optional().describe('Allow multiline input (default: false)'),
  timeout: z.number().optional().describe('Optional timeout in milliseconds'),
});

// ============================================================================
// Tool Factories
// ============================================================================

export function createAskConfirmTool(): PiTool {
  return new PiTool({
    name: 'ask_confirm',
    description: ASK_CONFIRM_DESCRIPTION,
    schema: AskConfirmSchema,
    async func(input): Promise<string> {
      const askManager = getAskManager();
      const result = askManager.createConfirm(input.question, { timeout: input.timeout });

      return formatAskResult(result);
    },
  });
}

export function createAskSelectTool(): PiTool {
  return new PiTool({
    name: 'ask_select',
    description: ASK_SELECT_DESCRIPTION,
    schema: AskSelectSchema,
    async func(input): Promise<string> {
      const askManager = getAskManager();
      const choices = input.options.map((opt: { value: string; label: string; description?: string; recommended?: boolean }) => ({
        value: opt.value,
        label: opt.label,
        description: opt.description,
        recommended: opt.recommended,
      }));

      const result = askManager.createSelect(input.question, choices, {
        header: input.header,
        timeout: input.timeout,
      });

      return formatAskResult(result);
    },
  });
}

export function createAskMultiSelectTool(): PiTool {
  return new PiTool({
    name: 'ask_multi_select',
    description: ASK_MULTI_SELECT_DESCRIPTION,
    schema: AskMultiSelectSchema,
    async func(input): Promise<string> {
      const askManager = getAskManager();
      const choices = input.options.map((opt: { value: string; label: string; description?: string }) => ({
        value: opt.value,
        label: opt.label,
        description: opt.description,
      }));

      const result = askManager.createMultiSelect(input.question, choices, {
        header: input.header,
        timeout: input.timeout,
        minSelections: input.min_selections,
        maxSelections: input.max_selections,
      });

      return formatAskResult(result);
    },
  });
}

export function createAskInputTool(): PiTool {
  return new PiTool({
    name: 'ask_input',
    description: ASK_INPUT_DESCRIPTION,
    schema: AskInputSchema,
    async func(input): Promise<string> {
      const askManager = getAskManager();
      const result = askManager.createInput(input.question, {
        placeholder: input.placeholder,
        defaultValue: input.default_value,
        multiline: input.multiline,
        timeout: input.timeout,
      });

      return formatAskResult(result);
    },
  });
}

export function createAskResponseTool(): PiTool {
  return new PiTool({
    name: 'ask_response',
    description: ASK_RESPONSE_DESCRIPTION,
    schema: AskResponseSchema,
    async func(input): Promise<string> {
      const askManager = getAskManager();

      // Validate request exists
      const response = askManager.getResponse(input.request_id);
      if (response) {
        return `Response already submitted for request: ${input.request_id}\nValue: ${Array.isArray(response.value) ? response.value.join(', ') : response.value}`;
      }

      if (input.skip) {
        askManager.submitSkip(input.request_id);
        return `Question skipped: ${input.request_id}`;
      }

      if (!input.value) {
        return `Error: No value provided for request: ${input.request_id}`;
      }

      // Parse value for multi-select (comma-separated)
      let parsedValue: string | string[];
      if (input.value.includes(',')) {
        parsedValue = input.value.split(',').map((v: string) => v.trim());
      } else {
        parsedValue = input.value;
      }

      askManager.submitValue(input.request_id, parsedValue);

      return `Response submitted: ${input.request_id}\nValue: ${Array.isArray(parsedValue) ? parsedValue.join(', ') : parsedValue}`;
    },
  });
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatAskResult(result: AskQuestionResult): string {
  const lines: string[] = [];

  lines.push(result.formattedPrompt);
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push(`📝 Use ask_response tool to submit your answer.`);
  lines.push(`   Request ID: ${result.requestId}`);
  lines.push('─'.repeat(60));

  return lines.join('\n');
}

// ============================================================================
// Module Exports
// ============================================================================

export const askTools = {
  createAskConfirmTool,
  createAskSelectTool,
  createAskMultiSelectTool,
  createAskInputTool,
  createAskResponseTool,
  getAskManager,
  resetAskManager,
  AskManager,
};
