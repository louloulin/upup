import { describe, expect, test, beforeEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getUpupModelRuntime,
  _resetUpupModelRuntimeCache,
  tryGetUpupModelRuntime,
} from './default-model-runtime';

/**
 * Regression for Sprint F2: previously UpUp's `resolvePiModel` only queried
 * the static Pi catalog and Ollama. A user who added a custom provider such
 * as `minimax:MiniMax-M3` to `~/.upup/agent/models.json` got a silent
 * fallback to the Pi default — the audit identified this as the single
 * largest gap in UpUp's LLM config surface.
 *
 * This test wires the default `ModelRuntime` into `resolvePiModel` via a
 * fake `models.json` and asserts that:
 *   1. The runtime loads models.json from the canonical UpUp agent dir.
 *   2. `getModel(provider, model)` resolves the user's custom entry.
 *   3. `tryGetUpupModelRuntime` reflects the cached singleton.
 *   4. `_resetUpupModelRuntimeCache` exists for test isolation.
 */
describe('@upup/pi-runtime — default ModelRuntime', () => {
  let home: string;
  let agentDir: string;

  beforeEach(() => {
    _resetUpupModelRuntimeCache();
    home = mkdtempSync(join(tmpdir(), 'upup-model-runtime-'));
    agentDir = join(home, '.upup', 'agent');
    // `models.json` lives inside the canonical UpUp agent dir; create it
    // before writing so `mkdtempSync`'s flat directory does not swallow
    // the `mkdir`.
    require('node:fs').mkdirSync(agentDir, { recursive: true });
    // Minimal model config the runtime can parse. The exact shape follows
    // Pi's `ModelConfig.load` contract.
    writeFileSync(join(agentDir, 'models.json'), JSON.stringify({
      providers: {
        minimax: {
          baseUrl: 'https://api.minimax.chat/v1',
          apiKey: 'minimax-test-key',
          api: 'openai-completions',
          models: [{ id: 'MiniMax-M3', name: 'MiniMax M3', contextWindow: 200000, maxTokens: 8192 }],
        },
      },
    }, null, 2));
    // The runtime resolves the canonical UpUp agent dir via
    // `resolveAgentDir(cwd)` which honours `UPUP_CODING_AGENT_DIR` first,
    // then falls back to `~/.upup/agent`. We point both at our temp home.
    process.env.UPUP_CODING_AGENT_DIR = agentDir;
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  test('loads a user-defined provider from models.json and resolves its models', async () => {
    const runtime = await getUpupModelRuntime({ refreshOnCreate: false });
    const model = runtime.getModel('minimax', 'MiniMax-M3');
    expect(model).toBeDefined();
    expect(model?.id).toBe('MiniMax-M3');
    expect(model?.provider).toBe('minimax');
    expect(tryGetUpupModelRuntime()).toBe(runtime);
  });

  test('reuses the cached singleton on a second call', async () => {
    const first = await getUpupModelRuntime({ refreshOnCreate: false });
    const second = await getUpupModelRuntime({ refreshOnCreate: false });
    expect(second).toBe(first);
  });

  test('rebuilds the cache after _resetUpupModelRuntimeCache', async () => {
    const first = await getUpupModelRuntime({ refreshOnCreate: false });
    _resetUpupModelRuntimeCache();
    expect(tryGetUpupModelRuntime()).toBeUndefined();
    const second = await getUpupModelRuntime({ refreshOnCreate: false });
    expect(second).not.toBe(first);
  });

  test('returns undefined for an unknown model even on a customised runtime', async () => {
    const runtime = await getUpupModelRuntime({ refreshOnCreate: false });
    expect(runtime.getModel('minimax', 'MiniMax-Nonexistent')).toBeUndefined();
  });
});
