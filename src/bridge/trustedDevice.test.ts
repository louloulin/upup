import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TrustedDeviceRegistry,
  TrustedDeviceRegistryError,
  generateDeviceFingerprint,
  TRUSTED_DEVICE_REGISTRY_VERSION,
} from './trustedDevice.js';

let tmpDir: string;
let registryPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'upup-trusted-'));
  registryPath = join(tmpDir, 'trusted-devices.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateDeviceFingerprint', () => {
  test('returns 64-char hex', () => {
    const fp = generateDeviceFingerprint();
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  test('two calls return different fingerprints', () => {
    expect(generateDeviceFingerprint()).not.toBe(generateDeviceFingerprint());
  });
});

describe('TrustedDeviceRegistry — empty / fresh', () => {
  test('registry file does not exist → starts empty', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(reg.count()).toBe(0);
    expect(reg.list()).toEqual([]);
  });

  test('isTrusted returns false for unknown', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(reg.isTrusted('unknown')).toBe(false);
  });

  test('get returns null for unknown', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(reg.get('unknown')).toBeNull();
  });
});

describe('TrustedDeviceRegistry — register', () => {
  test('register with auto-generated fingerprint', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    const fp = reg.register('laptop-home');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    expect(reg.isTrusted(fp)).toBe(true);
    expect(reg.count()).toBe(1);
  });

  test('register with explicit fingerprint', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    const fp = reg.register('phone', 'a'.repeat(64));
    expect(fp).toBe('a'.repeat(64));
    expect(reg.get(fp)?.name).toBe('phone');
  });

  test('register overwrites existing record with same fingerprint', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    const fp = 'b'.repeat(64);
    reg.register('old-name', fp);
    reg.register('new-name', fp);
    expect(reg.get(fp)?.name).toBe('new-name');
    expect(reg.count()).toBe(1);
  });

  test('register throws on empty name', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(() => reg.register('')).toThrow(TrustedDeviceRegistryError);
    expect(() => reg.register('', 'fp')).toThrow(TrustedDeviceRegistryError);
  });

  test('register throws on non-string fingerprint', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(() => reg.register('name', '' as unknown as string)).toThrow(
      TrustedDeviceRegistryError,
    );
  });

  test('registeredAt is a finite timestamp', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    const fp = reg.register('dev');
    const rec = reg.get(fp);
    expect(rec).not.toBeNull();
    expect(typeof rec!.registeredAt).toBe('number');
    expect(rec!.registeredAt).toBeGreaterThan(0);
    expect(rec!.registeredAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('TrustedDeviceRegistry — list / sort', () => {
  test('list returns sorted by name (stable for diffs)', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    reg.register('zebra', 'a'.repeat(64));
    reg.register('alpha', 'b'.repeat(64));
    reg.register('mango', 'c'.repeat(64));
    const list = reg.list();
    expect(list.map((d) => d.name)).toEqual(['alpha', 'mango', 'zebra']);
  });

  test('list is empty when no devices', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(reg.list()).toEqual([]);
  });
});

describe('TrustedDeviceRegistry — revoke', () => {
  test('revoke removes a registered device', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    const fp = reg.register('to-revoke');
    expect(reg.revoke(fp)).toBe(true);
    expect(reg.isTrusted(fp)).toBe(false);
    expect(reg.count()).toBe(0);
  });

  test('revoke returns false for unknown fingerprint', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(reg.revoke('not-here')).toBe(false);
  });

  test('revokeAll removes everything and returns count', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    reg.register('a', 'a'.repeat(64));
    reg.register('b', 'b'.repeat(64));
    reg.register('c', 'c'.repeat(64));
    const n = reg.revokeAll();
    expect(n).toBe(3);
    expect(reg.count()).toBe(0);
  });

  test('revokeAll on empty registry returns 0', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    expect(reg.revokeAll()).toBe(0);
  });
});

describe('TrustedDeviceRegistry — persistence', () => {
  test('writes to disk and re-reads correctly', () => {
    const r1 = new TrustedDeviceRegistry(registryPath);
    const fp1 = r1.register('laptop', 'a'.repeat(64));
    r1.register('phone', 'b'.repeat(64));
    expect(existsSync(registryPath)).toBe(true);

    const r2 = new TrustedDeviceRegistry(registryPath);
    expect(r2.count()).toBe(2);
    expect(r2.isTrusted(fp1)).toBe(true);
    expect(r2.get('a'.repeat(64))?.name).toBe('laptop');
  });

  test('rejects invalid registry file (not JSON)', () => {
    require('node:fs').writeFileSync(registryPath, 'not json', 'utf8');
    expect(() => new TrustedDeviceRegistry(registryPath)).toThrow(
      TrustedDeviceRegistryError,
    );
  });

  test('rejects registry with non-object root', () => {
    require('node:fs').writeFileSync(registryPath, '"a string"', 'utf8');
    expect(() => new TrustedDeviceRegistry(registryPath)).toThrow(
      TrustedDeviceRegistryError,
    );
  });

  test('rejects unsupported version', () => {
    require('node:fs').writeFileSync(
      registryPath,
      JSON.stringify({ version: 99, devices: {} }),
      'utf8',
    );
    expect(() => new TrustedDeviceRegistry(registryPath)).toThrow(/unsupported registry version 99/);
  });

  test('rejects devices that is not an object', () => {
    require('node:fs').writeFileSync(
      registryPath,
      JSON.stringify({ version: TRUSTED_DEVICE_REGISTRY_VERSION, devices: 'oops' }),
      'utf8',
    );
    expect(() => new TrustedDeviceRegistry(registryPath)).toThrow(/devices must be an object/);
  });

  test('rejects malformed device record (missing name)', () => {
    require('node:fs').writeFileSync(
      registryPath,
      JSON.stringify({ version: 1, devices: { fp1: { registeredAt: 1 } } }),
      'utf8',
    );
    expect(() => new TrustedDeviceRegistry(registryPath)).toThrow(/name must be a non-empty string/);
  });

  test('rejects malformed device record (bad registeredAt)', () => {
    require('node:fs').writeFileSync(
      registryPath,
      JSON.stringify({ version: 1, devices: { fp1: { name: 'a', registeredAt: 'now' } } }),
      'utf8',
    );
    expect(() => new TrustedDeviceRegistry(registryPath)).toThrow(/registeredAt must be a finite number/);
  });
});

describe('TrustedDeviceRegistry — write creates parent dir', () => {
  test('creates nested directory if missing', () => {
    const nestedPath = join(tmpDir, 'nested', 'subdir', 'reg.json');
    const reg = new TrustedDeviceRegistry(nestedPath);
    reg.register('a', 'a'.repeat(64));
    expect(existsSync(nestedPath)).toBe(true);
    const r2 = new TrustedDeviceRegistry(nestedPath);
    expect(r2.count()).toBe(1);
  });
});

describe('TrustedDeviceRegistry — error wrapping', () => {
  test('all errors are TrustedDeviceRegistryError', () => {
    const reg = new TrustedDeviceRegistry(registryPath);
    try {
      reg.register('');
    } catch (err) {
      expect(err).toBeInstanceOf(TrustedDeviceRegistryError);
      expect((err as Error).message).toMatch(/^trustedDevice:/);
    }
  });
});
