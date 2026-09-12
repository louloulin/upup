/**
 * Send User File Tool
 * 
 * Sends files to the user - similar to Claude Code's SendUserFile.
 * Used for investment research results export.
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { formatToolResult } from '../types.js';
import { assertSandboxPath } from './sandbox.js';

export const SEND_USER_FILE_DESCRIPTION = `
Send a file to the user by copying it to a temporary location.

## When to Use

- Exporting investment research results
- Saving generated reports to a convenient location
- Making files accessible outside the workspace

## Usage

Provide the source file path (relative or absolute) and optional destination.
If no destination is provided, file is copied to user downloads folder.

## Notes

- File is copied, not moved
- Original file remains in place
- Supports any file type
`.trim();

const sendUserFileSchema = z.object({
  path: z.string().describe('Path to the file to send to the user'),
  destination: z.string().optional().describe('Optional destination path'),
});

export function createSendUserFileTool() {
  return new PiTool({
    name: 'send_user_file',
    description: 'Send a file to the user by copying it to a convenient location',
    schema: sendUserFileSchema,
    func: async (input) => {
      const cwd = process.cwd();
      
      // Resolve source path
      const { resolved: sourcePath } = await assertSandboxPath({
        filePath: input.path,
        cwd,
        root: cwd,
      });
      
      // Check source file exists
      if (!fs.existsSync(sourcePath)) {
        return formatToolResult({
          success: false,
          error: `File not found: ${input.path}`,
        });
      }
      
      // Determine destination
      let destPath: string;
      if (input.destination) {
        const { resolved: destResolved } = await assertSandboxPath({
          filePath: input.destination,
          cwd,
          root: cwd,
        });
        destPath = destResolved;
      } else {
        // Default to downloads folder
        destPath = path.join(os.homedir(), 'Downloads', path.basename(sourcePath));
      }
      
      // Copy file
      fs.copyFileSync(sourcePath, destPath);
      
      const stats = fs.statSync(destPath);
      
      return formatToolResult({
        success: true,
        source: input.path,
        destination: input.destination || path.join('~/Downloads', path.basename(sourcePath)),
        size: stats.size,
        message: `File sent to ${input.destination || 'Downloads'}: ${path.basename(sourcePath)} (${stats.size} bytes)`,
      });
    },
  });
}

export const sendUserFileTool = createSendUserFileTool();
