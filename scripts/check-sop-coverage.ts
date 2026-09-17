#!/usr/bin/env bun
/**
 * check:sop-coverage — SOP (Standard Operating Procedure) guard.
 *
 * Fails when:
 *   - fewer than 5 built-in SOPs ship in `packages/pi-investment-workflow/sops/`
 *   - any built-in SOP fails schema validation against INVESTMENT_PROFILES
 *   - no built-in SOP exercises a parallel group (multi-agent debate / review)
 *   - a user-defined SOP in `.upup/sops/` cannot be discovered and validated
 *   - a user-defined agent in `.upup/agents/` cannot be discovered and validated
 *   - `/sop install` does not land under `$UPUP_HOME/sops` (installs must never
 *     write into the package directory or the developer's real `~/.upup`)
 *
 * Mirrors the other `scripts/check-*.ts` guards so CI can depend on it.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INVESTMENT_PROFILES,
  installSops,
  installedSopPath,
  loadAndValidateSops,
  loadSops,
  loadUserAgentSpecs,
  mergeAgentCatalog,
  resolveUpUpHomeRoot,
  uninstallSop,
} from '@upup/pi-investment-workflow';

const failures: string[] = [];
const builtinAgents = Object.values(INVESTMENT_PROFILES);

// 1. Built-in SOPs must load and validate.
const builtin = loadAndValidateSops(builtinAgents, {
  cwd: join(tmpdir(), 'upup-sop-coverage-no-cwd'),
  home: join(tmpdir(), 'upup-sop-coverage-no-home'),
});
if (builtin.sops.length < 5) {
  failures.push(`expected >= 5 built-in SOPs, found ${builtin.sops.length}`);
}
if (builtin.warnings.length > 0) {
  failures.push(`built-in SOP load produced warnings: ${builtin.warnings.join('; ')}`);
}

// 2. At least one SOP must exercise a parallel group.
if (!builtin.sops.some((sop) => (sop.parallelGroups?.length ?? 0) > 0)) {
  failures.push('no built-in SOP declares a parallelGroups entry (multi-agent debate/review missing)');
}

// 3. Every built-in SOP must have at least two phases.
for (const sop of builtin.sops) {
  if (sop.phases.length < 2) failures.push(`built-in SOP "${sop.id}" has fewer than 2 phases`);
}

// 4. User-defined SOP + agent must be discoverable from ~/.upup.
const home = mkdtempSync(join(tmpdir(), 'upup-sop-guard-home-'));
const cwd = mkdtempSync(join(tmpdir(), 'upup-sop-guard-cwd-'));
try {
  mkdirSync(join(home, '.upup', 'sops'), { recursive: true });
  mkdirSync(join(home, '.upup', 'agents'), { recursive: true });
  writeFileSync(join(home, '.upup', 'agents', 'guard-analyst.json'), JSON.stringify({
    id: 'guard-analyst',
    name: 'Guard Analyst',
    description: 'coverage guard user agent',
    version: '1.0.0',
    tools: ['get_financials'],
    permissions: {
      id: 'read-only',
      allow: ['safe', 'warning'],
      requireApproval: [],
      deny: ['dangerous', 'critical'],
      allowExternalNetwork: true,
      allowCredentialAccess: false,
      allowFinancialWrites: false,
    },
  }));
  writeFileSync(join(home, '.upup', 'sops', 'guard-sop.yaml'), [
    'id: guard-sop',
    'name: Guard SOP',
    'description: coverage guard user SOP',
    'version: 1.0.0',
    'phases:',
    '  - id: detect',
    '    agent: invest-explore',
    '    intent: gather evidence',
    '  - id: report',
    '    agent: guard-analyst',
    '    intent: report',
    '    requires: [detect]',
    '',
  ].join('\n'));

  const userAgents = loadUserAgentSpecs({ home, cwd });
  if (userAgents.warnings.length > 0) failures.push(`user agent load warnings: ${userAgents.warnings.join('; ')}`);
  if (!userAgents.agents.some((a) => a.id === 'guard-analyst')) {
    failures.push('user agent ~/.upup/agents/guard-analyst.json was not discovered');
  }

  const merged = mergeAgentCatalog(builtinAgents, userAgents.agents);
  if (merged.length <= builtinAgents.length) {
    failures.push('merged agent catalog did not include the user-defined agent');
  }

  const userSops = loadSops({ home, cwd, disableBuiltins: true });
  if (!userSops.sops.some((s) => s.id === 'guard-sop')) {
    failures.push('user SOP ~/.upup/sops/guard-sop.yaml was not discovered');
  }

  // Full validation pass with the merged catalog.
  loadAndValidateSops(merged, { home, cwd, disableBuiltins: true });
} finally {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
}

// 5. Install path must land in `$UPUP_HOME/sops` (and must be removable).
const installHome = mkdtempSync(join(tmpdir(), 'upup-sop-guard-install-'));
const installSource = mkdtempSync(join(tmpdir(), 'upup-sop-guard-src-'));
const previousUpupHome = process.env.UPUP_HOME;
try {
  process.env.UPUP_HOME = installHome;
  if (resolveUpUpHomeRoot() !== installHome) {
    failures.push('resolveUpUpHomeRoot() ignored $UPUP_HOME');
  }
  const yamlPath = join(installSource, 'guard-install.yaml');
  writeFileSync(yamlPath, [
    'id: guard-install',
    'name: Guard Install',
    'description: install-path guard SOP',
    'version: 1.0.0',
    'phases:',
    '  - id: detect',
    '    agent: invest-explore',
    '    intent: gather evidence',
    '  - id: report',
    '    agent: invest-review',
    '    intent: report',
    '    requires: [detect]',
    '',
  ].join('\n'));

  const installed = await installSops(yamlPath, { cwd, home });
  const expected = join(installHome, 'sops', 'guard-install.yaml');
  if (installed.targetDir !== join(installHome, 'sops')) {
    failures.push(`/sop install targeted ${installed.targetDir}, expected ${join(installHome, 'sops')}`);
  }
  if (!existsSync(expected)) failures.push(`/sop install did not write ${expected}`);
  if (installedSopPath('guard-install') !== expected) {
    failures.push('installedSopPath() did not resolve the $UPUP_HOME install');
  }

  // A second install without --force must be a no-op.
  const again = await installSops(yamlPath, { cwd, home });
  if (again.installed.length !== 0 || again.skipped[0] !== 'guard-install') {
    failures.push('/sop install overwrote an existing SOP without --force');
  }

  const removed = uninstallSop('guard-install', { cwd, home });
  if (!removed.removed || existsSync(expected)) failures.push('/sop uninstall did not remove the installed SOP');
} finally {
  if (previousUpupHome === undefined) delete process.env.UPUP_HOME;
  else process.env.UPUP_HOME = previousUpupHome;
  rmSync(installHome, { recursive: true, force: true });
  rmSync(installSource, { recursive: true, force: true });
}

// 6. Report.
const summary = builtin.sops
  .map((s) => `${s.id}(${s.phases.length} phases${s.parallelGroups?.length ? `, ${s.parallelGroups.length} group(s)` : ''})`)
  .join(', ');
console.log(`check:sop-coverage — built-in SOPs: ${builtin.sops.length} [${summary}]`);

if (failures.length > 0) {
  console.error('\ncheck:sop-coverage FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check:sop-coverage OK');
