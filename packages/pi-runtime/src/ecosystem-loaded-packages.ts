/**
 * npm package names Pi's own package manager already loads for this agent home.
 *
 * The UpUp ecosystem extension and `settings.json#packages` are two
 * independent mount paths for the same npm packages. Pi's built-in package
 * manager wins for anything listed in settings, so mounting it again here
 * registers a duplicate tool (`subagent`, `mcp`, `ask_user_question`) and Pi
 * aborts with `Failed to load extension`. Reading the settings file keeps the
 * two in sync without the user having to pick one.
 *
 * Missing or malformed settings degrade to "nothing pre-loaded", which is the
 * correct behaviour for a fresh install.
 *
 * Lives in its own module so that callers from the rest of `@upup/pi-runtime`
 * — `research-dag.ts` needs this to skip the DAG bridge when a subagent
 * package is already mounted — can import it statically without dragging in
 * `ecosystem-extension.ts`, which itself dynamically imports `research-dag.ts`
 * to register the bridge. Putting both functions in one module produced a
 * 2-node cycle in `lint:scc`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve the Pi agent dir the same way the rest of the runtime does, without
 * importing `@upup/pi-resource-composition` (that package depends on
 * `pi-runtime`, so importing it here would create a cycle).
 */
export function piAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit =
    env.UPUP_AGENT_DIR?.trim() ||
    env.UPUP_CODING_AGENT_DIR?.trim() ||
    env.PI_CODING_AGENT_DIR?.trim();
  if (explicit) return explicit.replace(/^~(?=\/|$)/, env.HOME ?? '');
  const home = env.HOME ?? '';
  const root = env.UPUP_HOME?.trim() || join(home, '.upup');
  return join(root, 'agent');
}

export function piLoadedPackageNames(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  const settingsPath = join(piAgentDir(env), 'settings.json');
  if (!existsSync(settingsPath)) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    return new Set();
  }
  const packages = (parsed as { packages?: unknown })?.packages;
  if (!Array.isArray(packages)) return new Set();
  const names = new Set<string>();
  for (const entry of packages) {
    // Entries are either a plain `"npm:<pkg>"` string or an object
    // `{ source: 'npm:<pkg>', autoload?: false }`. `autoload: false` means Pi
    // deliberately does NOT load it, so UpUp is the one that should.
    const raw = typeof entry === 'string' ? entry : (entry as { source?: unknown })?.source;
    const autoload = typeof entry === 'string' ? true : (entry as { autoload?: unknown })?.autoload;
    if (typeof raw !== 'string') continue;
    if (autoload === false) continue;
    const withoutPrefix = raw.replace(/^npm:/, '');
    if (withoutPrefix.length > 0) names.add(withoutPrefix);
  }
  return names;
}
