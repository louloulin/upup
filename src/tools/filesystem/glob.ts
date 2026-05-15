/**
 * GlobTool - Find files by glob pattern
 *
 * A simplified implementation of Claude Code's GlobTool for UpUp.
 * Uses native glob patterns to find files matching the specified pattern.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import G from 'glob';
const globSync = G.sync;
import { stat } from 'node:fs/promises';
import { getCwd, expandPath, toRelativePath } from '../../utils/paths.js';

const GLOB_TOOL_NAME = 'glob';
const MAX_RESULTS = 100;

/**
 * Input schema for GlobTool
 */
export const GlobToolInputSchema = z.object({
  pattern: z.string().describe('The glob pattern to match files against (e.g., "**/*.ts", "src/**/*.js")'),
  path: z.string().optional().describe('The directory to search in. Defaults to current working directory.'),
});

export type GlobToolInput = z.infer<typeof GlobToolInputSchema>;

/**
 * Output schema for GlobTool
 */
export interface GlobToolOutput {
  durationMs: number;
  numFiles: number;
  filenames: string[];
  truncated: boolean;
}

/**
 * GlobTool description
 */
const GLOB_TOOL_DESCRIPTION = `Find files matching a glob pattern.

Use this tool to:
- Find all files of a specific type (e.g., "**/*.ts", "**/*.json")
- Find files in a directory tree
- List files matching naming patterns

The search is performed recursively from the specified path (or current directory).

Examples:
- pattern: "**/*.ts" - Find all TypeScript files
- pattern: "src/**/*" - Find all files in src directory
- pattern: "*.md" - Find markdown files in current directory`;

/**
 * Build the GlobTool
 */
export function buildGlobTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: GLOB_TOOL_NAME,
    description: GLOB_TOOL_DESCRIPTION,
    schema: GlobToolInputSchema,
    async func({ pattern, path }: GlobToolInput): Promise<string> {
      const start = Date.now();
      const searchPath = path ? expandPath(path) : getCwd();

      // Validate path exists
      try {
        const stats = await stat(searchPath);
        if (!stats.isDirectory()) {
          return `Error: Path is not a directory: ${path}`;
        }
      } catch (e) {
        return `Error: Directory does not exist: ${path || getCwd()}`;
      }

      try {
        // Use glob to find matching files
        let files: string[] = await globSync(pattern, {
          cwd: searchPath,
          absolute: false,
          ignore: [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/.next/**',
            '**/coverage/**',
          ],
        });

        // Ensure files is always an array
        if (!Array.isArray(files)) {
          files = [];
        }

        // Limit results
        const truncated = files.length > MAX_RESULTS;
        const limitedFiles = files.slice(0, MAX_RESULTS);

        // Convert to relative paths
        const filenames = limitedFiles.map(f => toRelativePath(f));

        const output: GlobToolOutput = {
          durationMs: Date.now() - start,
          numFiles: filenames.length,
          filenames,
          truncated,
        };

        // Format output
        if (filenames.length === 0) {
          return `No files found matching pattern: ${pattern}`;
        }

        let result = `Found ${filenames.length} file${filenames.length === 1 ? '' : 's'} in ${output.durationMs}ms\n\n`;
        result += filenames.join('\n');

        if (truncated) {
          result += `\n\n(Results truncated. Consider using a more specific path or pattern.)`;
        }

        return result;
      } catch (e) {
        return `Error searching for files: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

/**
 * Get the singleton GlobTool instance
 */
let globToolInstance: DynamicStructuredTool | null = null;

export function getGlobTool(): DynamicStructuredTool {
  if (!globToolInstance) {
    globToolInstance = buildGlobTool();
  }
  return globToolInstance;
}

/**
 * Export for use in tool registry
 */
export const globTool = buildGlobTool();
