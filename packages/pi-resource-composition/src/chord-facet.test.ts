import { describe, expect, test } from 'bun:test';
import {
  MutablePluginRegistry,
  UPUP_PLUGIN_REGISTRY,
  UPUP_FACET_ID_PREFIX,
  createPluginRegistryFacet,
  createUpUpFacetHost,
  piPackageFacetId,
  piPackageToFacet,
  toMountedPlugin,
} from './chord-facet';
import type { PiPackageRecord } from './package-catalog';
import type { PiPackageManifest } from './package-catalog';

function makeManifest(overrides: Partial<PiPackageManifest> = {}): PiPackageManifest {
  return {
    name: '@upup/fixture',
    version: '1.2.3',
    contract: 'upup.pi.runtime.v1',
    source: 'builtin:upup',
    dependencies: {},
    runtimeDependencies: {},
    commands: [],
    root: '/tmp/fixture',
    extensions: ['extensions/index.ts'],
    skills: ['skills/a.md', 'skills/b.md'],
    prompts: [],
    workflows: [],
    policies: [],
    evals: [],
    hostCapabilities: [],
    tools: ['fixture_tool'],
    nativeTools: ['fixture_native'],
    sideEffects: [{ tools: ['fixture_write'], effect: 'financial-write', safetyLevel: 'high' }],
    capabilities: [],
    trust: { mode: 'builtin' },
    lifecycle: { scope: 'session' },
    ...overrides,
  } as PiPackageManifest;
}

function makeRecord(name: string, overrides: Partial<PiPackageManifest> = {}): PiPackageRecord {
  return { manifest: makeManifest({ name, ...overrides }), enabled: true, audits: [] };
}

describe('@upup/pi-resource-composition — chord facet bridge', () => {
  test('facet id is namespaced and deterministic', () => {
    expect(piPackageFacetId('@upup/pi-risk')).toBe(`${UPUP_FACET_ID_PREFIX}@upup/pi-risk`);
    expect(piPackageFacetId('@upup/pi-risk')).toBe(piPackageFacetId('@upup/pi-risk'));
  });

  test('toMountedPlugin projects manifest counts and tools', () => {
    const plugin = toMountedPlugin(makeRecord('@upup/fixture'));
    expect(plugin.name).toBe('@upup/fixture');
    expect(plugin.version).toBe('1.2.3');
    expect(plugin.lifecycleScope).toBe('session');
    expect(plugin.counts.extensions).toBe(1);
    expect(plugin.counts.skills).toBe(2);
    expect(plugin.tools).toEqual(['fixture_tool']);
    expect(plugin.nativeTools).toEqual(['fixture_native']);
    expect(plugin.sideEffectTools).toEqual(['fixture_write']);
  });

  test('toMountedPlugin produces a frozen-shape copy (no aliasing of manifest arrays)', () => {
    const record = makeRecord('@upup/alias');
    const plugin = toMountedPlugin(record);
    expect(plugin.tools).not.toBe(record.manifest.tools);
  });

  test('MutablePluginRegistry sorts list() by id and reports size', () => {
    const registry = new MutablePluginRegistry();
    registry.mount(toMountedPlugin(makeRecord('@upup/b')));
    registry.mount(toMountedPlugin(makeRecord('@upup/a')));
    expect(registry.list().map((entry) => entry.name)).toEqual(['@upup/a', '@upup/b']);
    expect(registry.size()).toBe(2);
    expect(registry.get(piPackageFacetId('@upup/a'))?.name).toBe('@upup/a');
    registry.unmount(piPackageFacetId('@upup/a'));
    expect(registry.size()).toBe(1);
  });

  test('piPackageToFacet returns a chord Facet with the namespaced id', () => {
    const facet = piPackageToFacet(makeRecord('@upup/fixture'));
    expect(facet.id).toBe(piPackageFacetId('@upup/fixture'));
    expect(typeof facet.setup).toBe('function');
  });

  test('registry facet declares id upup.core.plugin-registry', () => {
    const facet = createPluginRegistryFacet(new MutablePluginRegistry());
    expect(facet.id).toBe('upup.core.plugin-registry');
  });

  test('host mounts the initial package set and exposes it through the registry', async () => {
    const host = await createUpUpFacetHost([makeRecord('@upup/a'), makeRecord('@upup/b')]);
    try {
      const inventory = host.inventory();
      expect(inventory.map((entry) => entry.name)).toEqual(['@upup/a', '@upup/b']);
      expect(host.registry.size()).toBe(2);
    } finally {
      await host.dispose();
    }
  });

  test('reload with an unchanged id set uses chord in-place semantics', async () => {
    const host = await createUpUpFacetHost([makeRecord('@upup/a'), makeRecord('@upup/b')]);
    try {
      // Same package names, bumped version => same facet ids, new implementation.
      const result = await host.reload([makeRecord('@upup/a', { version: '9.9.9' }), makeRecord('@upup/b')]);
      expect(result.mode).toBe('in-place');
      expect(result.inventory.map((entry) => entry.name)).toEqual(['@upup/a', '@upup/b']);
      expect(result.inventory.find((entry) => entry.name === '@upup/a')?.version).toBe('9.9.9');
    } finally {
      await host.dispose();
    }
  });

  test('reload that adds a package falls back to a new generation', async () => {
    const host = await createUpUpFacetHost([makeRecord('@upup/a')]);
    try {
      const result = await host.reload([makeRecord('@upup/a'), makeRecord('@upup/b')]);
      expect(result.mode).toBe('regeneration');
      expect(result.inventory.map((entry) => entry.name)).toEqual(['@upup/a', '@upup/b']);
    } finally {
      await host.dispose();
    }
  });

  test('reload that removes a package falls back to a new generation', async () => {
    const host = await createUpUpFacetHost([makeRecord('@upup/a'), makeRecord('@upup/b')]);
    try {
      const result = await host.reload([makeRecord('@upup/b'), makeRecord('@upup/c')]);
      expect(result.mode).toBe('regeneration');
      expect(result.inventory.map((entry) => entry.name)).toEqual(['@upup/b', '@upup/c']);
    } finally {
      await host.dispose();
    }
  });

  test('reload to empty set clears the inventory', async () => {
    const host = await createUpUpFacetHost([makeRecord('@upup/a')]);
    try {
      const result = await host.reload([]);
      expect(result.mode).toBe('regeneration');
      expect(result.inventory).toEqual([]);
      expect(host.registry.size()).toBe(0);
    } finally {
      await host.dispose();
    }
  });

  test('onActivate hook runs per package and its cleanup is owned by the host', async () => {
    const activated: string[] = [];
    const disposed: string[] = [];
    const host = await createUpUpFacetHost([makeRecord('@upup/a')], {
      facetOptions: {
        onActivate: (plugin) => {
          activated.push(plugin.name);
          return () => {
            disposed.push(plugin.name);
          };
        },
      },
    });
    try {
      expect(activated).toEqual(['@upup/a']);
      await host.reload([]);
      expect(disposed).toContain('@upup/a');
    } finally {
      await host.dispose();
    }
  });

  test('injectable registry is used instead of an internal one', async () => {
    const registry = new MutablePluginRegistry();
    const host = await createUpUpFacetHost([makeRecord('@upup/a')], { registry });
    try {
      expect(host.registry).toBe(registry);
      expect(registry.size()).toBe(1);
    } finally {
      await host.dispose();
    }
  });

  test('UPUP_PLUGIN_REGISTRY service is local-only (never published remotely)', () => {
    expect(UPUP_PLUGIN_REGISTRY.local).toBe(true);
    expect(UPUP_PLUGIN_REGISTRY.id).toBe('upup.pi.plugin-registry');
  });

  test('duplicate package names collapse to one facet (id is the key)', async () => {
    const host = await createUpUpFacetHost([makeRecord('@upup/a'), makeRecord('@upup/a', { version: '2.0.0' })]);
    try {
      expect(host.registry.size()).toBe(1);
      expect(host.inventory()[0]?.version).toBe('2.0.0');
    } finally {
      await host.dispose();
    }
  });
});
