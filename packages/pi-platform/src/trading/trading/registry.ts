/**
 * Trading Broker Registry
 *
 * Central registry of BrokerAdapter implementations. Selects the active
 * broker via the UPUP_BROKER environment variable, with 'sandbox' as the
 * default. Live broker adapters (IBKR, Xueqiu) are wired in as stubs that
 * satisfy the interface; their network plumbing is broker-specific and lives
 * in their own files.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 */

import type { BrokerAdapter, BrokerConfig } from './types.js';
import { SandboxBroker } from './sandbox-engine.js';

export type BuiltinBrokerName = 'sandbox' | 'ibkr' | 'xueqiu';
export type BrokerName = string;

export const LIVE_TRADING_DISABLED_MESSAGE =
  'Live trading is disabled by default. Set UPUP_TRADING_MODE=live and UPUP_ALLOW_LIVE_TRADING=true only in an explicitly approved environment.';

export function isLiveTradingEnabled(): boolean {
  return process.env.UPUP_TRADING_MODE === 'live' && process.env.UPUP_ALLOW_LIVE_TRADING === 'true';
}

function assertLiveTradingEnabled(name: BrokerName): void {
  if (name !== 'sandbox' && !isLiveTradingEnabled()) {
    throw new Error(`${LIVE_TRADING_DISABLED_MESSAGE} Broker: ${name}`);
  }
}

const REGISTRY = new Map<BrokerName, (config?: BrokerConfig) => BrokerAdapter>();

export function registerBroker(
  name: BrokerName,
  factory: (config?: BrokerConfig) => BrokerAdapter,
): void {
  if (REGISTRY.has(name)) {
    throw new Error(`Broker "${name}" is already registered`);
  }
  REGISTRY.set(name, factory);
}

export function unregisterBroker(name: BrokerName): boolean {
  return REGISTRY.delete(name);
}

export function listBrokers(): BrokerName[] {
  return Array.from(REGISTRY.keys());
}

export function createBroker(
  name: BrokerName,
  config?: BrokerConfig,
): BrokerAdapter {
  const factory = REGISTRY.get(name);
  if (!factory) {
    const available = listBrokers().join(', ') || '(none)';
    throw new Error(
      `Broker "${name}" is not registered. Available: ${available}`,
    );
  }
  return config ? factory(config) : factory();
}

export function resolveActiveBroker(config?: BrokerConfig): BrokerAdapter {
  const name = process.env.UPUP_BROKER ?? 'sandbox';
  return createBroker(name, config);
}

registerBroker('sandbox', (config) => new SandboxBroker(config));

// Live broker adapters are loaded lazily to avoid pulling their (potentially
// heavy) deps into the default startup path. They throw at construction time
// until real HTTP/socket plumbing lands; the registry contract is what we
// exercise today.
registerBroker('ibkr', (config) => {
  // Synchronous wrapper around the async import to satisfy the factory
  // signature. The real adapter is constructed via the async loader below.
  throw new Error(
    'IBKR adapter loaded synchronously; use createBrokerAsync() for live brokers',
  );
});

registerBroker('xueqiu', (config) => {
  throw new Error(
    'Xueqiu adapter loaded synchronously; use createBrokerAsync() for live brokers',
  );
});

/**
 * Async variant for live broker construction. Sandbox stays sync; IBKR /
 * Xueqiu dynamic-import their adapter module so we don't load axios / ws
 * unless actually selected.
 */
export async function createBrokerAsync(
  name: BrokerName,
  config?: BrokerConfig,
): Promise<BrokerAdapter> {
  if (name !== 'sandbox' && name !== 'ibkr' && name !== 'xueqiu') {
    const available = listBrokers().join(', ') || '(none)';
    throw new Error(`Broker "${name}" is not registered. Available: ${available}`);
  }
  assertLiveTradingEnabled(name);
  if (name === 'sandbox') return createBroker('sandbox', config);

  switch (name) {
    case 'ibkr': {
      const { IbkrAdapter } = await import('./ibkr-adapter.js');
      return new IbkrAdapter(config);
    }
    case 'xueqiu': {
      const { XueqiuAdapter } = await import('./xueqiu-adapter.js');
      return new XueqiuAdapter(config);
    }
    default: {
      const available = listBrokers().join(', ') || '(none)';
      throw new Error(
        `Broker "${name}" is not registered. Available: ${available}`,
      );
    }
  }
}
