import { Supervisor } from './supervisor.js';

export interface DaemonExtensionApi {
  registerTool(tool: {
    name: string;
    label?: string;
    description?: string;
    parameters?: unknown;
    execute?: (...args: any[]) => Promise<any> | any;
  }): void;
  registerCommand(name: string, options: { description?: string; handler?: (...args: any[]) => Promise<void> | void }): void;
}

export function registerDaemonExtension(pi: DaemonExtensionApi): void {
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
