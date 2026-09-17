import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * UpUp investment slash commands registered into Pi's native slash-command
 * surface (`ExtensionAPI.registerCommand`).
 *
 * Sprint 1/7 cleanup (Pi Native migration): UpUp used to ship its own
 * `@upup/commands` registry (aliases, fuzzy matching, usage tracking, JSX
 * command rendering) and re-implemented `/model`, `/session`, `/compact`,
 * `/fork`, `/resume`, `/theme`, `/permissions`… Pi's built-in slash commands
 * (`core/slash-commands.ts`) already cover all of those, so the whole
 * framework was deleted. What remains here is the UpUp-specific investment
 * command family, which Pi cannot know about.
 *
 * The command catalog is injected at boot from
 * `@upup/pi-investment-workflow`'s `INVESTMENT_COMMANDS` registry — the single
 * source of truth for names, aliases and descriptions. The static
 * `DEFAULT_FINANCE_COMMAND_CATALOG` below is the fail-safe used when the
 * extension is loaded standalone (e.g. a Pi package installed without UpUp's
 * boot wiring); it must stay in sync with the registry, and
 * `extensions/commands.test.ts` guards the drift.
 */

export interface PiFinanceCommandDescriptor {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description?: string;
}

/**
 * Fail-safe catalog. Mirrors `INVESTMENT_COMMANDS` in
 * `@upup/pi-investment-workflow/src/registry.ts`.
 */
export const DEFAULT_FINANCE_COMMAND_CATALOG: readonly PiFinanceCommandDescriptor[] = [
  { name: 'invest', aliases: ['inv'], description: 'Run the canonical five-phase investment workflow (detect → plan → execute → verify → report).' },
  { name: 'dossier', aliases: ['doss'], description: 'Build or review the one-page investment dossier for a ticker.' },
  { name: 'strategy', aliases: ['strat'], description: 'Browse, create, publish or audit investment strategies.' },
  { name: 'risk-dashboard', aliases: ['risk'], description: 'Show the investment risk dashboard for active plans and watchlists.' },
  { name: 'portfolio-review', aliases: ['review', 'pr'], description: 'Review the portfolio against recent completed plans.' },
  { name: 'morning-brief', aliases: ['mb', 'brief'], description: 'Print the morning brief: today’s plan, watchlist and audit trail.' },
  { name: 'earnings-preview', aliases: ['ep', 'earnings'], description: 'Build an earnings preview framework for a ticker.' },
  { name: 'watchlist-edit', aliases: ['wl', 'watchlist'], description: 'Add, remove or list watchlist entries.' },
  { name: 'screen', aliases: ['scr'], description: 'Screen the market from a natural-language filter.' },
  { name: 'sop', aliases: ['sops'], description: 'Manage SOP methodologies: list / show / check / install <source> / new <id> (installs land in $UPUP_HOME/sops).' },
];

/** Back-compat export: the canonical command names (no aliases). */
export const PI_FINANCE_COMMANDS: readonly string[] = DEFAULT_FINANCE_COMMAND_CATALOG.map((entry) => entry.name);

const COMMAND_INTENTS: Readonly<Record<string, string>> = {
  invest: 'Run the UpUp investment workflow',
  dossier: 'Build or review the investment dossier',
  strategy: 'Review or design the investment strategy',
  'risk-dashboard': 'Analyze the investment risk dashboard',
  'portfolio-review': 'Review the investment portfolio',
  'morning-brief': 'Print the morning brief',
  'earnings-preview': 'Prepare the earnings preview',
  'watchlist-edit': 'Edit the investment watchlist',
  screen: 'Screen the market from a natural-language filter',
  sop: 'Manage the SOP methodology catalog (list / show / install / new)',
};

// The runners + accessors live in `../src/index` so they get a proper
// `.d.ts` declaration (the extensions/ subtree is bundled by `bun build`,
// not emitted by `tsc`).
import {
  setPiFinanceCommandRunners,
  getPiFinanceCommandRunners,
  type PiFinanceCommandRunner,
} from '../src/index';

export { setPiFinanceCommandRunners, getPiFinanceCommandRunners, type PiFinanceCommandRunner };

function resolveCatalog(): readonly PiFinanceCommandDescriptor[] {
  const injected = getPiFinanceCommandRunners().commands;
  return injected && injected.length > 0 ? injected : DEFAULT_FINANCE_COMMAND_CATALOG;
}

/**
 * Real Pi-native investment command wiring.
 *
 * Each command drives the canonical `@upup/pi-investment-workflow` pipeline
 * through the runner injected at boot — the LLM is not on the critical path.
 * Invocations are recorded on the session (`upup_finance_command` /
 * `upup_finance_command_result`) so `verify:pi7-final` and the session log can
 * audit every run, and failures are surfaced fail-closed.
 */
export function registerPiFinanceCommands(
  pi: Pick<ExtensionAPI, 'registerCommand' | 'sendUserMessage' | 'appendEntry'>,
): string[] {
  const catalog = resolveCatalog();
  const registered: string[] = [];

  const bind = (commandName: string, canonicalName: string, description: string, isAlias: boolean): void => {
    pi.registerCommand(commandName, {
      description: isAlias ? `Alias for /${canonicalName} — ${description}` : `UpUp finance: ${description}`,
      handler: async (args) => {
        const suffix = args.trim();
        const intent = suffix ? `${COMMAND_INTENTS[canonicalName] ?? description} for ${suffix}.` : `${COMMAND_INTENTS[canonicalName] ?? description}.`;
        pi.appendEntry('upup_finance_command', {
          schema: 2,
          command: canonicalName,
          invocationName: commandName,
          args: suffix,
          workflow: 'invest',
          intent,
          recordedAt: new Date().toISOString(),
        });
        const { invest, generic } = getPiFinanceCommandRunners();
        const runner = canonicalName === 'invest' ? invest : generic;
        if (!runner) {
          pi.appendEntry('upup_finance_command_result', {
            schema: 2,
            command: canonicalName,
            invocationName: commandName,
            args: suffix,
            ok: false,
            error: 'investment workflow runner not registered; call setPiFinanceCommandRunners() at boot',
            recordedAt: new Date().toISOString(),
          });
          pi.sendUserMessage(`/${commandName} unavailable: investment workflow runner is not registered (run \`upup doctor\` to verify Pi package manifest).`);
          return;
        }
        try {
          const text = canonicalName === 'invest'
            ? await invest!(suffix)
            : await generic!(canonicalName, suffix);
          pi.appendEntry('upup_finance_command_result', {
            schema: 2,
            command: canonicalName,
            invocationName: commandName,
            args: suffix,
            ok: true,
            recordedAt: new Date().toISOString(),
          });
          if (text) {
            pi.sendUserMessage(`/${commandName}${suffix ? ' ' + suffix : ''} (Pi finance workflow)\n\n${text}`);
          }
        } catch (error) {
          pi.appendEntry('upup_finance_command_result', {
            schema: 2,
            command: canonicalName,
            invocationName: commandName,
            args: suffix,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            recordedAt: new Date().toISOString(),
          });
          pi.sendUserMessage(`/${commandName} failed (fail-closed): ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    });
    registered.push(commandName);
  };

  for (const entry of catalog) {
    const description = entry.description ?? `UpUp finance: ${COMMAND_INTENTS[entry.name] ?? entry.name}`;
    bind(entry.name, entry.name, description, false);
    for (const alias of entry.aliases ?? []) {
      if (alias === entry.name) continue;
      bind(alias, entry.name, description, true);
    }
  }

  return registered;
}
