/**
 * @upup/pi-bridge - Pi Native device bridge transport.
 *
 * Public surface for the UpUp bridge transport that fans out messages
 * between paired devices and the Pi-native AgentSession runtime. All
 * bridge runtime configuration is injected through the gateway config
 * runtime port (`getGatewayConfigRuntime`) so the package never reads
 * root utils directly.
 */
export {
  PROTOCOL_VERSION,
  encodeMessage,
  decodeMessage,
  signMessage,
  verifyMessage,
  type BridgeMessage,
} from './protocol.js';
export {
  BridgeAuth,
  type BridgeAuthConfig,
  type VerifyResult,
  type RateLimitResult,
} from './auth.js';
export {
  BridgeSessionStore,
  type BridgeSession,
  type SessionStatus,
} from './session.js';
export {
  SessionSync,
  serializeSession,
  deserializeSession,
  sessionHash,
  type SessionState,
  type SessionSyncOptions,
} from './session-sync.js';
export {
  redactSecrets,
  debugTruncate,
  debugBody,
  formatDuration,
} from './debugUtils.js';
export {
  validatePollConfig,
  getPollIntervalConfig,
  _setPollConfigOverride,
} from './pollConfig.js';
export type { PollIntervalConfig } from './pollConfigDefaults.js';
export {
  DEFAULT_POLL_CONFIG,
} from './pollConfigDefaults.js';
export {
  validateEnvLessBridgeConfig,
  getEnvLessBridgeConfig,
  _setEnvLessBridgeConfigOverride,
  computeRetryDelay,
  DEFAULT_ENV_LESS_BRIDGE_CONFIG,
  type EnvLessBridgeConfig,
} from './envLessBridgeConfig.js';
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
} from './jwtUtils.js';
export {
  MAX_WEBHOOK_PAYLOAD_BYTES,
  normalizeWebhook,
  sanitizeWebhookUrl,
  type NormalizedWebhook,
  type SanitizeWebhookInput,
} from './webhookSanitizer.js';
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
} from './workSecret.js';
export {
  validateBridgeId,
  isValidBridgeId,
  _MAX_BRIDGE_ID_LENGTH,
  _SAFE_BRIDGE_ID_PATTERN,
} from './validateBridgeId.js';
export {
  FlushGate,
} from './flushGate.js';
export {
  canTransition,
  nextStates,
  abbreviateActivity,
  timestamp,
  BridgeStatusTracker,
  TOOL_DISPLAY_EXPIRY_MS,
  type StatusState,
  type BridgeStatusSnapshot,
} from './bridgeStatusUtil.js';
export {
  createCapacityWake,
  type CapacitySignal,
  type CapacityWake,
} from './capacityWake.js';
export {
  TRUSTED_DEVICE_REGISTRY_VERSION,
  generateDeviceFingerprint,
  TrustedDeviceRegistry,
  TrustedDeviceRegistryError,
  type TrustedDeviceRecord,
  type TrustedDeviceRegistryData,
} from './trustedDevice.js';
export {
  jsonResponse,
  startBridgeServer,
  verifyBridgeToken,
  type BridgeServer,
  type BridgeServerConfig,
} from './server.js';
export {
  startBridgeClient,
  type BridgeClient,
  type BridgeClientOptions,
} from './client.js';
