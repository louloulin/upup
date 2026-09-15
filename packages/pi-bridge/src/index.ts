/**
 * @upup/pi-bridge - Pi Native device bridge transport.
 *
 * Public surface for the UpUp bridge transport that fans out messages
 * between paired devices and the Pi-native AgentSession runtime. All
 * bridge runtime configuration is injected through the gateway config
 * runtime contract so the package never reads root utils directly.
 */
export {
  PROTOCOL_VERSION,
  encodeMessage,
  decodeMessage,
  signMessage,
  verifyMessage,
  type BridgeMessage,
} from './protocol';
export {
  BridgeAuth,
  type BridgeAuthConfig,
  type VerifyResult,
  type RateLimitResult,
} from './auth';
export {
  BridgeSessionStore,
  type BridgeSession,
  type SessionStatus,
} from './session';
export {
  SessionSync,
  serializeSession,
  deserializeSession,
  sessionHash,
  type SessionState,
  type SessionSyncOptions,
} from './session-sync';
export {
  redactSecrets,
  debugTruncate,
  debugBody,
  formatDuration,
} from './debugUtils';
export {
  validatePollConfig,
  getPollIntervalConfig,
  _setPollConfigOverride,
} from './pollConfig';
export type { PollIntervalConfig } from './pollConfigDefaults';
export {
  DEFAULT_POLL_CONFIG,
} from './pollConfigDefaults';
export {
  validateEnvLessBridgeConfig,
  getEnvLessBridgeConfig,
  _setEnvLessBridgeConfigOverride,
  computeRetryDelay,
  DEFAULT_ENV_LESS_BRIDGE_CONFIG,
  type EnvLessBridgeConfig,
} from './envLessBridgeConfig';
export {
  signJwt,
  verifyJwt,
  decodeJwt,
  decodeJwtExpiry,
  isJwtExpired,
  base64urlEncode,
  base64urlDecode,
  type JwtPayload,
  type DecodedJwt,
  type VerifyResult as JwtVerifyResult,
} from './jwtUtils';
export {
  MAX_WEBHOOK_PAYLOAD_BYTES,
  normalizeWebhook,
  sanitizeWebhookUrl,
  type NormalizedWebhook,
  type SanitizeWebhookInput,
} from './webhookSanitizer';
export {
  WORK_SECRET_VERSION,
  encodeWorkSecret,
  decodeWorkSecret,
  generateIngressToken,
  tokenFingerprint,
  sameSessionId,
  buildSdkUrl,
  type WorkSecretV1,
  type WorkSecretV1Input,
} from './workSecret';
export {
  validateBridgeId,
  isValidBridgeId,
  _MAX_BRIDGE_ID_LENGTH,
  _SAFE_BRIDGE_ID_PATTERN,
} from './validateBridgeId';
export {
  FlushGate,
} from './flushGate';
export {
  canTransition,
  nextStates,
  abbreviateActivity,
  timestamp,
  BridgeStatusTracker,
  TOOL_DISPLAY_EXPIRY_MS,
  type StatusState,
  type BridgeStatusSnapshot,
} from './bridgeStatusUtil';
export {
  createCapacityWake,
  type CapacitySignal,
  type CapacityWake,
} from './capacityWake';
export {
  TRUSTED_DEVICE_REGISTRY_VERSION,
  generateDeviceFingerprint,
  TrustedDeviceRegistry,
  TrustedDeviceRegistryError,
  type TrustedDeviceRecord,
  type TrustedDeviceRegistryData,
} from './trustedDevice';
export {
  jsonResponse,
  startBridgeServer,
  verifyBridgeToken,
  type BridgeServer,
  type BridgeServerConfig,
} from './server';
export {
  startBridgeClient,
  type BridgeClient,
  type BridgeClientOptions,
} from './client';
