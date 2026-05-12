/**
 * Build adapter config from UI form values.
 */

import type { AdapterModel } from '@paperclipai/adapter-utils';
import { inferProvider } from '../shared/constants.js';

// Re-export models for UI
export { UPUP_MODELS } from './index.js';

/**
 * Build adapterConfig from CreateConfigValues.
 * Maps UI form values to adapter configuration.
 */
export function buildUpupConfig(values: {
  model?: string;
  provider?: string;
  timeoutSec?: number;
  maxIterations?: number;
  persistSession?: boolean;
  cwd?: string;
  promptTemplate?: string;
}): Record<string, unknown> {
  return {
    model: values.model,
    provider: values.provider,
    timeoutSec: values.timeoutSec ?? 1800,
    maxIterations: values.maxIterations ?? 50,
    persistSession: values.persistSession ?? true,
    cwd: values.cwd,
    promptTemplate: values.promptTemplate,
  };
}
