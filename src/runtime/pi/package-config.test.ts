import { afterEach, describe, expect, test } from 'bun:test';
import { getBuiltinPiPackageOptions, resolveConfiguredPiPackages } from './package-config.js';

const previous = {
  paths: process.env.UPUP_PI_PACKAGE_PATHS,
  trusted: process.env.UPUP_PI_TRUSTED_PATHS,
  pinned: process.env.UPUP_PI_PINNED_PACKAGES,
};

afterEach(() => {
  if (previous.paths === undefined) delete process.env.UPUP_PI_PACKAGE_PATHS;
  else process.env.UPUP_PI_PACKAGE_PATHS = previous.paths;
  if (previous.trusted === undefined) delete process.env.UPUP_PI_TRUSTED_PATHS;
  else process.env.UPUP_PI_TRUSTED_PATHS = previous.trusted;
  if (previous.pinned === undefined) delete process.env.UPUP_PI_PINNED_PACKAGES;
  else process.env.UPUP_PI_PINNED_PACKAGES = previous.pinned;
});

describe('configured Pi packages', () => {
  test('resolves a distributable built-in finance package root', () => {
    const options = getBuiltinPiPackageOptions(process.cwd());
    expect(options?.piPackagePaths[0]).toContain('pi-finance-sdk');
    expect(options?.piPackageTrust.pinnedPackages).toEqual({ '@upup/pi-finance-sdk': '0.1.0' });
  });

  test('loads the pinned built-in finance package by default', () => {
    delete process.env.UPUP_PI_PACKAGE_PATHS;
    expect(resolveConfiguredPiPackages()).toEqual({
      piPackagePaths: [expect.stringContaining('/packages/pi-finance-sdk')],
      piPackageTrust: {
        trustedPaths: [expect.stringContaining('/packages/pi-finance-sdk')],
        pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' },
      },
    });
  });

  test('requires trusted roots and exact pinned versions', () => {
    process.env.UPUP_PI_PACKAGE_PATHS = JSON.stringify(['/tmp/finance-package']);
    delete process.env.UPUP_PI_TRUSTED_PATHS;
    expect(() => resolveConfiguredPiPackages()).toThrow('UPUP_PI_TRUSTED_PATHS');

    process.env.UPUP_PI_TRUSTED_PATHS = JSON.stringify(['/tmp']);
    process.env.UPUP_PI_PINNED_PACKAGES = JSON.stringify({ '@upup/pi-finance-sdk': '^0.1.0' });
    expect(() => resolveConfiguredPiPackages()).toThrow('exact semver');
  });

  test('parses an explicit package trust policy', () => {
    process.env.UPUP_PI_PACKAGE_PATHS = JSON.stringify(['/tmp/finance-package']);
    process.env.UPUP_PI_TRUSTED_PATHS = JSON.stringify(['/tmp']);
    process.env.UPUP_PI_PINNED_PACKAGES = JSON.stringify({ '@upup/pi-finance-sdk': '0.1.0' });
    expect(resolveConfiguredPiPackages()).toEqual({
      piPackagePaths: ['/tmp/finance-package'],
      piPackageTrust: {
        trustedPaths: ['/tmp'],
        pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' },
      },
    });
  });
});
