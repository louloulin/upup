/**
 * Compaction Orchestrator - Unified 4-Layer Compaction Pipeline
 *
 * Orchestrates all compaction layers:
 * 1. AutoTrigger  → Decide which layer to apply
 * 2. Snip         → Remove low-value messages
 * 3. Microcompact → Lightweight per-turn trimming
 * 4. Compact       → Full LLM summarization
 * 5. ApiMicrocompact → API-level compression
 * 6. SessionCompact → Session memory compression
 * 7. PostCleanup  → Post-compaction cleanup
 *
 * This is the main entry point for the compaction system.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { estimateTokens } from '../../utils/tokens.js';
import { info, warn, perf } from '../../utils/logging/logger.js';

// Import existing layers
import { compactContext, type CompactResult, type CompactContextParams } from '../compact.js';
import { microcompactMessages, type MicrocompactResult } from '../microcompact.js';
import { snipMessages, shouldSnip, type SnipResult } from '../snip.js';

// Import new layers
import {
  AutoTrigger,
  getAutoTrigger,
  resetAutoTrigger,
  type AutoTriggerResult,
  type CompactionLayer,
  type AutoTriggerConfig,
} from './auto-trigger.js';

import {
  ApiMicrocompact,
  getApiMicrocompact,
  resetApiMicrocompact,
  type ApiMicrocompactOptions,
} from './api-microcompact.js';

import {
  SessionMemoryCompact,
  getSessionMemoryCompact,
  resetSessionMemoryCompact,
  type SessionCompactResult,
} from './session-compact.js';

import {
  PostCleanup,
  getPostCleanup,
  resetPostCleanup,
  type PostCleanupResult,
  type PostCleanupConfig,
} from './post-cleanup.js';

// ============================================================================
// Orchestrator Configuration
// ============================================================================

export interface CompactionOrchestratorConfig {
  /** AutoTrigger configuration */
  autoTrigger?: AutoTriggerConfig;
  /** ApiMicrocompact options */
  apiMicrocompact?: ApiMicrocompactOptions;
  /** PostCleanup options */
  postCleanup?: PostCleanupConfig;
  /** Whether to use each layer */
  layers?: {
    snip?: boolean;
    microcompact?: boolean;
    compact?: boolean;
    autoTrigger?: boolean;
    apiMicrocompact?: boolean;
    sessionCompact?: boolean;
    postCleanup?: boolean;
  };
  /** Default compaction model */
  defaultModel?: string;
}

const DEFAULT_CONFIG: Required<CompactionOrchestratorConfig> = {
  autoTrigger: {},
  apiMicrocompact: {},
  postCleanup: {},
  layers: {
    snip: true,
    microcompact: true,
    compact: true,
    autoTrigger: true,
    apiMicrocompact: true,
    sessionCompact: true,
    postCleanup: true,
  },
  defaultModel: 'gpt-4o-mini',
};

// ============================================================================
// Orchestrator Result
// ============================================================================

export interface CompactionPipelineResult {
  /** Messages after pipeline */
  messages: BaseMessage[];
  /** Token count before */
  tokensBefore: number;
  /** Token count after */
  tokensAfter: number;
  /** Which layers were applied */
  appliedLayers: string[];
  /** Results from each layer */
  layerResults: {
    autoTrigger?: AutoTriggerResult;
    snip?: SnipResult;
    microcompact?: MicrocompactResult;
    apiMicrocompact?: { messagesCompressed: number };
    sessionCompact?: SessionCompactResult;
    postCleanup?: PostCleanupResult;
    compact?: CompactResult;
  };
  /** Total tokens saved */
  tokensSaved: number;
  /** Compression ratio */
  ratio: number;
  /** Error if any */
  error?: string;
}

// ============================================================================
// Orchestrator Class
// ============================================================================

export class CompactionOrchestrator {
  private config: Required<CompactionOrchestratorConfig>;
  private autoTrigger: AutoTrigger;
  private apiMicrocompact: ApiMicrocompact;
  private sessionCompact: SessionMemoryCompact;
  private postCleanup: PostCleanup;

  constructor(config: CompactionOrchestratorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.autoTrigger = new AutoTrigger(this.config.autoTrigger);
    this.apiMicrocompact = new ApiMicrocompact(this.config.apiMicrocompact);
    this.sessionCompact = new SessionMemoryCompact();
    this.postCleanup = new PostCleanup(this.config.postCleanup);
  }

  /**
   * Run the full compaction pipeline
   */
  async runPipeline(
    messages: BaseMessage[],
    params?: Partial<CompactContextParams>
  ): Promise<CompactionPipelineResult> {
    const startTokens = estimateTokens(messages);
    const appliedLayers: string[] = [];
    const layerResults: CompactionPipelineResult['layerResults'] = {};
    let currentMessages = [...messages];

    try {
      // === Layer 0: AutoTrigger Decision ===
      if (this.config.layers.autoTrigger) {
        const triggerResult = this.autoTrigger.check(currentMessages);

        if (triggerResult.action !== 'none') {
          appliedLayers.push(`auto:${triggerResult.action}`);
          layerResults.autoTrigger = triggerResult;
          this.autoTrigger.recordCompactionAttempt();
        } else if (triggerResult.skipReason) {
          this.autoTrigger.recordSkip();
        }
      }

      // === Layer 1: Snip (always available) ===
      if (this.config.layers.snip && shouldSnip(currentMessages)) {
        const snipResult = snipMessages(currentMessages);
        if (snipResult.removed > 0) {
          currentMessages = snipResult.snipped;
          appliedLayers.push('snip');
          layerResults.snip = snipResult;
        }
      }

      // === Layer 2: Microcompact ===
      if (this.config.layers.microcompact) {
        const mcResult = microcompactMessages(currentMessages);
        if (mcResult.cleared > 0) {
          currentMessages = mcResult.messages;
          appliedLayers.push('microcompact');
          layerResults.microcompact = mcResult;
        }
      }

      // === Layer 3: Full Compact (LLM summarization) ===
      if (this.config.layers.compact) {
        const compactThreshold = this.config.autoTrigger.compactTokenThreshold ?? 100_000;
        const currentTokens = estimateTokens(currentMessages);

        if (currentTokens >= compactThreshold && params) {
          try {
            const compactResult = await compactContext({
              ...params,
              signal: params.signal,
            });

            // Build summary message
            const summaryMessage: BaseMessage = {
              _getType: () => 'system',
              content: compactResult.summary,
            } as BaseMessage;

            currentMessages = [currentMessages[0], summaryMessage];
            appliedLayers.push('compact');
            layerResults.compact = compactResult;
            this.autoTrigger.recordCompactionAttempt();
          } catch (err) {
            warn('orchestrator', `Compact failed: ${err}`);
            layerResults.compact = undefined;
          }
        }
      }

      // === Layer 4: API Microcompact ===
      if (this.config.layers.apiMicrocompact) {
        if (this.apiMicrocompact.needsCompression(currentMessages)) {
          const { messages: compressed, analysis } = this.apiMicrocompact.compressMessages(currentMessages);
          const stats = this.apiMicrocompact.getStats(analysis);
          if (stats.messagesCompressed > 0) {
            currentMessages = compressed;
            appliedLayers.push('api-microcompact');
            layerResults.apiMicrocompact = { messagesCompressed: stats.messagesCompressed };
          }
        }
      }

      // === Layer 5: Session Memory Compact ===
      if (this.config.layers.sessionCompact) {
        this.sessionCompact.addFromMessages(currentMessages);
        const scResult = this.sessionCompact.compact();
        if (scResult.removed > 0 || scResult.merged > 0) {
          appliedLayers.push('session-compact');
          layerResults.sessionCompact = scResult;
        }
      }

      // === Layer 6: PostCleanup ===
      if (this.config.layers.postCleanup) {
        const cleanupResult = this.postCleanup.cleanup(currentMessages);
        if (cleanupResult.removed > 0) {
          currentMessages = cleanupResult.messages;
          appliedLayers.push('post-cleanup');
          layerResults.postCleanup = cleanupResult;
        }
      }

      const endTokens = estimateTokens(currentMessages);

      return {
        messages: currentMessages,
        tokensBefore: startTokens,
        tokensAfter: endTokens,
        appliedLayers,
        layerResults,
        tokensSaved: startTokens - endTokens,
        ratio: startTokens > 0 ? endTokens / startTokens : 1,
      };
    } catch (err) {
      return {
        messages: currentMessages,
        tokensBefore: startTokens,
        tokensAfter: estimateTokens(currentMessages),
        appliedLayers,
        layerResults,
        tokensSaved: 0,
        ratio: 1,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Quick pipeline (non-async, no LLM calls)
   */
  runQuickPipeline(messages: BaseMessage[]): {
    messages: BaseMessage[];
    appliedLayers: string[];
    tokensSaved: number;
  } {
    let currentMessages = [...messages];
    const appliedLayers: string[] = [];

    // Snip
    if (this.config.layers.snip) {
      const snipResult = snipMessages(currentMessages);
      if (snipResult.removed > 0) {
        currentMessages = snipResult.snipped;
        appliedLayers.push('snip');
      }
    }

    // Microcompact
    if (this.config.layers.microcompact) {
      const mcResult = microcompactMessages(currentMessages);
      if (mcResult.cleared > 0) {
        currentMessages = mcResult.messages;
        appliedLayers.push('microcompact');
      }
    }

    // PostCleanup
    if (this.config.layers.postCleanup) {
      const cleanupResult = this.postCleanup.cleanup(currentMessages);
      if (cleanupResult.removed > 0) {
        currentMessages = cleanupResult.messages;
        appliedLayers.push('post-cleanup');
      }
    }

    const startTokens = estimateTokens(messages);
    const endTokens = estimateTokens(currentMessages);

    return {
      messages: currentMessages,
      appliedLayers,
      tokensSaved: startTokens - endTokens,
    };
  }

  /**
   * Get the AutoTrigger for threshold checking
   */
  getAutoTrigger(): AutoTrigger {
    return this.autoTrigger;
  }

  /**
   * Record a user message (resets idle timer)
   */
  recordUserMessage(): void {
    this.autoTrigger.recordUserMessage();
  }

  /**
   * Record a turn (increments counters)
   */
  recordTurn(): void {
    this.autoTrigger.recordTurn();
  }

  /**
   * Record a skipped compaction
   */
  recordSkip(): void {
    this.autoTrigger.recordSkip();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompactionOrchestratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset all layers
   */
  reset(): void {
    this.autoTrigger.reset();
    resetApiMicrocompact();
    resetSessionMemoryCompact();
    resetPostCleanup();
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

let globalOrchestrator: CompactionOrchestrator | null = null;

export function getCompactionOrchestrator(
  config?: CompactionOrchestratorConfig
): CompactionOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new CompactionOrchestrator(config);
  }
  return globalOrchestrator;
}

export function resetCompactionOrchestrator(): void {
  if (globalOrchestrator) {
    globalOrchestrator.reset();
    globalOrchestrator = null;
  }
  resetAutoTrigger();
  resetApiMicrocompact();
  resetSessionMemoryCompact();
  resetPostCleanup();
}

// Re-export all types
export type {
  AutoTriggerConfig,
  AutoTriggerResult,
  CompactionLayer,
  ApiMicrocompactOptions,
  PostCleanupConfig,
  PostCleanupResult,
  SessionCompactResult,
};
