/**
 * UI module exports for @upup/adapter-paperclip
 */

import type { AdapterModel } from '@paperclipai/adapter-utils';

export const UPUP_MODELS: AdapterModel[] = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4.5', label: 'GPT-4.5' },
];

export { parseUpupStdoutLine, parseStdoutLine } from './parse-stdout.js';
export { buildUpupConfig } from './build-config.js';
