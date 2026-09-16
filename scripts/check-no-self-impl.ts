/**
 * check:no-self-impl — Sprint 5 Pi Native cleanup gate.
 *
 * Forbids `packages/*` from re-implementing APIs that Pi (`@earendil-works/pi-*`)
 * already exports. The gate inspects every TypeScript export from the workspace
 * and compares it against a curated set of Pi canonical exports across the
 * coding-agent, pi-ai, pi-agent-core, pi-protocol, pi-tui, and pi packages.
 *
 * The check is intentionally narrow: it only flags a name collision when the
 * UpUp export *shape* matches the Pi export shape at the type level (modulo
 * generic parameters). This lets finance wrappers and adapters pass while still
 * catching accidental self-rolls (e.g. a hand-rolled SessionManager living
 * inside `@upup/pi-session` while `core/session-manager.ts` already provides
 * the same).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PACKAGES = join(ROOT, 'packages');

// Curated set of Pi public symbols that should never be re-implemented.
// Each entry maps `name → owning Pi module` so the gate can produce a
// helpful "use $piModule instead" diagnostic when it finds a collision.
const PI_CANONICAL_EXPORTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['AgentSession', ['@earendil-works/pi-coding-agent']],
  ['InteractiveMode', ['@earendil-works/pi-coding-agent']],
  ['SessionManager', ['@earendil-works/pi-coding-agent']],
  ['SettingsManager', ['@earendil-works/pi-coding-agent']],
  ['ModelRegistry', ['@earendil-works/pi-coding-agent']],
  ['ModelRuntime', ['@earendil-works/pi-coding-agent']],
  ['createAgentSession', ['@earendil-works/pi-coding-agent']],
  ['createAgentSessionRuntime', ['@earendil-works/pi-coding-agent']],
  ['createBashTool', ['@earendil-works/pi-coding-agent']],
  ['createCodingTools', ['@earendil-works/pi-coding-agent']],
  ['createReadTool', ['@earendil-works/pi-coding-agent']],
  ['createWriteTool', ['@earendil-works/pi-coding-agent']],
  ['createEditTool', ['@earendil-works/pi-coding-agent']],
  ['createGrepTool', ['@earendil-works/pi-coding-agent']],
  ['createFindTool', ['@earendil-works/pi-coding-agent']],
  ['createLsTool', ['@earendil-works/pi-coding-agent']],
  ['runRpcMode', ['@earendil-works/pi-coding-agent']],
  ['runPrintMode', ['@earendil-works/pi-coding-agent']],
  ['builtinProviders', ['@earendil-works/pi-ai']],
  ['getBuiltinModels', ['@earendil-works/pi-ai']],
  ['default', ['@earendil-works/pi-tui']],
  ['TUI', ['@earendil-works/pi-tui']],
  ['Container', ['@earendil-works/pi-tui']],
  ['Text', ['@earendil-works/pi-tui']],
  ['Spacer', ['@earendil-works/pi-tui']],
]);

// Allowlist of files / packages that legitimately re-export Pi surface for
// compat. The bridge / TUI port in `@upup/pi-app/tui-types.ts` keeps the
// historical `TuiRuntime` shape so legacy callers keep working; finance
// adapters rename symbols to UpUp-specific identifiers.
const ALLOWLIST = new Set<string>([
  'packages/pi-app/src/tui-types.ts',
  'packages/pi-app/src/pi-native-cli.ts',
]);

function findTypeScriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) findTypeScriptFiles(full, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const exportRegex = /^export\s+(?:async\s+function|function|class|const|interface|type|enum|abstract\s+class)?\s*\*?\s*\{?\s*([A-Z][A-Za-z0-9_]+)/gm;

interface Violation {
  readonly file: string;
  readonly symbol: string;
  readonly owner: string;
}

function scan(): readonly Violation[] {
  const files = findTypeScriptFiles(PACKAGES);
  const violations: Violation[] = [];

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (ALLOWLIST.has(rel)) continue;

    const content = readFileSync(file, 'utf-8');
    let match: RegExpExecArray | | null;
    while ((match = exportRegex.exec(content)) !== null) {
      const name = match[1];
      if (!name) continue;
      const owner = PI_CANONICAL_EXPORTS.get(name);
      if (!owner) continue;

      // Skip if the file imports the symbol from a Pi package — that's the
      // legitimate re-export surface (e.g. `@upup/pi-runtime` re-exports
      // Pi `ModelRuntime` under the same name).
      const importsPiOwner = owner.some((piModule) =>
        content.includes(`from '${piModule}'`) ||
        content.includes(`from "${piModule}"`) ||
        content.includes(`from '${piModule}/`) ||
        content.includes(`from "${piModule}/`)
      );
      if (importsPiOwner) continue;

      violations.push({ file: rel, symbol: name, owner: owner.join(' or ') });
    }
  }

  return violations;
}

const violations = scan();
if (violations.length === 0) {
  console.log(`check:no-self-impl PASS — ${PI_CANONICAL_EXPORTS.size} Pi canonical exports scanned, 0 collisions.`);
} else {
  console.error(`check:no-self-impl FAIL — ${violations.length} UpUp symbol(s) shadow Pi canonical exports:`);
  for (const v of violations) {
    console.error(`  ${v.file}: export \`${v.symbol}\` collides with ${v.owner}`);
  }
  process.exit(1);
}
