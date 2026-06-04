/**
 * GrowthBook-style A/B testing module.
 *
 * Deterministic variant assignment using FNV-1a hash of `${experimentKey}::${userId}`.
 * Bucket = hash % 10_000 / 10_000 in [0, 1); walk cumulative weight distribution.
 *
 * Pure / stateless: callers pass variants per-call. `registerExperiment` is only
 * used for documentation / `listExperiments()` introspection (no global state
 * affects assignment).
 */
import { fnv1a } from '../../agent/feature-gates.js';

export interface ExperimentVariant {
  key: string;
  weight: number;
}

export interface ExperimentContext {
  userId?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface ExperimentAssignment {
  experimentKey: string;
  variantKey: string;
  userId: string;
  inExperiment: boolean;
}

interface ExperimentDefinition {
  key: string;
  description?: string;
  variants: ExperimentVariant[];
}

const experiments = new Map<string, ExperimentDefinition>();

/**
 * Assign a user to a variant deterministically.
 *
 * Throws if variants is empty or weights don't sum to 1.0 (tolerance 1e-6).
 */
export function assignVariant(
  experimentKey: string,
  ctx: ExperimentContext,
  variants: ExperimentVariant[],
): ExperimentAssignment {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(
      `assignVariant: variants list is empty for experiment "${experimentKey}"`,
    );
  }
  let total = 0;
  for (const v of variants) {
    if (typeof v.weight !== 'number' || Number.isNaN(v.weight)) {
      throw new Error(
        `assignVariant: variant "${v.key}" has non-numeric weight for experiment "${experimentKey}"`,
      );
    }
    total += v.weight;
  }
  if (Math.abs(total - 1.0) > 1e-6) {
    throw new Error(
      `assignVariant: weights for experiment "${experimentKey}" must sum to 1.0 (got ${total})`,
    );
  }

  const userId = ctx.userId ?? 'anonymous';
  const bucket = (fnv1a(`${experimentKey}::${userId}`) % 10_000) / 10_000;

  // Walk cumulative distribution. Edge: bucket==1.0 from FP rounding → return last.
  let cumulative = 0;
  let chosen = variants[variants.length - 1].key;
  for (const v of variants) {
    cumulative += v.weight;
    if (bucket < cumulative) {
      chosen = v.key;
      break;
    }
  }

  return {
    experimentKey,
    variantKey: chosen,
    userId,
    inExperiment: true,
  };
}

/**
 * Convenience: return just the variant key string.
 */
export function featureExperiment(
  experimentKey: string,
  ctx: ExperimentContext,
  variants: ExperimentVariant[],
): string {
  return assignVariant(experimentKey, ctx, variants).variantKey;
}

/**
 * Register an experiment definition for introspection via `listExperiments()`.
 * Has no effect on assignment (variants are passed per-call).
 * Idempotent: re-registering overwrites the previous definition.
 */
export function registerExperiment(
  key: string,
  variants: ExperimentVariant[],
  opts: { description?: string } = {},
): void {
  // Validate weights at registration time too — fail fast.
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(`registerExperiment: variants list is empty for "${key}"`);
  }
  let total = 0;
  for (const v of variants) {
    total += v.weight;
  }
  if (Math.abs(total - 1.0) > 1e-6) {
    throw new Error(
      `registerExperiment: weights for "${key}" must sum to 1.0 (got ${total})`,
    );
  }
  experiments.set(key, {
    key,
    description: opts.description,
    variants: variants.map((v) => ({ key: v.key, weight: v.weight })),
  });
}

export function listExperiments(): Array<{
  key: string;
  description?: string;
  variants: ExperimentVariant[];
}> {
  return Array.from(experiments.values()).map((def) => ({
    key: def.key,
    description: def.description,
    variants: def.variants.map((v) => ({ key: v.key, weight: v.weight })),
  }));
}

/**
 * Test/internal: clear all registered experiments. Not exported in public API.
 */
export function _resetExperiments(): void {
  experiments.clear();
}
