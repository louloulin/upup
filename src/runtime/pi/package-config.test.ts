import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBuiltinPiPackageOptions, getProjectPiPackageOptions, resolveConfiguredPiPackages } from './package-config.js';

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
  test('resolves a distributable built-in finance package root', () => {
    const options = getBuiltinPiPackageOptions(process.cwd());
    expect(options?.piPackagePaths[0]).toContain('pi-finance-sdk');
    expect(options?.piPackagePaths).toEqual(expect.arrayContaining([expect.stringContaining('pi-market-data')]));
    expect(options?.piPackagePaths).toEqual(expect.arrayContaining([expect.stringContaining('pi-investment-analysis'), expect.stringContaining('pi-browser')]));
    expect(options?.piPackageTrust.pinnedPackages).toEqual({
      '@upup/pi-finance-sdk': '0.1.0',
      '@upup/pi-market-data': '0.1.0',
      '@upup/pi-investment-analysis': '0.1.0',
      '@upup/pi-risk': '0.1.0',
      '@upup/pi-portfolio': '0.1.0',
      '@upup/pi-backtest': '0.1.0',
      '@upup/pi-platform': '0.1.0',
      '@upup/pi-research': '0.1.0',
      '@upup/pi-browser': '0.1.0',
      '@upup/pi-config': '0.1.0',
      '@upup/pi-cache': '0.1.0',
      '@upup/pi-notify': '0.1.0',
      '@upup/pi-investment-workflow': '0.1.0',
      '@upup/pi-management': '0.1.0',
      '@earendil-works/pi-coding-agent': '0.84.3',
      typebox: '1.3.7',
    });
    expect(options?.piPackageTrust.allowedSources).toEqual({
      '@upup/pi-finance-sdk': ['builtin:upup'],
      '@upup/pi-market-data': ['builtin:upup'],
      '@upup/pi-investment-analysis': ['builtin:upup'],
      '@upup/pi-risk': ['builtin:upup'],
      '@upup/pi-portfolio': ['builtin:upup'],
      '@upup/pi-backtest': ['builtin:upup'],
      '@upup/pi-platform': ['builtin:upup'],
      '@upup/pi-research': ['builtin:upup'],
      '@upup/pi-browser': ['builtin:upup'],
      '@upup/pi-config': ['builtin:upup'],
      '@upup/pi-cache': ['builtin:upup'],
      '@upup/pi-notify': ['builtin:upup'],
      '@upup/pi-investment-workflow': ['builtin:upup'],
      '@upup/pi-management': ['builtin:upup'],
    });
  });

  test('loads the pinned built-in finance package by default', () => {
    delete process.env.UPUP_PI_PACKAGE_PATHS;
    expect(resolveConfiguredPiPackages()).toEqual({
      piPackagePaths: expect.arrayContaining([expect.stringContaining('/packages/pi-finance-sdk'), expect.stringContaining('/packages/pi-market-data'), expect.stringContaining('/packages/pi-investment-analysis'), expect.stringContaining('/packages/pi-risk'), expect.stringContaining('/packages/pi-portfolio'), expect.stringContaining('/packages/pi-backtest'), expect.stringContaining('/packages/pi-platform'), expect.stringContaining('/packages/pi-research'), expect.stringContaining('/packages/pi-browser'), expect.stringContaining('/packages/pi-config'), expect.stringContaining('/packages/pi-cache'), expect.stringContaining('/packages/pi-notify'), expect.stringContaining('/packages/pi-investment-workflow'), expect.stringContaining('/packages/pi-management')]),
      piPackageTrust: {
        trustedPaths: expect.arrayContaining([expect.stringContaining('/packages/pi-finance-sdk'), expect.stringContaining('/packages/pi-market-data'), expect.stringContaining('/packages/pi-investment-analysis'), expect.stringContaining('/packages/pi-risk'), expect.stringContaining('/packages/pi-portfolio'), expect.stringContaining('/packages/pi-backtest'), expect.stringContaining('/packages/pi-platform'), expect.stringContaining('/packages/pi-research'), expect.stringContaining('/packages/pi-browser'), expect.stringContaining('/packages/pi-config'), expect.stringContaining('/packages/pi-cache'), expect.stringContaining('/packages/pi-notify'), expect.stringContaining('/packages/pi-investment-workflow'), expect.stringContaining('/packages/pi-management')]),
        pinnedPackages: {
          '@upup/pi-finance-sdk': '0.1.0',
          '@upup/pi-market-data': '0.1.0',
          '@upup/pi-investment-analysis': '0.1.0',
          '@upup/pi-risk': '0.1.0',
      '@upup/pi-portfolio': '0.1.0',
          '@upup/pi-backtest': '0.1.0',
          '@upup/pi-platform': '0.1.0',
      '@upup/pi-research': '0.1.0',
          '@upup/pi-browser': '0.1.0',
          '@upup/pi-config': '0.1.0',
          '@upup/pi-cache': '0.1.0',
          '@upup/pi-notify': '0.1.0',
          '@upup/pi-investment-workflow': '0.1.0',
          '@upup/pi-management': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: {
          '@upup/pi-finance-sdk': ['builtin:upup'],
          '@upup/pi-market-data': ['builtin:upup'],
          '@upup/pi-investment-analysis': ['builtin:upup'],
          '@upup/pi-risk': ['builtin:upup'],
      '@upup/pi-portfolio': ['builtin:upup'],
          '@upup/pi-backtest': ['builtin:upup'],
          '@upup/pi-platform': ['builtin:upup'],
          '@upup/pi-research': ['builtin:upup'],
          '@upup/pi-browser': ['builtin:upup'],
          '@upup/pi-config': ['builtin:upup'],
          '@upup/pi-cache': ['builtin:upup'],
          '@upup/pi-notify': ['builtin:upup'],
          '@upup/pi-investment-workflow': ['builtin:upup'],
          '@upup/pi-management': ['builtin:upup'],
        },
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
