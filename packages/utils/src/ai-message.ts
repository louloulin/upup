import type { AssistantMessage } from '@earendil-works/pi-ai';

/**
 * Extract text content from a Pi AssistantMessage
 */
export function extractTextContent(message: AssistantMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter(block => typeof block === 'object' && 'type' in block && block.type === 'text')
      .map(block => (block as { text: string }).text)
      .join('\n');
  }

  return '';
}

/**
 * Check if a Pi AssistantMessage has tool calls
 */
export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some((part) => part.type === 'toolCall');
}
