// Internal relative-path ".js" suffix audit.
//
// Goal: prevent regression of the Pi7 ".js" suffix cleanup. Internal TS
// imports must use the no-suffix form (from "./X"), while legitimate
// external / literal references are allowed:
//
//   - External npm packages (e.g. "@modelcontextprotocol/sdk/client/index.js",
//     "fuse.js") - not a relative path.
//   - Test fixture write-paths (writeFile(..., "extensions/index.js", ...)).
//   - String literals / glob patterns ("star-star-slash-star.js", "node script.js").
//   - Negative assertions (expect(...).not.toContain("legacy.js")).
//
// Only flags real "from" / "require" / dynamic-import specifiers that start
// with "./" or "../" and end in ".js" / ".jsx" / ".mjs" / ".cjs".

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const scanRoots = [resolve(root, 'packages'), resolve(root, 'src')];

interface Violation {
  file: string;
  line: number;
  column: number;
  specifier: string;
  kind: 'import' | 'require' | 'dynamic-import';
}

const violations: Violation[] = [];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry)) files.push(path);
  }
  return files;
}

const JS_LIKE_SUFFIX = String.raw`\.(?:c|m)?js`;
const RELATIVE_BODY = String.raw`([./][^"']*` + JS_LIKE_SUFFIX + `)`;

const FROM_RELATIVE_WITH_JS = new RegExp(String.raw`from\s+["']` + RELATIVE_BODY + String.raw`["']`, 'g');
const REQUIRE_RELATIVE_WITH_JS = new RegExp(String.raw`(?:^|[^\w$.])require\s*\(\s*["']` + RELATIVE_BODY + String.raw`["']`, 'g');
const DYNAMIC_RELATIVE_WITH_JS = new RegExp(String.raw`import\s*\(\s*["']` + RELATIVE_BODY + String.raw`["']\s*\)`, 'g');

function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1] ?? '').length + 1 };
}

interface SpecifierRule {
  readonly pattern: RegExp;
  readonly kind: Violation['kind'];
}

const RULES: readonly SpecifierRule[] = [
  { pattern: FROM_RELATIVE_WITH_JS, kind: 'import' },
  { pattern: REQUIRE_RELATIVE_WITH_JS, kind: 'require' },
  { pattern: DYNAMIC_RELATIVE_WITH_JS, kind: 'dynamic-import' },
];

for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const rule of RULES) {
      for (const match of source.matchAll(rule.pattern)) {
        const offset = match.index ?? 0;
        const { line, column } = offsetToLineColumn(source, offset);
        violations.push({
          file: file.replace(root + '/', ''),
          line,
          column,
          specifier: match[1] ?? '',
          kind: rule.kind,
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`FAIL: ${violations.length} internal relative-path .js suffix violation(s):`);
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}:${violation.column}  ${violation.kind}  ${violation.specifier}`,
    );
  }
  process.exit(1);
}

let totalFiles = 0;
for (const scanRoot of scanRoots) totalFiles += walk(scanRoot).length;
console.log(
  `.js suffix audit passed: scanned ${totalFiles} TS/TSX file(s) under packages/ and src/, 0 internal relative-path .js imports.`,
);
