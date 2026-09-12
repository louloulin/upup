import { PiTool } from '../../runtime/pi/tool.js';
import { constants } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { assertSandboxPath } from './sandbox.js';
import {
  detectLineEnding,
  fuzzyFindText,
  generateDiffString,
  normalizeForFuzzyMatch,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from './utils/edit-diff.js';
import { checkStaleness, updateAfterWrite } from './file-state.js';

export const EDIT_FILE_DESCRIPTION = `
Perform precise in-place text edits in a local workspace file.

## When to Use

- Replacing a specific block/string in an existing file
- Making surgical code/config edits without rewriting full file

## When NOT to Use

- Creating or overwriting entire files (use \`write_file\`)
- Reading file contents (use \`read_file\`)

## Usage Notes

- The system will prompt the user for confirmation automatically; just call the tool directly
- Accepts \`path\`, \`old_text\`, \`new_text\`, and optional \`replace_all\`
- \`old_text\` must be unique in the file; ambiguous matches are rejected (unless \`replace_all\` is true)
- Preserves BOM and line ending style where possible
- Returns a unified diff summary of the change
`.trim();

const editFileSchema = z.object({
  path: z.string().describe('Path to the file to edit (relative or absolute).'),
  old_text: z.string().describe('Exact text to find and replace.'),
  new_text: z.string().describe('New text to replace old_text with.'),
  replace_all: z.boolean().default(false).describe('Replace all occurrences (default: false, requires unique match)'),
});

export const editFileTool = new PiTool({
  name: 'edit_file',
  description:
    'Make precise text replacements in a file. The target text must be unique in the file to avoid ambiguous edits.',
  schema: editFileSchema,
  func: async (input) => {
    const cwd = process.cwd();
    const { resolved } = await assertSandboxPath({
      filePath: input.path,
      cwd,
      root: cwd,
    });

    try {
      await access(resolved, constants.R_OK | constants.W_OK);
    } catch {
      throw new Error(`File not found or not writable: ${input.path}`);
    }

    const rawContent = (await readFile(resolved)).toString('utf-8');

    // Staleness check: detect if file was modified since last read
    const { bom, text: content } = stripBom(rawContent);
    const staleness = await checkStaleness(resolved, content);
    if (staleness.stale) {
      throw new Error(
        `File has been modified since last read: ${staleness.reason}. Please re-read the file before editing.`,
      );
    }

    const originalEnding = detectLineEnding(content);
    const normalizedContent = normalizeToLF(content);
    const normalizedOldText = normalizeToLF(input.old_text);
    const normalizedNewText = normalizeToLF(input.new_text);

    const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);
    if (!matchResult.found) {
      throw new Error(
        `Could not find the exact text in ${input.path}. The old_text must match exactly including whitespace/newlines.`,
      );
    }

    const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
    const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
    const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;
    if (occurrences > 1 && !input.replace_all) {
      throw new Error(
        `Found ${occurrences} occurrences of old_text in ${input.path}. Provide more context so it is unique, or set replace_all=true.`,
      );
    }

    let newContent: string;
    let baseContent: string;
    let replacementCount: number;

    if (input.replace_all && occurrences > 1) {
      // Replace all occurrences
      baseContent = normalizedContent;
      const searchStr = matchResult.usedFuzzyMatch ? fuzzyOldText : normalizedOldText;
      const replaceStr = normalizedNewText;
      newContent = baseContent.split(searchStr).join(replaceStr);
      replacementCount = occurrences;
    } else {
      // Single replacement (original behavior)
      baseContent = matchResult.contentForReplacement;
      newContent =
        baseContent.substring(0, matchResult.index) +
        normalizedNewText +
        baseContent.substring(matchResult.index + matchResult.matchLength);
      replacementCount = 1;
    }

    if (baseContent === newContent) {
      throw new Error(`No changes made to ${input.path}. Replacement produced identical content.`);
    }

    const finalContent = bom + restoreLineEndings(newContent, originalEnding);
    await writeFile(resolved, finalContent, 'utf-8');

    // Update tracked state so next edit doesn't see our own write as stale
    updateAfterWrite(resolved, content);

    const diffResult = generateDiffString(baseContent, newContent);
    return formatToolResult({
      path: input.path,
      message: `Successfully replaced ${replacementCount} occurrence(s) in ${input.path}.`,
      replacements: replacementCount,
      diff: diffResult.diff,
      firstChangedLine: diffResult.firstChangedLine,
    });
  },
});
