export interface PlatformSnippableMessage {
  readonly role?: string;
  readonly content: string | readonly unknown[];
  readonly _getType?: () => string;
}

export interface PlatformSnipResult {
  readonly snipped: readonly PlatformSnippableMessage[];
  readonly removed: number;
  readonly removedIndices: readonly number[];
  readonly reasons: readonly string[];
}

const LOW_VALUE_PATTERNS: readonly RegExp[] = [
  /^(Yes|No),?\s*(please|continue|go ahead|do that|sounds good|let'?s?)?$/i,
  /^Sure,?\s*(I|let'?s?|we)?$/i,
  /^Okay,?\s*(then|now|let's?)?$/i,
  /^Sounds good$/i,
  /^Let me know if/i,
  /^Thanks,?\s*(that)?$/i,
  /^Great,?\s*(thanks)?$/i,
  /^(Sounds|Sounds like) a plan$/i,
  /^Good (idea|point|thinking)$/i,
  /^(Yep|Yah|Yeah),?\s*(I|we|that)?$/i,
  /^(Yep|Nope),?\s*(sounds|that)?$/i,
  /^(Go ahead|Continue|Keep going|Proceed),?\s*(please)?$/i,
  /^(Feel free to|You can) (continue|proceed)/i,
  /^(Got it|Acknowledged|Acknowledged\.|Understood)$/i,
  /^Noted,?\s*(thanks|will do)?$/i,
];
const MEANINGFUL_KEYWORDS = ['analyze', 'review', 'compare', 'find', 'search', 'look', 'explain', 'describe', 'implement', 'fix', 'create', 'build', 'write', 'read', 'check', 'verify', 'test', 'run', 'question', 'help', 'need', 'want', 'think', 'believe'];

function messageText(message: PlatformSnippableMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content.filter((part): part is { readonly type: 'text'; readonly text: string } =>
    Boolean(part) && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string',
  ).map((part) => part.text).join('\n');
}

function hasMeaningfulContent(text: string): boolean { return MEANINGFUL_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword)); }

export function shouldPlatformSnipMessage(message: PlatformSnippableMessage): { readonly snip: boolean; readonly reason?: string } {
  const type = message.role ?? message._getType?.();
  if (type !== 'user' && type !== 'human') return { snip: false };
  const text = messageText(message).trim();
  if (!text || text.length < 3) return { snip: true, reason: 'empty_or_too_short' };
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(text)) && !hasMeaningfulContent(text)) return { snip: true, reason: 'low_value_pattern' };
  return { snip: false };
}

export function platformSnipMessages(messages: readonly PlatformSnippableMessage[], options: { readonly preserveFirstN?: number; readonly preserveLastN?: number; readonly maxRemove?: number } = {}): PlatformSnipResult {
  const preserveFirstN = Math.max(options.preserveFirstN ?? 1, 0);
  const preserveLastN = Math.max(options.preserveLastN ?? 2, 0);
  const maxRemove = Math.max(options.maxRemove ?? 10, 0);
  const safeEnd = messages.length - preserveLastN;
  if (safeEnd <= preserveFirstN || maxRemove === 0) return { snipped: messages, removed: 0, removedIndices: [], reasons: [] };
  const removedIndices: number[] = [];
  const reasons: string[] = [];
  for (let index = safeEnd - 1; index >= preserveFirstN && removedIndices.length < maxRemove; index -= 1) {
    const decision = shouldPlatformSnipMessage(messages[index]!);
    if (decision.snip) { removedIndices.push(index); reasons.push(decision.reason ?? 'unknown'); }
  }
  const removedSet = new Set(removedIndices);
  return { snipped: messages.filter((_message, index) => !removedSet.has(index)), removed: removedIndices.length, removedIndices: removedIndices.sort((left, right) => right - left), reasons };
}

export function shouldPlatformSnip(messages: readonly PlatformSnippableMessage[], threshold = 3): boolean {
  let count = 0;
  for (let index = 1; index < messages.length - 1; index += 1) if (shouldPlatformSnipMessage(messages[index]!).snip) count += 1;
  return count >= Math.max(threshold, 0);
}

export function estimatePlatformSnipSavings(messages: readonly PlatformSnippableMessage[], averageTokens = 50): { readonly removed: number; readonly estimatedTokensSaved: number } {
  const removed = platformSnipMessages(messages).removed;
  return { removed, estimatedTokensSaved: removed * Math.max(averageTokens, 0) };
}
