import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBuiltinPiPackageOptions, getProjectPiPackageOptions, mergePiPackageTrust, resolveConfiguredPiPackages } from './package-config';

const previous = {
  paths: process.env.UPUP_PI_PACKAGE_PATHS,
  trusted: process.env.UPUP_PI_TRUSTED_PATHS,
  pinned: process.env.UPUP_PI_PINNED_PACKAGES,
  sources: process.env.UPUP_PI_ALLOWED_SOURCES,
};

afterEach(() => {
  if (previous.paths === undefined) delete process.env.UPUP_PI_PACKAGE_PATHS;
  else process.env.UPUP_PI_PACKAGE_PATHS = previous.paths;
  if (previous.trusted === undefined) delete process.env.UPUP_PI_TRUSTED_PATHS;
  else process.env.UPUP_PI_TRUSTED_PATHS = previous.trusted;
  if (previous.pinned === undefined) delete process.env.UPUP_PI_PINNED_PACKAGES;
  else process.env.UPUP_PI_PINNED_PACKAGES = previous.pinned;
  if (previous.sources === undefined) delete process.env.UPUP_PI_ALLOWED_SOURCES;
  else process.env.UPUP_PI_ALLOWED_SOURCES = previous.sources;
});

describe('configured Pi packages', () => {
  test('resolves distributable built-in Pi package roots', () => {
    const options = getBuiltinPiPackageOptions(process.cwd());
    expect(options).toBeDefined();
    if (!options) throw new Error('built-in Pi packages are not configured');
    const pinnedPackages = options.piPackageTrust.pinnedPackages ?? {};
    const allowedSources = options.piPackageTrust.allowedSources ?? {};
    const names = Object.keys(pinnedPackages);
    expect(options.piPackagePaths[0]).toContain('pi-finance-sdk');
    for (const name of ['@upup/pi-finance-sdk', '@upup/pi-market-data', '@upup/pi-research']) {
      expect(names).toContain(name);
      expect(pinnedPackages[name]).toMatch(/^\d+\.\d+\.\d+$/);
      expect(allowedSources[name]).toEqual(['builtin:upup']);
    }
  });

  test('loads the pinned built-in finance packages by default', () => {
    delete process.env.UPUP_PI_PACKAGE_PATHS;
    const options = resolveConfiguredPiPackages();
    expect(options).toBeDefined();
    if (!options) throw new Error('built-in Pi packages are not configured');
    const pinnedPackages = options.piPackageTrust.pinnedPackages ?? {};
    const allowedSources = options.piPackageTrust.allowedSources ?? {};
    expect(options.piPackagePaths).toEqual(expect.arrayContaining([
      expect.stringContaining('/packages/pi-finance-sdk'),
      expect.stringContaining('/packages/pi-research'),
    ]));
    expect(pinnedPackages['@upup/pi-finance-sdk']).toBe('0.1.0');
    expect(pinnedPackages['@upup/pi-research']).toBe('0.1.0');
    expect(allowedSources['@upup/pi-research']).toEqual(['builtin:upup']);
  });

  test('requires trusted roots and exact pinned versions', () => {
    process.env.UPUP_PI_PACKAGE_PATHS = JSON.stringify(['/tmp/finance-package']);
    delete process.env.UPUP_PI_TRUSTED_PATHS;
    expect(() => resolveConfiguredPiPackages()).toThrow('UPUP_PI_TRUSTED_PATHS');

    process.env.UPUP_PI_TRUSTED_PATHS = JSON.stringify(['/tmp']);
    process.env.UPUP_PI_PINNED_PACKAGES = JSON.stringify({ '@upup/pi-finance-sdk': '^0.1.0' });
    expect(() => resolveConfiguredPiPackages()).toThrow('exact semver');

    process.env.UPUP_PI_PINNED_PACKAGES = JSON.stringify({ '@upup/pi-finance-sdk': '0.1.0' });
    delete process.env.UPUP_PI_ALLOWED_SOURCES;
    expect(() => resolveConfiguredPiPackages()).toThrow('UPUP_PI_ALLOWED_SOURCES');
  });

  test('parses an explicit package trust policy', () => {
    process.env.UPUP_PI_PACKAGE_PATHS = JSON.stringify(['/tmp/finance-package']);
    process.env.UPUP_PI_TRUSTED_PATHS = JSON.stringify(['/tmp']);
    process.env.UPUP_PI_PINNED_PACKAGES = JSON.stringify({ '@upup/pi-finance-sdk': '0.1.0' });
    process.env.UPUP_PI_ALLOWED_SOURCES = JSON.stringify({ '@upup/pi-finance-sdk': 'npm:@upup/pi-finance-sdk' });
    expect(resolveConfiguredPiPackages()).toEqual({
      piPackagePaths: ['/tmp/finance-package'],
      piPackageTrust: {
        trustedPaths: ['/tmp'],
        pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' },
        allowedSources: { '@upup/pi-finance-sdk': ['npm:@upup/pi-finance-sdk'] },
      },
    });
  });

  test('merges explicit trust overrides with builtin dependency pins and sources', () => {
    expect(mergePiPackageTrust({
      trustedPaths: ['/builtin'],
      pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.85.1' },
      allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
    }, {
      trustedPaths: ['/project'],
      pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' },
    })).toEqual({
      trustedPaths: ['/project'],
      pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.85.1' },
      allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
    });
  });

  test('loads project-local Pi packages from .pi/settings.json with explicit trust policy', async () => {
    const cwd = await mkdtemp(join(process.cwd(), '.upup', 'pi-settings-'));
    try {
      const packagePath = join(cwd, 'packages', 'finance');
      await mkdir(packagePath, { recursive: true });
      await mkdir(join(cwd, '.pi'), { recursive: true });
      await writeFile(join(cwd, '.pi', 'settings.json'), JSON.stringify({
        packages: [{ source: './packages/finance', autoload: true }],
        upupPiPackages: {
          trustedPaths: ['./packages/finance'],
          pinnedPackages: { '@upup/fixture': '1.2.3' },
          allowedSources: { '@upup/fixture': ['internal:fixture'] },
        },
      }));
      expect(getProjectPiPackageOptions(cwd)).toEqual({
        piPackagePaths: [packagePath],
        piPackageTrust: {
          trustedPaths: [packagePath],
          pinnedPackages: { '@upup/fixture': '1.2.3' },
          allowedSources: { '@upup/fixture': ['internal:fixture'] },
        },
      });
      expect(resolveConfiguredPiPackages(cwd)).toEqual(getProjectPiPackageOptions(cwd));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('rejects remote and escaping project package sources', async () => {
    const cwd = await mkdtemp(join(process.cwd(), '.upup', 'pi-settings-invalid-'));
    try {
      await mkdir(join(cwd, '.pi'), { recursive: true });
      await writeFile(join(cwd, '.pi', 'settings.json'), JSON.stringify({ packages: ['npm:@upup/remote'] }));
      expect(() => getProjectPiPackageOptions(cwd)).toThrow('Remote Pi package sources');
      await writeFile(join(cwd, '.pi', 'settings.json'), JSON.stringify({ packages: ['../outside'] }));
      expect(() => getProjectPiPackageOptions(cwd)).toThrow('escapes the project root');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
