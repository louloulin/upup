/**
 * Memory Extraction - Per-turn extraction for UpUp Memory
 *
 * Based on Claude Code's 2-phase extraction:
 * - Phase 1: Per-turn extraction (after final response, no tool calls)
 * - Phase 2: Periodic consolidation (every 24h or 5+ sessions)
 *
 * Extraction is non-blocking - happens in background after response is sent.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
} from './prompts.js';
import { callStructuredLlm, DEFAULT_MODEL } from '../runtime/pi/model.js';
import { getUpupDir } from '../utils/paths.js';
import { MEMORY_TYPES, type MemoryType, type MemoryWriteRequest } from './types.js';
import { z } from 'zod';
import { warn, error } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

const MEMORY_DIRNAME = 'memory';

const MEMORY_FRONTMATTER_SCHEMA = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['user', 'feedback', 'project', 'reference']),
});

/**
 * Parse extraction result from LLM output.
 */
export interface ExtractionResult {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}

const EXTRACTION_OUTPUT_SCHEMA = z.object({
  memories: z.array(z.object({
    name: z.string(),
    description: z.string(),
    type: z.enum(['user', 'feedback', 'project', 'reference']),
    content: z.string(),
  })).nullable().optional(),
});

// ============================================================================
// Extraction
// ============================================================================

/**
 * Extract memories from conversation messages.
 *
 * Called after model produces final response (no tool calls).
 * Non-blocking - runs in background.
 */
export async function extractMemories(
  messages: { role: string; content: string }[],
  options: {
    model?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ExtractionResult[]> {
  // Check if we have meaningful messages to analyze
  if (messages.length < 2) {
    return [];
  }

  // Get existing memories to avoid duplicates
  const existingMemories = await readExistingMemories();

  try {
    const result = await callStructuredLlm(buildExtractionPrompt(messages, existingMemories), EXTRACTION_OUTPUT_SCHEMA, {
      model: options.model ?? DEFAULT_MODEL,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      signal: options.signal,
    });

    if (!result || !result.memories || result.memories.length === 0) {
      return [];
    }

    // Validate and write memories
    const validMemories: ExtractionResult[] = [];
    for (const memory of result.memories) {
      try {
        MEMORY_FRONTMATTER_SCHEMA.parse(memory);
        await writeMemoryFile(memory);
        validMemories.push(memory);
      } catch {
        // Skip invalid memories
        warn('memory', `Skipping invalid memory: ${memory.name}`);
      }
    }

    // Update MEMORY.md index if we wrote new memories
    if (validMemories.length > 0) {
      await updateMemoryIndex();
    }

    return validMemories;
  } catch (e) {
    if (options.signal?.aborted) {
      return [];
    }
    error('memory', 'Extraction failed', e instanceof Error ? e : undefined);
    return [];
  }
}

/**
 * Check if messages contain tool calls.
 */
export function hasToolCalls(messages: { role: string; content: string }[]): boolean {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return false;

  // Check if content contains tool-related patterns
  const content = lastMessage.content || '';
  return content.includes('tool_use') ||
         content.includes('invoke') ||
         content.includes('tool_calls') ||
         content.includes('function_call');
}

/**
 * Read existing memories for context (avoid duplicates).
 */
async function readExistingMemories(): Promise<string> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const memories: string[] = [];

  try {
    const entries = await readdir(memoryDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const filePath = join(memoryDir, entry.name);
      try {
        const content = await readFile(filePath, 'utf-8');
        const { data } = matter(content);
        const description = data.description || content.slice(0, 100);
        memories.push(`${entry.name}: ${description}`);
      } catch {
        continue;
      }
    }
  } catch {
    return '';
  }

  return memories.join('\n');
}

/**
 * Write a memory file to disk.
 */
async function writeMemoryFile(memory: ExtractionResult): Promise<void> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const typeDir = join(memoryDir, memory.type);
  const fileName = `${memory.name}.md`;
  const filePath = join(typeDir, fileName);

  // Ensure type directory exists
  await mkdir(typeDir, { recursive: true });

  // Build frontmatter
  const fileContent = matter.stringify(memory.content, {
    name: memory.name,
    description: memory.description,
    type: memory.type,
  });

  await writeFile(filePath, fileContent, 'utf-8');
}

/**
 * Update MEMORY.md index with current memories.
 */
async function updateMemoryIndex(): Promise<void> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const indexPath = join(memoryDir, 'MEMORY.md');

  const entries: string[] = [];

  for (const type of MEMORY_TYPES) {
    const typeDir = join(memoryDir, type);

    try {
      const files = await readdir(typeDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = join(typeDir, file);
        const content = await readFile(filePath, 'utf-8');
        const { data } = matter(content);

        const name = data.name || file.replace(/\.md$/, '');
        const description = data.description || '';

        entries.push(`- [${type}/${file}](${type}/${file}) — ${description}`);
      }
    } catch {
      // Type directory doesn't exist
    }
  }

  // Build index content
  const indexContent = [
    '# UpUp Memory Index',
    '',
    '## Summary',
    `Last updated: ${new Date().toISOString()}`,
    '',
    '## Memories',
    '',
    ...entries.sort(),
    '',
  ].join('\n');

  await writeFile(indexPath, indexContent, 'utf-8');
}

// ============================================================================
// Extraction hooks
// ============================================================================

/**
 * Create an extraction hook for after model response.
 * Call this to set up extraction that triggers after final response.
 */
export function createExtractionHook(
  options: {
    minTurnsBetweenExtractions?: number;
    maxMemoriesPerExtraction?: number;
  } = {},
) {
  let turnsSinceLastExtraction = 0;
  let lastExtractionTime = 0;
  const MIN_TURN_INTERVAL = 5; // At least 5 turns between extractions
  const MAX_EXTRACTIONS_PER_HOUR = 4;

  return async function onAfterResponse(
    messages: { role: string; content: string }[],
    signal?: AbortSignal,
  ): Promise<ExtractionResult[]> {
    turnsSinceLastExtraction++;

    // Check frequency limit
    const now = Date.now();
    const hoursSinceLast = (now - lastExtractionTime) / (1000 * 60 * 60);
    if (hoursSinceLast < 0.25) { // At least 15 minutes between extractions
      return [];
    }

    // Skip if too soon since last extraction
    if (turnsSinceLastExtraction < MIN_TURN_INTERVAL) {
      return [];
    }

    // Skip if messages contain tool calls
    if (hasToolCalls(messages)) {
      return [];
    }

    // Rate limit check
    if (hoursSinceLast < 1 && turnsSinceLastExtraction < 10) {
      return [];
    }

    // Perform extraction
    turnsSinceLastExtraction = 0;
    lastExtractionTime = now;

    return extractMemories(messages, { signal });
  };
}
