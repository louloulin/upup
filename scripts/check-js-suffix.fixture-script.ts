import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const scanRoots = [resolve(root, 'probe')].filter((dir) => existsSync(dir));

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

interface SpecifierRule { readonly pattern: RegExp; readonly kind: string; }
const RULES: readonly SpecifierRule[] = [
  { pattern: FROM_RELATIVE_WITH_JS, kind: 'import' },
  { pattern: REQUIRE_RELATIVE_WITH_JS, kind: 'require' },
  { pattern: DYNAMIC_RELATIVE_WITH_JS, kind: 'dynamic-import' },
];

const violations: { file: string; line: number; specifier: string; kind: string }[] = [];

for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const rule of RULES) {
      for (const match of source.matchAll(rule.pattern)) {
        const offset = match.index ?? 0;
        const { line } = offsetToLineColumn(source, offset);
        violations.push({ file: file.replace(root + '/', ''), line, specifier: match[1] ?? '', kind: rule.kind });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('FAIL: ' + violations.length + ' violation(s):');
  for (const v of violations) console.error('  ' + v.file + ':' + v.line + ' ' + v.kind + ' ' + v.specifier);
  process.exit(1);
}
console.log('clean');
