/**
 * AI Memory Selector - Intelligent memory selection using LLM
 *
 * Based on Claude Code's memory system.
 * Primary recall method - LLM semantic selection over vector search.
 *
 * Features:
 * - 4-type classification (user, feedback, project, reference)
 * - MEMORY.md index integration
 * - Scanner integration for typed memory files
 * - Trust verification for recalled memories
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  SELECT_SYSTEM_PROMPT,
  buildSelectionPrompt,
} from './prompts.js';
import {
  scanMemoryFiles,
  scanTypedMemoryFiles,
  buildManifest,
  buildTypedManifest,
} from './scanner.js';
import { callStructuredLlm, type PromptRunner } from '@upup/utils';
import { DEFAULT_MODEL } from '@upup/utils';
import { getUpupDir } from '@upup/utils';
import { MEMORY_TYPES, type MemoryFileMeta } from './types.js';
import { error } from '@upup/utils/logging';

// ============================================================================
// Types
// ============================================================================

const MEMORY_DIRNAME = 'memory';
const MEMORY_INDEX_FILE = 'MEMORY.md';
const LONG_TERM_FILE = 'MEMORY.md';
const DAILY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

export interface FindRelevantMemoriesOptions {
  /** Maximum number of memories to select (default: 5) */
  maxMemories?: number;
  /** Recently used tool names (to avoid selecting tool reference docs) */
  recentTools?: readonly string[];
  /** Already surfaced memories to exclude */
  alreadySurfaced?: ReadonlySet<string>;
  /** Model to use for selection */
  model?: string;
  /** Abort signal */
  signal?: AbortSignal;
  /** Filter by memory type */
  typeFilter?: 'user' | 'feedback' | 'project' | 'reference';
  runner?: PromptRunner;
}

export interface SelectedMemory {
  /** Full file path */
  path: string;
  /** File modification time in milliseconds */
  mtimeMs: number;
  /** File name */
  filename: string;
  /** Memory type */
  type: 'user' | 'feedback' | 'project' | 'reference';
  /** Description from frontmatter */
  description: string;
}

export interface SelectedMemoryWithContent {
  /** Full file path */
  path: string;
  /** File name */
  filename: string;
  /** File modification time */
  mtimeMs: number;
  /** Full file content */
  content: string;
  /** Memory type */
  type: 'user' | 'feedback' | 'project' | 'reference';
  /** Description */
  description: string;
}

// ============================================================================
// Schema
// ============================================================================

const SELECT_MEMORIES_OUTPUT_SCHEMA = z.object({
  selected_memories: z.array(z.string()).describe('Array of memory filenames to select'),
});

// ============================================================================
// AI Memory Selection
// ============================================================================

/**
 * Find relevant memories using AI selection (AI-Selector).
 *
 * Primary recall method - LLM semantic selection.
 * This differs from vector search in that it can understand semantic
 * relevance beyond keyword/embedding similarity.
 *
 * @param query - The user's query to find relevant memories for
 * @param options - Options including recent tools, already surfaced memories, etc.
 * @returns Array of selected memories with file paths and metadata
 */
export async function findRelevantMemories(
  query: string,
  options: FindRelevantMemoriesOptions = {},
): Promise<SelectedMemory[]> {
  const {
    maxMemories = 5,
    recentTools = [],
    alreadySurfaced = new Set<string>(),
    model,
    signal,
    typeFilter,
    runner,
  } = options;

  // Try to read MEMORY.md index first
  const indexPath = join(getUpupDir(), MEMORY_DIRNAME, MEMORY_INDEX_FILE);
  let memories: MemoryFileMeta[] = [];

  if (existsSync(indexPath)) {
    try {
      const indexContent = await readFile(indexPath, 'utf-8');
      memories = await parseIndexFile(indexContent);
    } catch {
      // Fall back to scanner
      memories = await scanTypedMemoryFiles({ signal });
    }
  } else {
    memories = await scanTypedMemoryFiles({ signal });
  }

  // Filter out already surfaced memories
  memories = memories.filter(m => !alreadySurfaced.has(m.filePath));

  // Filter by type if specified
  if (typeFilter) {
    memories = memories.filter(m => m.type === typeFilter);
  }

  if (memories.length === 0) {
    return [];
  }

  // Use AI selection
  const selectedFilenames = await selectRelevantMemories(
    query,
    memories,
    signal,
    recentTools,
    model,
    runner,
  );

  // Map selected filenames back to memory metadata
  const byFilename = new Map(
    memories.map(m => [`${m.type}/${m.filename}`, m])
  );

  const selected = selectedFilenames
    .slice(0, maxMemories)
    .map(filename => byFilename.get(filename))
    .filter((m): m is MemoryFileMeta => m !== undefined);

  return selected.map(m => ({
    path: m.filePath,
    mtimeMs: m.mtimeMs,
    filename: m.filename,
    type: m.type,
    description: m.description,
  }));
}

/**
 * Use LLM to select relevant memories from a list.
 */
async function selectRelevantMemories(
  query: string,
  memories: MemoryFileMeta[],
  signal?: AbortSignal,
  recentTools?: readonly string[],
  model?: string,
  runner?: PromptRunner,
): Promise<string[]> {
  const validFilenames = new Set(
    memories.map(m => `${m.type}/${m.filename}`)
  );

  const manifest = buildTypedManifest(memories);

  try {
    const result = await callStructuredLlm(buildSelectionPrompt(query, manifest, recentTools), SELECT_MEMORIES_OUTPUT_SCHEMA, {
      model: model ?? DEFAULT_MODEL,
      systemPrompt: SELECT_SYSTEM_PROMPT,
      signal,
      runner,
    });

    if (!result || !Array.isArray(result.selected_memories)) {
      return [];
    }

    // Filter to only valid filenames (with type prefix)
    return result.selected_memories.filter(f => {
      // Handle both with and without type prefix
      if (validFilenames.has(f)) return true;
      // Try adding type prefix if not present
      for (const type of MEMORY_TYPES) {
        if (validFilenames.has(`${type}/${f}`)) return true;
      }
      return false;
    });
  } catch (e) {
    if (signal?.aborted) {
      return [];
    }
    error('memory', 'Failed to select relevant memories', e instanceof Error ? e : undefined);
    return [];
  }
}

// ============================================================================
// Index File Parsing
// ============================================================================

/**
 * Parse MEMORY.md index file to extract memory metadata.
 */
async function parseIndexFile(content: string): Promise<MemoryFileMeta[]> {
  const memories: MemoryFileMeta[] = [];
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);

  // Parse markdown links: [name](type/filename.md) — description
  const linkRegex = /-\s*\[([^\]]+)\]\(([^)]+)\)\s*[—\-]\s*(.+)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const [, name, path, description] = match;
    const parts = path.split('/');
    const type = parts[0] as 'user' | 'feedback' | 'project' | 'reference';
    const filename = parts[1] || `${name}.md`;

    if (!MEMORY_TYPES.includes(type)) continue;

    const filePath = join(memoryDir, path);

    try {
      const stat = await import('node:fs/promises').then(m => m.stat(filePath));

      memories.push({
        filename,
        type,
        description: description.trim(),
        name: name.trim(),
        filePath,
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      // File may not exist, skip
    }
  }

  return memories;
}

// ============================================================================
// Load Memory Content
// ============================================================================

/**
 * Find relevant memories and load their content.
 *
 * Convenience function that combines finding relevant
 * memories with loading their content.
 */
export async function findAndLoadRelevantMemories(
  query: string,
  options: FindRelevantMemoriesOptions = {},
): Promise<SelectedMemoryWithContent[]> {
  const selected = await findRelevantMemories(query, options);

  const results: SelectedMemoryWithContent[] = [];

  for (const mem of selected) {
    try {
      const content = await readFile(mem.path, 'utf-8');
      results.push({
        path: mem.path,
        filename: mem.filename,
        mtimeMs: mem.mtimeMs,
        content,
        type: mem.type,
        description: mem.description,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

// ============================================================================
// Trust Verification
// ============================================================================

/**
 * Verify a recalled memory is still valid.
 *
 * Based on Claude Code's trust verification:
 * - "Memory says X exists" ≠ "X exists now"
 * - Verify file paths, function names, flags before acting
 */
export async function verifyMemory(
  memory: SelectedMemoryWithContent,
): Promise<{ valid: boolean; reason?: string }> {
  // Check file exists
  if (!existsSync(memory.path)) {
    return { valid: false, reason: 'File no longer exists' };
  }

  // Check file hasn't been modified significantly
  try {
    const stat = await import('node:fs/promises').then(m => m.stat(memory.path));
    if (stat.mtimeMs !== memory.mtimeMs) {
      // File was modified, content may have changed
      return {
        valid: true,
        reason: 'File was modified after recall, content may have changed',
      };
    }
  } catch {
    return { valid: false, reason: 'Cannot stat file' };
  }

  return { valid: true };
}

// ============================================================================
// Default export
// ============================================================================

export default findRelevantMemories;
