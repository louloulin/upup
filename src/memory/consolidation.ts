/**
 * Memory Consolidation - Periodic consolidation for UpUp Memory
 *
 * Based on Claude Code's 2-phase consolidation:
 * - Triggered every 24h or after 5+ new sessions
 * - Uses file-based lock to prevent concurrent consolidation
 * - Merges similar topics, removes duplicates
 */

import { readdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import {
  CONSOLIDATION_SYSTEM_PROMPT,
  buildConsolidationPrompt,
} from './prompts.js';
import { callStructuredLlm, DEFAULT_MODEL } from '../runtime/pi/model.js';
import { getUpupDir } from '../utils/paths.js';
import { MEMORY_TYPES, type MemoryType } from './types.js';
import { z } from 'zod';
import { info, warn, error } from '../utils/logging/logger.js';

// ============================================================================
// Constants
// ============================================================================

const MEMORY_DIRNAME = 'memory';
const LOCK_FILE = '.consolidation.lock';
const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Types
// ============================================================================

interface MemoryFile {
  name: string;
  type: MemoryType;
  content: string;
  filePath: string;
  mtimeMs: number;
}

interface ConsolidationResult {
  merged: MemoryFile[];
  deleted: string[];
  updated: string[];
}

const CONSOLIDATION_OUTPUT_SCHEMA = z.object({
  merged_memories: z.array(z.object({
    name: z.string(),
    type: z.enum(['user', 'feedback', 'project', 'reference']),
    content: z.string(),
    merge_from: z.array(z.string()).optional(),
  })).optional(),
  delete_files: z.array(z.string()).optional(),
});

// ============================================================================
// Consolidation
// ============================================================================

/**
 * Consolidate memory files.
 *
 * Triggered every 24h or after 5+ new sessions.
 * Uses file lock to prevent concurrent consolidation.
 */
export async function consolidateMemories(options: {
  model?: string;
  signal?: AbortSignal;
} = {}): Promise<ConsolidationResult> {
  // Acquire lock
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    info('memory', 'Consolidation skipped - lock held by another process');
    return { merged: [], deleted: [], updated: [] };
  }

  try {
    // Read all memory files
    const memories = await readAllMemoryFiles();

    if (memories.length === 0) {
      info('memory', 'No memories to consolidate');
      return { merged: [], deleted: [], updated: [] };
    }

    // Group by topic (simple heuristic: first word of name)
    const groups = groupByTopic(memories);

    // Find groups with multiple files (candidates for merging)
    const mergeCandidates = Object.entries(groups)
      .filter(([, files]) => files.length > 1)
      .map(([topic, files]) => files);

    if (mergeCandidates.length === 0) {
      info('memory', 'No memories to merge');
      return { merged: [], deleted: [], updated: [] };
    }

    // Perform LLM-assisted consolidation
    const result = await performConsolidation(mergeCandidates.flat(), options);

    // Apply changes
    const deleted: string[] = [];
    const merged: MemoryFile[] = [];
    const updated: string[] = [];

    for (const delFile of result.delete_files || []) {
      try {
        await unlink(delFile);
        deleted.push(delFile);
      } catch {
        warn('memory', `Failed to delete: ${delFile}`);
      }
    }

    for (const mem of result.merged_memories || []) {
      try {
        const typeDir = join(getUpupDir(), MEMORY_DIRNAME, mem.type);
        const filePath = join(typeDir, `${mem.name}.md`);
        const content = matter.stringify(mem.content, {
          name: mem.name,
          description: extractDescription(mem.content),
          type: mem.type,
        });
        await writeFile(filePath, content, 'utf-8');
        merged.push({ ...mem, filePath, content, mtimeMs: Date.now() });
        updated.push(filePath);

        // Delete merged files
        for (const oldFile of mem.merge_from || []) {
          if (oldFile !== filePath) {
            try {
              await unlink(oldFile);
              deleted.push(oldFile);
            } catch {
              // May already be deleted
            }
          }
        }
      } catch {
        warn('memory', `Failed to write merged memory: ${mem.name}`);
      }
    }

    // Update MEMORY.md index
    await updateMemoryIndex();

    info('memory', `Consolidation complete: ${merged.length} merged, ${deleted.length} deleted`);
    return { merged, deleted, updated };
  } catch (e) {
    if (options.signal?.aborted) {
      return { merged: [], deleted: [], updated: [] };
    }
    error('memory', 'Consolidation failed', e instanceof Error ? e : undefined);
    return { merged: [], deleted: [], updated: [] };
  } finally {
    await releaseLock();
  }
}

/**
 * Check if consolidation is needed.
 */
export async function shouldConsolidate(): Promise<{
  needed: boolean;
  reason: string;
}> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const lockPath = join(memoryDir, LOCK_FILE);

  // Check lock
  try {
    const lockStat = await stat(lockPath);
    const lockAge = Date.now() - lockStat.mtimeMs;
    if (lockAge < LOCK_TTL_MS) {
      return { needed: false, reason: 'Consolidation in progress' };
    }
  } catch {
    // No lock file
  }

  // Check for new sessions
  const sessionCount = await countNewSessions();
  if (sessionCount >= 5) {
    return { needed: true, reason: `${sessionCount} new sessions since last consolidation` };
  }

  // Check time since last consolidation
  const lastConsolidation = await getLastConsolidationTime();
  const hoursSince = (Date.now() - lastConsolidation) / (1000 * 60 * 60);
  if (hoursSince >= 24) {
    return { needed: true, reason: `${Math.round(hoursSince)} hours since last consolidation` };
  }

  return { needed: false, reason: 'Not yet needed' };
}

// ============================================================================
// Private helpers
// ============================================================================

/**
 * Acquire consolidation lock.
 */
async function acquireLock(): Promise<boolean> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const lockPath = join(memoryDir, LOCK_FILE);

  try {
    await writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      startedAt: Date.now(),
    }), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Release consolidation lock.
 */
async function releaseLock(): Promise<void> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const lockPath = join(memoryDir, LOCK_FILE);

  try {
    await unlink(lockPath);
  } catch {
    // Lock file may not exist
  }
}

/**
 * Read all memory files from all type directories.
 */
async function readAllMemoryFiles(): Promise<MemoryFile[]> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const memories: MemoryFile[] = [];

  for (const type of MEMORY_TYPES) {
    const typeDir = join(memoryDir, type);

    try {
      const files = await readdir(typeDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = join(typeDir, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          const { data } = matter(content);
          const statResult = await stat(filePath);

          memories.push({
            name: data.name || file.replace(/\.md$/, ''),
            type,
            content,
            filePath,
            mtimeMs: statResult.mtimeMs,
          });
        } catch {
          continue;
        }
      }
    } catch {
      // Type directory doesn't exist
    }
  }

  return memories;
}

/**
 * Group memories by topic using simple heuristics.
 */
function groupByTopic(memories: MemoryFile[]): Record<string, MemoryFile[]> {
  const groups: Record<string, MemoryFile[]> = {};

  for (const memory of memories) {
    // Extract topic from name (first part before _ or -)
    const parts = memory.name.split(/[_-]/);
    const topic = parts[0];

    if (!groups[topic]) {
      groups[topic] = [];
    }
    groups[topic].push(memory);
  }

  return groups;
}

/**
 * Perform LLM-assisted consolidation.
 */
async function performConsolidation(
  memories: MemoryFile[],
  options: { model?: string; signal?: AbortSignal },
): Promise<z.infer<typeof CONSOLIDATION_OUTPUT_SCHEMA>> {
  try {
    return await callStructuredLlm(buildConsolidationPrompt(memories.map(m => ({
        name: m.name,
        type: m.type,
        content: m.content,
      }))), CONSOLIDATION_OUTPUT_SCHEMA, {
        model: options.model ?? DEFAULT_MODEL,
        systemPrompt: CONSOLIDATION_SYSTEM_PROMPT,
        signal: options.signal,
      });
  } catch (e) {
    error('memory', 'LLM consolidation failed', e instanceof Error ? e : undefined);
    return { merged_memories: [], delete_files: [] };
  }
}

/**
 * Count new sessions since last consolidation.
 */
async function countNewSessions(): Promise<number> {
  // Simple heuristic: count daily memory files
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const DAILY_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

  try {
    const files = await readdir(memoryDir);
    return files.filter(f => DAILY_RE.test(f)).length;
  } catch {
    return 0;
  }
}

/**
 * Get timestamp of last consolidation.
 */
async function getLastConsolidationTime(): Promise<number> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const lockPath = join(memoryDir, LOCK_FILE);

  try {
    const content = await readFile(lockPath, 'utf-8');
    const lock = JSON.parse(content);
    return lock.startedAt || 0;
  } catch {
    return 0;
  }
}

/**
 * Extract first line as description.
 */
function extractDescription(content: string): string {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return '';
  return lines[0].slice(0, 100);
}

/**
 * Update MEMORY.md index after consolidation.
 */
async function updateMemoryIndex(): Promise<void> {
  const memoryDir = join(getUpupDir(), MEMORY_DIRNAME);
  const indexPath = join(memoryDir, 'MEMORY.md');

  const memories = await readAllMemoryFiles();
  const entries = memories.map(m =>
    `- [${m.type}/${m.name}.md](${m.type}/${m.name}.md) — ${m.name}`
  );

  const indexContent = [
    '# UpUp Memory Index',
    '',
    `Last updated: ${new Date().toISOString()}`,
    `Last consolidation: ${new Date().toISOString()}`,
    '',
    ...entries.sort(),
    '',
  ].join('\n');

  await writeFile(indexPath, indexContent, 'utf-8');
}
