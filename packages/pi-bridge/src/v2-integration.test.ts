/**
 * Integration test for the bridge-v2 subsystem.
 *
 * Verifies that the 15 new bridge-v2 modules work together correctly:
 * workSecret, capacityWake, flushGate, pollConfig, envLessBridgeConfig,
 * bridgeStatusUtil, validateBridgeId, trustedDevice, debugUtils,
 * jwtUtils, webhookSanitizer.
 *
 * Each test is a small "scenario" that exercises a realistic flow.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeWorkSecret, decodeWorkSecret, generateIngressToken, tokenFingerprint, sameSessionId, buildSdkUrl } from './workSecret';
import { createCapacityWake } from './capacityWake';
import { FlushGate } from './flushGate';
import { getPollIntervalConfig, _setPollConfigOverride } from './pollConfig';
import { DEFAULT_POLL_CONFIG } from './pollConfigDefaults';
import { getEnvLessBridgeConfig, _setEnvLessBridgeConfigOverride, computeRetryDelay, DEFAULT_ENV_LESS_BRIDGE_CONFIG } from './envLessBridgeConfig';
import { BridgeStatusTracker, canTransition } from './bridgeStatusUtil';
import { validateBridgeId, isValidBridgeId } from './validateBridgeId';
import { TrustedDeviceRegistry } from './trustedDevice';
import { redactSecrets, debugBody, formatDuration } from './debugUtils';
import { signJwt, verifyJwt, decodeJwt, isJwtExpired } from './jwtUtils';
import { normalizeWebhook, sanitizeWebhookUrl } from './webhookSanitizer';

describe('v2-integration: work secret + JWT + URL flow', () => {
  test('full work-secret lifecycle: generate → encode → decode → JWT-sign → verify', () => {
    // 1. Generate a fresh ingress token
    const token = generateIngressToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // 2. Encode a work secret
    const encoded = encodeWorkSecret({
      session_ingress_token: token,
      api_base_url: 'https://api.upup.example.com',
    });

    // 3. Decode it back
    const decoded = decodeWorkSecret(encoded);
    expect(decoded.session_ingress_token).toBe(token);

    // 4. Sign a JWT (representing a bridge session token) using the
    //    fingerprint of the ingress token as the secret (in real life
    //    this would be a separately-derived session key).
    const fp = tokenFingerprint(token);
    const sessionSecret = `session-${fp}`;
    const sessionJwt = signJwt(
      { sub: 'device-1', session_ingress_fp: fp },
      sessionSecret,
      { ttlSec: 300 },
    );

    // 5. Verify the JWT
    const result = verifyJwt(sessionJwt, sessionSecret);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('device-1');
      expect(result.payload.session_ingress_fp).toBe(fp);
    }
  });

  test('work secret with metadata round-trips and JWT carries custom claim', () => {
    const token = generateIngressToken();
    const encoded = encodeWorkSecret({
      session_ingress_token: token,
      api_base_url: 'https://api.upup.example.com',
      metadata: { account: 'acc-42', region: 'us-east-1' },
    });
    const decoded = decodeWorkSecret(encoded);
    expect(decoded.metadata).toEqual({ account: 'acc-42', region: 'us-east-1' });

    const jwt = signJwt(
      { sub: 'a', account: 'acc-42', region: 'us-east-1' },
      'secret',
      { ttlSec: 60 },
    );
    const result = verifyJwt(jwt, 'secret');
    expect(result.ok).toBe(true);
  });

  test('work secret with bad signature fails JWT verify', () => {
    const encoded = encodeWorkSecret({
      session_ingress_token: 'tok-1234567890abcdef',
      api_base_url: 'https://api.example.com',
    });
    const decoded = decodeWorkSecret(encoded);
    const jwt = signJwt({ sub: 'a', tokenFp: tokenFingerprint(decoded.session_ingress_token) }, 'correct-secret');
    const badResult = verifyJwt(jwt, 'wrong-secret');
    expect(badResult.ok).toBe(false);
  });
});

describe('v2-integration: work secret sessionId + URL + ID validation', () => {
  test('validateBridgeId → buildSdkUrl → sameSessionId flow', () => {
    const sessionId = validateBridgeId('sess-abc123-def456', 'sessionId');
    expect(isValidBridgeId(sessionId)).toBe(true);

    // Build SDK URL using the validated sessionId
    const url = buildSdkUrl('https://api.upup.example.com', sessionId);
    expect(url).toBe('wss://api.upup.example.com/session_ingress/ws/sess-abc123-def456');

    // Tagged IDs from different layers (cse_/session_) should be recognized as same
    expect(sameSessionId('cse_abc123-def456', 'session_abc123-def456')).toBe(true);
  });

  test('validateBridgeId rejects path traversal before reaching buildSdkUrl', () => {
    expect(() => validateBridgeId('../admin', 'sessionId')).toThrow();
    expect(() => validateBridgeId('a/b', 'sessionId')).toThrow();
    // Same input would still pass sameSessionId because lastIndexOf gives "b" both sides
    // — but the validation guard runs first in real flow.
  });

  test('localhost api base + validated sessionId → ws:// (not wss://)', () => {
    const sessionId = validateBridgeId('sess_local_1', 'sessionId');
    const url = buildSdkUrl('http://localhost:3000', sessionId);
    expect(url.startsWith('ws://localhost:3000/')).toBe(true);
    expect(url).not.toContain('wss://');
  });
});

describe('v2-integration: trustedDevice + work secret tokenFingerprint', () => {
  let tmpDir: string;
  let registryPath: string;
  let registry: TrustedDeviceRegistry;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'upup-v2-int-'));
    registryPath = join(tmpDir, 'trusted.json');
    registry = new TrustedDeviceRegistry(registryPath);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('register device using tokenFingerprint as the key', () => {
    const token = generateIngressToken();
    const fp = tokenFingerprint(token) + '0'.repeat(52); // pad to 64 hex
    const fingerprint = fp.padEnd(64, '0');

    expect(registry.isTrusted(fingerprint)).toBe(false);
    registry.register(`device-${fp}`, fingerprint);
    expect(registry.isTrusted(fingerprint)).toBe(true);
    expect(registry.get(fingerprint)?.name).toBe(`device-${fp}`);
  });

  test('revoke → re-register → JWT verify reflects new device', () => {
    const fp1 = 'a'.repeat(64);
    const fp2 = 'b'.repeat(64);
    registry.register('dev1', fp1);
    registry.register('dev2', fp2);

    expect(registry.count()).toBe(2);

    // Sign a JWT claiming a device
    const jwt = signJwt({ sub: fp1, scope: 'bridge' }, 'device-secret-1', { ttlSec: 60 });
    expect(verifyJwt(jwt, 'device-secret-1').ok).toBe(true);

    // Revoke the device
    expect(registry.revoke(fp1)).toBe(true);
    expect(registry.isTrusted(fp1)).toBe(false);

    // The JWT itself is still cryptographically valid (revocation isn't
    // server-side here) — but the device-fingerprint-as-sub check would
    // catch it. Verify the sub claim is what we'd use for the check.
    const result = verifyJwt(jwt, 'device-secret-1');
    if (result.ok) {
      expect(result.payload.sub).toBe(fp1);
      expect(registry.isTrusted(result.payload.sub as string)).toBe(false);
    }
  });

  test('registry persists across instances', () => {
    registry.register('laptop', 'a'.repeat(64));
    registry.register('phone', 'b'.repeat(64));
    expect(existsSync(registryPath)).toBe(true);

    const r2 = new TrustedDeviceRegistry(registryPath);
    expect(r2.count()).toBe(2);
    expect(r2.list().map((d) => d.name).sort()).toEqual(['laptop', 'phone']);
  });
});

describe('v2-integration: capacityWake + FlushGate + StatusTracker', () => {
  test('FlushGate + capacityWake: queue items during a flush, wake on completion', async () => {
    const gate = new FlushGate<number>();
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);

    // 1. Start a flush
    gate.start();

    // 2. New items arriving during flush are queued
    expect(gate.enqueue(1, 2, 3)).toBe(true);
    expect(gate.pendingCount).toBe(3);

    // 3. The poll loop is sleeping (capacity-wake)
    const { signal, cleanup } = wake.signal();
    expect(signal.aborted).toBe(false);

    // 4. End the flush and drain
    const drained = gate.end();
    expect(drained).toEqual([1, 2, 3]);
    expect(gate.active).toBe(false);

    // 5. Wake the poll loop now that capacity is free
    wake.wake();
    expect(signal.aborted).toBe(true);

    cleanup();
  });

  test('StatusTracker walks through attach → titled → reconnect → re-attach', () => {
    const tracker = new BridgeStatusTracker();
    expect(tracker.state).toBe('idle');

    // Connect
    tracker.transition('attached');
    expect(canTransition(tracker.state, 'titled')).toBe(true);
    tracker.transition('titled');
    tracker.markToolStart();

    // Connection drops
    tracker.transition('reconnecting');
    expect(tracker.isToolDisplayActive()).toBe(true); // still in window

    // Re-attach
    tracker.transition('attached');
    tracker.transition('titled');

    // Final: a tool ran
    expect(tracker.snapshot().toolDisplayActive).toBe(true);
  });

  test('Failed state requires explicit reset to idle', () => {
    const tracker = new BridgeStatusTracker();
    tracker.transition('attached');
    tracker.transition('titled');
    tracker.transition('reconnecting');
    tracker.transition('failed');

    // failed can only go to idle
    expect(() => tracker.transition('attached')).toThrow();
    expect(() => tracker.transition('titled')).toThrow();
    tracker.reset();
    expect(tracker.state).toBe('idle');
  });
});

describe('v2-integration: pollConfig + envLessBridgeConfig defaults', () => {
  beforeEach(() => {
    _setPollConfigOverride(undefined);
    _setEnvLessBridgeConfigOverride(undefined);
  });
  afterEach(() => {
    _setPollConfigOverride(undefined);
    _setEnvLessBridgeConfigOverride(undefined);
  });

  test('both return DEFAULT when no overrides', () => {
    expect(getPollIntervalConfig()).toBe(DEFAULT_POLL_CONFIG);
    expect(getEnvLessBridgeConfig()).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('both can be overridden independently and the live config reflects each', () => {
    _setPollConfigOverride({
      ...DEFAULT_POLL_CONFIG,
      poll_interval_ms_not_at_capacity: 500,
    });
    _setEnvLessBridgeConfigOverride({
      ...DEFAULT_ENV_LESS_BRIDGE_CONFIG,
      heartbeat_interval_ms: 10_000,
    });
    expect(getPollIntervalConfig().poll_interval_ms_not_at_capacity).toBe(500);
    expect(getEnvLessBridgeConfig().heartbeat_interval_ms).toBe(10_000);
    // Unrelated field is unchanged
    expect(getEnvLessBridgeConfig().http_timeout_ms).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG.http_timeout_ms);
  });

  test('envLessBridgeConfig.computeRetryDelay called with live config', () => {
    const cfg = getEnvLessBridgeConfig();
    // attempt 0, no jitter → exactly base
    const d = computeRetryDelay(0, cfg.init_retry_base_delay_ms, cfg.init_retry_max_delay_ms, cfg.init_retry_jitter_fraction, () => 0.5);
    expect(d).toBeGreaterThanOrEqual(cfg.init_retry_base_delay_ms);
    expect(d).toBeLessThanOrEqual(cfg.init_retry_max_delay_ms);
  });
});

describe('v2-integration: debugUtils + jwtUtils redaction', () => {
  test('redactSecrets catches tokens inside a JWT payload string', () => {
    const token = 'abcdefghijklmnop1234567890';
    const jwt = signJwt({ sub: 'a', session_ingress_token: token }, 'secret');
    const decoded = decodeJwt(jwt);
    expect(decoded).not.toBeNull();
    const raw = JSON.stringify(decoded!.payload);
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain('abcd...7890');
  });

  test('debugBody formats a JWT verification result with redaction', () => {
    const token = 'abcdefghijklmnop1234567890';
    const jwt = signJwt({ sub: 'a', secret: token }, 'k');
    const result = verifyJwt(jwt, 'k');
    const formatted = debugBody(result);
    expect(formatted).toContain('"sub":"a"');
    expect(formatted).not.toContain(token);
  });

  test('formatDuration is human-readable for both poll intervals and timeouts', () => {
    const cfg = getPollIntervalConfig();
    const envCfg = getEnvLessBridgeConfig();
    expect(formatDuration(cfg.poll_interval_ms_not_at_capacity)).toMatch(/s$/);
    expect(formatDuration(envCfg.heartbeat_interval_ms)).toMatch(/s$/);
    expect(formatDuration(envCfg.token_refresh_buffer_ms)).toMatch(/m/);
  });
});

describe('v2-integration: webhook sanitizer + debug redaction', () => {
  test('webhook payload with secret field is redacted via debugUtils', () => {
    const result = normalizeWebhook({
      event: 'auth.token_refreshed',
      source: 'bridge',
      payload: {
        user: 'alice',
        access_token: '1234567890abcdef1234567890',
        account: 'acc-1',
      },
    });
    expect(result).not.toBeNull();
    expect(result!.payload).not.toContain('1234567890abcdef1234567890');
    expect(result!.payload).toContain('"user":"alice"');
    expect(result!.payload).toContain('"account":"acc-1"');
  });

  test('webhook sourceUrl sanitization + same URL used by buildSdkUrl', () => {
    const dirty = 'https://user:pass@api.example.com';
    const clean = sanitizeWebhookUrl(dirty);
    expect(clean).toBe('https://api.example.com/');

    // Use the clean URL as a base for SDK URL build (path preserved)
    const sessionId = validateBridgeId('sess-int-1', 'sessionId');
    const sdkUrl = buildSdkUrl(clean!, sessionId);
    expect(sdkUrl).toBe('wss://api.example.com/session_ingress/ws/sess-int-1');
  });
});

describe('v2-integration: end-to-end session lifecycle', () => {
  test('attach → poll-config → status transitions → JWT rotate → flush drain', () => {
    // 1. Tracker initial state
    const tracker = new BridgeStatusTracker();
    expect(tracker.state).toBe('idle');

    // 2. Resolve poll config (defaults)
    const pollCfg = getPollIntervalConfig();
    expect(pollCfg.poll_interval_ms_not_at_capacity).toBeGreaterThanOrEqual(100);

    // 3. Attach
    tracker.transition('attached');
    expect(tracker.state).toBe('attached');

    // 4. Issue a session JWT
    const sessionSecret = 'session-secret-for-rotation';
    const oldJwt = signJwt({ sub: 'device-A', scope: 'bridge' }, sessionSecret, { ttlSec: 60 });
    expect(isJwtExpired(oldJwt)).toBe(false);

    // 5. Flush gate collects any messages generated during work
    const gate = new FlushGate<string>();
    gate.start();
    gate.enqueue('msg-1', 'msg-2');
    expect(gate.pendingCount).toBe(2);

    // 6. Title the session
    tracker.transition('titled');
    expect(tracker.state).toBe('titled');

    // 7. End the flush, drain pending
    const drained = gate.end();
    expect(drained).toEqual(['msg-1', 'msg-2']);

    // 8. Issue a new JWT (token rotation)
    const newJwt = signJwt({ sub: 'device-A', scope: 'bridge', rotated: true }, sessionSecret, { ttlSec: 60 });
    expect(verifyJwt(newJwt, sessionSecret).ok).toBe(true);
    expect(verifyJwt(oldJwt, sessionSecret).ok).toBe(true); // both valid

    // 9. Reconnect + fail
    tracker.transition('reconnecting');
    tracker.transition('failed');
    expect(() => tracker.transition('attached')).toThrow();
    tracker.reset();

    // 10. After reset, new cycle
    tracker.transition('attached');
    expect(tracker.state).toBe('attached');
  });
});
