/**
 * Elicitation Hooks - Loucode-style user question handling
 *
 * Features:
 * - Elicitation request hooks
 * - User prompt handling
 * - Choice presentation
 * - Response parsing
 *
 * Reference: Loucode's elicitation hooks
 */

import { info, warn } from '../utils/logging/logger.js';
import { getHookExecutor } from './tool-hooks.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Elicitation question type
 */
export type ElicitationType =
  | 'choice'        // Multiple choice selection
  | 'text'          // Free text input
  | 'confirm'       // Yes/No confirmation
  | 'select'        // Item selection from list
  | 'priority';     // Priority ranking

/**
 * Choice option for elicitation
 */
export interface ElicitationChoice {
  /** Unique option identifier */
  value: string;
  /** Human-readable label */
  label: string;
  /** Optional description */
  description?: string;
  /** Whether this is the recommended option */
  recommended?: boolean;
}

/**
 * Elicitation request
 */
export interface ElicitationRequest {
  /** Unique request ID */
  id: string;
  /** Question to ask user */
  question: string;
  /** Type of elicitation */
  type: ElicitationType;
  /** Available choices (for choice/select types) */
  choices?: ElicitationChoice[];
  /** Placeholder text for input */
  placeholder?: string;
  /** Default value if user skips */
  defaultValue?: string;
  /** Timeout in ms (0 = no timeout) */
  timeout?: number;
  /** Whether to allow multiple selections */
  multiSelect?: boolean;
  /** Session context */
  sessionId: string;
}

/**
 * Elicitation response
 */
export interface ElicitationResponse {
  /** Request ID */
  requestId: string;
  /** User's response */
  value: string | string[];
  /** Whether user skipped */
  skipped: boolean;
  /** Response timestamp */
  timestamp: number;
}

/**
 * Elicitation hook result
 */
export interface ElicitationHookResult {
  /** Whether to use built-in prompting */
  useBuiltIn: boolean;
  /** Custom prompt message */
  customPrompt?: string;
  /** Abort elicitation */
  abort?: boolean;
  /** Default value to use */
  defaultValue?: string;
}

// ============================================================================
// Elicitation Manager
// ============================================================================

/**
 * Manages elicitation requests and user interactions
 */
export class ElicitationManager {
  private pendingRequests: Map<string, ElicitationRequest> = new Map();
  private responses: Map<string, ElicitationResponse> = new Map();
  private listeners: Map<string, (response: ElicitationResponse) => void> = new Map();

  /**
   * Create an elicitation request
   */
  createRequest(params: Omit<ElicitationRequest, 'id'>): ElicitationRequest {
    const request: ElicitationRequest = {
      ...params,
      id: `elicitation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    this.pendingRequests.set(request.id, request);
    info('system', `Elicitation created: ${request.id}`);

    return request;
  }

  /**
   * Get pending request by ID
   */
  getRequest(id: string): ElicitationRequest | undefined {
    return this.pendingRequests.get(id);
  }

  /**
   * Submit response to elicitation
   */
  submitResponse(response: ElicitationResponse): void {
    this.responses.set(response.requestId, response);
    this.pendingRequests.delete(response.requestId);

    // Notify listeners
    const listener = this.listeners.get(response.requestId);
    if (listener) {
      listener(response);
      this.listeners.delete(response.requestId);
    }

    info('system', `Elicitation response received: ${response.requestId}`);
  }

  /**
   * Submit simple value response
   */
  submitValue(requestId: string, value: string | string[]): void {
    this.submitResponse({
      requestId,
      value,
      skipped: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Submit skip response
   */
  submitSkip(requestId: string): void {
    const request = this.pendingRequests.get(requestId);

    this.submitResponse({
      requestId,
      value: request?.defaultValue || '',
      skipped: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Get response for request
   */
  getResponse(requestId: string): ElicitationResponse | undefined {
    return this.responses.get(requestId);
  }

  /**
   * Wait for response to request
   */
  async waitForResponse(
    requestId: string,
    timeout?: number
  ): Promise<ElicitationResponse> {
    return new Promise((resolve, reject) => {
      // Check if already responded
      const existing = this.responses.get(requestId);
      if (existing) {
        resolve(existing);
        return;
      }

      // Register listener
      this.listeners.set(requestId, resolve);

      // Set timeout if specified
      if (timeout && timeout > 0) {
        setTimeout(() => {
          this.listeners.delete(requestId);
          reject(new Error(`Elicitation ${requestId} timed out`));
        }, timeout);
      }
    });
  }

  /**
   * Get all pending requests
   */
  getPendingRequests(): ElicitationRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Cancel pending request
   */
  cancelRequest(id: string): boolean {
    const request = this.pendingRequests.get(id);
    if (request) {
      this.pendingRequests.delete(id);
      info('system', `Elicitation cancelled: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all pending requests
   */
  clearPending(): void {
    const count = this.pendingRequests.size;
    this.pendingRequests.clear();
    info('system', `Cleared ${count} pending elicitation(s)`);
  }
}

// ============================================================================
// Built-in Elicitation Hooks
// ============================================================================

/**
 * Create elicitation request hook
 */
export function createElicitationRequestHook(): {
  id: string;
  name: string;
  event: 'ElicitationRequest';
  type: 'function';
  handler: (
    params: { request: ElicitationRequest },
    context: unknown
  ) => Promise<ElicitationHookResult>;
} {
  return {
    id: 'elicitation-request-handler',
    name: 'Elicitation Request Handler',
    event: 'ElicitationRequest',
    type: 'function',
    handler: async ({ request }) => {
      // Log the elicitation
      info('system', `Processing elicitation request: ${request.question}`);

      // Check for built-in hooks
      const hookExecutor = getHookExecutor();
      const hooks = hookExecutor.getHooks('ElicitationRequest');

      // Let built-in handling proceed
      return {
        useBuiltIn: true,
      };
    },
  };
}

/**
 * Create choice validation hook
 */
export function createChoiceValidationHook(): {
  id: string;
  name: string;
  event: 'ElicitationResponse';
  type: 'function';
  handler: (
    params: { request: ElicitationRequest; response: ElicitationResponse },
    context: unknown
  ) => Promise<{ valid: boolean; error?: string }>;
} {
  return {
    id: 'elicitation-choice-validation',
    name: 'Choice Validation',
    event: 'ElicitationResponse',
    type: 'function',
    handler: async ({ request, response }) => {
      // Validate choice types
      if (request.type === 'choice' || request.type === 'select') {
        if (!request.choices) {
          return { valid: true };
        }

        const validChoices = request.choices.map(c => c.value);

        if (request.multiSelect && Array.isArray(response.value)) {
          // Validate all selections
          for (const val of response.value) {
            if (!validChoices.includes(val)) {
              return {
                valid: false,
                error: `Invalid selection: ${val}`,
              };
            }
          }
        } else if (!validChoices.includes(response.value as string)) {
          return {
            valid: false,
            error: `Invalid selection: ${response.value}`,
          };
        }
      }

      // Validate confirm type
      if (request.type === 'confirm') {
        const value = response.value as string;
        if (value !== 'yes' && value !== 'no' && value !== 'y' && value !== 'n') {
          return {
            valid: false,
            error: 'Confirmation must be yes/no',
          };
        }
      }

      return { valid: true };
    },
  };
}

// ============================================================================
// Elicitation Display
// ============================================================================

/**
 * Format elicitation request for display
 */
export function formatElicitationPrompt(request: ElicitationRequest): string {
  let prompt = `\n${'='.repeat(60)}\n`;
  prompt += `❓ ${request.question}\n`;
  prompt += `${'='.repeat(60)}\n`;

  switch (request.type) {
    case 'choice':
      if (request.choices) {
        request.choices.forEach((choice, i) => {
          const prefix = choice.recommended ? '⭐' : '  ';
          const label = choice.recommended ? `${choice.label} (recommended)` : choice.label;
          prompt += `${prefix} ${i + 1}. ${label}`;
          if (choice.description) {
            prompt += `\n    ${choice.description}`;
          }
          prompt += '\n';
        });
      }
      break;

    case 'select':
      if (request.choices) {
        request.choices.forEach((choice, i) => {
          prompt += `  ${i + 1}. ${choice.label}`;
          if (choice.description) {
            prompt += ` - ${choice.description}`;
          }
          prompt += '\n';
        });
        if (request.multiSelect) {
          prompt += `\n(You can select multiple, e.g., "1, 3")\n`;
        }
      }
      break;

    case 'confirm':
      prompt += `  1. Yes\n  2. No\n`;
      break;

    case 'text':
      if (request.placeholder) {
        prompt += `  (Enter your response${request.defaultValue ? ` [${request.defaultValue}]` : ''})\n`;
      }
      break;

    case 'priority':
      prompt += `  (Enter priority order, e.g., "3, 1, 2")\n`;
      break;
  }

  if (request.timeout && request.timeout > 0) {
    const seconds = Math.floor(request.timeout / 1000);
    prompt += `\n⏱️  Timeout: ${seconds}s\n`;
  }

  prompt += `${'='.repeat(60)}\n`;

  return prompt;
}

/**
 * Parse user response based on elicitation type
 */
export function parseElicitationResponse(
  request: ElicitationRequest,
  input: string
): string | string[] | null {
  const trimmed = input.trim();

  // Handle empty input
  if (!trimmed) {
    return request.defaultValue || null;
  }

  switch (request.type) {
    case 'choice':
    case 'select': {
      // Try to parse as number(s)
      if (request.multiSelect) {
        const indices = trimmed.split(/[,\s]+/).map(s => parseInt(s, 10) - 1);
        const values: string[] = [];

        for (const idx of indices) {
          if (!isNaN(idx) && request.choices && idx >= 0 && idx < request.choices.length) {
            values.push(request.choices[idx].value);
          }
        }

        return values.length > 0 ? values : null;
      } else {
        const idx = parseInt(trimmed, 10) - 1;
        if (!isNaN(idx) && request.choices && idx >= 0 && idx < request.choices.length) {
          return request.choices[idx].value;
        }
      }
      break;
    }

    case 'confirm': {
      const lower = trimmed.toLowerCase();
      if (lower === 'yes' || lower === 'y' || lower === '1') {
        return 'yes';
      }
      if (lower === 'no' || lower === 'n' || lower === '2') {
        return 'no';
      }
      break;
    }

    case 'text':
    case 'priority':
      return trimmed;
  }

  return null;
}

// ============================================================================
// Singleton
// ============================================================================

let elicitationManager: ElicitationManager | null = null;

export function getElicitationManager(): ElicitationManager {
  if (!elicitationManager) {
    elicitationManager = new ElicitationManager();
  }
  return elicitationManager;
}

export function resetElicitationManager(): void {
  if (elicitationManager) {
    elicitationManager.clearPending();
    elicitationManager = null;
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export const elicitation = {
  ElicitationManager,
  createElicitationRequestHook,
  createChoiceValidationHook,
  formatElicitationPrompt,
  parseElicitationResponse,
  getElicitationManager,
  resetElicitationManager,
};
