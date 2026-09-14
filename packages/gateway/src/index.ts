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
export { runAgentForMessage, enqueueForSession, isSessionRunning } from './agent-runner.js';
export type { AgentRunRequest } from './agent-runner.js';
export { loadGatewayConfig, saveGatewayConfig, getGatewayConfigPath, listWhatsAppAccountIds, resolveWhatsAppAccount } from './config.js';
export type { GatewayConfig } from './config.js';
export { normalizeE164, isSelfChatMode, cleanMarkdownForWhatsApp, toWhatsappJid } from './utils.js';
export { buildHeartbeatQuery, loadHeartbeatDocument, isHeartbeatContentEmpty } from './heartbeat/prompt.js';
export { evaluateSuppression, HEARTBEAT_OK_TOKEN } from './heartbeat/suppression.js';
export type { SuppressionResult, SuppressionState } from './heartbeat/suppression.js';
export { resolveSessionStorePath, loadSessionStore, saveSessionStore, upsertSessionMeta } from './sessions/store.js';
export type { SessionEntry } from './sessions/store.js';
export { assertOutboundAllowed, sendComposing, sendMessageWhatsApp } from './channels/whatsapp/index.js';
export { startGateway } from './gateway.js';
export { registerGatewayAgentRuntime, registerGatewayConfigRuntime, registerGatewayCronRuntime } from './runtime-port.js';
export type { GatewayAgentRuntimePort, GatewayConfigRuntimePort, GatewayCronRuntimePort } from './runtime-port.js';
