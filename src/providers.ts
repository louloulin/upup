/**
 * Canonical provider registry — single source of truth for all provider metadata.
 * When adding a new provider, add a single entry here; all other modules derive from this.
 *
 * @deprecated Use @upup/llm directly instead
 * Re-exports from @upup/llm for backward compatibility
 */

export type { ProviderDef } from '@upup/llm';
export {
  PROVIDERS,
  resolveProvider,
  getProviderById,
} from '@upup/llm';
