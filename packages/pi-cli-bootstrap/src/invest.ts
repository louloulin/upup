/**
 * `upup invest` — headless /invest CLI.
 *
 * Lets users run the same 5-phase investment workflow that the Pi TUI
 * exposes via `/invest <TICKER> [intent]`, but as a one-shot CLI subcommand
 * so scripts and CI can drive it without an interactive session.
 *
 *   upup invest 600519.SH
 *   upup invest 600519.SH 估值与基本面分析
 *   upup invest --resume <planId>
 *   upup invest --list
 *
 * Implementation note: this command dynamically imports `@upup/pi-app/default`
 * so the same singleton Pi app (and therefore the same session factory,
 * registered finance commands, capability hosts) used by the TUI / print /
 * gateway / cron paths is reused here. Keeping the wiring out of static
 * imports avoids a `pi-cli-bootstrap → pi-app` package dependency cycle
 * (pi-app already depends on pi-cli-bootstrap for doctor / config /
 * openbuddy / plugin).
 */
export interface InvestCommandOptions {
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}

export interface InvestCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

export async function runInvestCommand(opts: InvestCommandOptions): Promise<InvestCommandResult> {
  const trimmed = opts.args.join(' ').trim();
  if (trimmed === '' || trimmed === '--help' || trimmed === '-h') {
    return {
      exitCode: 0,
      output: [
        '',
        '  upup invest — headless /invest runner',
        '',
        '  Usage:',
        '    upup invest <TICKER> [intent]',
        '    upup invest --list',
        '    upup invest --resume <planId>',
        '    upup invest --sops',
        '    upup invest --sop <id> <TICKER>',
        '',
        '  Example:',
        '    upup invest 600519.SH 估值与基本面分析',
        '    upup invest 0700.HK',
        '    upup invest AAPL valuation and moat',
        '    upup invest --sop graham 600519.SH',
        '    upup invest --sop debate AAPL',
        '',
        '  Runs the canonical 5-phase workflow (detect → plan → execute →',
        '  verify → report) with the same Pi session factory the TUI uses,',
        '  and prints the rendered result. Exit code is 0 unless the command',
        '  itself fails (e.g. invalid ticker / missing app wiring); individual',
        '  phase failures show up inline in the rendered output.',
        '',
      ].join('\n'),
    };
  }

  try {
    const { getPiNativeApp } = await import('@upup/pi-app/default');
    const app = getPiNativeApp();
    // `workflow.runInvest` is the same function the TUI's `/invest` slash
    // command binds via `setPiFinanceCommandRunners`. It already wires the
    // session factory and is the canonical Pi investment command entry.
    const output = await app.getInvestmentWorkflow().runInvest(trimmed);
    return { exitCode: 0, output };
  } catch (err) {
    return {
      exitCode: 1,
      output: `\n  ✗ upup invest failed: ${err instanceof Error ? err.message : String(err)}\n`,
    };
  }
}
