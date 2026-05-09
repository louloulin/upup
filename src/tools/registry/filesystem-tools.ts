/**
 * Filesystem, heartbeat, cron, and memory tool registrations.
 */

import type { RegisteredTool } from './types.js';
import { fileWriteMetadata, fileReadMetadata, memoryMetadata } from './types.js';
import { readFileTool, READ_FILE_DESCRIPTION } from '../filesystem/read-file.js';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from '../filesystem/write-file.js';
import { editFileTool, EDIT_FILE_DESCRIPTION } from '../filesystem/edit-file.js';
import { globTool } from '../filesystem/glob.js';
import { grepTool } from '../filesystem/grep.js';
import { sendUserFileTool, SEND_USER_FILE_DESCRIPTION } from '../filesystem/send-user-file.js';
import { heartbeatTool, HEARTBEAT_TOOL_DESCRIPTION } from '../heartbeat/heartbeat-tool.js';
import { cronTool, CRON_TOOL_DESCRIPTION } from '../cron/cron-tool.js';
import { memoryGetTool, MEMORY_GET_DESCRIPTION, memorySearchTool, MEMORY_SEARCH_DESCRIPTION, memoryUpdateTool, MEMORY_UPDATE_DESCRIPTION } from '../memory/index.js';

export function loadFilesystemTools(): RegisteredTool[] {
  return [
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
      description: `Find files matching a glob pattern. Use this to find all files of a specific type (e.g., "**/*.ts") or files in a directory tree.`,
      compactDescription: 'Find files by glob pattern (e.g., "**/*.ts", "src/**/*.js").',
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
