/**
 * Chord facet host bridge.
 *
 * `@earendil-works/chord` is Pi's application-composition runtime: a `Facet`
 * is the unit of composition and a `FacetHost` activates them with
 * `reload(facets)` semantics — "activate and replace facets with matching IDs
 * without disconnecting consumer service handles".
 *
 * That is exactly the guarantee UpUp's plugin story needs: install a Pi
 * package, reload, and have the running session pick it up without tearing
 * down unrelated packages or in-flight service consumers.
 *
 * This module maps the UpUp package catalog onto chord facets:
 *   - one facet per Pi package, id `pi-package:<manifest.name>`
 *   - a `UpUpPluginRegistry` local service facets can consume to inspect the
 *     mounted inventory
 *   - a `UpUpFacetHost` wrapper that adds UpUp bookkeeping on top of chord's
 *     `FacetHost` (stable inventory snapshots, deterministic ids, disposal)
 *
 * The bridge is deliberately free of Pi-runtime side effects: it composes
 * descriptors and lifecycles, it does not load extensions. Extension loading
 * stays with `DefaultResourceLoader` so there is exactly one loader.
 */

import { createFacetHost, defineService, type Facet, type FacetEnvironment, type FacetHost } from '@earendil-works/chord';
import type { PiPackageRecord } from './package-catalog';

/** Facet id prefix; keeps UpUp facets namespaced inside a shared chord host. */
export const UPUP_FACET_ID_PREFIX = 'pi-package:';

/** Immutable snapshot of one mounted Pi package, safe to hand to facets. */
export interface UpUpMountedPlugin {
  /** Chord facet id, `pi-package:<manifest.name>`. */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly contract: string;
  readonly lifecycleScope: 'runtime' | 'session' | 'process';
  readonly enabled: boolean;
  readonly counts: {
    readonly extensions: number;
    readonly skills: number;
    readonly prompts: number;
    readonly workflows: number;
    readonly policies: number;
    readonly evals: number;
  };
  readonly tools: readonly string[];
  readonly nativeTools: readonly string[];
  readonly sideEffectTools: readonly string[];
}

/** Local service exposing the mounted plugin inventory to other facets. */
export interface UpUpPluginRegistry {
  list(): readonly UpUpMountedPlugin[];
  get(id: string): UpUpMountedPlugin | undefined;
  /** Number of currently mounted facets; useful for reload assertions. */
  size(): number;
}

export const UPUP_PLUGIN_REGISTRY = defineService<UpUpPluginRegistry>('upup.pi.plugin-registry', { local: true });

/**
 * Chord wraps values handed to `env.provide()` / returned from `env.use()` in a
 * member-restricted handle, so the write side of the registry must never travel
 * through the service. Adapter facets instead close over the concrete instance,
 * which keeps `mount()`/`unmount()` private to the kernel while every other
 * facet only ever sees the read-only {@link UpUpPluginRegistry} contract.
 */

/** Deterministic facet id for a package name. */
export function piPackageFacetId(packageName: string): string {
  return `${UPUP_FACET_ID_PREFIX}${packageName}`;
}

/** Project a catalog record onto the immutable descriptor facets see. */
export function toMountedPlugin(record: PiPackageRecord): UpUpMountedPlugin {
  const { manifest, enabled } = record;
  return {
    id: piPackageFacetId(manifest.name),
    name: manifest.name,
    version: manifest.version,
    contract: manifest.contract,
    lifecycleScope: manifest.lifecycle.scope,
    enabled,
    counts: {
      extensions: manifest.extensions.length,
      skills: manifest.skills.length,
      prompts: manifest.prompts.length,
      workflows: manifest.workflows.length,
      policies: manifest.policies.length,
      evals: manifest.evals.length,
    },
    tools: [...manifest.tools],
    nativeTools: [...manifest.nativeTools],
    sideEffectTools: manifest.sideEffects.flatMap((declaration) => declaration.tools),
  };
}

export interface PiPackageFacetOptions {
  /** Registry instance the adapter mounts into. Owned by `createUpUpFacetHost`. */
  readonly registry?: MutablePluginRegistry;
  /**
   * Hook invoked during facet activation, after the registry has been updated.
   * Use it to bind package-scoped resources to the facet lifecycle. Any
   * function it returns is registered with `env.own()` so chord disposes it on
   * reload/deactivate.
   */
  readonly onActivate?: (plugin: UpUpMountedPlugin) => void | (() => void | Promise<void>);
}

/**
 * Adapter: one Pi package catalog record → one chord `Facet`.
 *
 * The facet owns nothing Pi-runtime-specific; it registers its descriptor in
 * the shared registry during activation and hands any package cleanup to
 * chord's `own()` so a reload cannot leak.
 */
export function piPackageToFacet(record: PiPackageRecord, options: PiPackageFacetOptions = {}): Facet {
  const plugin = toMountedPlugin(record);
  return {
    id: plugin.id,
    setup(env: FacetEnvironment): void {
      const registry = options.registry;
      env.onActivate(() => {
        registry?.mount(plugin);
        const dispose = options.onActivate?.(plugin);
        if (typeof dispose === 'function') {
          env.own(dispose);
        }
      });
      env.onDeactivate(() => {
        // Guarded so an in-place reload's retiring generation cannot unmount
        // the freshly activated replacement with the same facet id.
        registry?.unmountIfCurrent(plugin.id, plugin);
      });
    },
  };
}

/**
 * Internal registry implementation. Exposed for tests and for the core facet
 * that publishes it; production callers should go through `createUpUpFacetHost`.
 */
export class MutablePluginRegistry implements UpUpPluginRegistry {
  private readonly plugins = new Map<string, UpUpMountedPlugin>();

  mount(plugin: UpUpMountedPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unmount(id: string): void {
    this.plugins.delete(id);
  }

  /**
   * Remove `id` only if it is still mapped to `expected`.
   *
   * Chord's in-place reload activates replacement facets *before* disposing the
   * previous records, so both generations call teardown for the same facet id.
   * An unconditional unmount would let the retiring facet delete its own
   * replacement; comparing the descriptor instance keeps the survivor mounted.
   */
  unmountIfCurrent(id: string, expected: UpUpMountedPlugin): void {
    if (this.plugins.get(id) === expected) {
      this.plugins.delete(id);
    }
  }

  /** Drop every entry; used when the facet generation is torn down. */
  replaceAll(plugins: readonly UpUpMountedPlugin[]): void {
    this.plugins.clear();
    for (const plugin of plugins) this.plugins.set(plugin.id, plugin);
  }

  list(): readonly UpUpMountedPlugin[] {
    return [...this.plugins.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  get(id: string): UpUpMountedPlugin | undefined {
    return this.plugins.get(id);
  }

  size(): number {
    return this.plugins.size;
  }
}

/**
 * The core facet that publishes the read-only registry view. Always mounted
 * first so adapter facets can `env.use(UPUP_PLUGIN_REGISTRY)` if they want to
 * observe the inventory.
 */
export function createPluginRegistryFacet(registry: UpUpPluginRegistry): Facet {
  return {
    id: 'upup.core.plugin-registry',
    setup(env: FacetEnvironment): void {
      env.provide(UPUP_PLUGIN_REGISTRY, registry);
    },
  };
}

export interface UpUpFacetHostOptions {
  readonly onError?: (error: Error) => void;
  readonly facetOptions?: PiPackageFacetOptions;
  /** Injectable registry, mainly so tests can observe mounts. */
  readonly registry?: MutablePluginRegistry;
}

export type UpUpReloadMode = 'in-place' | 'regeneration';

export interface UpUpReloadResult {
  /**
   * How the new package set was applied:
   *   - `in-place`: the facet id set was unchanged, so chord swapped
   *     implementations without disconnecting consumers bound to the registry
   *     service. This is the guarantee chord exists to provide.
   *   - `regeneration`: packages were added or removed, which chord cannot
   *     express in-place (its `reload()` requires every id to already be
   *     active). A new host generation was created instead.
   */
  readonly mode: UpUpReloadMode;
  readonly inventory: readonly UpUpMountedPlugin[];
}

export interface UpUpFacetHost {
  /** Underlying chord host; exposed for advanced service access. */
  readonly host: FacetHost;
  /** Registry powering the `UPUP_PLUGIN_REGISTRY` service. */
  readonly registry: MutablePluginRegistry;
  /** Replace the mounted package set and return how it was applied. */
  reload(records: readonly PiPackageRecord[]): Promise<UpUpReloadResult>;
  /** Current package inventory. */
  inventory(): readonly UpUpMountedPlugin[];
  dispose(): Promise<void>;
}

/**
 * Create a chord facet host preconfigured with the UpUp plugin registry.
 *
 * Reload semantics are deliberately two-tier because chord's own `reload()` is
 * a *replace-in-place* operation: it validates that every incoming facet id is
 * already active and that its service requirements and provisions are
 * unchanged. That preserves consumer handles, but it cannot add or remove
 * packages. UpUp therefore:
 *   - uses chord's in-place reload when the id set is unchanged (plugin
 *     version/content changes), keeping every consumer handle valid;
 *   - falls back to a fresh host generation when the set itself changed
 *     (plugin installed or uninstalled), disposing the previous generation.
 */
export async function createUpUpFacetHost(
  initialRecords: readonly PiPackageRecord[] = [],
  options: UpUpFacetHostOptions = {},
): Promise<UpUpFacetHost> {
  const registry = options.registry ?? new MutablePluginRegistry();
  const coreFacet = createPluginRegistryFacet(registry);
  // Dedupe by facet id before handing the generation to chord: a generation
  // must have unique ids, and "last declaration wins" matches how
  // settings.json package lists resolve name collisions.
  const dedupe = (records: readonly PiPackageRecord[]): readonly PiPackageRecord[] => {
    const byId = new Map<string, PiPackageRecord>();
    for (const record of records) {
      byId.set(piPackageFacetId(record.manifest.name), record);
    }
    return [...byId.values()];
  };
  const facetsFor = (records: readonly PiPackageRecord[]): readonly Facet[] => [
    coreFacet,
    ...dedupe(records).map((record) => piPackageToFacet(record, { ...(options.facetOptions ?? {}), registry })),
  ];

  let currentIds = new Set(dedupe(initialRecords).map((record) => piPackageFacetId(record.manifest.name)));
  let host = await createFacetHost({
    facets: facetsFor(initialRecords),
    ...(options.onError ? { onError: options.onError } : {}),
  });

  return {
    get host() {
      return host;
    },
    registry,
    async reload(records) {
      const nextRecords = dedupe(records);
      const nextIds = new Set(nextRecords.map((record) => piPackageFacetId(record.manifest.name)));
      const sameIdSet = nextIds.size === currentIds.size && [...nextIds].every((id) => currentIds.has(id));
      if (sameIdSet) {
        await host.reload(facetsFor(nextRecords));
        return { mode: 'in-place', inventory: registry.list() };
      }
      // Id set changed: chord cannot express this in-place. Drop the old
      // generation so its owned disposals run, then build a new one.
      const previous = host;
      registry.replaceAll([]);
      await previous.dispose();
      host = await createFacetHost({
        facets: facetsFor(nextRecords),
        ...(options.onError ? { onError: options.onError } : {}),
      });
      currentIds = nextIds;
      return { mode: 'regeneration', inventory: registry.list() };
    },
    inventory() {
      return registry.list();
    },
    async dispose() {
      await host.dispose();
    },
  };
}
