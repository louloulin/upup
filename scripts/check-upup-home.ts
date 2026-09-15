/**
 * `UPUP_HOME` resolution audit.
 *
 * Every code path that produces an UpUp home directory MUST honour `$UPUP_HOME`
 * (see `@upup/utils/paths#getUpupHomeRoot`) so that tests, sandboxed installs,
 * and CI all run inside an isolated home. This script fails when production
 * source code writes the canonical `join(homedir(), '.upup', …)` literal
 * directly — those bypass the override and silently mutate the developer's
 * real `~/.upup`.
 *
 * Allowed exception: `src/utils/test-home-isolation.contract.test.ts` (asserts
 * the literal home root to prove the sandbox differs from it) and the few
 * Pi-side migration targets under `.pi/agent/...` (which intentionally target
 * Pi's layout).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const scanRoots = [resolve(root, 'packages'), resolve(root, 'src')];

interface Violation {
  file: string;
  line: number;
  text: string;
}

const violations: Violation[] = [];
const TEST_FILES = new Set([
  resolve(root, 'src/utils/test-home-isolation.contract.test.ts'),
  resolve(root, 'src/utils/paths.test.ts'),
]);

// A line is a violation iff it references both `homedir()` and `'.upup'`
// (in any order, anywhere on the line) AND it does NOT reference
// `process.env.UPUP_HOME`. The canonical replacement pattern always mentions
// `UPUP_HOME`, so this gives an accurate pre/post check.
const mentionsHomedir = /\bhomedir\s*\(\s*\)/;
const mentionsUpupDir = /['"]\.upup['"]/;
// Catches `process.env.UPUP_HOME`, `process.env[UPUP_HOME_ENV]`, and the
// `UPUP_HOME_ENV = 'UPUP_HOME'` constant declaration (the bracket form is
// what `packages/pi-config/src/index.ts` uses).
const mentionsUpupHome = /UPUP_HOME(_ENV)?/;
const mentionsGetUpupHomeRoot = /\bgetUpupHomeRoot\s*\(\s*\)/;

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!stats.isFile()) continue;
    if (!/\.ts$/.test(entry)) continue;
    const abs = resolve(full);
    if (TEST_FILES.has(abs)) continue;
    const text = readFileSync(full, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (!mentionsHomedir.test(line) || !mentionsUpupDir.test(line)) continue;
      // The canonical replacement pattern always references UPUP_HOME
      // (inline or via `getUpupHomeRoot()`).
      if (mentionsUpupHome.test(line) || mentionsGetUpupHomeRoot.test(line)) continue;
      violations.push({ file: full, line: i + 1, text: line.trim() });
    }
  }
}

for (const scanRoot of scanRoots) walk(scanRoot);

if (violations.length === 0) {
  console.log('UPUP_HOME resolution audit passed: every UpUp home path honours `$UPUP_HOME`.');
  process.exit(0);
}

console.error(`UPUP_HOME resolution audit failed: ${violations.length} literal path(s) found.`);
console.error('Each violation must use `$UPUP_HOME` (see @upup/utils/paths#getUpupHomeRoot).');
for (const violation of violations) {
  console.error(`  ${violation.file}:${violation.line}  ${violation.text}`);
}
process.exit(1);
