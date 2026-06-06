/**
 * FilterSpec — Strongly-typed schema for natural-language stock screening
 * (Gap G4 / P1.b).
 *
 * Design note (D-CTG-3): LLM only ever emits this typed schema, never raw
 * SQL/DSL. The two-stage pipeline is:
 *   1. NL  → FilterSpec        (LLM, or deterministic regex parser for tests)
 *   2. FilterSpec → ranked rows (pure code, no LLM)
 *
 * Reuse: lives in `src/plan/` because it composes with the plan-builder's
 * existing NL→typed pipeline.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export const FilterOpSchema = z.enum(['=', '!=', '>', '<', '>=', '<=', 'between', 'in', 'not-in']);
export type FilterOp = z.infer<typeof FilterOpSchema>;

export type Scalar = string | number;

export const FilterClauseSchema = z.object({
  field: z.string(),
  op: FilterOpSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])]),
    z.array(z.union([z.string(), z.number()])),
  ]),
});
export type FilterClause = z.infer<typeof FilterClauseSchema>;

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

export const UniverseSchema = z.enum(['us', 'cn', 'hk', 'crypto']);
export type Universe = z.infer<typeof UniverseSchema>;

// ---------------------------------------------------------------------------
// FilterSpec
// ---------------------------------------------------------------------------

export const FilterSpecSchema = z.object({
  universe: UniverseSchema,
  /** Similarity template, e.g. 'AAPL-like', 'momentum', 'value', 'compound'. */
  template: z.string().optional(),
  /** All clauses are AND-ed. */
  filters: z.array(FilterClauseSchema),
  sortBy: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().min(1).max(500).default(50),
  realtime: z.boolean().default(false),
});
export type FilterSpec = z.infer<typeof FilterSpecSchema>;

/** Validate a candidate spec. Throws ZodError on invalid shape. */
export function parseFilterSpec(input: unknown): FilterSpec {
  return FilterSpecSchema.parse(input);
}

/** Safe parse — returns ok/err without throwing. */
export function safeParseFilterSpec(input: unknown): { ok: true; spec: FilterSpec } | { ok: false; error: string } {
  const r = FilterSpecSchema.safeParse(input);
  if (r.success) return { ok: true, spec: r.data };
  return { ok: false, error: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
