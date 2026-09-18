/**
 * Pi Native App public surface — re-exports the factory and types from
 * `app-factory.ts` so external callers (`@upup/pi-cli-bootstrap`,
 * `index.test.ts`, every embedding host) keep importing from `./index`,
 * plus the `pi-native-cli` re-exports used by the transport adapters.
 *
 * `createPiApp` / `PiApp` / `PiAppOptions` live in `app-factory.ts` so
 * `default.ts` can construct the singleton without first importing from
 * `./index`; keeping them here would form a 4-node cycle with
 * `default.ts -> index.ts` plus the `pi-native-cli` re-export.
 */
export {
  createPiApp,
  type PiApp,
  type PiAppOptions,
  type PiAppSessionRuntimeFactory,
  type PiBackgroundRuntimePort,
  type PiEventStreamPort,
  type PiInvestmentWorkflow,
} from './app-factory';

// Re-exports for cross-platform exposure (`@upup/pi-cli-bootstrap` uses
// these to wire `upup rpc` and `upup json-stream` onto Pi's `--mode rpc`
// and `--mode json` transports without forking the TUI's argv parser).
export { runPiNativeCli, filterForwardablePiArgs, resolveUpupExtensionPaths } from './pi-native-cli';
export type { PiNativeRunCliOptions } from './pi-native-cli';
