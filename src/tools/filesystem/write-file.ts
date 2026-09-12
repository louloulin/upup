import { PiTool } from '../../runtime/pi/tool.js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { assertSandboxPath } from './sandbox.js';

export const WRITE_FILE_DESCRIPTION = `
Create or overwrite files in the local workspace.

## When to Use

- Creating a new file with full contents
- Replacing an existing file entirely
- Writing generated output to disk

## When NOT to Use

- Small surgical updates in an existing file (use \`edit_file\`)
- Reading file contents (use \`read_file\`)

## Usage Notes

- The system will prompt the user for confirmation automatically; just call the tool directly
- Accepts \`path\` and full \`content\`
- Creates parent directories when they do not exist
- Overwrites existing file content completely
- **Atomic write**: Skips writing if content is unchanged (prevents mtime churn and unnecessary file operations)
`.trim();

const writeFileSchema = z.object({
  path: z.string().describe('Path to the file to write (relative or absolute).'),
  content: z.string().describe('Content to write to the file.'),
});

export const writeFileTool = new PiTool({
  name: 'write_file',
  description:
    'Create or overwrite a file inside the workspace. Automatically creates parent directories when needed. Skips write if content unchanged.',
  schema: writeFileSchema,
  func: async (input) => {
    const cwd = process.cwd();
    const { resolved } = await assertSandboxPath({
      filePath: input.path,
      cwd,
      root: cwd,
    });
    const dir = dirname(resolved);
    await mkdir(dir, { recursive: true });

    // Atomic write: skip if content unchanged
    try {
      const existing = await readFile(resolved, 'utf-8');
      if (existing === input.content) {
        return formatToolResult({
          path: input.path,
          bytesWritten: 0,
          skipped: true,
          message: `Skipped writing ${input.path} — content unchanged (atomic write)`,
        });
      }
    } catch {
      // File doesn't exist, will create new
    }

    await writeFile(resolved, input.content, 'utf-8');

    return formatToolResult({
      path: input.path,
      bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
      skipped: false,
      message: `Successfully wrote ${input.content.length} characters to ${input.path}`,
    });
  },
});
