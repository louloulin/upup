/**
 * UpUp Gateway System — Channel Types
 *
 * WhatsApp and multi-channel interface types.
 */

// Re-export base types
export {
  type InboundContext,
  type InboundMessage,
  type OutboundMessage,
  type SendResult,
  type RouteResolution,
  type SessionMeta,
  type AccessControlEntry,
  type PairingRequest,
  type GroupContext,
  type GroupHistoryEntry,
} from './types.js';

// ============================================================================
// Channel Types (local)
// ============================================================================

export type ChannelId = 'whatsapp';

export type ChannelRuntimeSnapshot = {
  accountId: string;
  running: boolean;
  connected?: boolean;
  lastError?: string | null;
  lastStartAt?: number;
  lastStopAt?: number;
};

export type ChannelStartContext<TAccount> = {
  accountId: string;
  account: TAccount;
  abortSignal: AbortSignal;
  getStatus: () => ChannelRuntimeSnapshot;
  setStatus: (next: Partial<ChannelRuntimeSnapshot>) => ChannelRuntimeSnapshot;
};

export type ChannelStopContext<TAccount> = {
  accountId: string;
  account: TAccount;
  abortSignal: AbortSignal;
  getStatus: () => ChannelRuntimeSnapshot;
  setStatus: (next: Partial<ChannelRuntimeSnapshot>) => ChannelRuntimeSnapshot;
};

export type ChannelConfigAdapter<TConfig, TAccount> = {
  listAccountIds: (cfg: TConfig) => string[];
  resolveAccount: (cfg: TConfig, accountId: string) => TAccount;
  isEnabled?: (account: TAccount, cfg: TConfig) => boolean;
  isConfigured?: (account: TAccount, cfg: TConfig) => Promise<boolean> | boolean;
};

export type ChannelGatewayAdapter<TAccount> = {
  startAccount: (ctx: ChannelStartContext<TAccount>) => Promise<void>;
  stopAccount?: (ctx: ChannelStopContext<TAccount>) => Promise<void>;
};

export type ChannelPlugin<TConfig, TAccount> = {
  id: ChannelId;
  config: ChannelConfigAdapter<TConfig, TAccount>;
  gateway: ChannelGatewayAdapter<TAccount>;
  status?: {
    defaultRuntime?: ChannelRuntimeSnapshot;
  };
};

// ============================================================================
// WhatsApp Types
// ============================================================================

/**
 * WhatsApp account configuration
 */
export interface WhatsAppAccountConfig {
  enabled?: boolean;
  phoneNumber?: string;
  botName?: string;
  groupPolicy?: 'all' | 'whitelist' | 'denylist';
  groupAllowFrom?: string[];
}

/**
 * WhatsApp gateway configuration
 */
export interface WhatsAppGatewayConfig {
  enabled: boolean;
  account: WhatsAppAccountConfig;
}

/**
 * WhatsApp inbound message
 */
export interface WhatsAppInboundMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: unknown;
  messageTimestamp?: number;
  pushName?: string;
}

/**
 * WhatsApp close reason
 */
export type WhatsAppCloseReason =
  | 'forced'
  | 'invalid-session'
  | 'intentional'
  | 'initiated'
  | 'lost-socket'
  | 'network-change'
  | 'reason-initiated'
  | 'server-close'
  | 'unknown';