import type { Message } from '@earendil-works/pi-ai';

/**
 * Parses UpUp's chat_history.json into indexable text chunks for memory search.
 *
 * Each conversation turn (user message + agent response) becomes a searchable
 * entry so that past conversations are recallable even if never explicitly saved
 * to MEMORY.md.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export type SessionEntry = {
  /** Formatted text: "User: ...\nAssistant: ..." */
  content: string;
  /** SHA-256 of content for change detection. */
  contentHash: string;
  /** ISO timestamp from the original message. */
  timestamp: string;
};

type ChatHistoryMessage = {
  id: string;
  timestamp: string;
  userMessage: string;
  agentResponse: string | null;
};

type ChatHistoryFile = {
  messages: ChatHistoryMessage[];
};

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function parseSessionTranscripts(chatHistoryPath: string): Promise<SessionEntry[]> {
  let raw: string;
  try {
    raw = await readFile(chatHistoryPath, 'utf-8');
  } catch {
    return [];
  }

  let parsed: ChatHistoryFile;
  try {
    parsed = JSON.parse(raw) as ChatHistoryFile;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.messages)) {
    return [];
  }

  const entries: SessionEntry[] = [];

  for (const msg of parsed.messages) {
    if (!msg.userMessage || !msg.agentResponse) {
      continue;
    }

    const userPart = normalizeWhitespace(msg.userMessage);
    const assistantPart = normalizeWhitespace(msg.agentResponse);
    const content = `User: ${userPart}\nAssistant: ${assistantPart}`;

    entries.push({
      content,
      contentHash: hashContent(content),
      timestamp: msg.timestamp,
    });
  }

  return entries;
}

// ============================================================================
// Session Memory Update
// ============================================================================

let lastUpdateTimestamp = 0;
const MIN_UPDATE_INTERVAL_MS = 60_000; // 1 minute minimum between updates

/**
 * Returns true if enough time has passed since the last session memory update.
 * Used to throttle update frequency.
 */
export function shouldUpdateSessionMemory(): boolean {
  return Date.now() - lastUpdateTimestamp >= MIN_UPDATE_INTERVAL_MS;
}

export interface UpdateResult {
  tokenCount: number;
  messageCount: number;
}

/**
 * Updates session memory with recent conversation messages.
 * Extracts meaningful content from messages and records the update timestamp.
 */
export async function updateSessionMemory(messages: Message[]): Promise<UpdateResult> {
  const tokenCount = messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : m.content;
    const text = typeof content === 'string'
      ? content
      : content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map((part) => part.text).join('\n');
    return sum + Math.ceil(text.length / 4);
  }, 0);
  const messageCount = messages.length;
  lastUpdateTimestamp = Date.now();
  return { tokenCount, messageCount };
}

export type SessionMemoryFile = { filePath: string; content: string; mtimeMs: number };
