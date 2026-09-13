import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const packageDir = resolve(root, 'packages');
const failures: string[] = [];
const sourceDir = resolve(root, 'src');

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry) && !entry.endsWith('.test.ts')) files.push(path);
  }
  return files;
}

interface ImportReference {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly dynamic: boolean;
}

function importsFrom(source: string): ImportReference[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => {
    const start = source.lastIndexOf('\n', match.index ?? 0) + 1;
    const matchStart = match.index ?? 0;
    const prefix = source.slice(start, matchStart);
    return {
      specifier: match[1],
      typeOnly: /\b(?:import|export)\s+type\b/.test(prefix),
      dynamic: /^import\s*\(/.test(source.slice(matchStart, matchStart + 20)),
    };
  });
}

function resolveLocalImport(importer: string, specifier: string, files: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const withoutExtension = specifier.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
  const base = resolve(dirname(importer), withoutExtension);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.mts'),
    join(base, 'index.cts'),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

function findCycles<T>(nodes: readonly T[], edges: ReadonlyMap<T, ReadonlySet<T>>): T[][] {
  let index = 0;
  const indexes = new Map<T, number>();
  const lowLinks = new Map<T, number>();
  const stack: T[] = [];
  const onStack = new Set<T>();
  const cycles: T[][] = [];

  function visit(node: T): void {
    indexes.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const dependency of edges.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(dependency)!));
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(dependency)!));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: T[] = [];
    let current: T;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    if (component.length > 1) cycles.push(component);
  }

  for (const node of nodes) if (!indexes.has(node)) visit(node);
  return cycles;
}

const packageRoots = readdirSync(packageDir)
  .map((name) => ({ name, path: join(packageDir, name) }))
  .filter(({ path }) => statSync(path).isDirectory());
const packageNames = new Map(packageRoots.map(({ name }) => [`@upup/${name}`, name]));
const graph = new Map(packageRoots.map(({ name }) => [name, new Set<string>()]));
const packageFiles = new Set(packageRoots.flatMap(({ path }) => walk(path)));
const sourceFiles = walk(sourceDir);
const allWorkspaceFiles = new Set([...packageFiles, ...sourceFiles]);
const rootSourcePrefix = `${sourceDir}/`;

for (const { name, path: packageRoot } of packageRoots) {
  const manifestPath = join(packageRoot, 'package.json');
  if (statSync(manifestPath, { throwIfNoEntry: false })) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies = manifest[section];
      if (!dependencies || typeof dependencies !== 'object') continue;
      for (const [dependency, version] of Object.entries(dependencies as Record<string, unknown>)) {
        if (dependency === 'upup' || String(version).includes('/src')) {
          failures.push(`${relative(root, manifestPath)} must not depend on root src through ${dependency}: ${String(version)}`);
        }
      }
    }
  }
  for (const file of walk(packageRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const reference of importsFrom(source)) {
      const specifier = reference.specifier;
      if (specifier === '@/' || specifier.startsWith('@/')) {
        failures.push(`${relative(root, file)} imports root src through alias: ${specifier}`);
        continue;
      }
      if (specifier === sourceDir || specifier.startsWith(rootSourcePrefix)) {
        failures.push(`${relative(root, file)} imports root src through absolute path: ${specifier}`);
        continue;
      }
      if (specifier.startsWith('.')) {
        const target = resolveLocalImport(file, specifier, allWorkspaceFiles);
        const packageSourceRoot = resolve(packageRoot, 'src');
        if (target && (target === resolve(root, 'src') || target.startsWith(`${resolve(root, 'src')}/`)) &&
          !(target === packageSourceRoot || target.startsWith(`${packageSourceRoot}/`))) {
          failures.push(`${relative(root, file)} imports root src: ${specifier}`);
        }
      }
      const dependency = packageNames.get(specifier);
      if (dependency && dependency !== name) graph.get(name)?.add(dependency);
    }
  }
}

for (const component of findCycles(packageRoots.map(({ name }) => name), graph)) {
  failures.push(`workspace package dependency cycle: ${component.join(' -> ')}`);
}

const sourceFileSet = new Set(sourceFiles);
const sourceGraph = new Map(sourceFiles.map((file) => [file, new Set<string>()]));
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const reference of importsFrom(source)) {
    if (reference.typeOnly || reference.dynamic) continue;
    const target = resolveLocalImport(file, reference.specifier, sourceFileSet);
    if (target) sourceGraph.get(file)?.add(target);
  }
}
for (const component of findCycles(sourceFiles, sourceGraph)) {
  failures.push(`root src module dependency cycle: ${component.map((file) => relative(root, file)).join(' -> ')}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Module boundaries passed: ${packageRoots.length} workspace packages, ${sourceFiles.length} root src modules, no root-src imports or dependency cycles.`);
