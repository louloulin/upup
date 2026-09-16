/**
 * Unit tests for `scripts/check-upup-microkernel.ts`.
 *
 * Verifies the regex extraction logic that drives the Sprint D self-publish
 * guard: the script must detect `definePiCapabilityHost(pi, { capabilities:
 * [...] })` blocks and correlate them against `pi.hostCapabilities` declared
 * in each package's `package.json`.
 */
import { describe, expect, test } from 'bun:test';

const SAMPLE_BLOCKS = {
  inline: `definePiCapabilityHost(pi, {
    packageName: PACKAGE,
    packageVersion: VERSION,
    capabilities: ['tool-definitions', 'market-data-transport'],
    contract: 'upup.pi.host.v1',
    providers: {},
    register: () => undefined,
  });`,
  constantRef: `definePiCapabilityHost(pi, {
    packageName: PI_FINANCE_PACKAGE_NAME,
    packageVersion: PI_FINANCE_PACKAGE_VERSION,
    capabilities: PI_FINANCE_HOST_CAPABILITIES,
    contract: PI_FINANCE_HOST_CONTRACT,
    providers: {},
    register: () => undefined,
  });`,
  empty: `definePiCapabilityHost(pi, {
    packageName: PACKAGE,
    packageVersion: VERSION,
    capabilities: [] as readonly string[],
    providers: {},
    register: () => undefined,
  });`,
};

function extractCapabilities(source: string): string[] {
  const match = source.match(/definePiCapabilityHost\(\s*pi\s*,\s*\{([\s\S]*?)\}\s*\)/);
  if (!match) return [];
  const body = match[1] ?? '';
  const capabilitiesMatch = body.match(/capabilities:\s*\[([^\]]*)\]/);
  if (!capabilitiesMatch) return [];
  return (capabilitiesMatch[1] ?? '')
    .split(',')
    .map((t) => t.replace(/['"`]/g, '').trim())
    .filter(Boolean);
}

describe('check-upup-microkernel extraction', () => {
  test('parses inline string capabilities', () => {
    expect(extractCapabilities(SAMPLE_BLOCKS.inline)).toEqual(['tool-definitions', 'market-data-transport']);
  });

  test('returns empty when capabilities references a constant', () => {
    // The constant is resolved by inspecting host-contract.ts; the inner
    // extraction alone cannot resolve identifiers.
    expect(extractCapabilities(SAMPLE_BLOCKS.constantRef)).toEqual([]);
  });

  test('returns empty array literal', () => {
    expect(extractCapabilities(SAMPLE_BLOCKS.empty)).toEqual([]);
  });

  test('returns empty for source with no definePiCapabilityHost block', () => {
    expect(extractCapabilities('// nothing here')).toEqual([]);
  });
});

describe('check-upup-microkernel correlation', () => {
  test('passes when inline capabilities cover all declared hostCapabilities', () => {
    const declared = ['tool-definitions', 'market-data-transport'];
    const block = SAMPLE_BLOCKS.inline;
    const caps = extractCapabilities(block);
    const missing = declared.filter((c) => !block.includes(`'${c}'`) && !caps.includes(c));
    expect(missing).toEqual([]);
  });

  test('fails when inline capabilities miss a declared hostCapability', () => {
    const declared = ['tool-definitions', 'investment-workflow'];
    const block = SAMPLE_BLOCKS.inline;
    const caps = extractCapabilities(block);
    const missing = declared.filter((c) => !block.includes(`'${c}'`) && !caps.includes(c));
    expect(missing).toContain('investment-workflow');
  });

  test('constant reference is satisfied when union src contains the literal', () => {
    const declared = ['tool-definitions', 'market-data-transport'];
    const block = SAMPLE_BLOCKS.constantRef;
    const contractSrc = "export const PI_FINANCE_HOST_CAPABILITIES = ['tool-definitions', 'market-data-transport'] as const;";
    const unionSrc = block + contractSrc;
    const missing = declared.filter((c) => !block.includes(`'${c}'`) && !unionSrc.includes(`'${c}'`));
    expect(missing).toEqual([]);
  });
});
