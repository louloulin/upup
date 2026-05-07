/**
 * Memory Scanner - Scans memory directory and parses frontmatter
 *
 * Based on Claude Code's memory system. Supports 4-type classification:
 * - user: User preferences, role, knowledge
 * - feedback: User corrections and validations
 * - project: Ongoing work, goals, decisions
 * - reference: External system pointers
 *
 * Each type maps to a subdirectory under ~/.dexter/memory/
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { MemoryFileMeta, MemoryType } from './types.js';
import { MEMORY_TYPES, parseMemoryType } from './types.js';
import { getDexterDir } from '../utils/paths.js';

// ============================================================================
// Constants
// ============================================================================

const MEMORY_DIRNAME = 'memory';

/** Regex for daily memory files: YYYY-MM-DD.md */
const DAILY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

/** Regex for typed memory files: type_name.md */
const TYPED_MEMORY_RE = /^(user|feedback|project|reference)_.+\.md$/;

/** Maximum description length for AI selection */
const MAX_DESCRIPTION_LENGTH = 200;

/** Maximum lines to read for description extraction */
const DESCRIPTION_LINES = 10;

// ============================================================================
// Types
// ============================================================================

export interface ScannerOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Maximum number of files to scan */
  maxFiles?: number;
  /** Override base Dexter directory for tests/scripts */
  baseDir?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function extractDescription(content: string, lines: number = DESCRIPTION_LINES): string {
  const text = content
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.startsWith('---'))
    .slice(0, lines)
    .join(' ')
    .trim();

  return text.length > MAX_DESCRIPTION_LENGTH
    ? text.slice(0, MAX_DESCRIPTION_LENGTH) + '...'
    : text;
}

function parseFrontmatter(content: string, filename: string): Partial<MemoryFileMeta> {
  try {
    const { data, content: body } = matter(content);

    const type = parseMemoryType(data.type);
    const name = typeof data.name === 'string' ? data.name : filename.replace(/\.md$/, '');
    const description =
      typeof data.description === 'string'
        ? data.description
        : extractDescription(body || content);

    return { type, name, description };
  } catch {
    return {
      name: filename.replace(/\.md$/, ''),
      description: extractDescription(content),
    };
  }
}

// ============================================================================
// Scanner
// ============================================================================

/**
 * Scan the memory directory and return all memory files with their metadata.
 */
export async function scanMemoryFiles(
  options: ScannerOptions = {},
): Promise<MemoryFileMeta[]> {
  const memoryDir = join(options.baseDir ?? getDexterDir(), MEMORY_DIRNAME);
  const results: MemoryFileMeta[] = [];

  try {
    const entries = await readdir(memoryDir, { withFileTypes: true });

    for (const entry of entries) {
      if (options.signal?.aborted) break;
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const filePath = join(memoryDir, entry.name);

      try {
        const content = await readFile(filePath, 'utf-8');
        const statResult = await stat(filePath);
        const frontmatter = parseFrontmatter(content, entry.name);

        // Determine type from frontmatter or filename pattern
        const type: MemoryType = frontmatter.type ||
          (TYPED_MEMORY_RE.test(entry.name)
            ? (entry.name.split('_')[0] as MemoryType)
            : 'project');

        results.push({
          filename: entry.name,
          type,
          description: frontmatter.description || '',
          name: frontmatter.name || entry.name.replace(/\.md$/, ''),
          filePath,
          mtimeMs: statResult.mtimeMs,
        });
      } catch {
        // Skip files that can't be read
        continue;
      }
    }
  } catch {
    // Directory doesn't exist
    return [];
  }

  // Sort by modification time (newest first)
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

/**
 * Scan only typed memory files (user/, feedback/, project/, reference/ directories).
 */
export async function scanTypedMemoryFiles(
  options: ScannerOptions = {},
): Promise<MemoryFileMeta[]> {
  const memoryDir = join(options.baseDir ?? getDexterDir(), MEMORY_DIRNAME);
  const results: MemoryFileMeta[] = [];

  for (const type of MEMORY_TYPES) {
    const typeDir = join(memoryDir, type);

    try {
      const entries = await readdir(typeDir, { withFileTypes: true });

      for (const entry of entries) {
        if (options.signal?.aborted) break;
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const filePath = join(typeDir, entry.name);

        try {
          const content = await readFile(filePath, 'utf-8');
          const statResult = await stat(filePath);
          const frontmatter = parseFrontmatter(content, entry.name);

          results.push({
            filename: entry.name,
            type,
            description: frontmatter.description || '',
            name: frontmatter.name || entry.name.replace(/\.md$/, ''),
            filePath,
            mtimeMs: statResult.mtimeMs,
          });
        } catch {
          continue;
        }
      }
    } catch {
      // Type directory doesn't exist, skip
      continue;
    }
  }

  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

/**
 * Filter memories by type.
 */
export function filterByType(memories: MemoryFileMeta[], type: MemoryType): MemoryFileMeta[] {
  return memories.filter(m => m.type === type);
}

/**
 * Group memories by type.
 */
export function groupByType(memories: MemoryFileMeta[]): Record<MemoryType, MemoryFileMeta[]> {
  const grouped: Record<MemoryType, MemoryFileMeta[]> = {
    user: [],
    feedback: [],
    project: [],
    reference: [],
  };

  for (const memory of memories) {
    grouped[memory.type].push(memory);
  }

  return grouped;
}

/**
 * Build a manifest string for AI selection prompt.
 * Format: "- type/name.md: description"
 */
export function buildManifest(memories: MemoryFileMeta[]): string {
  return memories
    .map(m => `- ${m.type}/${m.filename}: ${m.description}`)
    .join('\n');
}

/**
 * Build a type-grouped manifest for AI selection prompt.
 * Format:
 * ## user/
 * - name.md — description
 * ## feedback/
 * - name.md — description
 */
export function buildTypedManifest(memories: MemoryFileMeta[]): string {
  const grouped = groupByType(memories);
  const lines: string[] = [];

  for (const type of MEMORY_TYPES) {
    const typeMemories = grouped[type];
    if (typeMemories.length > 0) {
      lines.push(`## ${type}/`);
      for (const m of typeMemories) {
        lines.push(`- [${m.name}](${m.type}/${m.filename}) — ${m.description}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Ensure MEMORY.md index file exists.
 * Creates it with current memories if it doesn't exist.
 */
export async function ensureMemoryIndex(): Promise<void> {
  const memoryDir = join(getDexterDir(), MEMORY_DIRNAME);
  const indexPath = join(memoryDir, 'MEMORY.md');

  if (existsSync(indexPath)) {
    return; // Already exists
  }

  // Scan existing memories
  const memories = await scanTypedMemoryFiles();

  // Build index content
  const indexContent = [
    '# Dexter Memory Index',
    '',
    '## Summary',
    `Last updated: ${new Date().toISOString()}`,
    '',
    '## Memories',
    '',
    ...memories.map(m => `- [${m.type}/${m.filename}](${m.type}/${m.filename}) — ${m.description}`),
    '',
  ].join('\n');

  // Create the file
  await writeFile(indexPath, indexContent, 'utf-8');
}
