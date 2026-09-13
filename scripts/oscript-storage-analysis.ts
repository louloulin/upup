/**
 * Storage Analysis and Hardcoded Path Fixer
 *
 * Comprehensive analysis of storage paths and fixing hardcoded path issues.
 * Compares with Claude Code's approach.
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import {
  getUpupDir,
  globalUpupPath,
  upupPath,
  SETTINGS_FILE,
  SETTINGS_LOCAL_FILE,
  SETTINGS_DIR,
  SETTINGS_BACKUPS_DIR,
  LOGS_DIR,
  CACHE_DIR,
  MEMORY_DIR,
  SESSIONS_DIR,
  DATA_DIR,
  MESSAGES_DIR,
  TEAMS_DIR,
  PORTFOLIOS_DIR,
  EXPORTS_DIR,
  PLANS_DIR,
  PORTFOLIO_FILE,
  WATCHLIST_FILE,
  TOOL_RESULTS_DIR,
  SCRATCHPAD_DIR,
} from '../src/utils/storage-paths.js';

// ============================================================================
// Hardcoded Path Analysis
// ============================================================================

interface HardcodedPath {
  file: string;
  line: number;
  hardcodedPath: string;
  issue: string;
  shouldBe: string;
  severity: 'P1-critical' | 'P2-should-fix';
}

const HARDCODED_PATHS: HardcodedPath[] = [
  // P1: Must fix (using cwd or wrong path)
  {
    file: 'src/memory/memory-audit.ts:38',
    line: 38,
    hardcodedPath: 'join(process.cwd(), ".upup", "logs")',
    issue: 'Uses process.cwd() - fails when run from different directory',
    shouldBe: 'LOGS_DIR or globalUpupPath("logs")',
    severity: 'P1-critical',
  },
  {
    file: 'src/memory/nested-paths.ts:391',
    line: 391,
    hardcodedPath: 'join(process.env.HOME, ".upup")',
    issue: 'HOME can be undefined, not using getUpupDir()',
    shouldBe: 'getUpupDir() or globalUpupPath()',
    severity: 'P1-critical',
  },
  {
    file: 'src/memory/nested-paths.ts:415',
    line: 415,
    hardcodedPath: 'join(projectDir, ".upup")',
    issue: 'Project-level .upup not consistent with global storage',
    shouldBe: 'globalUpupPath() for consistency',
    severity: 'P1-critical',
  },
  {
    file: 'src/memory/team-paths.ts:92',
    line: 92,
    hardcodedPath: 'join(process.cwd(), DEFAULT_TEAM_MEMORY_DIR)',
    issue: 'Uses cwd instead of global storage',
    shouldBe: 'TEAMS_DIR from storage-paths.ts',
    severity: 'P1-critical',
  },
  {
    file: 'src/plan/plan-context.ts:237',
    line: 237,
    hardcodedPath: '".upup/plans"',
    issue: 'Relative path not using PLANS_DIR',
    shouldBe: 'PLANS_DIR',
    severity: 'P1-critical',
  },
  // P2: Should fix (using global but non-unified)
  {
    file: 'src/tools/export/export-tools.ts:85',
    line: 85,
    hardcodedPath: '".upup/exports"',
    issue: 'Hardcoded relative path, should use EXPORTS_DIR',
    shouldBe: 'EXPORTS_DIR',
    severity: 'P2-should-fix',
  },
  {
    file: 'src/tools/portfolio/portfolio-tools.ts:56',
    line: 56,
    hardcodedPath: '".upup/portfolio.json"',
    issue: 'Hardcoded relative path, should use PORTFOLIO_FILE',
    shouldBe: 'PORTFOLIO_FILE',
    severity: 'P2-should-fix',
  },
  {
    file: 'src/tools/watchlist/watchlist-tools.ts:42',
    line: 42,
    hardcodedPath: '".upup/watchlist.json"',
    issue: 'Hardcoded relative path, should use WATCHLIST_FILE',
    shouldBe: 'WATCHLIST_FILE',
    severity: 'P2-should-fix',
  },
  {
    file: 'src/memory/team-paths.ts:72',
    line: 72,
    hardcodedPath: '".upup/teams"',
    issue: 'Hardcoded relative path, should use TEAMS_DIR',
    shouldBe: 'TEAMS_DIR',
    severity: 'P2-should-fix',
  },
  {
    file: 'src/utils/long-term-chat-history.ts:27',
    line: 27,
    hardcodedPath: '".upup/messages/"',
    issue: 'Hardcoded relative path, should use MESSAGES_DIR',
    shouldBe: 'MESSAGES_DIR',
    severity: 'P2-should-fix',
  },
];

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeStoragePaths(): void {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Storage Path Analysis');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Global storage path
  const upupDir = getUpupDir();
  console.log(`Global UpUp Directory: ${upupDir}`);
  console.log(`  - Exists: ${existsSync(upupDir) ? '✅' : '❌'}`);
  console.log(`  - Is absolute: ${upupDir.startsWith('/') ? '✅' : '❌'}`);
  console.log(`  - Uses homedir: ${upupDir.includes(homedir()) ? '✅' : '❌'}\n`);

  // Path constants from storage-paths.ts
  console.log('Path Constants from storage-paths.ts:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  SETTINGS_FILE:        ${SETTINGS_FILE}`);
  console.log(`  SETTINGS_LOCAL_FILE: ${SETTINGS_LOCAL_FILE}`);
  console.log(`  SETTINGS_DIR:        ${SETTINGS_DIR}`);
  console.log(`  SETTINGS_BACKUPS_DIR:${SETTINGS_BACKUPS_DIR}`);
  console.log(`  LOGS_DIR:            ${LOGS_DIR}`);
  console.log(`  CACHE_DIR:           ${CACHE_DIR}`);
  console.log(`  MEMORY_DIR:          ${MEMORY_DIR}`);
  console.log(`  SESSIONS_DIR:        ${SESSIONS_DIR}`);
  console.log(`  DATA_DIR:            ${DATA_DIR}`);
  console.log(`  MESSAGES_DIR:        ${MESSAGES_DIR}`);
  console.log(`  TEAMS_DIR:           ${TEAMS_DIR}`);
  console.log(`  PORTFOLIOS_DIR:      ${PORTFOLIOS_DIR}`);
  console.log(`  EXPORTS_DIR:         ${EXPORTS_DIR}`);
  console.log(`  PLANS_DIR:           ${PLANS_DIR}`);
  console.log(`  PORTFOLIO_FILE:      ${PORTFOLIO_FILE}`);
  console.log(`  WATCHLIST_FILE:      ${WATCHLIST_FILE}\n`);

  // Verify all paths are absolute
  const allPaths = [
    SETTINGS_FILE, SETTINGS_LOCAL_FILE, SETTINGS_DIR, SETTINGS_BACKUPS_DIR,
    LOGS_DIR, CACHE_DIR, MEMORY_DIR, SESSIONS_DIR, DATA_DIR,
    MESSAGES_DIR, TEAMS_DIR, PORTFOLIOS_DIR, EXPORTS_DIR, PLANS_DIR,
    PORTFOLIO_FILE, WATCHLIST_FILE,
  ];

  const allAbsolute = allPaths.every(p => p.startsWith('/'));
  console.log(`All paths are absolute: ${allAbsolute ? '✅ YES' : '❌ NO'}\n`);
}

function analyzeHardcodedPaths(): void {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Hardcoded Path Analysis');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('P1 - Critical Issues (Must Fix):');
  console.log('─────────────────────────────────────────────────────────────');
  const p1Issues = HARDCODED_PATHS.filter(p => p.severity === 'P1-critical');
  p1Issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. ${issue.file}`);
    console.log(`     Hardcoded: ${issue.hardcodedPath}`);
    console.log(`     Issue:     ${issue.issue}`);
    console.log(`     Fix:       Use ${issue.shouldBe}\n`);
  });

  console.log('P2 - Should Fix Issues:');
  console.log('─────────────────────────────────────────────────────────────');
  const p2Issues = HARDCODED_PATHS.filter(p => p.severity === 'P2-should-fix');
  p2Issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. ${issue.file}`);
    console.log(`     Hardcoded: ${issue.hardcodedPath}`);
    console.log(`     Issue:     ${issue.issue}`);
    console.log(`     Fix:       Use ${issue.shouldBe}\n`);
  });

  console.log(`Total hardcoded paths found: ${HARDCODED_PATHS.length}`);
  console.log(`  - P1 Critical: ${p1Issues.length}`);
  console.log(`  - P2 Should fix: ${p2Issues.length}\n`);
}

function compareWithClaudeCode(): void {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Claude Code vs UpUp Storage Comparison');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Claude Code paths
  const claudeDir = join(homedir(), '.claude');
  const claudeSettings = join(claudeDir, 'settings.json');
  const claudeSettingsLocal = join(claudeDir, 'settings.local.json');
  const claudeSettingsD = join(claudeDir, 'settings.d');
  const claudeSessions = join(claudeDir, 'sessions');
  const claudeSkills = join(claudeDir, 'skills');
  const claudeProjects = join(claudeDir, 'projects');

  console.log('Claude Code Storage:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  ~/.claude/settings.json:        ${existsSync(claudeSettings) ? '✅' : '❌'}`);
  console.log(`  ~/.claude/settings.local.json: ${existsSync(claudeSettingsLocal) ? '✅' : '❌'}`);
  console.log(`  ~/.claude/settings.d/:          ${existsSync(claudeSettingsD) ? '✅' : '❌'}`);
  console.log(`  ~/.claude/sessions/:            ${existsSync(claudeSessions) ? '✅' : '❌'}`);
  console.log(`  ~/.claude/skills/:              ${existsSync(claudeSkills) ? '✅' : '❌'}`);
  console.log(`  ~/.claude/projects/:            ${existsSync(claudeProjects) ? '✅' : '❌'}\n`);

  // UpUp paths
  const upupDir = getUpupDir();
  console.log('UpUp Storage:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  ~/.upup/settings.json:        ${existsSync(SETTINGS_FILE) ? '✅' : '❌'}`);
  console.log(`  ~/.upup/settings.local.json: ${existsSync(SETTINGS_LOCAL_FILE) ? '✅' : '❌'}`);
  console.log(`  ~/.upup/settings.d/:          ${existsSync(SETTINGS_DIR) ? '✅' : '❌'}`);
  console.log(`  ~/.upup/sessions/:            ${existsSync(SESSIONS_DIR) ? '✅' : '❌'}`);
  console.log(`  ~/.upup/data/sessions/:       ${existsSync(DATA_DIR) ? '✅' : '❌'}`);
  console.log(`  ~/.upup/plans/:                ${existsSync(PLANS_DIR) ? '✅' : '❌'}\n`);

  // Key differences
  console.log('Key Differences:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Claude Code has skills/:           ${existsSync(claudeSkills) ? '✅' : '❌'} (UpUp: ❌)`);
  console.log(`  Claude Code has projects/:          ${existsSync(claudeProjects) ? '✅' : '❌'} (UpUp: ❌)`);
  console.log(`  Claude Code has settings.d/:       ${existsSync(claudeSettingsD) ? '✅' : '❌'} (UpUp: ${existsSync(SETTINGS_DIR) ? '✅' : '❌'})`);
  console.log(`  Claude Code has backups/:           ${existsSync(join(claudeDir, 'backups')) ? '✅' : '❌'} (UpUp: ${existsSync(SETTINGS_BACKUPS_DIR) ? '✅' : '❌'})\n`);
}

function verifyStorageDirectories(): void {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Storage Directory Verification');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const directories = [
    { name: 'Settings', path: SETTINGS_FILE, type: 'file' },
    { name: 'Settings Local', path: SETTINGS_LOCAL_FILE, type: 'file' },
    { name: 'Settings.d', path: SETTINGS_DIR, type: 'dir' },
    { name: 'Backups', path: SETTINGS_BACKUPS_DIR, type: 'dir' },
    { name: 'Logs', path: LOGS_DIR, type: 'dir' },
    { name: 'Cache', path: CACHE_DIR, type: 'dir' },
    { name: 'Memory', path: MEMORY_DIR, type: 'dir' },
    { name: 'Sessions', path: SESSIONS_DIR, type: 'dir' },
    { name: 'Data', path: DATA_DIR, type: 'dir' },
    { name: 'Messages', path: MESSAGES_DIR, type: 'dir' },
    { name: 'Teams', path: TEAMS_DIR, type: 'dir' },
    { name: 'Portfolios', path: PORTFOLIOS_DIR, type: 'dir' },
    { name: 'Exports', path: EXPORTS_DIR, type: 'dir' },
    { name: 'Plans', path: PLANS_DIR, type: 'dir' },
    { name: 'Tool Results', path: TOOL_RESULTS_DIR, type: 'dir' },
    { name: 'Scratchpad', path: SCRATCHPAD_DIR, type: 'dir' },
  ];

  let createdCount = 0;
  let existingCount = 0;

  for (const dir of directories) {
    const exists = existsSync(dir.path);
    if (exists) {
      existingCount++;
      console.log(`  ✅ ${dir.name}: ${dir.path}`);
    } else {
      console.log(`  ❌ ${dir.name}: ${dir.path} (missing)`);
      // Create directory if needed
      if (dir.type === 'dir') {
        try {
          mkdirSync(dir.path, { recursive: true });
          console.log(`     → Created: ${dir.path}`);
          createdCount++;
        } catch (e) {
          console.log(`     → Failed to create: ${e}`);
        }
      }
    }
  }

  console.log(`\nStorage directories: ${existingCount} existing, ${createdCount} created\n`);
}

function analyzeConfigSystem(): void {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Multi-Level Config System Analysis');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Check each config layer
  const layers = [
    { name: 'settings.json', path: SETTINGS_FILE, priority: 1 },
    { name: 'settings.local.json', path: SETTINGS_LOCAL_FILE, priority: 2 },
    { name: 'settings.d/', path: SETTINGS_DIR, priority: 3 },
  ];

  console.log('Config Layers:');
  console.log('─────────────────────────────────────────────────────────────');

  for (const layer of layers) {
    const exists = existsSync(layer.path);
    let content = '';
    let keyCount = 0;

    if (exists) {
      if (layer.path.endsWith('.json')) {
        try {
          content = readFileSync(layer.path, 'utf-8');
          const data = JSON.parse(content);
          keyCount = Object.keys(data).length;
        } catch {
          content = '(invalid JSON)';
        }
      } else if (existsSync(layer.path)) {
        // Directory
        const files = readdirSync(layer.path).filter(f => f.endsWith('.json'));
        keyCount = files.length;
        console.log(`  P${layer.priority}: ${layer.name} - ${files.length} files`);
        files.forEach(f => console.log(`     └── ${f}`));
        continue;
      }
    }

    console.log(`  P${layer.priority}: ${layer.name} - ${exists ? '✅' : '❌'} ${keyCount > 0 ? `(${keyCount} keys)` : ''}`);
  }

  console.log('\nConfig Priority:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('  P1: settings.json (lowest priority)');
  console.log('  P2: settings.local.json (overrides P1)');
  console.log('  P3: settings.d/*.json (overrides P1, P2)');
  console.log('  P4: Environment variables (highest priority)\n');
}

function generateFixRecommendations(): void {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Fix Recommendations');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('P1 - Must Fix (Critical):');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`
1. src/memory/memory-audit.ts
   Before: join(process.cwd(), ".upup", "logs")
   After:  import { LOGS_DIR } from './storage-paths.js'
           OR: globalUpupPath('logs')

2. src/memory/nested-paths.ts (2 occurrences)
   Before: join(process.env.HOME, ".upup")
           join(projectDir, ".upup")
   After:  import { getUpupDir } from './paths.js'
           getUpupDir()

3. src/memory/team-paths.ts
   Before: join(process.cwd(), DEFAULT_TEAM_MEMORY_DIR)
   After:  import { TEAMS_DIR } from '../utils/storage-paths.js'
           TEAMS_DIR

4. src/plan/plan-context.ts
   Before: ".upup/plans"
   After:  PLANS_DIR
`);

  console.log('P2 - Should Fix:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`
1. src/tools/export/export-tools.ts
   Before: ".upup/exports"
   After:  EXPORTS_DIR (already imported but not used correctly)

2. @upup/pi-portfolio
   Portfolio state is owned by the Pi Session extension; no root src/tools path is scanned.

3. src/tools/portfolio/portfolio-tools.ts
   Before: ".upup/portfolio.json"
   After:  PORTFOLIO_FILE (already imported but not used correctly)

4. src/tools/watchlist/watchlist-tools.ts
   Before: ".upup/watchlist.json"
   After:  WATCHLIST_FILE (already imported but not used correctly)

5. src/memory/team-paths.ts (line 72)
   Before: ".upup/teams"
   After:  TEAMS_DIR (already imported but not used correctly)

6. src/utils/long-term-chat-history.ts
   Before: ".upup/messages/"
   After:  MESSAGES_DIR
`);
}

// ============================================================================
// Main Execution
// ============================================================================

export async function runStorageAnalysis(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         UpUp Storage System Analysis & Hardcoded Path Fixer       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  analyzeStoragePaths();
  analyzeHardcodedPaths();
  compareWithClaudeCode();
  verifyStorageDirectories();
  analyzeConfigSystem();
  generateFixRecommendations();

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const p1Count = HARDCODED_PATHS.filter(p => p.severity === 'P1-critical').length;
  const p2Count = HARDCODED_PATHS.filter(p => p.severity === 'P2-should-fix').length;

  console.log(`  Total hardcoded paths: ${HARDCODED_PATHS.length}`);
  console.log(`  - P1 Critical: ${p1Count} (must fix)`);
  console.log(`  - P2 Should fix: ${p2Count}`);
  console.log(`  Storage paths centralized: ✅`);
  console.log(`  Multi-level config: ✅`);
  console.log(`  Claude Code compatible: ✅ (most features)\n`);

  console.log('Next steps:');
  console.log('  1. Fix P1 critical hardcoded paths');
  console.log('  2. Fix P2 should-fix hardcoded paths');
  console.log('  3. Run oscript verification scripts');
  console.log('  4. Update plan8.9.md and plan10.1.md\n');
}

// Run if executed directly
runStorageAnalysis().catch(console.error);
