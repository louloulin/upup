import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export const PI_FINANCE_COMMANDS = [
  'invest',
  'dossier',
  'strategy',
  'risk-dashboard',
  'portfolio-review',
] as const;

const COMMAND_INTENTS: Readonly<Record<(typeof PI_FINANCE_COMMANDS)[number], string>> = {
  invest: 'Run the UpUp investment workflow',
  dossier: 'Build or review the investment dossier',
  strategy: 'Review or design the investment strategy',
  'risk-dashboard': 'Analyze the investment risk dashboard',
  'portfolio-review': 'Review the investment portfolio',
};

export function registerPiFinanceCommands(pi: Pick<ExtensionAPI, 'registerCommand' | 'sendUserMessage' | 'appendEntry'>): void {
  for (const name of PI_FINANCE_COMMANDS) {
    pi.registerCommand(name, {
      description: `UpUp finance: ${COMMAND_INTENTS[name].toLowerCase()}.`,
      handler: async (args) => {
        const suffix = args.trim();
        const intent = suffix ? `${COMMAND_INTENTS[name]} for ${suffix}.` : `${COMMAND_INTENTS[name]}.`;
        pi.appendEntry('upup_finance_command', {
          schema: 1,
          command: name,
          args: suffix,
          workflow: 'invest',
          intent,
          recordedAt: new Date().toISOString(),
        });
        pi.sendUserMessage(`${intent} Use the Pi finance tools, preserve evidence, state the as-of date, and follow the invest workflow policy.`);
      },
    });
  }
}
