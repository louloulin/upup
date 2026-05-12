/**
 * Model detection from environment configuration.
 */

import { inferProvider } from '../shared/constants.js';

/**
 * Detect configured model from environment.
 * Returns model info based on DEFAULT_MODEL and MODEL_PROVIDER env vars.
 */
export async function detectModel(): Promise<{
  model: string;
  provider: string;
  source: string;
} | null> {
  const model = process.env.DEFAULT_MODEL;
  if (!model) return null;

  const provider =
    process.env.MODEL_PROVIDER ||
    inferProvider(model);

  return {
    model,
    provider,
    source: 'environment',
  };
}
