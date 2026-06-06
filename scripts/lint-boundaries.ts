#!/usr/bin/env bun
/**
 * lint:boundaries - Enforce workspace boundary rules.
 *
 * Rules:
 *  1. No stale `src/` subdirectory may exist (src/ is shell-only, 5 files max)
 *  2. No undeclared @upup/* dependency in package.json (warning, not error)
 *
 * The 5 shell files (src/index.tsx, src/cli.ts, src/run.ts,
 * src/bundled-runner.ts, src/theme.ts) are EXPECTED to import from
 * workspace packages — that is their purpose.
 *
 * Exit 0 = clean (or warnings only), Exit 1 = hard violations found.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = ".";
const SRC_SHELL_FILES = new Set([
  "src/index.tsx",
  "src/cli.ts",
  "src/run.ts",
  "src/bundled-runner.ts",
  "src/theme.ts",
]);

interface Violation {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
}

const violations: Violation[] = [];

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      results.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function checkSrcShell(): void {
  const srcDir = join(ROOT, "src");
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir)) {
    const relPath = `src/${entry}`;
    const full = join(srcDir, entry);
    if (statSync(full).isDirectory()) {
      violations.push({
        file: relPath,
        line: 0,
        message: `stale src/ subdirectory — move contents to packages/* and remove`,
        severity: "error",
      });
    } else if (!SRC_SHELL_FILES.has(relPath)) {
      violations.push({
        file: relPath,
        line: 0,
        message: `unexpected src/ file — only ${[...SRC_SHELL_FILES].join(", ")} are allowed`,
        severity: "error",
      });
    }
  }
}

function getPackageDeps(pkgDir: string): Set<string> {
  const pkgPath = join(pkgDir, "package.json");
  if (!existsSync(pkgPath)) return new Set();
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return new Set(Object.keys(pkg.dependencies ?? {}));
}

function checkPackageImports(): void {
  const packagesDir = join(ROOT, "packages");
  if (!existsSync(packagesDir)) return;
  for (const entry of readdirSync(packagesDir)) {
    const pkgDir = join(packagesDir, entry);
    if (!statSync(pkgDir).isDirectory()) continue;
    const srcDir = join(pkgDir, "src");
    if (!existsSync(srcDir)) continue;
    const declaredDeps = getPackageDeps(pkgDir);
    for (const file of walk(srcDir)) {
      const rel = relative(ROOT, file);
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const match = line.match(/from\s+["'](@upup\/[^"']+)["']/);
        if (match) {
          const imp = match[1]!;
          const pkgName = imp.split("/").slice(0, 2).join("/");
          if (!declaredDeps.has(pkgName) && pkgName !== `@upup/${entry}`) {
            violations.push({
              file: rel,
              line: i + 1,
              message: `undeclared dependency: ${pkgName} not in package.json dependencies`,
              severity: "warning",
            });
          }
        }
      }
    }
  }
}

checkSrcShell();
checkPackageImports();

const errors = violations.filter((v) => v.severity === "error");
const warnings = violations.filter((v) => v.severity === "warning");

if (warnings.length > 0) {
  console.log(`⚠️  ${warnings.length} undeclared dependency warning(s) (pre-existing)\n`);
}

if (errors.length === 0) {
  console.log("✅ No boundary violations found");
  process.exit(0);
}

console.error(`❌ Found ${errors.length} boundary violation(s):\n`);
for (const v of errors) {
  const loc = v.line > 0 ? `${v.file}:${v.line}` : v.file;
  console.error(`  ${loc}`);
  console.error(`    ${v.message}\n`);
}
process.exit(1);
