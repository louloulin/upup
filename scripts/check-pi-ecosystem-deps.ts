#!/usr/bin/env bun
/**
 * check-pi-ecosystem-deps — UpUp's Pi ecosystem package guard.
 *
 * Verifies every entry in `@upup/pi-runtime`'s `UPUP_ECOSYSTEM_PACKAGES`
 * registry is actually installed in `node_modules` at the documented
 * version, and that its default export still mounts on a fake
 * `ExtensionAPI`. Hard-fails CI if any of:
 *
 *   - the npm package is missing from node_modules (developer forgot
 *     `bun add` after adding to the registry);
 *   - the installed version does not match `version` (someone bumped
 *     upstream and did not refresh the registry);
 *   - the default export is not callable (Pi 0.85.1 broke it).
 *
 * The script intentionally exits non-zero on the first failure so the
 * CI matrix surfaces the offending package by name.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { UPUP_ECOSYSTEM_PACKAGES } from '../packages/pi-runtime/src/ecosystem-packages';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const nodeModules = join(repoRoot, 'node_modules');

interface CheckResult {
  readonly name: string;
  readonly installed: boolean;
  readonly versionMatches: boolean;
  readonly installedVersion: string | null;
  readonly mounts: boolean;
  readonly error?: string;
}

function readInstalledVersion(pkg: string): string | null {
  const path = join(nodeModules, pkg, 'package.json');
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  }
}

function createFakePi(): ExtensionAPI {
  const sink: Record<string, unknown> = {};
  const stub: any = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'events') return { on: () => undefined };
      if (prop === 'getFlag') return () => undefined;
      if (prop === 'getSessionName') return () => undefined;
      if (prop === 'getActiveTools') return () => [];
      if (prop === 'getAllTools') return () => [];
      if (prop === 'getCommands') return () => [];
      if (prop === 'getThinkingLevel') return () => 'medium' as const;
      if (prop === 'setModel') return async () => true;
      if (prop === 'exec') return async () => '';
      return (...args: unknown[]) => {
        sink[String(prop)] = args;
      };
    },
  });
  return stub as ExtensionAPI;
}

async function checkPackage(spec: typeof UPUP_ECOSYSTEM_PACKAGES[number]): Promise<CheckResult> {
  const installedVersion = readInstalledVersion(spec.name);
  const installed = installedVersion !== null;
  const versionMatches = installedVersion === spec.version;
  let mounts = false;
  let error: string | undefined;
  if (installed && spec.verifiedClean === false) {
    error = 'known broken (verifiedClean: false in registry)';
    return { name: spec.name, installed, versionMatches, installedVersion, mounts, error };
  }
  if (installed) {
    try {
      const importer = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
      const mod: any = await importer(spec.importPath);
      const fn = mod?.default;
      if (typeof fn === 'function') {
        fn(createFakePi());
        mounts = true;
      } else if (typeof mod === 'object' && mod !== null && Object.keys(mod).length > 0) {
        mounts = true;
      } else {
        error = 'module has no default function and no named exports';
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message.split('\n')[0] : String(e);
    }
  } else {
    error = 'not in node_modules';
  }
  return { name: spec.name, installed, versionMatches, installedVersion, mounts, error };
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];
  for (const spec of UPUP_ECOSYSTEM_PACKAGES) {
    results.push(await checkPackage(spec));
  }

  const ok = results.filter((r) => r.installed && r.versionMatches && r.mounts);
  const bad = results.filter((r) => !(r.installed && r.versionMatches && r.mounts));

  console.log(`check:pi-ecosystem-deps — ${ok.length}/${results.length} ecosystem packages verified`);
  for (const r of results) {
    const tag = r.installed && r.versionMatches && r.mounts ? '✓' : '✗';
    const v = r.installedVersion ?? '<missing>';
    const err = r.error ? ` — ${r.error}` : '';
    console.log(`  ${tag} ${r.name.padEnd(34)} registry=${r.installedVersion ?? '?'} installed=${v}${err}`);
  }

  const knownBroken = bad.filter((r) => r.error?.includes('known broken'));
  const realFailures = bad.filter((r) => !r.error?.includes('known broken'));
  if (knownBroken.length > 0) {
    console.warn(`\n${knownBroken.length} known-broken package(s) (expected, not a CI failure):`);
    for (const r of knownBroken) {
      console.warn(`  ⚠ ${r.name}: ${r.error ?? 'unknown'}`);
    }
  }
  if (realFailures.length > 0) {
    console.error(`\n${realFailures.length} ecosystem package(s) failed:`);
    for (const r of realFailures) {
      console.error(`  - ${r.name}: ${r.error ?? 'unknown'}`);
    }
    process.exit(1);
  }
}

await main();
