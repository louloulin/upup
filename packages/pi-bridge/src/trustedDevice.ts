/**
 * Trusted device registry for bridge (remote-control) sessions.
 *
 * An additional RBAC layer on top of the bridge auth token: even if a
 * token is leaked, only fingerprints pre-registered in this file are
 * accepted for elevated operations (e.g. archive, settings changes).
 *
 * Storage: a single JSON file at `registryPath` (typically
 * `~/.upup/trusted-devices.json`). Format:
 *   { version: 1, devices: { [fingerprint]: { name, registeredAt } } }
 *
 * Generation: `generateDeviceFingerprint()` returns a 32-byte random
 * hex string. The CLI registers its fingerprint on first install
 * (`upup bridge trust <name>`), the registry is then used at
 * request time to gate elevated operations.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const TRUSTED_DEVICE_REGISTRY_VERSION = 1 as const;

export interface TrustedDeviceRecord {
  name: string;
  registeredAt: number;
}

export interface TrustedDeviceRegistryData {
  version: typeof TRUSTED_DEVICE_REGISTRY_VERSION;
  devices: Record<string, TrustedDeviceRecord>;
}

export class TrustedDeviceRegistryError extends Error {
  constructor(message: string) {
    super(`trustedDevice: ${message}`);
    this.name = 'TrustedDeviceRegistryError';
  }
}

/** Generate a 32-byte random device fingerprint, returned as 64-char hex. */
export function generateDeviceFingerprint(): string {
  return randomBytes(32).toString('hex');
}

export class TrustedDeviceRegistry {
  private data: TrustedDeviceRegistryData;

  constructor(private readonly registryPath: string) {
    this.data = this.load();
  }

  private load(): TrustedDeviceRegistryData {
    if (!existsSync(this.registryPath)) {
      return { version: TRUSTED_DEVICE_REGISTRY_VERSION, devices: {} };
    }
    let text: string;
    try {
      text = readFileSync(this.registryPath, 'utf8');
    } catch (err) {
      throw new TrustedDeviceRegistryError(
        `cannot read ${this.registryPath}: ${(err as Error).message}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TrustedDeviceRegistryError(`invalid JSON in ${this.registryPath}`);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new TrustedDeviceRegistryError(
        `registry must be a JSON object, got ${typeof parsed}`,
      );
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== TRUSTED_DEVICE_REGISTRY_VERSION) {
      throw new TrustedDeviceRegistryError(
        `unsupported registry version ${String(obj.version)}`,
      );
    }
    if (!obj.devices || typeof obj.devices !== 'object' || Array.isArray(obj.devices)) {
      throw new TrustedDeviceRegistryError('registry.devices must be an object');
    }
    const devices = obj.devices as Record<string, unknown>;
    // Validate each record shape
    for (const [fp, rec] of Object.entries(devices)) {
      if (typeof fp !== 'string' || fp.length === 0) {
        throw new TrustedDeviceRegistryError('device fingerprint must be a non-empty string');
      }
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
        throw new TrustedDeviceRegistryError(`device ${fp} record must be an object`);
      }
      const r = rec as Record<string, unknown>;
      if (typeof r.name !== 'string' || r.name.length === 0) {
        throw new TrustedDeviceRegistryError(`device ${fp} name must be a non-empty string`);
      }
      if (typeof r.registeredAt !== 'number' || !Number.isFinite(r.registeredAt)) {
        throw new TrustedDeviceRegistryError(`device ${fp} registeredAt must be a finite number`);
      }
    }
    return {
      version: TRUSTED_DEVICE_REGISTRY_VERSION,
      devices: devices as Record<string, TrustedDeviceRecord>,
    };
  }

  private save(): void {
    const dir = dirname(this.registryPath);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        throw new TrustedDeviceRegistryError(
          `cannot create directory ${dir}: ${(err as Error).message}`,
        );
      }
    }
    try {
      writeFileSync(this.registryPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      throw new TrustedDeviceRegistryError(
        `cannot write ${this.registryPath}: ${(err as Error).message}`,
      );
    }
  }

  /** Register a device. Returns the fingerprint used (generated if not provided). */
  register(name: string, fingerprint?: string): string {
    if (typeof name !== 'string' || name.length === 0) {
      throw new TrustedDeviceRegistryError('name must be a non-empty string');
    }
    const fp = fingerprint ?? generateDeviceFingerprint();
    if (typeof fp !== 'string' || fp.length === 0) {
      throw new TrustedDeviceRegistryError('fingerprint must be a non-empty string');
    }
    this.data.devices[fp] = { name, registeredAt: Date.now() };
    this.save();
    return fp;
  }

  /** Returns true iff the fingerprint is registered. */
  isTrusted(fingerprint: string): boolean {
    return typeof fingerprint === 'string' && fingerprint in this.data.devices;
  }

  /** Return the record for a fingerprint, or null. */
  get(fingerprint: string): TrustedDeviceRecord | null {
    return this.data.devices[fingerprint] ?? null;
  }

  /** List all devices, sorted by name (stable for diffs). */
  list(): Array<{ fingerprint: string; name: string; registeredAt: number }> {
    return Object.entries(this.data.devices)
      .map(([fingerprint, rec]) => ({ fingerprint, ...rec }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Returns the number of registered devices. */
  count(): number {
    return Object.keys(this.data.devices).length;
  }

  /** Remove a device. Returns true if removed, false if not found. */
  revoke(fingerprint: string): boolean {
    if (!(fingerprint in this.data.devices)) return false;
    delete this.data.devices[fingerprint];
    this.save();
    return true;
  }

  /** Remove all devices. Returns the count removed. */
  revokeAll(): number {
    const n = Object.keys(this.data.devices).length;
    this.data.devices = {};
    this.save();
    return n;
  }
}
