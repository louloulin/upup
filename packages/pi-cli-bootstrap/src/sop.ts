/**
 * `upup sop` — headless SOP (投资方法论) management.
 *
 * Lets scripts, CI, and sandboxed installs drive the same SOP catalog the TUI
 * exposes via `/sop …`, without needing an interactive session or credentials:
 *
 *   upup sop list
 *   upup sop show graham
 *   upup sop install https://example.com/my-sop.yaml
 *   upup sop install ./team-sops/ --project
 *   upup sop new my-methodology
 *   upup sop uninstall my-methodology
 *
 * Like `upup invest`, the implementation dynamically imports
 * `@upup/pi-investment-workflow` so `pi-cli-bootstrap` keeps no static
 * dependency on the investment packages (and therefore no cycle through
 * `pi-app`).
 */
export interface SopCommandOptions {
  readonly args: readonly string[];
}

export interface SopCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

export async function runSopCommandCli(opts: SopCommandOptions): Promise<SopCommandResult> {
  const trimmed = opts.args.join(' ').trim();
  try {
    const { runSopCommand } = await import('@upup/pi-investment-workflow');
    const output = await runSopCommand(trimmed);
    return { exitCode: 0, output };
  } catch (err) {
    return {
      exitCode: 1,
      output: `\n  ✗ upup sop failed: ${err instanceof Error ? err.message : String(err)}\n`,
    };
  }
}
