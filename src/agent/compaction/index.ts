/**
 * Compaction System - Enhanced Multi-Layer Context Management
 *
 * 4-Layer Architecture:
 * 1. Snip      → Remove low-value confirmation/acknowledgment messages
 * 2. Micro     → Per-turn lightweight trimming (replace old tool results)
 * 3. Compact   → Full LLM summarization (when context grows too large)
 * 4. Auto      → Automatic threshold-based triggering (not just overflow)
 *
 * Additional Features:
 * - apiMicrocompact    → Per-message API-level compression
 * - sessionMemoryCompact → Session-level memory compression
 * - postCompactCleanup → Post-compaction cleanup
 * - grouping           → Message grouping by task
 *
 * Reference: Loucode's 8-file compaction service (~3,983 lines)
 */

export * from './auto-trigger.js';
export * from './api-microcompact.js';
export * from './session-compact.js';
export * from './post-cleanup.js';
export * from './orchestrator.js';
