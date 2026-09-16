/**
 * UpUp brand banner.
 *
 * Pi Native migration (Sprint 5+): the π symbol previously shown by Pi's
 * `main()` has been replaced with an UpUp (涨涨) branded banner that
 * foregrounds UpUp as the product and Pi as the underlying agent runtime.
 * The banner is emitted to stderr before Pi's `InteractiveMode` takes over
 * the terminal, so the first line a user sees during `upup` / `bun run dev`
 * is consistently UpUp-branded.
 *
 * Block art is built from standard Unicode box-drawing / block characters so
 * it renders in any UTF-8 terminal (macOS Terminal, iTerm2, GNOME Terminal,
 * Windows Terminal, Alacritty, Kitty). It deliberately avoids ANSI colors
 * so the banner survives `NO_COLOR`, piped output, and CI logs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UPUP_BANNER = `
 ██╗   ██╗██████╗ ██╗   ██╗██████╗
 ██║   ██║██╔══██╗██║   ██║██╔══██╗
 ██║   ██║██████╔╝██║   ██║██████╔╝
 ██║   ██║██╔═══╝ ██║   ██║██╔═══╝
 ╚██████╔╝██║     ╚██████╔╝██║
  ╚═════╝ ╚═╝      ╚═════╝ ╚═╝

     涨涨 · Chinese Investment Research Agent
`;

export interface UpupBannerOptions {
  /** UpUp version to display; defaults to `process.env.npm_package_version`. */
  readonly version?: string;
  /** Optional mode label (e.g. "interactive", "stdio", "print"). */
  readonly mode?: string;
  /** Optional model identifier to display alongside the version. */
  readonly model?: string;
}

function readVersion(): string {
  const fromEnv = process.env.npm_package_version;
  if (fromEnv) return fromEnv;
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    if (!existsSync(pkgPath)) return 'dev';
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

export function renderUpupBanner(options: UpupBannerOptions = {}): string {
  const version = options.version ?? readVersion();
  const mode = options.mode ? ` · mode=${options.mode}` : '';
  const model = options.model ? ` · model=${options.model}` : '';
  const footer = `\n  UpUp v${version} · 涨涨 · Pi Runtime${mode}${model}\n`;
  return `${UPUP_BANNER}${footer}`;
}

/**
 * Print the UpUp banner to stderr. Used by `entry.ts` and `pi-native-cli.ts`
 * before they hand the terminal to Pi's `InteractiveMode`.
 */
export function printUpupBanner(options: UpupBannerOptions = {}): void {
  process.stderr.write(renderUpupBanner(options));
}

/**
 * Print a one-line UpUp banner suitable for short contexts (e.g. CLI
 * subcommands like `upup doctor` or `upup openbuddy`). Keeps the same
 * visual identity without taking a full screen line of banner space.
 */
export function printUpupBrandLine(options: UpupBannerOptions = {}): void {
  const version = options.version ?? readVersion();
  process.stderr.write(`UpUp v${version} · 涨涨 · Pi Runtime\n`);
}
