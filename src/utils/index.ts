/**
 * @deprecated Use @upup/utils instead
 * Re-exports from @upup/utils for backward compatibility
 */

// Re-export from @upup/utils package
export {
  extractTextContent,
  hasToolCalls,
} from '@upup/utils';

export {
  loadConfig,
  saveConfig,
  getSetting,
  setSetting,
} from '@upup/utils';

export {
  findPrevWordStart,
  findNextWordEnd,
} from '@upup/utils';

export {
  cursorHandlers,
} from '@upup/utils';
export type { CursorContext } from '@upup/utils';

export {
  getToolDescription,
} from '@upup/utils';

export {
  transformMarkdownTables,
  formatResponse,
} from '@upup/utils';

export {
  estimateTokens,
  getEffectiveContextWindow,
  getAutoCompactThreshold,
  CONTEXT_THRESHOLD,
  KEEP_TOOL_USES,
} from '@upup/utils';

export {
  parseApiErrorInfo,
  classifyError,
  isContextOverflowError,
  isNonRetryableError,
  formatUserFacingError,
} from '@upup/utils';

// Logger re-exports from @upup/utils/logging
export {
  getLogger,
  createLogger,
  log,
  debug,
  info,
  warn,
  error,
  perf,
} from '@upup/utils/logging';
export type { LogEntry, LogLevel, LogCategory, LoggerConfig } from '@upup/utils/logging';

// Legacy logger export from src/utils/logger.js (for backward compatibility)
export { logger } from './logger.js';

// NOTE: These utilities remain in src/utils due to dependencies on @/providers
// They will be migrated in a future phase
export {
  getApiKeyNameForProvider,
  getProviderDisplayName,
  checkApiKeyExistsForProvider,
  saveApiKeyForProvider,
} from './env.js';
export { InMemoryChatHistory } from './in-memory-chat-history.js';

// LongTermChatHistory moved to @upup/utils
export { LongTermChatHistory } from '@upup/utils';
export type { ConversationEntry } from '@upup/utils';

// NOTE: model.ts remains in src/utils due to dependencies on @/providers
// It will be migrated in a future phase
export {
  PROVIDERS,
  getModelsForProvider,
  getModelIdsForProvider,
  getDefaultModelForProvider,
  getModelDisplayName,
} from './model.js';
export type { Model } from './model.js';
