#!/usr/bin/env bun
/**
 * build:packages - Build all workspace packages in topological (DAG) order.
 *
 * Reads each package's package.json, builds a dependency graph from
 * @upup/* workspace dependencies, topologically sorts, and runs
 * `bun run typecheck` on each package in order. This catches
 * cross-package type errors that parallel builds would miss.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_DIR = "packages";

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
}

function loadPackages(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const entries = readdirSync(PACKAGES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(PACKAGES_DIR, entry.name, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = Object.keys(pkg.dependencies ?? {}).filter((d) =>
      d.startsWith("@upup/"),
    );
    result.set(pkg.name, deps);
  }
  return result;
}

function topologicalSort(graph: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const deps = graph.get(name) ?? [];
    for (const dep of deps) visit(dep);
    result.push(name);
  }
  for (const name of graph.keys()) visit(name);
  return result;
}

const graph = loadPackages();
const order = topologicalSort(graph);

console.log(`📦 Building ${order.length} packages in topological order:\n`);
for (let i = 0; i < order.length; i++) {
  const name = order[i]!;
  const deps = graph.get(name) ?? [];
  console.log(`  ${i + 1}. ${name}${deps.length ? ` (deps: ${deps.join(", ")})` : ""}`);
}
console.log("");

let failed = 0;
for (const name of order) {
  const dir = join(PACKAGES_DIR, name.replace("@upup/", ""));
  process.stdout.write(`🔨 ${name} ... `);
  const proc = Bun.spawnSync(["bun", "run", "typecheck"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode === 0) {
    console.log("✅");
  } else {
    console.log("❌");
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n❌ ${failed} package(s) failed typecheck`);
  process.exit(1);
}
console.log(`\n✅ All ${order.length} packages typecheck passed`);
