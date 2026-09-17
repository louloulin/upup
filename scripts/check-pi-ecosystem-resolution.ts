#!/usr/bin/env bun
/**
 * check-pi-ecosystem-resolution — dual-scope resolver guard.
 *
 * Every `UPUP_ECOSYSTEM_PACKAGES` entry marked `verifiedClean: true` must
 * be resolvable through `@upup/pi-runtime/ecosystem-resolver`, which walks
 * `~/.upup/agent/npm` first and then falls back to the bundled workspace.
 * If a registry entry claims it is loadable but neither scope can find it,
 * the next session will fail at import time — exactly the regression
 * `@quintinshaw/pi-dynamic-workflows` showed when its `"import"`-only
 * `exports` block defeated the CJS-only `createRequire` lookup.
 *
 * Failure isolation: this script only asserts the resolution path; it
 * does not try to import the package. Importing every package up-front
 * would slow CI and surface peer-dep noise unrelated to resolution.
 */

import { describeEcosystemResolution, findEcosystemPackageDirs, resolvePiExtensionEntries } from '../packages/pi-runtime/src/ecosystem-resolver';
import { UPUP_ECOSYSTEM_PACKAGES } from '../packages/pi-runtime/src/ecosystem-packages';

const EXPECTED_USER_ROOT_SUFFIX = '/.upup/agent/npm';

interface ResolutionRow {
  readonly name: string;
  readonly importPath: string;
  readonly scope: 'user' | 'bundled' | 'missing';
  readonly resolved: string | undefined;
  readonly root: string | undefined;
  readonly verifiedClean: boolean;
}

function main(): void {
  const rows: ResolutionRow[] = UPUP_ECOSYSTEM_PACKAGES.map((pkg) => {
    // Pi's contract is `pi.extensions`, not the npm main entry: `pi-crew` and
    // `pi-esr` put their factory outside a resolvable `.`-export. Prefer the
    // declared extension entries and fall back to `importPath`, mirroring
    // `mountUpUpEcosystemPackages` so this guard and the runtime agree on what
    // "loadable" means.
    const declared = resolvePiExtensionEntries(pkg.name);
    if (declared.length > 0) {
      // Report the scope the entry actually came from: a user-home install
      // shadows the bundled copy, and the resolver already encodes that.
      const entry = declared[0]!;
      const owner = findEcosystemPackageDirs(pkg.name).find((candidate) => entry.startsWith(candidate.dir));
      return {
        name: pkg.name,
        importPath: entry,
        scope: owner?.scope ?? 'bundled',
        resolved: entry,
        root: owner?.root,
        verifiedClean: pkg.verifiedClean,
      };
    }
    const described = describeEcosystemResolution(pkg.importPath);
    return {
      name: pkg.name,
      importPath: pkg.importPath,
      scope: described.scope,
      resolved: described.resolved,
      root: described.root,
      verifiedClean: pkg.verifiedClean,
    };
  });

  // Per-scope counts; useful for `report:pi7` to assert user scope ever
  // gets exercised (no point shipping `upup ecosystem install` if no
  // scope ever reports as `user`).
  const counts = { user: 0, bundled: 0, missing: 0 };
  for (const r of rows) counts[r.scope] += 1;

  console.log(`check:pi-ecosystem-resolution — ${rows.length} packages`);
  console.log(`  user=${counts.user}  bundled=${counts.bundled}  missing=${counts.missing}`);

  const missing = rows.filter((r) => r.scope === 'missing');
  for (const r of rows) {
    const tag = r.scope === 'missing' ? '✗' : r.scope === 'user' ? '↑' : '·';
    const where = r.resolved ? r.resolved.replace(process.cwd(), '<repo>') : '';
    console.log(`  ${tag} ${r.name.padEnd(36)} scope=${r.scope.padEnd(8)} ${where}`);
  }

  // Hard rule: a package the registry says is loadable must be loadable
  // from *some* root. `verifiedClean=false` is exempt — those entries
  // ship as documentation, not loaders.
  const realFailures = missing.filter((r) => r.verifiedClean);
  if (realFailures.length > 0) {
    console.error(`\n${realFailures.length} verifiedClean ecosystem package(s) failed to resolve:`);
    for (const r of realFailures) {
      console.error(`  - ${r.name} (import path: ${r.importPath})`);
    }
    process.exit(1);
  }

  // Soft rule: warn (do not fail) when the user scope is empty AND the
  // agent dir exists — that means `upup ecosystem install` was never run,
  // which is fine for CI but useful to surface locally.
  const agentDir = process.env.UPUP_HOME
    ? `${process.env.UPUP_HOME}/agent/npm`
    : `${process.env.HOME ?? ''}${EXPECTED_USER_ROOT_SUFFIX}`;
  const userScopeEmpty = counts.user === 0 && agentDir.length > EXPECTED_USER_ROOT_SUFFIX.length;
  if (userScopeEmpty) {
    console.log(
      `\n  (info) no packages resolved from user scope yet; run "upup ecosystem install" to populate ${agentDir}`,
    );
  }
}

main();
