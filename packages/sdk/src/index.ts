/**
 * UpUp SDK — public entry point.
 *
 * Hosts (TradingAgents, Claude Code, Codex, custom IDE) import
 * `{ createUpUpSession, UPUP_SDK_PROFILES, type UpUpSessionHandle }` from
 * here. The full surface is intentionally small so that Pi minor upgrades
 * never break the host.
 *
 * Re-exports:
 *   - `createUpUpSession(options, runtime?)`  ← async create + handle
 *   - `UPUP_SDK_PROFILES`                     ← 7 canonical agent specs
 *   - `resolveUpUpSpec(profileOrSpec?)`       ← helper to resolve short-hands
 *   - `UpUpSessionHandle`                     ← public type
 *   - `UpUpSessionOptions`                    ← public options type
 *   - `UpUpAgentProfile`                      ← profile name union
 *   - `UpUpSessionEvent`                      ← 9 SDK-level event types
 */

export {
  createUpUpSession,
} from './create-session';

export {
  UPUP_SDK_PROFILES,
  resolveUpUpSpec,
} from './default-specs';

export {
  UpUpEventStream,
} from './event-stream';

export {
  createUpUpSessionHandle,
  type CreateUpUpSessionRuntime,
} from './handle';

export type {
  UpUpSessionHandle,
  UpUpSessionOptions,
  UpUpPromptOptions,
  UpUpSessionEvent,
  UpUpAgentProfile,
  UpUpSessionAdapter,
} from './types';
