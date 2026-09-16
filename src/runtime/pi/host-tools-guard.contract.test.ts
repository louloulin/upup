import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Contract: every `registerPiCapabilityHost(pi, PACKAGE, (host) => {...})`
 * callback that touches `host.providers.tools` must guard the access with an
 * optional chain (`host?.providers?.tools?.<method>`) somewhere **before** the
 * bare-access line. When `host` is defined but `host.providers` or
 * `host.providers.tools` is missing (e.g. on the management surface, which has
 * no session), the unguarded access throws `undefined is not an object` and
 * the whole extension load fails — taking down `upup management`, eval, and
 * any other headless path that loads packages eagerly.
 *
 * Regressions observed in the wild: 7 files used the bare-access pattern, of
 * which one (`pi-finance-sdk/extensions/index.ts`) was fixed by wrapping the
 * call in `if (host && host.providers?.tools?.getToolDefinitions)`. The
 * remaining 6 were fixed by hoisting the optional-chain guard into the
 * top-of-callback short-circuit. This contract makes sure no future file
 * reintroduces the bare-access form.
 */
describe('Pi host-tools guard contract', () => {
  const workspaceRoot = join(import.meta.dir, '..', '..', '..');
  const packagesRoot = join(workspaceRoot, 'packages');
  const bareAccess = /host\.providers\.tools\.[A-Za-z]+/;
  const guardPattern = /host\??\.providers\??\.tools\??\.[A-Za-z]+/;
  const guardRegex = new RegExp(guardPattern.source, 'g');

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        yield* walk(path);
      } else if (path.endsWith('extensions/index.ts')) {
        yield path;
      }
    }
  }

  test('every registerPiCapabilityHost callback guards host.providers.tools access', () => {
    let filesScanned = 0;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const path of walk(packagesRoot)) {
      filesScanned++;
      const lines = readFileSync(path, 'utf-8').split('\n');

      // Track every callback scope introduced by `registerPiCapabilityHost(... (host) => {`.
      const callbackStarts: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/registerPiCapabilityHost\s*\(/.test(lines[i]) && /\(host\)\s*=>/.test(lines[i])) {
          callbackStarts.push(i);
        }
      }

      for (const start of callbackStarts) {
        // Find the matching closing brace. The callback body is typically 2–8 lines
        // (function definition + brace). Walk forward counting braces until they
        // balance.
        let depth = 0;
        let openedAt: number | null = null;
        let end = lines.length - 1;
        for (let i = start; i < lines.length; i++) {
          const opens = (lines[i].match(/\{/g) ?? []).length;
          const closes = (lines[i].match(/\}/g) ?? []).length;
          if (openedAt === null && opens > 0) openedAt = i;
          depth += opens - closes;
          if (openedAt !== null && depth <= 0) {
            end = i;
            break;
          }
        }

        for (let i = openedAt ?? start; i <= end; i++) {
          bareAccess.lastIndex = 0;
          if (!bareAccess.test(lines[i])) continue;
          // Window: lines strictly before `i`, up to 12 lines back, within the
          // same callback body. Self-match is excluded so the offending line
          // itself can't satisfy the guard check.
          const windowStart = Math.max(openedAt ?? start, i - 12);
          const window = lines.slice(windowStart, i);
          const guardSeen = window.some((prev) => guardPattern.test(prev));
          if (!guardSeen) {
            violations.push({
              file: path.replace(`${workspaceRoot}/`, ''),
              line: i + 1,
              text: lines[i].trim(),
            });
          }
        }
      }
    }

    expect(filesScanned).toBeGreaterThan(5);
    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} unguarded host.providers.tools.* access(es) in Pi extensions.\n` +
          `Add an early-return guard like \`if (!host?.providers?.tools?.getToolDefinitions) return;\`.\n` +
          `Violations:\n${summary}`,
      );
    }
    expect(violations.length).toBe(0);
    // Suppress unused-var warning for guardRegex (kept for future per-line lint use).
    expect(guardRegex).toBeInstanceOf(RegExp);
  });
});
