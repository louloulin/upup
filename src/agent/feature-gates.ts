/**
 * Feature Gates — three-layer enablement for UpUp capabilities.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/feature-gates
 *
 * Three layers, evaluated in this order:
 *   1. Compile-time: process.env.BUN_CONFIG_FEATURE_<NAME> = '0' excludes
 *      code from Bun.build bundles. Read at module load.
 *   2. Startup: process.env.FEATURE_<NAME> = 'false' / '0' disables at boot.
 *   3. Runtime: featureGates.set(name, { ratio, userId }) for A/B rollouts,
 *      using deterministic hashing so the same user always lands in the
 *      same bucket.
 *
 * Doctor: `featureGates.doctor()` returns a structured table of every known
 * gate with its current state and source.
 */

export type FeatureSource = 'compile' | 'startup' | 'runtime' | 'default';

export interface FeatureState {
  name: string;
  enabled: boolean;
  source: FeatureSource;
  /** For runtime gates with ratio < 1. */
  ratio?: number;
}

export interface RuntimeConfig {
  /** Stable identifier for deterministic bucketing. */
  userId?: string;
  /** Fraction of users in [0, 1] for whom this gate is enabled. */
  ratio?: number;
  /** Force-enable regardless of ratio. */
  force?: boolean;
}

export interface FeatureGates {
  isEnabled(name: string, ctx?: { userId?: string }): boolean;
  set(name: string, cfg: RuntimeConfig): void;
  clearRuntime(name: string): void;
  /** Returns the current state for a single gate. */
  inspect(name: string): FeatureState;
  /** Returns states for all known gates (defaults + registered). */
  doctor(): FeatureState[];
  /** Register a default-enabled gate at startup. */
  register(name: string, opts?: { defaultEnabled?: boolean }): void;
}

function parseBool(s: string | undefined): boolean | null {
  if (s === undefined) return null;
  const v = s.toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

function readCompileTime(name: string): boolean | null {
  return parseBool(process.env[`BUN_CONFIG_FEATURE_${name.toUpperCase()}`]);
}

function readStartup(name: string): boolean | null {
  return parseBool(process.env[`FEATURE_${name.toUpperCase()}`]);
}

/** Deterministic 32-bit FNV-1a hash. Same input always lands in the same bucket. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function bucket(userId: string, name: string): number {
  // Mix gate name + userId so two gates with the same ratio don't draw from
  // the exact same users.
  return (fnv1a(`${name}::${userId}`) % 10_000) / 10_000;
}

export function createFeatureGates(): FeatureGates {
  const RUNTIME = new Map<string, RuntimeConfig>();
  const DEFAULTS = new Map<string, boolean>();
  function isEnabled(name: string, ctx?: { userId?: string }): boolean {
    const rt = RUNTIME.get(name);
    if (rt) {
      if (rt.force === true) return true;
      if (rt.force === false) return false;
      if (rt.ratio === undefined) return true;
      const ratio = Math.max(0, Math.min(1, rt.ratio));
      const uid = ctx?.userId ?? rt.userId;
      if (!uid) {
        // Without a stable userId, fall back to enabled (so dev mode is opt-in).
        return true;
      }
      return bucket(uid, name) < ratio;
    }
    const compile = readCompileTime(name);
    if (compile !== null) return compile;
    const startup = readStartup(name);
    if (startup !== null) return startup;
    return DEFAULTS.get(name) ?? false;
  }

  function inspect(name: string): FeatureState {
    if (RUNTIME.has(name)) {
      const rt = RUNTIME.get(name)!;
      return {
        name,
        enabled: isEnabled(name),
        source: 'runtime',
        ratio: rt.ratio,
      };
    }
    if (readCompileTime(name) !== null) {
      return { name, enabled: isEnabled(name), source: 'compile' };
    }
    if (readStartup(name) !== null) {
      return { name, enabled: isEnabled(name), source: 'startup' };
    }
    return { name, enabled: isEnabled(name), source: 'default' };
  }

  return {
    isEnabled,
    set(name, cfg) {
      RUNTIME.set(name, cfg);
    },
    clearRuntime(name) {
      RUNTIME.delete(name);
    },
    inspect,
    doctor() {
      const names = new Set<string>([...DEFAULTS.keys(), ...RUNTIME.keys()]);
      // Also include any compile-time/startup env vars that hint at a gate
      for (const k of Object.keys(process.env)) {
        if (k.startsWith('BUN_CONFIG_FEATURE_') || k.startsWith('FEATURE_')) {
          names.add(k.split('_', 3).slice(2).join('_').toLowerCase());
        }
      }
      return Array.from(names).sort().map((n) => inspect(n));
    },
    register(name, opts) {
      DEFAULTS.set(name, opts?.defaultEnabled ?? true);
    },
  };
}

/** Process-wide default. Replaced by tests via resetDefaultGates(). */
let defaultGates: FeatureGates | null = null;
export function getDefaultGates(): FeatureGates {
  if (!defaultGates) defaultGates = createFeatureGates();
  return defaultGates;
}
export function resetDefaultGates(): void {
  defaultGates = null;
}

/** Convenience: top-level `featureGates.isEnabled('kairos')` style API. */
export const featureGates: FeatureGates = {
  isEnabled: (n, c) => getDefaultGates().isEnabled(n, c),
  set: (n, c) => getDefaultGates().set(n, c),
  clearRuntime: (n) => getDefaultGates().clearRuntime(n),
  inspect: (n) => getDefaultGates().inspect(n),
  doctor: () => getDefaultGates().doctor(),
  register: (n, o) => getDefaultGates().register(n, o),
};
