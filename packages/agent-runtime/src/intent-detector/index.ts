/**
 * Intent Detector — entry point.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/intent-detector
 *
 * Selects between the LLM-driven classifier (default) and the legacy
 * keyword classifier via the UPUP_INTENT_MODE env var:
 *   - 'legacy'  → keyword matcher
 *   - 'llm' or unset → LLM-driven (uses src/model/llm.ts)
 *
 * Few-shot examples live in examples.json next to this file and are
 * loaded once at construction time.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlmClassifier } from './llm.js';
import { createLegacyClassifier } from './legacy.js';
import {
  type FewShotExample,
  type IntentDetector,
  type IntentResult,
  type LlmCall,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadFewShotExamples(path?: string): FewShotExample[] {
  const file = path ?? join(__dirname, 'examples.json');
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as { examples?: FewShotExample[] };
    return Array.isArray(parsed.examples) ? parsed.examples : [];
  } catch {
    return [];
  }
}

export interface FactoryOptions {
  /** Override LLM call (used by tests and CLI startup). */
  llmCall?: LlmCall;
  /** Override few-shot examples file. */
  examplesPath?: string;
  /** Force a specific mode, ignoring env var. */
  forceMode?: 'legacy' | 'llm';
}

/** Create the appropriate classifier based on env / override. */
export function createIntentDetector(opts: FactoryOptions = {}): IntentDetector {
  const mode = opts.forceMode ?? (process.env.UPUP_INTENT_MODE === 'legacy' ? 'legacy' : 'llm');
  if (mode === 'legacy') {
    const legacy = createLegacyClassifier();
    return {
      async classify(query: string): Promise<IntentResult> {
        return legacy.classify(query);
      },
    };
  }
  if (!opts.llmCall) {
    throw new Error(
      'createIntentDetector in llm mode requires opts.llmCall. ' +
        'Pass an injected call (production wires callLlm from src/model/llm.ts).',
    );
  }
  const examples = loadFewShotExamples(opts.examplesPath);
  const llm = createLlmClassifier({ llmCall: opts.llmCall, examples });
  return {
    async classify(query: string): Promise<IntentResult> {
      return llm.classify(query);
    },
    addExample: (ex) => llm.addExample(ex),
    listExamples: () => llm.listExamples(),
  };
}

export { createLlmClassifier, _internal as llmInternal } from './llm.js';
export { createLegacyClassifier, _internal as legacyInternal } from './legacy.js';
export {
  ALL_INTENTS,
  INTENT_DESCRIPTIONS,
  type Intent,
  type IntentDetector,
  type IntentResult,
  type IntentScore,
  type FewShotExample,
  type LlmCall,
} from './types.js';

// ---------------------------------------------------------------------------
// 中文投资意图路由 (Sprint 4.5 — 同花顺问财对标)
// ---------------------------------------------------------------------------

export {
  ZhRouter,
  routeZh,
  keywordRoute,
  ZH_INTENT_LABELS,
  ZH_INTENT_DESCRIPTIONS,
  type ZhIntent,
  type ZhRouteResult,
  type ZhRouterOptions,
} from './zh-router.js';
