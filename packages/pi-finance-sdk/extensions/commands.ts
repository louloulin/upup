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

/**
 * Investment-command runners, injected by `@upup/pi-app` at boot.
 *
 * Why this exists: pi-finance-sdk's extension handler must drive the
 * canonical `@upup/pi-investment-workflow` five-phase pipeline instead
 * of the previous LLM prompt-nudge. But declaring a runtime edge
 * `pi-finance-sdk → pi-investment-workflow` (via `dependencies`,
 * `peerDependencies`, or `pi.dependencies`) induces a package cycle
 * because `pi-investment-workflow → pi-research → pi-finance-sdk`.
 *
 * The fix mirrors the existing `setInvestCommandHandler` pattern used
 * by the workflow package itself: the host (`@upup/pi-app/default`)
 * resolves the runners from `@upup/pi-investment-workflow` at boot and
 * injects them here. Until the injection happens, the extension
 * surfaces a fail-closed message instead of crashing or nudging the LLM.
 */
// The runners + accessors live in `../src/index` so they get a proper
// `.d.ts` declaration (the extensions/ subtree is bundled by `bun build`,
// not emitted by `tsc`).
import {
  setPiFinanceCommandRunners,
  getPiFinanceCommandRunners,
  type PiFinanceCommandRunner,
} from '../src/index';

export { setPiFinanceCommandRunners, getPiFinanceCommandRunners, type PiFinanceCommandRunner };

/**
 * Real Pi-native investment command wiring.
 *
 * The previous implementation emitted an LLM prompt-nudge via
 * `pi.sendUserMessage(...)` ("Use the Pi finance tools..."). That handler
 * routed `/invest` etc. back through the LLM instead of invoking the
 * canonical `@upup/pi-investment-workflow` five-phase pipeline. The fix
 * below calls the workflow runner (injected at boot) directly, which:
 *
 *   1. Drives the canonical detect → plan → execute → verify → report
 *      state machine, persisting the dossier under `.upup/plans/`.
 *   2. Returns a plain-text result that we hand back to the TUI via
 *      `pi.sendUserMessage` so the Ink renderer can display it.
 *   3. Records the structured audit entry (`upup_finance_command`) on
 *      success and a result entry (`upup_finance_command_result`) so
 *      `verify:pi7-final` and the session log capture every invocation.
 *
 * Failure modes: any thrown error from the workflow is caught, logged
 * to the audit trail with `ok: false`, and surfaced as a fail-closed
 * message back to the user. The LLM is no longer on the critical path.
 */
export function registerPiFinanceCommands(pi: Pick<ExtensionAPI, 'registerCommand' | 'sendUserMessage' | 'appendEntry'>): void {
  for (const name of PI_FINANCE_COMMANDS) {
    pi.registerCommand(name, {
      description: `UpUp finance: ${COMMAND_INTENTS[name].toLowerCase()}.`,
      handler: async (args) => {
        const suffix = args.trim();
        const intent = suffix ? `${COMMAND_INTENTS[name]} for ${suffix}.` : `${COMMAND_INTENTS[name]}.`;
        pi.appendEntry('upup_finance_command', {
          schema: 2,
          command: name,
          args: suffix,
          workflow: 'invest',
          intent,
          recordedAt: new Date().toISOString(),
        });
        const { invest, generic } = getPiFinanceCommandRunners();
        const runner = name === 'invest' ? invest : generic;
        if (!runner) {
          pi.appendEntry('upup_finance_command_result', {
            schema: 2,
            command: name,
            args: suffix,
            ok: false,
            error: 'investment workflow runner not registered; call setPiFinanceCommandRunners() at boot',
            recordedAt: new Date().toISOString(),
          });
          pi.sendUserMessage(`/${name} unavailable: investment workflow runner is not registered (run \`upup doctor\` to verify Pi package manifest).`);
          return;
        }
        try {
          const text = name === 'invest'
            ? await invest!(suffix)
            : await generic!(name, suffix);
          pi.appendEntry('upup_finance_command_result', {
            schema: 2,
            command: name,
            args: suffix,
            ok: true,
            recordedAt: new Date().toISOString(),
          });
          if (text) {
            pi.sendUserMessage(`/${name}${suffix ? ' ' + suffix : ''} (Pi finance workflow)\n\n${text}`);
          }
        } catch (error) {
          pi.appendEntry('upup_finance_command_result', {
            schema: 2,
            command: name,
            args: suffix,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            recordedAt: new Date().toISOString(),
          });
          pi.sendUserMessage(`/${name} failed (fail-closed): ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    });
  }
}
