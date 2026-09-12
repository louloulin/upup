import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyPiResourceTrust } from './plugin-trust.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'upup-pi-trust-'));
  const resources = join(root, 'resources');
  mkdirSync(resources);
  writeFileSync(join(resources, 'research.md'), 'trusted finance research');
  return { root, resources };
}

function hash(path: string): string {
  return createHash('sha256').update('research.md\0trusted finance research\0').digest('hex');
}

describe('Pi plugin trust policy', () => {
  test('requires explicit trust and records a content hash audit', () => {
    const { root, resources } = fixture();
    expect(() => verifyPiResourceTrust([resources], undefined, root)).toThrow('trustedPaths');
    const result = verifyPiResourceTrust([resources], { trustedPaths: [resources], allowedHashes: { [resources]: hash(resources) } }, root);
    expect(result.paths).toEqual([resources]);
    expect(result.audits[0]).toMatchObject({ path: resources, decision: 'trusted' });
    expect(result.audits[0]?.contentHash).toBe(hash(resources));
  });

  test('rejects path escapes and changed resources', () => {
    const { root, resources } = fixture();
    mkdirSync(join(root, 'other'));
    expect(() => verifyPiResourceTrust([join(root, 'other')], { trustedPaths: [resources] }, root)).toThrow('outside');
    expect(() => verifyPiResourceTrust([resources], { trustedPaths: [resources], allowedHashes: { [resources]: 'bad' } }, root)).toThrow('hash mismatch');
  });

  test('enforces pinned package versions', () => {
    const { root } = fixture();
    const packageDir = join(root, 'package');
    mkdirSync(packageDir);
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'pi-finance-fixture', version: '1.2.3' }));
    writeFileSync(join(packageDir, 'index.md'), 'finance');
    expect(() => verifyPiResourceTrust([packageDir], { trustedPaths: [packageDir], pinnedPackages: {} }, root)).toThrow('pinned package allowlist');
    expect(verifyPiResourceTrust([packageDir], { trustedPaths: [packageDir], pinnedPackages: { 'pi-finance-fixture': '1.2.3' } }, root).audits[0]).toMatchObject({ packageName: 'pi-finance-fixture', packageVersion: '1.2.3' });
  });
});
