import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { migrateSessionFile } from './pi-migration.js';

if (import.meta.main) {
const sourceDir = join(homedir(), '.upup', 'sessions');
const targetDir = join(homedir(), '.pi', 'agent', 'sessions', 'upup-migrated');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(sourceDir)) {
  console.log(`No legacy session directory found: ${sourceDir}`);
} else {
  const files = readdirSync(sourceDir).filter((file) => /\.jsonl?$/.test(file));
  for (const file of files) {
    const source = join(sourceDir, file);
    const target = join(targetDir, `${basename(file).replace(/\.json$/, '')}.pi.jsonl`);
    try {
      const report = migrateSessionFile(source, { outputPath: target, dryRun, backupPath: dryRun ? undefined : `${source}.bak` });
      console.log(JSON.stringify(report));
    } catch (error) {
      console.error(JSON.stringify({ source, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

}
