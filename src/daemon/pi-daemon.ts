import { Supervisor } from './supervisor.js';
import type { PiUpupExtensionApi } from '../pi-main.js';

/**
 * The daemon extension registers against the upup extension contract —
 * the same `PiUpupExtensionApi` shape the Pi Fake API implements. See
 * `src/realtime/pi-realtime.ts` for the rationale behind the narrow contract.
 */
export type DaemonExtensionApi = PiUpupExtensionApi;

export function registerDaemonExtension(pi: PiUpupExtensionApi): void {
  const supervisor = new Supervisor();

  pi.registerTool({
    name: 'daemon_stats',
    label: 'Daemon Stats',
    description: 'Show daemon supervisor queue and worker stats',
    async execute() {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(supervisor.getStats()),
          },
        ],
      };
    },
  });

  pi.registerCommand('daemon', {
    description: 'Start the daemon supervisor',
    handler: async () => {
      await supervisor.start();
    },
  });
}