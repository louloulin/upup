/**
 * Test fixture for the migrated config tools.
 *
 * Mock the `loadConfig` / `saveConfig` / `useDynamicConfig` boundary so the
 * migrated `config_get` / `config_set` / `config_list` tools can run
 * hermetically without touching the real on-disk settings.
 */

import { mock } from 'bun:test';

interface ConfigFixture {
  data: Record<string, unknown>;
  saved: Array<{ snapshot: Record<string, unknown> }>;
  dynamicSets: Array<{ key: string; value: unknown }>;
}

let fixture: ConfigFixture | null = null;

/** Install module mocks. Call once per test file (idempotent). */
export function configToolGetFixture(): void {
  const f: ConfigFixture = {
    data: {
      modelId: 'gpt-4',
      memory: {
        enabled: true,
        embeddingProvider: 'openai',
      },
      nested: {
        deep: { value: 42 },
      },
    },
    saved: [],
    dynamicSets: [],
  };
  fixture = f;

  mock.module('../utils/config.js', () => {
    return {
      loadConfig: () => f.data,
      saveConfig: (cfg: Record<string, unknown>) => {
        f.saved.push({ snapshot: { ...cfg } });
        return true;
      },
    };
  });

  mock.module('../hooks/agent-hooks.js', () => {
    return {
      useDynamicConfig: () => ({
        set: (key: string, value: unknown) => {
          if (!fixture) return;
          fixture.dynamicSets.push({ key, value });
        },
      }),
    };
  });
}

/** Reset the fixture state between tests. */
export function resetConfigToolFixture(): void {
  if (!fixture) return;
  fixture.data = {
    modelId: 'gpt-4',
    memory: {
      enabled: true,
      embeddingProvider: 'openai',
    },
    nested: {
      deep: { value: 42 },
    },
  };
  fixture.saved = [];
  fixture.dynamicSets = [];
}

/** Read-only view of the fixture for assertions. */
export function getConfigToolFixture(): ConfigFixture | null {
  return fixture;
}
