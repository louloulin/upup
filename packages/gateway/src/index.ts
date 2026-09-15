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
} from './types';

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
} from './channel-types';
export { runAgentForMessage, enqueueForSession, isSessionRunning } from './agent-runner';
export type { AgentRunRequest } from './agent-runner';
export { loadGatewayConfig, saveGatewayConfig, getGatewayConfigPath, listWhatsAppAccountIds, resolveWhatsAppAccount } from './config';
export type { GatewayConfig } from './config';
export { normalizeE164, isSelfChatMode, cleanMarkdownForWhatsApp, toWhatsappJid } from './utils';
export { buildHeartbeatQuery, loadHeartbeatDocument, isHeartbeatContentEmpty } from './heartbeat/prompt';
export { evaluateSuppression, HEARTBEAT_OK_TOKEN } from './heartbeat/suppression';
export type { SuppressionResult, SuppressionState } from './heartbeat/suppression';
export { resolveSessionStorePath, loadSessionStore, saveSessionStore, upsertSessionMeta } from './sessions/store';
export type { SessionEntry } from './sessions/store';
export { assertOutboundAllowed, sendComposing, sendMessageWhatsApp } from './channels/whatsapp/index';
export { startGateway } from './gateway';
export type { GatewayAgentRuntimePort, GatewayConfigRuntimePort, GatewayCronRuntimePort, GatewayRuntime } from './runtime-port';
export { loginWhatsApp } from './channels/whatsapp/login';
export { runGatewayCli } from './cli';
