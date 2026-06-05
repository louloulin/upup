/**
 * Filesystem, heartbeat, cron, and memory tool registrations.
 */

import type { RegisteredTool } from './types.js';
import { fileWriteMetadata, fileReadMetadata, memoryMetadata } from './types.js';
import { readFileTool, READ_FILE_DESCRIPTION } from './read-file';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from './write-file';
import { editFileTool, EDIT_FILE_DESCRIPTION } from './edit-file';
import { globTool } from './glob';
import { grepTool } from './grep';
import { sendUserFileTool, SEND_USER_FILE_DESCRIPTION } from './send-user-file';
import { heartbeatTool, HEARTBEAT_TOOL_DESCRIPTION } from './heartbeat-tool';
import { cronTool, CRON_TOOL_DESCRIPTION } from '@upup/cron/cron-tool';
import { memoryGetTool, MEMORY_GET_DESCRIPTION, memorySearchTool, MEMORY_SEARCH_DESCRIPTION, memoryUpdateTool, MEMORY_UPDATE_DESCRIPTION } from '@upup/memory-system/index';
import { bashTool, BASH_TOOL_NAME } from './bash/index';

export function loadFilesystemTools(): RegisteredTool[] {
  return [
    // Bash tool - for shell commands like ls, pwd, cat, grep, mkdir, etc.
    // Reference: Loucode's BashTool with command classification
    {
      name: BASH_TOOL_NAME,
      tool: bashTool,
      description: `Execute shell commands in the terminal. Use for:
- Listing directories: ls, tree, du
- Reading file content: cat, head, tail, less, more
- Searching: find, grep, locate, which
- File operations: mkdir, rm, cp, mv, touch, chmod
- Information: pwd, whoami, date, uname
- Pipes and redirects: any command with |, >, >>, &&, ||
- Environment: echo, export, env

DO NOT use this for reading individual files - use read_file instead.
DO NOT use this for pattern matching - use glob instead.`,
      compactDescription: 'Execute shell commands (ls, pwd, cat, grep, find, mkdir, etc.)',
      concurrencySafe: false,
      concurrencyMetadata: fileReadMetadata(),
    },
    {
      name: 'read_file',
      tool: readFileTool,
      description: READ_FILE_DESCRIPTION,
      compactDescription: 'Read a local file by path. Returns file content as text.',
      concurrencySafe: true,
    },
    {
      name: 'write_file',
      tool: writeFileTool,
      description: WRITE_FILE_DESCRIPTION,
      compactDescription: 'Create or overwrite a file. Requires user approval.',
      concurrencySafe: false,
      concurrencyMetadata: fileWriteMetadata(),
    },
    {
      name: 'edit_file',
      tool: editFileTool,
      description: EDIT_FILE_DESCRIPTION,
      compactDescription: 'Edit a file by replacing text. Requires user approval.',
      concurrencySafe: false,
      concurrencyMetadata: fileWriteMetadata(),
    },
    {
      name: 'glob',
      tool: globTool,
      description: `Find files matching a glob pattern. Use this to find all files of a specific type (e.g., "**/*.ts") or files in a directory tree.

For shell commands (ls, cat, grep, find), use the bash tool instead.`,
      compactDescription: 'Find files by glob pattern (e.g., "**/*.ts", "src/**/*.js"). For ls/cat/grep use bash.',
      concurrencySafe: true,
      concurrencyMetadata: fileReadMetadata(),
    },
    {
      name: 'grep',
      tool: grepTool,
      description: `Search file contents using regular expressions. Use this to find text patterns across files, search for function/variable definitions, or extract matching lines with context.`,
      compactDescription: 'Search file contents with regex patterns. Supports content, files_with_matches, and count modes.',
      concurrencySafe: true,
      concurrencyMetadata: fileReadMetadata(),
    },
    {
      name: 'send_user_file',
      tool: sendUserFileTool,
      description: SEND_USER_FILE_DESCRIPTION,
      compactDescription: 'Send/export a file to the user (copies to Downloads or custom path).',
      concurrencySafe: true,
    },
    {
      name: 'heartbeat',
      tool: heartbeatTool,
      description: HEARTBEAT_TOOL_DESCRIPTION,
      compactDescription: 'View or update the periodic heartbeat checklist (.upup/HEARTBEAT.md).',
      concurrencySafe: true,
    },
    {
      name: 'cron',
      tool: cronTool,
      description: CRON_TOOL_DESCRIPTION,
      compactDescription: 'Manage scheduled cron jobs (create, list, update, delete).',
      concurrencySafe: true,
    },
    {
      name: 'memory_search',
      tool: memorySearchTool,
      description: MEMORY_SEARCH_DESCRIPTION,
      compactDescription: 'Search persistent memory and past conversations for stored facts and preferences.',
      concurrencySafe: true,
      concurrencyMetadata: memoryMetadata(false),
    },
    {
      name: 'memory_get',
      tool: memoryGetTool,
      description: MEMORY_GET_DESCRIPTION,
      compactDescription: 'Read specific memory file sections by line range.',
      concurrencySafe: true,
      concurrencyMetadata: memoryMetadata(false),
    },
    {
      name: 'memory_update',
      tool: memoryUpdateTool,
      description: MEMORY_UPDATE_DESCRIPTION,
      compactDescription: 'Add, edit, or delete persistent memory entries.',
      concurrencySafe: false,
      concurrencyMetadata: memoryMetadata(true),
    },
  ];
}
