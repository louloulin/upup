/**
 * GrepTool - Search file contents with regex
 *
 * A simplified implementation of Claude Code's GrepTool for Dexter.
 * Uses ripgrep (rg) for fast searching when available, falls back to JavaScript.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { getCwd, expandPath, toRelativePath } from '../../utils/paths.js';
import { stat as fsStat } from 'node:fs/promises';

const execAsync = promisify(exec);

const GREP_TOOL_NAME = 'grep';
const DEFAULT_LIMIT = 100;

// VCS directories to exclude
const VCS_DIRECTORIES = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];

/**
 * Input schema for GrepTool
 */
export const GrepToolInputSchema = z.object({
  pattern: z.string().describe('The regular expression pattern to search for'),
  path: z.string().optional().describe('File or directory to search in. Defaults to current working directory.'),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")'),
  output_mode: z.enum(['content', 'files_with_matches', 'count']).optional().default('files_with_matches').describe('Output mode: "content" shows matching lines, "files_with_matches" shows file paths, "count" shows match counts'),
  '-n': z.boolean().optional().default(true).describe('Show line numbers in output'),
  '-i': z.boolean().optional().default(false).describe('Case insensitive search'),
  '-C': z.number().optional().describe('Number of lines of context to show before and after match'),
  head_limit: z.number().optional().describe('Limit output to first N lines'),
});

export type GrepToolInput = z.infer<typeof GrepToolInputSchema>;

/**
 * Output schema for GrepTool
 */
export interface GrepToolOutput {
  mode: 'content' | 'files_with_matches' | 'count';
  numFiles: number;
  filenames: string[];
  content?: string;
  numLines?: number;
  numMatches?: number;
}

/**
 * GrepTool description
 */
const GREP_TOOL_DESCRIPTION = `Search file contents using regular expressions.

Use this tool to:
- Find text patterns across files
- Search for function/variable definitions
- Find code references and usages
- Extract matching lines with context

Uses ripgrep (rg) for fast searching when available.

Examples:
- pattern: "function foo" - Find all occurrences of "function foo"
- pattern: "TODO" output_mode: "content" - Show TODO comments with line numbers
- pattern: "class Component" glob: "*.tsx" - Find component definitions in TSX files`;

/**
 * Check if ripgrep is available
 */
async function isRipgrepAvailable(): Promise<boolean> {
  try {
    await execAsync('which rg');
    return true;
  } catch {
    return false;
  }
}

/**
 * Search using ripgrep
 */
async function searchWithRipgrep(
  input: GrepToolInput,
  searchPath: string
): Promise<GrepToolOutput> {
  const args: string[] = ['--hidden', '-l']; // -l for files_with_matches

  // Add case insensitive flag
  if (input['-i']) {
    args.push('-i');
  }

  // Add line numbers for content mode
  if (input.output_mode === 'content') {
    if (input['-n']) {
      args.push('-n');
    }
    if (input['-C']) {
      args.push('-C', input['-C'].toString());
    }
  }

  // Add count mode
  if (input.output_mode === 'count') {
    args.pop(); // Remove -l
    args.push('-c');
  }

  // Add glob filter
  if (input.glob) {
    args.push('--glob', input.glob);
  }

  // Exclude VCS directories
  for (const dir of VCS_DIRECTORIES) {
    args.push('--glob', `!${dir}`);
  }

  // Limit line length to prevent base64/minified content
  args.push('--max-columns', '500');

  // Add pattern
  if (input.pattern.startsWith('-')) {
    args.push('-e', input.pattern);
  } else {
    args.push(input.pattern);
  }

  // Add search path
  args.push(searchPath);

  try {
    const { stdout } = await execAsync(`rg ${args.join(' ')}`, {
      timeout: 30000,
    });

    const lines = stdout.trim().split('\n').filter(Boolean);

    if (input.output_mode === 'content') {
      // Parse content lines: filename:line:content
      const results: string[] = [];
      const files = new Set<string>();

      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex);
          files.add(toRelativePath(filePath));
          if (input.head_limit && results.length >= input.head_limit) break;
          results.push(line);
        }
      }

      // Apply limit
      const limitedResults = input.head_limit ? results.slice(0, input.head_limit) : results;

      return {
        mode: 'content',
        numFiles: files.size,
        filenames: Array.from(files),
        content: limitedResults.join('\n'),
        numLines: limitedResults.length,
      };
    }

    if (input.output_mode === 'count') {
      // Parse count lines: filename:count
      const fileCounts: Map<string, number> = new Map();
      let totalMatches = 0;

      for (const line of lines) {
        const colonIndex = line.lastIndexOf(':');
        if (colonIndex > 0) {
          const filePath = toRelativePath(line.substring(0, colonIndex));
          const count = parseInt(line.substring(colonIndex + 1), 10);
          if (!isNaN(count)) {
            fileCounts.set(filePath, count);
            totalMatches += count;
          }
        }
      }

      const entries = Array.from(fileCounts.entries());
      const limitedEntries = input.head_limit ? entries.slice(0, input.head_limit) : entries;

      return {
        mode: 'count',
        numFiles: fileCounts.size,
        filenames: limitedEntries.map(([path]) => path),
        content: limitedEntries.map(([path, count]) => `${path}:${count}`).join('\n'),
        numMatches: totalMatches,
      };
    }

    // files_with_matches mode
    const files = new Set(lines.map(l => toRelativePath(l)));
    const fileList = Array.from(files);
    const limitedFiles = input.head_limit ? fileList.slice(0, input.head_limit) : fileList;

    return {
      mode: 'files_with_matches',
      numFiles: limitedFiles.length,
      filenames: limitedFiles,
    };
  } catch (e) {
    // If ripgrep fails (e.g., no matches), return empty results
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        mode: 'files_with_matches',
        numFiles: 0,
        filenames: [],
      };
    }
    throw e;
  }
}

/**
 * Recursive search using JavaScript (fallback when ripgrep unavailable)
 */
async function searchWithJavaScript(
  input: GrepToolInput,
  searchPath: string
): Promise<GrepToolOutput> {
  const regex = new RegExp(
    input.pattern,
    input['-i'] ? 'i' : ''
  );

  const matchingFiles: string[] = [];
  const results: string[] = [];
  const fileCounts: Map<string, number> = new Map();

  async function searchDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip VCS directories and common ignore patterns
        if (VCS_DIRECTORIES.includes(entry.name) ||
            ['node_modules', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else if (entry.isFile()) {
          // Check glob pattern
          if (input.glob && !matchGlob(entry.name, input.glob)) {
            continue;
          }

          // Check if file matches regex
          try {
            const content = await readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (regex.test(line)) {
                const relPath = toRelativePath(fullPath);

                if (input.output_mode === 'files_with_matches') {
                  if (!matchingFiles.includes(relPath)) {
                    matchingFiles.push(relPath);
                  }
                } else if (input.output_mode === 'content') {
                  const lineNum = input['-n'] ? `${relPath}:${i + 1}:` : `${relPath}:`;
                  let matchLine = `${lineNum}${line}`;

                  // Add context
                  if (input['-C']) {
                    const start = Math.max(0, i - input['-C']!);
                    const end = Math.min(lines.length, i + input['-C']! + 1);
                    for (let j = start; j < end; j++) {
                      const prefix = j === i ? '>' : ' ';
                      matchLine += `\n${prefix}${lines[j]}`;
                    }
                  }

                  results.push(matchLine);
                } else if (input.output_mode === 'count') {
                  const count = fileCounts.get(relPath) || 0;
                  fileCounts.set(relPath, count + 1);
                }
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  await searchDir(searchPath);

  // Apply head limit
  if (input.head_limit) {
    if (input.output_mode === 'files_with_matches') {
      matchingFiles.splice(input.head_limit);
    } else if (input.output_mode === 'content') {
      results.splice(input.head_limit);
    } else if (input.output_mode === 'count') {
      const entries = Array.from(fileCounts.entries());
      entries.splice(input.head_limit);
      fileCounts.clear();
      entries.forEach(([k, v]) => fileCounts.set(k, v));
    }
  }

  if (input.output_mode === 'content') {
    return {
      mode: 'content',
      numFiles: matchingFiles.length,
      filenames: matchingFiles,
      content: results.join('\n'),
      numLines: results.length,
    };
  }

  if (input.output_mode === 'count') {
    const entries = Array.from(fileCounts.entries());
    return {
      mode: 'count',
      numFiles: entries.length,
      filenames: entries.map(([path]) => path),
      content: entries.map(([path, count]) => `${path}:${count}`).join('\n'),
      numMatches: entries.reduce((sum, [, count]) => sum + count, 0),
    };
  }

  return {
    mode: 'files_with_matches',
    numFiles: matchingFiles.length,
    filenames: matchingFiles.slice(0, DEFAULT_LIMIT),
  };
}

/**
 * Simple glob pattern matching
 */
function matchGlob(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.replace(/,/g, '|')})`);

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Build the GrepTool
 */
export function buildGrepTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: GREP_TOOL_NAME,
    description: GREP_TOOL_DESCRIPTION,
    schema: GrepToolInputSchema,
    async func(input: GrepToolInput): Promise<string> {
      const searchPath = input.path ? expandPath(input.path) : getCwd();

      // Validate path exists
      try {
        const stats = await fsStat(searchPath);
        if (!stats.isDirectory() && !stats.isFile()) {
          return `Error: Path does not exist: ${searchPath}`;
        }
      } catch {
        return `Error: Path does not exist: ${searchPath}`;
      }

      try {
        // Try ripgrep first
        const hasRipgrep = await isRipgrepAvailable();

        const output = hasRipgrep
          ? await searchWithRipgrep(input, searchPath)
          : await searchWithJavaScript(input, searchPath);

        // Format output
        if (output.numFiles === 0) {
          return 'No matches found';
        }

        if (output.mode === 'content') {
          let result = output.content || '';
          if (output.numLines && output.numLines > (input.head_limit || DEFAULT_LIMIT)) {
            result += `\n\n(Showing first ${input.head_limit || DEFAULT_LIMIT} results)`;
          }
          return result;
        }

        if (output.mode === 'count') {
          let result = output.content || '';
          result += `\n\nFound ${output.numMatches} total matches across ${output.numFiles} files`;
          return result;
        }

        // files_with_matches
        let result = `Found ${output.numFiles} files:\n\n`;
        result += output.filenames.join('\n');
        return result;
      } catch (e) {
        return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

/**
 * Get the singleton GrepTool instance
 */
let grepToolInstance: DynamicStructuredTool | null = null;

export function getGrepTool(): DynamicStructuredTool {
  if (!grepToolInstance) {
    grepToolInstance = buildGrepTool();
  }
  return grepToolInstance;
}

/**
 * Export for use in tool registry
 */
export const grepTool = buildGrepTool();
