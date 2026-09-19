# Sprint 1.4 Portfolio Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement portfolio attribution in three standard frameworks (Brinson 3-factor, Barra-style 4-factor, Shenwan/GICS sector) and unify them under a single `portfolio_attribution` tool per Design Doc D19 and the portfolio-attribution spec.

**Architecture:** Pure-function modules in `src/tools/portfolio/`. Each module exports a single `xxxAttribution(input)` function returning a typed result. The unified `attribution.ts` dispatches by `method` and supports `combined` (returns all three). Tool registration uses the existing registry pattern (`src/tools/registry/portfolio-tools.ts` with `loadPortfolioTools()`).

**Tech Stack:** Bun runtime, TypeScript strict, Zod for the tool schema, no external deps. Pure math, no I/O.

**Reference:** Design Doc D19 (Brinson formula), portfolio-attribution spec (style/sector/unified).

---

## File Structure

```
src/tools/portfolio/
├── brinson.ts              # Brinson 3-factor pure function
├── brinson.test.ts         # Additive identity: alloc + select + interact === active
├── style-attribution.ts    # 4-factor style (Size / Value / Momentum / Volatility)
├── style.test.ts           # 4 factor contributions sum to active
├── sector-attribution.ts   # Per-sector contribution; supports shenwan-l1 + gics-l2
├── sector.test.ts          # 31 sector sum + classification toggle
├── attribution.ts          # Unified entry: dispatch by method + `combined` mode
├── attribution.e2e.test.ts # E2E: mock 20-holding portfolio + CSI 300 benchmark, all 4 methods
└── types.ts                # Shared Portfolio / Benchmark / Attribution result types
```

Plus one registry wiring:
```
src/tools/registry/portfolio-tools.ts   # loadPortfolioTools() exports portfolio_attribution
```

## Task 1: Shared types in `src/tools/portfolio/types.ts`

**Files:**
- Create: `src/tools/portfolio/types.ts`

- [ ] **Step 1.1: Write the types**

```ts
// src/tools/portfolio/types.ts
// Shared shapes for the three attribution modules. Pure data, no behavior.

export interface Holding {
  sector: string;       // classification key (e.g. shenwan-l1: '食品饮料')
  weight: number;       // portfolio weight 0..1 (or 0..100, see normalize)
  return: number;       // period return as decimal 0.05 = +5%
}

export interface Portfolio {
  holdings: Holding[];
  totalReturn: number;  // period total return as decimal
}

export interface Benchmark {
  holdings: Holding[];  // sector-level weights + returns for index constituents
  totalReturn: number;
}

export type SectorClassification = 'shenwan-l1' | 'gics-l2';

export interface BrinsonResult {
  allocation: number;
  selection: number;
  interaction: number;
  activeReturn: number;
  bySector: Array<{
    sector: string;
    allocation: number;
    selection: number;
    interaction: number;
  }>;
}

export interface StyleFactor {
  name: 'Size' | 'Value' | 'Momentum' | 'Volatility';
  portfolioExposure: number;   // portfolio loading
  benchmarkExposure: number;   // benchmark loading
  factorReturn: number;        // factor return for the period
  contribution: number;        // (p - b) * factorReturn
}

export interface StyleResult {
  factors: StyleFactor[];
  activeReturn: number;
  residual: number;            // activeReturn - sum(contributions)
}

export interface SectorContribution {
  sector: string;
  weightDiff: number;          // w_p - w_b
  sectorReturn: number;        // portfolio sector return
  benchmarkReturn: number;     // benchmark sector return
  contribution: number;        // w_p * r_p - w_b * r_b
}

export interface SectorResult {
  classification: SectorClassification;
  sectors: SectorContribution[];
  activeReturn: number;
}

export type AttributionMethod = 'brinson' | 'style' | 'sector' | 'combined';

export interface AttributionInput {
  portfolio: Portfolio;
  benchmark: Benchmark;
  method: AttributionMethod;
  sectorClassification?: SectorClassification;   // default 'shenwan-l1'
}

export type AttributionResult =
  | { method: 'brinson'; result: BrinsonResult }
  | { method: 'style'; result: StyleResult }
  | { method: 'sector'; result: SectorResult }
  | { method: 'combined'; result: { brinson: BrinsonResult; style: StyleResult; sector: SectorResult } };
```

- [ ] **Step 1.2: Typecheck**

```bash
bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 1.3: Commit**

```bash
git add src/tools/portfolio/types.ts
git commit -m "feat(portfolio): Sprint 1.4 Task 1 — shared attribution types"
```

## Task 2: Brinson 3-factor

**Files:**
- Create: `src/tools/portfolio/brinson.ts`
- Create: `src/tools/portfolio/brinson.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// src/tools/portfolio/brinson.test.ts
import { describe, expect, test } from 'bun:test';
import { brinsonAttribution } from './brinson.js';
import type { Portfolio, Benchmark } from './types.js';

describe('brinsonAttribution', () => {
  test('allocation + selection + interaction === active return', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.12,
      holdings: [
        { sector: 'Tech', weight: 0.40, return: 0.20 },
        { sector: 'Finance', weight: 0.30, return: 0.10 },
        { sector: 'Energy', weight: 0.20, return: 0.05 },
        { sector: 'Health', weight: 0.10, return: 0.08 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.08,
      holdings: [
        { sector: 'Tech', weight: 0.25, return: 0.18 },
        { sector: 'Finance', weight: 0.40, return: 0.07 },
        { sector: 'Energy', weight: 0.20, return: 0.04 },
        { sector: 'Health', weight: 0.15, return: 0.06 },
      ],
    };
    const r = brinsonAttribution({ portfolio, benchmark });
    const sum = r.allocation + r.selection + r.interaction;
    expect(Math.abs(sum - r.activeReturn)).toBeLessThan(1e-9);
    // Active return = 0.12 - 0.08 = 0.04
    expect(Math.abs(r.activeReturn - 0.04)).toBeLessThan(1e-9);
  });

  test('all-zero inputs produce all-zero effects', () => {
    const portfolio: Portfolio = { totalReturn: 0, holdings: [{ sector: 'A', weight: 1, return: 0 }] };
    const benchmark: Benchmark = { totalReturn: 0, holdings: [{ sector: 'A', weight: 1, return: 0 }] };
    const r = brinsonAttribution({ portfolio, benchmark });
    expect(r.allocation).toBe(0);
    expect(r.selection).toBe(0);
    expect(r.interaction).toBe(0);
    expect(r.activeReturn).toBe(0);
  });

  test('overweight a winning sector yields positive allocation', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.15,
      holdings: [
        { sector: 'Tech', weight: 0.60, return: 0.20 },
        { sector: 'Other', weight: 0.40, return: 0.05 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.08,
      holdings: [
        { sector: 'Tech', weight: 0.30, return: 0.18 },
        { sector: 'Other', weight: 0.70, return: 0.03 },
      ],
    };
    const r = brinsonAttribution({ portfolio, benchmark });
    // Overweight Tech (winning sector) → allocation > 0
    expect(r.allocation).toBeGreaterThan(0);
  });

  test('bySector arrays length matches unique sector count', () => {
    const portfolio: Portfolio = { totalReturn: 0.1, holdings: [
      { sector: 'A', weight: 0.5, return: 0.1 },
      { sector: 'B', weight: 0.5, return: 0.1 },
    ]};
    const benchmark: Benchmark = { totalReturn: 0.1, holdings: [
      { sector: 'A', weight: 0.5, return: 0.1 },
      { sector: 'B', weight: 0.5, return: 0.1 },
    ]};
    const r = brinsonAttribution({ portfolio, benchmark });
    expect(r.bySector.length).toBe(2);
  });
});
```

- [ ] **Step 2.2: Run — expect module not found**

```bash
bun test src/tools/portfolio/brinson.test.ts
```

- [ ] **Step 2.3: Implement `src/tools/portfolio/brinson.ts`**

```ts
// src/tools/portfolio/brinson.ts
// Brinson 3-factor (Brinson-Hood-Beebower 1986) attribution.
//
// active return  = Σ w_p * r_p  -  Σ w_b * r_b
// allocation     = Σ (w_p - w_b) * r_b
// selection      = Σ w_b * (r_p - r_b)
// interaction    = Σ (w_p - w_b) * (r_p - r_b)
//
// Identity: allocation + selection + interaction = active return (exact).
import type { BrinsonResult, Holding, Portfolio, Benchmark } from './types.js';

export function brinsonAttribution(input: { portfolio: Portfolio; benchmark: Benchmark }): BrinsonResult {
  const { portfolio, benchmark } = input;
  const sectors = uniqueSectors(portfolio.holdings, benchmark.holdings);

  const pBy = indexBy(portfolio.holdings, (h) => h.sector);
  const bBy = indexBy(benchmark.holdings, (h) => h.sector);

  let allocation = 0;
  let selection = 0;
  let interaction = 0;
  const bySector: BrinsonResult['bySector'] = [];

  for (const sector of sectors) {
    const wp = pBy.get(sector)?.weight ?? 0;
    const wb = bBy.get(sector)?.weight ?? 0;
    const rp = pBy.get(sector)?.return ?? 0;
    const rb = bBy.get(sector)?.return ?? 0;
    const a = (wp - wb) * rb;
    const s = wb * (rp - rb);
    const i = (wp - wb) * (rp - rb);
    allocation += a;
    selection += s;
    interaction += i;
    bySector.push({ sector, allocation: a, selection: s, interaction: i });
  }

  const activeReturn = portfolio.totalReturn - benchmark.totalReturn;
  return { allocation, selection, interaction, activeReturn, bySector };
}

function uniqueSectors(a: Holding[], b: Holding[]): string[] {
  const set = new Set<string>();
  for (const h of a) set.add(h.sector);
  for (const h of b) set.add(h.sector);
  return [...set].sort();
}

function indexBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T> {
  const m = new Map<K, T>();
  for (const x of arr) m.set(key(x), x);
  return m;
}
```

- [ ] **Step 2.4: Run tests — expect 4/4 pass**

```bash
bun test src/tools/portfolio/brinson.test.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add src/tools/portfolio/brinson.ts src/tools/portfolio/brinson.test.ts
git commit -m "feat(portfolio): Sprint 1.4 Task 2 — Brinson 3-factor (alloc/select/interact)"
```

## Task 3: Style attribution (Barra-style 4-factor)

**Files:**
- Create: `src/tools/portfolio/style-attribution.ts`
- Create: `src/tools/portfolio/style.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// src/tools/portfolio/style.test.ts
import { describe, expect, test } from 'bun:test';
import { styleAttribution } from './style-attribution.js';

describe('styleAttribution', () => {
  test('overweight Value + underweight Momentum returns signed contributions', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0.1, Value: 0.4, Momentum: -0.2, Volatility: 0.0 },
      benchmarkExposures: { Size: 0.0, Value: 0.0, Momentum: 0.0, Volatility: 0.0 },
      factorReturns: { Size: 0.02, Value: 0.05, Momentum: 0.03, Volatility: -0.01 },
      activeReturn: 0.018,
    });
    const value = r.factors.find((f) => f.name === 'Value');
    const momentum = r.factors.find((f) => f.name === 'Momentum');
    expect(value?.contribution).toBeCloseTo(0.4 * 0.05, 9);   // overweight Value * VR
    expect(momentum?.contribution).toBeCloseTo(-0.2 * 0.03, 9); // underweight Mom * MR
  });

  test('sum of contributions + residual equals active return', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0.5, Value: 0.2, Momentum: 0.1, Volatility: -0.3 },
      benchmarkExposures: { Size: 0.0, Value: 0.0, Momentum: 0.0, Volatility: 0.0 },
      factorReturns: { Size: 0.01, Value: 0.02, Momentum: 0.03, Volatility: 0.04 },
      activeReturn: 0.05,
    });
    const sum = r.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(Math.abs(sum + r.residual - r.activeReturn)).toBeLessThan(1e-9);
  });

  test('identical exposures yield all-zero contributions', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0.1, Value: 0.2, Momentum: 0.3, Volatility: 0.4 },
      benchmarkExposures: { Size: 0.1, Value: 0.2, Momentum: 0.3, Volatility: 0.4 },
      factorReturns: { Size: 0.01, Value: 0.02, Momentum: 0.03, Volatility: 0.04 },
      activeReturn: 0.0,
    });
    for (const f of r.factors) expect(f.contribution).toBe(0);
    expect(r.residual).toBe(0);
  });

  test('always emits exactly 4 factors in declared order', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
      benchmarkExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
      factorReturns: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
      activeReturn: 0,
    });
    expect(r.factors.map((f) => f.name)).toEqual(['Size', 'Value', 'Momentum', 'Volatility']);
  });
});
```

- [ ] **Step 3.2: Run — expect module not found**

```bash
bun test src/tools/portfolio/style.test.ts
```

- [ ] **Step 3.3: Implement `src/tools/portfolio/style-attribution.ts`**

```ts
// src/tools/portfolio/style-attribution.ts
// Simple Barra-style 4-factor attribution. Contribution per factor = (p - b) * f.
// Residual captures the unexplained (specific) portion of active return.
import type { StyleFactor, StyleResult } from './types.js';

const FACTOR_NAMES = ['Size', 'Value', 'Momentum', 'Volatility'] as const;
type FactorName = (typeof FACTOR_NAMES)[number];

export interface StyleAttributionInput {
  portfolioExposures: Record<FactorName, number>;
  benchmarkExposures: Record<FactorName, number>;
  factorReturns: Record<FactorName, number>;
  activeReturn: number;
}

export function styleAttribution(input: StyleAttributionInput): StyleResult {
  const factors: StyleFactor[] = FACTOR_NAMES.map((name) => {
    const p = input.portfolioExposures[name] ?? 0;
    const b = input.benchmarkExposures[name] ?? 0;
    const f = input.factorReturns[name] ?? 0;
    return {
      name,
      portfolioExposure: p,
      benchmarkExposure: b,
      factorReturn: f,
      contribution: (p - b) * f,
    };
  });
  const explained = factors.reduce((acc, x) => acc + x.contribution, 0);
  return {
    factors,
    activeReturn: input.activeReturn,
    residual: input.activeReturn - explained,
  };
}
```

- [ ] **Step 3.4: Run tests — expect 4/4 pass**

```bash
bun test src/tools/portfolio/style.test.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add src/tools/portfolio/style-attribution.ts src/tools/portfolio/style.test.ts
git commit -m "feat(portfolio): Sprint 1.4 Task 3 — Barra-style 4-factor (Size/Value/Momentum/Volatility)"
```

## Task 4: Sector attribution (Shenwan L1 + GICS L2)

**Files:**
- Create: `src/tools/portfolio/sector-attribution.ts`
- Create: `src/tools/portfolio/sector.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// src/tools/portfolio/sector.test.ts
import { describe, expect, test } from 'bun:test';
import { sectorAttribution } from './sector-attribution.js';
import type { Portfolio, Benchmark } from './types.js';

describe('sectorAttribution', () => {
  test('contributions sum to active return', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.12,
      holdings: [
        { sector: '食品饮料', weight: 0.30, return: 0.20 },
        { sector: '银行', weight: 0.30, return: 0.10 },
        { sector: '医药生物', weight: 0.20, return: 0.05 },
        { sector: '科技', weight: 0.20, return: 0.10 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.08,
      holdings: [
        { sector: '食品饮料', weight: 0.20, return: 0.18 },
        { sector: '银行', weight: 0.30, return: 0.07 },
        { sector: '医药生物', weight: 0.30, return: 0.06 },
        { sector: '科技', weight: 0.20, return: 0.05 },
      ],
    };
    const r = sectorAttribution({ portfolio, benchmark, classification: 'shenwan-l1' });
    const sum = r.sectors.reduce((acc, s) => acc + s.contribution, 0);
    expect(Math.abs(sum - r.activeReturn)).toBeLessThan(1e-9);
  });

  test('classification toggle returns classification field', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [{ sector: 'A', weight: 1, return: 0.1 }] };
    const b: Benchmark = { totalReturn: 0.05, holdings: [{ sector: 'A', weight: 1, return: 0.05 }] };
    expect(sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' }).classification).toBe('shenwan-l1');
    expect(sectorAttribution({ portfolio: p, benchmark: b, classification: 'gics-l2' }).classification).toBe('gics-l2');
  });

  test('weightDiff equals portfolio.weight - benchmark.weight', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [{ sector: 'X', weight: 0.6, return: 0.1 }] };
    const b: Benchmark = { totalReturn: 0.05, holdings: [{ sector: 'X', weight: 0.3, return: 0.05 }] };
    const r = sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' });
    const x = r.sectors.find((s) => s.sector === 'X');
    expect(x?.weightDiff).toBeCloseTo(0.3, 9);
  });

  test('contribution equals w_p * r_p - w_b * r_b per sector', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [{ sector: 'X', weight: 0.5, return: 0.2 }] };
    const b: Benchmark = { totalReturn: 0.05, holdings: [{ sector: 'X', weight: 0.5, return: 0.1 }] };
    const r = sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' });
    const x = r.sectors.find((s) => s.sector === 'X');
    expect(x?.contribution).toBeCloseTo(0.5 * 0.2 - 0.5 * 0.1, 9);
  });

  test('handles sectors present in only one of portfolio/benchmark', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [
      { sector: 'A', weight: 0.5, return: 0.1 },
      { sector: 'B', weight: 0.5, return: 0.1 },
    ]};
    const b: Benchmark = { totalReturn: 0.05, holdings: [
      { sector: 'A', weight: 0.5, return: 0.05 },
      { sector: 'C', weight: 0.5, return: 0.05 },
    ]};
    const r = sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' });
    expect(r.sectors.length).toBe(3);
    expect(r.sectors.find((s) => s.sector === 'B')).toBeDefined();
    expect(r.sectors.find((s) => s.sector === 'C')).toBeDefined();
  });
});
```

- [ ] **Step 4.2: Run — expect module not found**

```bash
bun test src/tools/portfolio/sector.test.ts
```

- [ ] **Step 4.3: Implement `src/tools/portfolio/sector-attribution.ts`**

```ts
// src/tools/portfolio/sector-attribution.ts
// Per-sector contribution to active return. classification is an opaque
// string key (shenwan-l1 / gics-l2); the sector strings themselves carry
// the classification already so the function is a pure join over sectors.
//
// contribution_i = w_p_i * r_p_i  -  w_b_i * r_b_i
// Σ contribution_i = portfolio.totalReturn - benchmark.totalReturn
//                    = active return
import type { Benchmark, Portfolio, SectorClassification, SectorContribution, SectorResult, Holding } from './types.js';

export interface SectorAttributionInput {
  portfolio: Portfolio;
  benchmark: Benchmark;
  classification: SectorClassification;
}

export function sectorAttribution(input: SectorAttributionInput): SectorResult {
  const { portfolio, benchmark, classification } = input;
  const sectors = uniqueSectors(portfolio.holdings, benchmark.holdings);
  const pBy = indexBy(portfolio.holdings, (h) => h.sector);
  const bBy = indexBy(benchmark.holdings, (h) => h.sector);

  const sectorsOut: SectorContribution[] = sectors.map((sector) => {
    const wp = pBy.get(sector)?.weight ?? 0;
    const wb = bBy.get(sector)?.weight ?? 0;
    const rp = pBy.get(sector)?.return ?? 0;
    const rb = bBy.get(sector)?.return ?? 0;
    return {
      sector,
      weightDiff: wp - wb,
      sectorReturn: rp,
      benchmarkReturn: rb,
      contribution: wp * rp - wb * rb,
    };
  });

  return {
    classification,
    sectors: sectorsOut,
    activeReturn: portfolio.totalReturn - benchmark.totalReturn,
  };
}

function uniqueSectors(a: Holding[], b: Holding[]): string[] {
  const set = new Set<string>();
  for (const h of a) set.add(h.sector);
  for (const h of b) set.add(h.sector);
  return [...set].sort();
}

function indexBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T> {
  const m = new Map<K, T>();
  for (const x of arr) m.set(key(x), x);
  return m;
}
```

- [ ] **Step 4.4: Run tests — expect 5/5 pass**

```bash
bun test src/tools/portfolio/sector.test.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add src/tools/portfolio/sector-attribution.ts src/tools/portfolio/sector.test.ts
git commit -m "feat(portfolio): Sprint 1.4 Task 4 — sector attribution (shenwan-l1 / gics-l2)"
```

## Task 5: Unified `attribution.ts` entry + dispatch

**Files:**
- Create: `src/tools/portfolio/attribution.ts`

- [ ] **Step 5.1: Implement `src/tools/portfolio/attribution.ts`**

```ts
// src/tools/portfolio/attribution.ts
// Unified entry point. Dispatches to Brinson / Style / Sector sub-modules.
// For 'combined' runs all three (style requires exposures + factor returns).
import { brinsonAttribution } from './brinson.js';
import { styleAttribution } from './style-attribution.js';
import { sectorAttribution } from './sector-attribution.js';
import type {
  AttributionInput,
  AttributionResult,
  BrinsonResult,
  SectorResult,
  StyleResult,
} from './types.js';

export interface CombinedInput {
  portfolio: AttributionInput['portfolio'];
  benchmark: AttributionInput['benchmark'];
  sectorClassification?: AttributionInput['sectorClassification'];
  style?: {
    portfolioExposures: { Size: number; Value: number; Momentum: number; Volatility: number };
    benchmarkExposures: { Size: number; Value: number; Momentum: number; Volatility: number };
    factorReturns: { Size: number; Value: number; Momentum: number; Volatility: number };
  };
}

export function attribution(
  input:
    | (AttributionInput & { method: 'brinson' | 'sector' })
    | (AttributionInput & { method: 'style'; style: CombinedInput['style'] })
    | (Omit<AttributionInput, 'method'> & { method: 'combined'; style?: CombinedInput['style'] }),
): AttributionResult {
  const activeReturn = input.portfolio.totalReturn - input.benchmark.totalReturn;

  if (input.method === 'brinson') {
    const result = brinsonAttribution({ portfolio: input.portfolio, benchmark: input.benchmark });
    return { method: 'brinson', result };
  }

  if (input.method === 'style') {
    if (!input.style) {
      throw new Error('portfolio_attribution: style method requires style input (exposures + factor returns)');
    }
    const result = styleAttribution({ ...input.style, activeReturn });
    return { method: 'style', result };
  }

  if (input.method === 'sector') {
    const result = sectorAttribution({
      portfolio: input.portfolio,
      benchmark: input.benchmark,
      classification: input.sectorClassification ?? 'shenwan-l1',
    });
    return { method: 'sector', result };
  }

  // combined
  const brinson: BrinsonResult = brinsonAttribution({ portfolio: input.portfolio, benchmark: input.benchmark });
  const sector: SectorResult = sectorAttribution({
    portfolio: input.portfolio,
    benchmark: input.benchmark,
    classification: input.sectorClassification ?? 'shenwan-l1',
  });
  const style: StyleResult = input.style
    ? styleAttribution({ ...input.style, activeReturn })
    : styleAttribution({
        portfolioExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
        benchmarkExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
        factorReturns: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
        activeReturn,
      });
  return { method: 'combined', result: { brinson, style, sector } };
}
```

- [ ] **Step 5.2: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5.3: Commit**

```bash
git add src/tools/portfolio/attribution.ts
git commit -m "feat(portfolio): Sprint 1.4 Task 5 — unified attribution entry (dispatch + combined)"
```

## Task 6: E2E test (mock 20-holding portfolio + CSI 300 benchmark)

**Files:**
- Create: `src/tools/portfolio/attribution.e2e.test.ts`

- [ ] **Step 6.1: Write the test**

```ts
// src/tools/portfolio/attribution.e2e.test.ts
import { describe, expect, test } from 'bun:test';
import { attribution } from './attribution.js';
import type { Portfolio, Benchmark } from './types.js';

// Mock: 20 holdings across 5 shenwan-l1 sectors, CSI 300-like benchmark.
const PORTFOLIO: Portfolio = {
  totalReturn: 0.10,
  holdings: [
    { sector: '食品饮料', weight: 0.30, return: 0.18 },
    { sector: '银行', weight: 0.20, return: 0.06 },
    { sector: '医药生物', weight: 0.20, return: 0.12 },
    { sector: '科技', weight: 0.20, return: 0.08 },
    { sector: '能源', weight: 0.10, return: 0.03 },
  ],
};
const BENCHMARK: Benchmark = {
  totalReturn: 0.07,
  holdings: [
    { sector: '食品饮料', weight: 0.15, return: 0.16 },
    { sector: '银行', weight: 0.25, return: 0.05 },
    { sector: '医药生物', weight: 0.20, return: 0.10 },
    { sector: '科技', weight: 0.25, return: 0.07 },
    { sector: '能源', weight: 0.15, return: 0.02 },
  ],
};
const STYLE = {
  portfolioExposures: { Size: 0.2, Value: 0.3, Momentum: -0.1, Volatility: 0.1 },
  benchmarkExposures: { Size: 0.0, Value: 0.0, Momentum: 0.0, Volatility: 0.0 },
  factorReturns: { Size: 0.01, Value: 0.04, Momentum: 0.03, Volatility: -0.02 },
};

describe('attribution e2e', () => {
  test('brinson additive identity holds', () => {
    const r = attribution({ method: 'brinson', portfolio: PORTFOLIO, benchmark: BENCHMARK });
    if (r.method !== 'brinson') throw new Error('expected brinson');
    const sum = r.result.allocation + r.result.selection + r.result.interaction;
    expect(Math.abs(sum - r.result.activeReturn)).toBeLessThan(1e-9);
  });

  test('sector contributions sum to active return', () => {
    const r = attribution({ method: 'sector', portfolio: PORTFOLIO, benchmark: BENCHMARK, sectorClassification: 'shenwan-l1' });
    if (r.method !== 'sector') throw new Error('expected sector');
    const sum = r.result.sectors.reduce((acc, s) => acc + s.contribution, 0);
    expect(Math.abs(sum - r.result.activeReturn)).toBeLessThan(1e-9);
  });

  test('style contributions + residual sum to active return', () => {
    const r = attribution({ method: 'style', portfolio: PORTFOLIO, benchmark: BENCHMARK, style: STYLE });
    if (r.method !== 'style') throw new Error('expected style');
    const sum = r.result.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(Math.abs(sum + r.result.residual - r.result.activeReturn)).toBeLessThan(1e-9);
  });

  test('combined returns all three decompositions', () => {
    const r = attribution({ method: 'combined', portfolio: PORTFOLIO, benchmark: BENCHMARK, style: STYLE });
    if (r.method !== 'combined') throw new Error('expected combined');
    expect(r.result.brinson).toBeDefined();
    expect(r.result.style).toBeDefined();
    expect(r.result.sector).toBeDefined();
  });
});
```

- [ ] **Step 6.2: Run tests — expect 4/4 pass**

```bash
bun test src/tools/portfolio/attribution.e2e.test.ts
```

- [ ] **Step 6.3: Commit**

```bash
git add src/tools/portfolio/attribution.e2e.test.ts
git commit -m "test(portfolio): Sprint 1.4 Task 6 — e2e Brinson/sector/style/combined 验证加和等式"
```

## Task 7: Tool registration — `portfolio_attribution` in registry

**Files:**
- Create: `src/tools/registry/portfolio-tools.ts`
- Modify: `src/tools/registry/index.ts` (wire in)

- [ ] **Step 7.1: Implement the tool wrapper**

```ts
// src/tools/registry/portfolio-tools.ts
import { z } from 'zod';
import { tool } from 'langchain';
import { attribution } from '../portfolio/attribution.js';
import type { Portfolio, Benchmark } from '../portfolio/types.js';
import type { RegisteredTool } from './types.js';

const AttributionMethod = z.enum(['brinson', 'style', 'sector', 'combined']);

const PortfolioHolding = z.object({
  sector: z.string(),
  weight: z.number().describe('0..1 decimal'),
  return: z.number().describe('0..1 decimal, e.g. 0.05 = +5%'),
});

const PortfolioSchema = z.object({
  totalReturn: z.number(),
  holdings: z.array(PortfolioHolding),
});

export function loadPortfolioTools(): RegisteredTool[] {
  const portfolioAttribution = tool(
    async (params) => {
      const portfolio: Portfolio = params.portfolio;
      const benchmark: Benchmark = params.benchmark;
      const result = attribution({
        method: params.method,
        portfolio,
        benchmark,
        sectorClassification: params.sectorClassification ?? 'shenwan-l1',
        style: params.style,
      });
      return JSON.stringify(result);
    },
    {
      name: 'portfolio_attribution',
      description:
        'Decompose a portfolio\'s active return into Brinson 3-factor, Barra-style 4-factor, ' +
        'or per-sector contributions. Methods: brinson | style | sector | combined.',
      schema: z.object({
        method: AttributionMethod,
        portfolio: PortfolioSchema,
        benchmark: PortfolioSchema,
        sectorClassification: z.enum(['shenwan-l1', 'gics-l2']).optional(),
        style: z
          .object({
            portfolioExposures: z.object({
              Size: z.number(), Value: z.number(), Momentum: z.number(), Volatility: z.number(),
            }),
            benchmarkExposures: z.object({
              Size: z.number(), Value: z.number(), Momentum: z.number(), Volatility: z.number(),
            }),
            factorReturns: z.object({
              Size: z.number(), Value: z.number(), Momentum: z.number(), Volatility: z.number(),
            }),
          })
          .optional(),
      }),
    },
  );

  return [{ name: 'portfolio_attribution', tool: portfolioAttribution }];
}
```

- [ ] **Step 7.2: Wire into the registry index**

Inspect `src/tools/registry/index.ts` to find the existing pattern, then add a call to `loadPortfolioTools()`. Follow the same shape as the alt-data wiring from Sprint 1.2.

- [ ] **Step 7.3: Typecheck + smoke**

```bash
bun run typecheck
bun test src/tools/portfolio/  # all 5 test files
```

- [ ] **Step 7.4: Commit**

```bash
git add src/tools/registry/portfolio-tools.ts src/tools/registry/index.ts
git commit -m "feat(portfolio): Sprint 1.4 Task 7 — 注册 portfolio_attribution 到 registry"
```

## Task 8: Update tasks.md + push

- [ ] **Step 8.1: Mark 1.4.1-1.4.9 complete in tasks.md**

Replace the 1.4 block:

```
### 1.4 portfolio-attribution

- [x] 1.4.1 实现 `src/tools/portfolio/brinson.ts` Brinson 3-factor(配置/选股/交互)
- [x] 1.4.2 实现 `src/tools/portfolio/style-attribution.ts` Barra 风格因子(大盘/价值/成长/动量)
- [x] 1.4.3 实现 `src/tools/portfolio/sector-attribution.ts` 申万一级 / GICS
- [x] 1.4.4 实现 `src/tools/portfolio/attribution.ts` 统一入口(组合归因)
- [x] 1.4.5 写 `src/tools/portfolio/brinson.test.ts` 加和验证
- [x] 1.4.6 写 `src/tools/portfolio/style.test.ts` 4 因子分解
- [x] 1.4.7 写 `src/tools/portfolio/sector.test.ts` 行业归因
- [x] 1.4.8 注册 `portfolio_attribution` 1 个 tool 到 registry
- [x] 1.4.9 写 e2e:用 mock 组合 + 基准,跑完整归因
```

- [ ] **Step 8.2: Commit + push**

```bash
git add openspec/changes/top-tier-investment-assistant-v2/tasks.md
git commit -m "chore(tasks): mark Sprint 1.4 portfolio-attribution tasks complete (9/9)"
git push upstream main
```
