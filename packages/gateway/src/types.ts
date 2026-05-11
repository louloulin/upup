/**
 * UpUp Gateway System — Types
 *
 * Channel interfaces, routing types, and session management types.
 */

// ============================================================================
// Channel Types
// ============================================================================

/**
 * Channel type
 */
export type ChannelType = 'whatsapp' | 'telegram' | 'slack' | 'web';

/**
 * Channel plugin interface
 */
export interface ChannelPlugin<Config = unknown, Runtime = unknown> {
  name: string;
  initialize(config: Config): Promise<void>;
  start(): Promise<Runtime>;
  stop(): Promise<void>;
  send(to: string, message: string): Promise<void>;
}

/**
 * Channel runtime snapshot
 */
export interface ChannelRuntimeSnapshot {
  name: string;
  isConnected: boolean;
  connectedAt?: number;
  messageCount: number;
  errorCount: number;
}

/**
 * Channel status
 */
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================================================
// Inbound Message Types
// ============================================================================

/**
 * Inbound context - message metadata
 */
export interface InboundContext {
  channel: ChannelType;
  accountId: string;
  from: string;
  to: string;
  chatType: 'direct' | 'group';
  body: string;
  senderName?: string;
  senderId?: string;
  messageId?: string;
  timestamp?: number;
}

/**
 * Inbound message
 */
export interface InboundMessage {
  id: string;
  context: InboundContext;
  text: string;
  raw?: unknown;
}

// ============================================================================
// Outbound Message Types
// ============================================================================

/**
 * Outbound message
 */
export interface OutboundMessage {
  to: string;
  body: string;
  mentions?: string[];
  replyTo?: string;
}

/**
 * Send result
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Route type
 */
export type RouteType = 'command' | 'query' | 'event' | 'unknown';

/**
 * Route resolution result
 */
export interface RouteResolution {
  type: RouteType;
  pattern?: string;
  handler?: string;
  params?: Record<string, string>;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session metadata
 */
export interface SessionMeta {
  id: string;
  accountId: string;
  userId: string;
  chatType: 'direct' | 'group';
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  approvedTools?: string[];
}

/**
 * Session store interface
 */
export interface SessionStore {
  get(sessionId: string): Promise<SessionMeta | null>;
  set(sessionId: string, meta: SessionMeta): Promise<void>;
  delete(sessionId: string): Promise<void>;
  list(accountId?: string): Promise<SessionMeta[]>;
}

// ============================================================================
// Access Control Types
// ============================================================================

/**
 * Access policy
 */
export type AccessPolicy = 'allow' | 'deny' | 'prompt';

/**
 * Access control entry
 */
export interface AccessControlEntry {
  phoneNumber: string;
  policy: AccessPolicy;
  addedAt: number;
  addedBy?: string;
}

/**
 * Pairing request
 */
export interface PairingRequest {
  phoneNumber: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'denied';
}

// ============================================================================
// Group Types
// ============================================================================

/**
 * Group context
 */
export interface GroupContext {
  groupId: string;
  groupName?: string;
  members: string[];
  botMemberId?: string;
}

/**
 * Group message history entry
 */
export interface GroupHistoryEntry {
  senderId: string;
  senderName?: string;
  message: string;
  timestamp: number;
  mentions?: string[];
}