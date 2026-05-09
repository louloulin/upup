#!/usr/bin/env bun
/**
 * Phase 4 verification script — tests that the registry split works at runtime.
 * Run: bun run scripts/verify-registry.ts
 */

console.log('=== Phase 4: Registry Split Verification ===\n');

// Test 1: Import the registry module
console.log('[1] Importing registry/index.js...');
const { getTools, getToolRegistry, getToolConcurrencyMap, buildCompactToolDescriptions } = await import('../src/tools/registry/index.js');
console.log('    ✅ Import succeeded\n');

// Test 2: Load the full tool registry
console.log('[2] Loading tool registry (all domains)...');
const registry = await getToolRegistry('gpt-4o');
console.log(`    ✅ Loaded ${registry.length} tools\n`);

// Test 3: Verify domain tools present
const toolNames = new Set(registry.map(t => t.name));
const expected = [
  'get_financials',      // finance
  'web_fetch',           // web-search
  'read_file',           // filesystem
  'calculate_var',       // quant
  'read_filings',        // finance
  'add_position',        // domain
  'memory_search',       // filesystem
  'heartbeat',           // filesystem
  'cron',                // filesystem
  'agent',               // agent-planning
  'task_create',         // agent-planning
];
const missing = expected.filter(n => !toolNames.has(n));
if (missing.length) {
  console.log(`    ❌ Missing tools: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`    ✅ All expected domain tools present (${expected.length}/${expected.length} checked)\n`);

// Test 4: Concurrency map
console.log('[3] Testing getToolConcurrencyMap...');
const cmap = await getToolConcurrencyMap('gpt-4o');
console.log(`    ✅ Concurrency map: ${cmap.size} entries\n`);

// Test 5: Compact descriptions
console.log('[4] Testing buildCompactToolDescriptions...');
const desc = await buildCompactToolDescriptions('gpt-4o');
const lines = desc.split('\n').filter(l => l.trim());
console.log(`    ✅ Compact descriptions: ${lines.length} lines\n`);

// Test 6: commands.ts can import getTools
console.log('[5] Testing commands.ts dynamic import of registry...');
const cmdMod = await import('../src/commands/registry.js');
const cmdReg = cmdMod.getGlobalRegistry();
const cmds = cmdReg.list();
console.log(`    ✅ Command registry: ${cmds.length} commands registered\n`);

console.log('=== All Phase 4 checks passed ===');
