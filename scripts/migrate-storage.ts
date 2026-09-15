#!/usr/bin/env bun
/**
 * migrate-storage.ts
 *
 * Migrates UpUp storage from old locations to the new global structure.
 * Handles:
 * - .dexter → ~/.upup/
 * - ./dist/.upup → ~/.upup/
 * - Project-local .upup/ → ~/.upup/
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { getUpupHomeRoot } from '@upup/utils';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// Old locations to migrate from
const OLD_LOCATIONS = [
  '.dexter',
  './dist/.upup',
  './.upup',
];

// New global location
const NEW_DIR = getUpupHomeRoot();

// Subdirectories to migrate
const SUBDIRS = [
  'sessions',
  'data',
  'memory',
  'cache',
  'logs',
  'tool-results',
  'exports',
  'portfolios',
  'plans',
];

interface MigrationResult {
  source: string;
  destination: string;
  files: number;
  success: boolean;
  error?: string;
}

async function migrateDirectory(source: string, dest: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    source,
    destination: dest,
    files: 0,
    success: false,
  };

  if (!existsSync(source)) {
    result.error = 'Source does not exist';
    return result;
  }

  try {
    // Create destination directory
    mkdirSync(dest, { recursive: true });

    // Migrate each subdirectory
    for (const subdir of SUBDIRS) {
      const srcPath = join(source, subdir);
      const destPath = join(dest, subdir);

      if (existsSync(srcPath)) {
        if (!existsSync(destPath)) {
          mkdirSync(destPath, { recursive: true });
        }

        const files = readdirSync(srcPath);
        for (const file of files) {
          const srcFile = join(srcPath, file);
          const destFile = join(destPath, file);

          // Skip if destination already exists
          if (!existsSync(destFile)) {
            const stat = statSync(srcFile);
            if (stat.isDirectory()) {
              // Recursively copy directory
              await copyDirectory(srcFile, destFile);
            } else {
              copyFileSync(srcFile, destFile);
            }
            result.files++;
          }
        }
      }
    }

    result.success = true;
  } catch (e) {
    result.error = String(e);
  }

  return result;
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true });
  const files = readdirSync(src);

  for (const file of files) {
    const srcFile = join(src, file);
    const destFile = join(dest, file);
    const stat = statSync(srcFile);

    if (stat.isDirectory()) {
      await copyDirectory(srcFile, destFile);
    } else {
      copyFileSync(srcFile, destFile);
    }
  }
}

async function runMigration() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  UpUp Storage Migration Script');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log();
  console.log(`${BLUE}Migrating to:${RESET} ${NEW_DIR}`);
  console.log();

  const results: MigrationResult[] = [];
  let totalFiles = 0;

  // Migrate each old location
  for (const location of OLD_LOCATIONS) {
    const resolvedPath = location.replace('~', homedir());
    console.log(`${YELLOW}Checking:${RESET} ${resolvedPath}`);

    if (existsSync(resolvedPath)) {
      console.log(`  ${GREEN}Found${RESET} - migrating...`);

      const dest = NEW_DIR;
      const result = await migrateDirectory(resolvedPath, dest);
      results.push(result);

      if (result.success) {
        console.log(`  ${GREEN}✅ Migrated ${result.files} files${RESET}`);
        totalFiles += result.files;
      } else {
        console.log(`  ${RED}❌ Error: ${result.error}${RESET}`);
      }
    } else {
      console.log(`  ${YELLOW}Not found${RESET} - skipping`);
    }
  }

  // Summary
  console.log();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log();

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  Total locations processed: ${results.length}`);
  console.log(`  ${GREEN}Successful:${RESET} ${successful.length}`);
  if (failed.length > 0) {
    console.log(`  ${RED}Failed:${RESET} ${failed.length}`);
  }
  console.log(`  Total files migrated: ${totalFiles}`);
  console.log();

  // Verify new location
  if (existsSync(NEW_DIR)) {
    const files = readdirSync(NEW_DIR);
    console.log(`${GREEN}✅ New storage location ready:${RESET} ${NEW_DIR}`);
    console.log(`    ${files.length} subdirectories`);
  } else {
    console.log(`${RED}❌ New storage location not created${RESET}`);
  }

  console.log();
  console.log('Note: Old locations are preserved. Remove them manually if migration was successful.');
  console.log();
}

runMigration().catch(e => {
  console.error(`Error: ${e}`);
  process.exit(1);
});
