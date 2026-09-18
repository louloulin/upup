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

  /**
   * `node:path.resolve` does not expand `~`; it treats it as an ordinary
   * directory name. Every env override accepts shell-style `~`, so the
   * resolver expands it by hand — otherwise `UPUP_AGENT_DIR=~/upup/agent`
   * silently produced `<cwd>/~/upup/agent`, a real directory named `~` under
   * the project root.
   */
  test('env overrides expand a leading ~ instead of nesting it under cwd', () => {
    for (const name of ['UPUP_AGENT_DIR', 'UPUP_CODING_AGENT_DIR', 'PI_CODING_AGENT_DIR'] as const) {
      const resolved = resolveAgentDir(tmpdir(), { env: { [name]: '~/upup/agent' }, home: '/home/tester' });
      expect(resolved.agentDir).toBe('/home/tester/upup/agent');
    }
    const homeRoot = resolveAgentDir(tmpdir(), { env: { UPUP_HOME: '~/upup-home' }, home: '/home/tester' });
    expect(homeRoot.agentDir).toBe('/home/tester/upup-home/agent');
  });

  /**
   * `UPUP_SESSION_DIR` is the legacy spelling that predates the rebrand. Pi
   * only reads `<APP_NAME>_CODING_AGENT_SESSION_DIR`, so a process that set
   * the legacy name alone had its sessions written to the real
   * `~/.upup/agent/sessions` while every verifier and test believed it was
   * isolated. The publisher mirrors it into the names Pi consumes.
   */
  test('the legacy UPUP_SESSION_DIR alias reaches the names Pi reads', async () => {
    const contract = await readPiAgentDirContract();
    const dir = sandboxAgentDir();
    const env: NodeJS.ProcessEnv = { UPUP_HOME: join(dir, '..'), UPUP_SESSION_DIR: join(dir, 'legacy-sessions') };

    publishPiAgentDirEnv({ env, cwd: tmpdir(), home: tmpdir() });

    // The exact variable name Pi resolves at module init.
    expect(contract.envAgentDir).toBe('UPUP_CODING_AGENT_DIR');
    expect(env.UPUP_CODING_AGENT_SESSION_DIR).toBe(join(dir, 'legacy-sessions'));
    expect(env.PI_CODING_AGENT_SESSION_DIR).toBe(join(dir, 'legacy-sessions'));
  });

  test('an explicit sessionDir beats the legacy alias, and neither is invented', () => {
    const withExplicit: NodeJS.ProcessEnv = { UPUP_SESSION_DIR: '/legacy' };
    publishPiAgentDirEnv({ env: withExplicit, agentDir: '/upup/agent', sessionDir: '/explicit' });
    expect(withExplicit.UPUP_CODING_AGENT_SESSION_DIR).toBe('/explicit');

    const unset: NodeJS.ProcessEnv = {};
    publishPiAgentDirEnv({ env: unset, agentDir: '/upup/agent' });
    // Pi derives `<agentDir>/sessions` itself; publishing a value would
    // override a user's own `--session-dir` choice.
    expect(unset.UPUP_CODING_AGENT_SESSION_DIR).toBeUndefined();
  });

  /**
   * Ambient-run guard: the `bun test` preload must relocate *this* process's
   * agent dir into a throwaway sandbox.
   *
   * Regression for the field observation that session suites wrote fixture
   * JSONL into the developer's real `~/.upup/agent/sessions/`. The preload
   * (`scripts/test-preload.ts`) sets `UPUP_HOME` to a `mkdtempSync` root and
   * then calls `publishPiAgentDirEnv()`, so both UpUp's resolver and Pi's own
   * `getAgentDir()` stay inside the sandbox. Asserting it here makes the
   * isolation contractual instead of incidental: if the preload is dropped
   * from `bunfig.toml`, this test fails rather than silently re-polluting the
   * real home.
   */
  test('the ambient test process is sandboxed away from the real ~/.upup/agent', async () => {
    const contract = await readPiAgentDirContract();
    const resolved = resolveAgentDir(process.cwd(), { env: process.env });
    const tmp = resolve(tmpdir());

    expect(resolved.agentDir.startsWith(tmp + '/')).toBe(true);
    // The name Pi's `getAgentDir()` reads must be published in-process too.
    expect(process.env[contract.envAgentDir]).toBe(resolved.agentDir);

    // And Pi itself must resolve to that same sandbox path.
    const previous = process.env[contract.envAgentDir];
    process.env[contract.envAgentDir] = resolved.agentDir;
    try {
      expect(resolve(contract.getAgentDir())).toBe(resolved.agentDir);
    } finally {
      if (previous === undefined) delete process.env[contract.envAgentDir];
      else process.env[contract.envAgentDir] = previous;
    }
  });
});
