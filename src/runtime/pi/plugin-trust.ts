import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export interface PiPluginTrustPolicy {
  trustedPaths: readonly string[];
  allowedHashes?: Readonly<Record<string, string>>;
  pinnedPackages?: Readonly<Record<string, string>>;
}

export interface PiResourceTrustAudit {
  path: string;
  contentHash: string;
  packageName?: string;
  packageVersion?: string;
  decision: 'trusted';
}

function filesUnder(path: string): string[] {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`Trusted Pi resource cannot contain a symbolic link: ${path}`);
  }
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !DYNAMIC_DIRECTORY_NAMES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => filesUnder(join(path, entry.name)));
}

const DYNAMIC_DIRECTORY_NAMES = new Set(['.git', '.upup', 'node_modules', 'dist', 'tmp', 'coverage']);

function hashPath(path: string): string {
  const hash = createHash('sha256');
  for (const file of filesUnder(path)) {
    hash.update(relative(path, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function packageMetadata(path: string): { name?: string; version?: string } {
  const packagePath = statSync(path).isDirectory() ? join(path, 'package.json') : join(dirname(path), 'package.json');
  if (!existsSync(packagePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown; version?: unknown };
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      version: typeof parsed.version === 'string' ? parsed.version : undefined,
    };
  } catch {
    throw new Error(`Invalid package.json for trusted Pi resource: ${packagePath}`);
  }
}

function isInside(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !child.startsWith('/'));
}

export function verifyPiResourceTrust(
  paths: readonly string[],
  policy: PiPluginTrustPolicy | undefined,
  cwd: string,
): { paths: string[]; audits: PiResourceTrustAudit[] } {
  if (paths.length === 0) return { paths: [], audits: [] };
  if (!policy || policy.trustedPaths.length === 0) {
    throw new Error('Unreviewed Pi Skill/Prompt resources are disabled; provide an explicit trustedPaths policy');
  }
  const trustedRoots = policy.trustedPaths.map((path) => resolve(cwd, path));
  const audits: PiResourceTrustAudit[] = [];
  const normalized = paths.map((path) => {
    const resolved = resolve(cwd, path);
    if (!trustedRoots.some((root) => isInside(resolved, root))) {
      throw new Error(`Pi resource is outside the trusted allowlist: ${resolved}`);
    }
    if (!existsSync(resolved)) throw new Error(`Trusted Pi resource does not exist: ${resolved}`);
    if (lstatSync(resolved).isSymbolicLink()) {
      throw new Error(`Trusted Pi resource cannot be a symbolic link: ${resolved}`);
    }
    const contentHash = hashPath(resolved);
    const expectedHash = policy.allowedHashes?.[resolved] ?? policy.allowedHashes?.[path];
    if (expectedHash && expectedHash !== contentHash) {
      throw new Error(`Pi resource hash mismatch: ${resolved}`);
    }
    const metadata = packageMetadata(resolved);
    if (metadata.name && policy.pinnedPackages?.[metadata.name] !== undefined && policy.pinnedPackages[metadata.name] !== metadata.version) {
      throw new Error(`Pi package version is not pinned as expected: ${metadata.name}@${metadata.version ?? 'unknown'}`);
    }
    if (metadata.name && !policy.pinnedPackages?.[metadata.name]) {
      throw new Error(`Pi package is not in the pinned package allowlist: ${metadata.name}`);
    }
    audits.push({ path: resolved, contentHash, packageName: metadata.name, packageVersion: metadata.version, decision: 'trusted' });
    return resolved;
  });
  return { paths: normalized, audits };
}
