import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  PI_AGENT_DIR_ENV_NAMES,
  publishPiAgentDirEnv,
  resolveAgentDir,
} from '@upup/pi-resource-composition';

/**
 * Sandbox-escape guard for Pi's global agent dir.
 *
 * UpUp publishes the agent dir as an **env var Pi reads at module init**, not
 * as a constructor argument. The var *name* is derived from Pi's own
 * `package.json#piConfig.name` (`ENV_AGENT_DIR = ${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`),
 * so UpUp's rebranded build (`piConfig.name = "upup"`, applied by
 * `patches/@earendil-works%2Fpi-coding-agent@0.85.1.patch`) reads
 * `UPUP_CODING_AGENT_DIR`, **not** `PI_CODING_AGENT_DIR`.
 *
 * Publishing only the legacy name is a silent sandbox escape: Pi falls back to
 * `~/.upup/agent`, and a `$UPUP_HOME`-isolated test run writes into the real
 * developer home. `src/utils/test-home-isolation.contract.test.ts` did not
 * catch this because it only asserted UpUp's own path helpers.
 *
 * This test reads the *installed* Pi config module, so it also fails if a Pi
 * upgrade changes how the env var name is derived.
 */

const PI_CONFIG_JS = 'node_modules/@earendil-works/pi-coding-agent/dist/config.js';

interface PiAgentDirContract {
  readonly appName: string;
  readonly envAgentDir: string;
  readonly configDirName: string;
  readonly getAgentDir: () => string;
}

/** Read the installed Pi build's agent-dir contract without going through Pi's index. */
async function readPiAgentDirContract(): Promise<PiAgentDirContract> {
  const mod = (await import(resolve(process.cwd(), PI_CONFIG_JS))) as {
    APP_NAME: string;
    ENV_AGENT_DIR: string;
    CONFIG_DIR_NAME: string;
    getAgentDir: () => string;
  };
  return {
    appName: mod.APP_NAME,
    envAgentDir: mod.ENV_AGENT_DIR,
    configDirName: mod.CONFIG_DIR_NAME,
    getAgentDir: mod.getAgentDir,
  };
}

function sandboxAgentDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'upup-agentdir-contract-'));
  const dir = join(root, '.upup', 'agent');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Pi agent-dir publication contract', () => {
  test('the installed Pi build reads the UpUp-branded env var name', async () => {
    const contract = await readPiAgentDirContract();
    expect(contract.appName).toBe('upup');
    expect(contract.envAgentDir).toBe('UPUP_CODING_AGENT_DIR');
    expect(contract.configDirName).toBe('.upup');
  });

  test('UpUp publishes the env var name the installed Pi actually reads', async () => {
    const contract = await readPiAgentDirContract();
    expect(PI_AGENT_DIR_ENV_NAMES as readonly string[]).toContain(contract.envAgentDir);
  });

  test('a $UPUP_HOME sandbox reaches Pi getAgentDir() without escaping', async () => {
    const contract = await readPiAgentDirContract();
    const dir = sandboxAgentDir();
    const env: NodeJS.ProcessEnv = { UPUP_HOME: join(dir, '..') };

    publishPiAgentDirEnv({ env, cwd: tmpdir(), home: tmpdir() });

    expect(env.UPUP_CODING_AGENT_DIR).toBe(dir);
    const previous = process.env[contract.envAgentDir];
    process.env[contract.envAgentDir] = env[contract.envAgentDir];
    try {
      expect(resolve(contract.getAgentDir())).toBe(dir);
    } finally {
      if (previous === undefined) delete process.env[contract.envAgentDir];
      else process.env[contract.envAgentDir] = previous;
    }
  });

  test('UPUP_HOME alone relocates resolveAgentDir when no CODING_AGENT_DIR is set', () => {
    const dir = sandboxAgentDir();
    const resolved = resolveAgentDir(tmpdir(), {
      env: { UPUP_HOME: join(dir, '..') },
      home: tmpdir(),
    });
    expect(resolved.agentDir).toBe(dir);
    expect(resolved.source).toBe('upup-home-env');
  });

  test('publishing never clobbers an explicit user choice', () => {
    const env: NodeJS.ProcessEnv = { PI_CODING_AGENT_DIR: '/custom/pi' };
    publishPiAgentDirEnv({ env, agentDir: '/upup/agent' });
    expect(env.PI_CODING_AGENT_DIR).toBe('/custom/pi');
    expect(env.UPUP_CODING_AGENT_DIR).toBe('/upup/agent');
  });
});
