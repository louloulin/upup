// Dependency-ordered workspace build.
//
// Cross-package imports in this monorepo resolve through each package's
// `exports` field, which points at `dist/`. `dist/` is gitignored, so a fresh
// checkout (and therefore CI) has no resolvable `@upup/*` modules until every
// workspace package has been built. Building them in parallel is not enough:
// a package that imports another one's `dist` can start before that `dist`
// exists, which is what happened with `@upup/pi-app` -> `@upup/pi-cli-bootstrap`.
//
// This script resolves the internal dependency order and builds sequentially.

import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const packagesDirectory = join(root, 'packages');

interface WorkspacePackage {
  readonly directory: string;
  readonly name: string;
  readonly internalDependencies: readonly string[];
}

function readWorkspacePackages(): WorkspacePackage[] {
  return readdirSync(packagesDirectory)
    .filter((entry) => statSync(join(packagesDirectory, entry)).isDirectory())
    .flatMap((entry) => {
      const directory = join(packagesDirectory, entry);
      const manifestPath = join(directory, 'package.json');
      if (!existsSync(manifestPath)) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      return [
        {
          directory,
          name: manifest.name ?? `@upup/${entry}`,
          internalDependencies: Object.keys({
            ...(manifest.dependencies ?? {}),
            ...(manifest.peerDependencies ?? {}),
          }).filter((dependency) => dependency.startsWith('@upup/')),
        },
      ];
    });
}

function orderByDependencies(packages: readonly WorkspacePackage[]): WorkspacePackage[] {
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const ordered: WorkspacePackage[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(entry: WorkspacePackage): void {
    if (visited.has(entry.name)) return;
    if (visiting.has(entry.name)) return; // cycle: break and let the gate report it
    visiting.add(entry.name);
    for (const dependency of entry.internalDependencies) {
      const target = byName.get(dependency);
      if (target) visit(target);
    }
    visiting.delete(entry.name);
    visited.add(entry.name);
    ordered.push(entry);
  }

  for (const entry of packages) visit(entry);
  return ordered;
}

const packages = readWorkspacePackages();
const ordered = orderByDependencies(packages);
const requested = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
const targets = requested.length > 0 ? ordered.filter((entry) => requested.includes(entry.name)) : ordered;

if (targets.length === 0) {
  console.error('No workspace packages matched.');
  process.exit(1);
}

const startedAt = Date.now();
const failures: string[] = [];

/**
 * `composite: true` implies incremental emit, and a `tsconfig.tsbuildinfo`
 * left behind by an earlier build makes `tsc --emitDeclarationOnly` skip
 * writing declarations (exit 0, no output). That silently strips the types
 * other packages resolve through `dist`, so the cache is dropped before each
 * package build.
 */
function resetDeclarationCache(directory: string): void {
  for (const buildInfo of [
    resolve(directory, 'tsconfig.tsbuildinfo'),
    resolve(directory, 'dist/tsconfig.tsbuildinfo'),
  ]) {
    if (existsSync(buildInfo)) rmSync(buildInfo, { force: true });
  }
}

for (const entry of targets) {
  const label = relative(root, entry.directory);
  resetDeclarationCache(entry.directory);
  console.log(`\n▶ ${entry.name} (${label})`);
  const result = Bun.spawnSync({
    cmd: ['bun', 'run', 'build'],
    cwd: entry.directory,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) failures.push(entry.name);
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(`\n❌ ${failures.length}/${targets.length} workspace package builds failed in ${seconds}s:`);
  for (const name of failures) console.error(`   - ${name}`);
  process.exit(1);
}

console.log(`\n✅ Built ${targets.length} workspace packages in ${seconds}s`);
