/**
 * UpUp Gateway System
 *
 * WhatsApp integration, routing, and channel management types.
 */

// Core types
export {
  type ChannelType,
  type ChannelPlugin,
  type ChannelRuntimeSnapshot,
  type ChannelStatus,
  type InboundContext,
  type InboundMessage,
  type OutboundMessage,
  type SendResult,
  type RouteType,
  type RouteResolution,
  type SessionMeta,
  type SessionStore,
  type AccessPolicy,
  type AccessControlEntry,
  type PairingRequest,
  type GroupContext,
  type GroupHistoryEntry,
} from './types.js';

// Channel types
export {
  type ChannelId,
  type ChannelRuntimeSnapshot as ChannelSnapshot,
  type ChannelStartContext,
  type ChannelStopContext,
  type ChannelConfigAdapter,
  type ChannelGatewayAdapter,
  type ChannelPlugin as ChannelPluginDefinition,
  type WhatsAppAccountConfig,
  type WhatsAppGatewayConfig,
  type WhatsAppInboundMessage,
  type WhatsAppCloseReason,
} from './channel-types.js';