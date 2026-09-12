import type { AssistantMessage } from '@earendil-works/pi-ai';

/**
 * Extract text content from a Pi AssistantMessage
 */
export function extractTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Check if a Pi AssistantMessage has tool calls
 */
export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some((block) => block.type === 'toolCall');
}
