import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { migrateSessionFile } from './pi-migration.js';

interface CliOptions {
  sourceDir: string;
  outputDir: string;
  backupDir?: string;
  session?: string;
  all: boolean;
  dryRun: boolean;
}

function usage(): never {
  console.error([
    'Usage: bun run packages/pi-session/src/migrate-to-pi.ts [options]',
    '',
    '  --session <path>       migrate one legacy JSON/JSONL file',
    '  --all                  migrate every JSON/JSONL file under --source-dir',
    '  --source-dir <path>   legacy session directory (default: .upup/sessions)',
    '  --output-dir <path>   Pi session directory (default: .upup/pi-sessions)',
    '  --backup-dir <path>   copy each source before migration',
    '  --dry-run              verify without writing output files',
  ].join('\n'));
  process.exit(2);
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    sourceDir: resolve(process.env.UPUP_SESSION_DIR ?? join(process.cwd(), '.upup', 'sessions')),
    outputDir: resolve(join(process.cwd(), '.upup', 'pi-sessions')),
    all: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--session') options.session = argv[++index];
    else if (arg === '--source-dir') options.sourceDir = resolve(argv[++index] ?? usage());
    else if (arg === '--output-dir') options.outputDir = resolve(argv[++index] ?? usage());
    else if (arg === '--backup-dir') options.backupDir = resolve(argv[++index] ?? usage());
    else usage();
  }
  if ((options.session ? 1 : 0) + (options.all ? 1 : 0) !== 1) usage();
  return options;
}

function collectFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return ['.json', '.jsonl'].includes(extname(root)) ? [root] : [];
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectFiles(join(root, entry.name)));
}

function outputPath(source: string, sourceDir: string, outputDir: string): string {
  const relativePath = relative(sourceDir, source);
  const stem = basename(relativePath).replace(/\.(jsonl?|JSONL?)$/, '');
  return join(outputDir, dirname(relativePath), `${stem}.pi.jsonl`);
}

function migrate(options: CliOptions): void {
  const sources = options.session
    ? [resolve(options.session)]
    : collectFiles(options.sourceDir);
  if (sources.length === 0) throw new Error('No legacy session files found');
  for (const source of sources) {
    const target = outputPath(source, options.sourceDir, options.outputDir);
    const backupPath = options.backupDir ? join(options.backupDir, relative(options.sourceDir, source)) : undefined;
    const report = migrateSessionFile(source, {
      outputPath: target,
      backupPath,
      cwd: process.cwd(),
      dryRun: options.dryRun,
    });
    console.log(JSON.stringify(report));
  }
}

if (import.meta.main) {
  try {
    migrate(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
