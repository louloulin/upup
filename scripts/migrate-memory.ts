import { migrateLegacyMemories } from '../src/memory/migration.js';

const dryRun = process.argv.includes('--dry-run');

const result = await migrateLegacyMemories({ dryRun });

console.log(JSON.stringify({
  dryRun,
  migrated: result.migrated,
  skipped: result.skipped,
  archived: result.archived,
  indexPath: result.indexPath,
}, null, 2));
