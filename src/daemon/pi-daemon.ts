import type { PiUpupExtensionApi } from '../pi-main.js';
import { daemonStatsTool } from './pi-daemon-stats-tool.js';

/**
 * The daemon extension registers against the upup extension contract —
 * the same `PiUpupExtensionApi` shape the Pi Fake API implements. See
 * `src/realtime/pi-realtime.ts` for the rationale behind the narrow contract.
 */
export type DaemonExtensionApi = PiUpupExtensionApi;

/**
 * Register the daemon extension against the supplied Pi extension API.
 *
 * The migrated `daemon_stats` tool is a real Pi `ToolDefinition` built with
 * `defineTool()` and a TypeBox schema — see `pi-daemon-stats-tool.ts`. This
 * is the prototype for migrating all 296 upup tools to pi's strict shape;
 * the command below still uses the historic loose shape because `daemon`
 * has no schema and no pi-runtime constraints.
 */
export function registerDaemonExtension(pi: PiUpupExtensionApi): void {
  pi.registerTool(daemonStatsTool);

  pi.registerCommand('daemon', {
    description: 'Start the daemon supervisor',
    handler: async () => {
      // Daemon supervisor boot is handled at the runtime layer; the
      // command intentionally does no work here under the fake api.
    },
  });
}
