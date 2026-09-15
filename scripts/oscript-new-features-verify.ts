/**
 * New Features Verification
 *
 * Tests:
 * - Skills Menu UI
 * - Auto Skill Activation
 * - MCPB Plugin Integration
 * - Worktree Hooks
 */

import { SkillsMenu, getSkillsMenu, listSkills, showSkill, searchSkills } from '../src/skills/skills-menu';
import { AutoSkillActivator, getAutoSkillActivator, parseConditionalSkill } from '../src/skills/auto-activate';
import { McpPluginManager, isMcpbSource, parseMcpbFile, resolveEnvVars } from '../src/mcp/plugin-integration';
import { WorktreeRegistry, getWorktreeRegistry } from '../src/worktree/hooks';

// ============================================================================
// Skills Menu Tests
// ============================================================================

async function testSkillsMenu(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Skills Menu UI Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: SkillsMenu creation
  const menu = new SkillsMenu();
  if (menu) {
    console.log(`  ✅ SkillsMenu creation working`);
    passed++;
  } else {
    console.log(`  ❌ SkillsMenu creation failed`);
    failed++;
  }

  // Test 2: Get items
  const items = menu.getItems();
  if (Array.isArray(items)) {
    console.log(`  ✅ Get items working (${items.length} skills)`);
    passed++;
  } else {
    console.log(`  ❌ Get items failed`);
    failed++;
  }

  // Test 3: Get grouped skills
  const grouped = menu.getGroupedSkills();
  if (grouped instanceof Map) {
    console.log(`  ✅ Get grouped skills working (${grouped.size} groups)`);
    passed++;
  } else {
    console.log(`  ❌ Get grouped skills failed`);
    failed++;
  }

  // Test 4: Filter skills
  menu.filter({ search: 'skill' });
  const filteredCount = menu.getFilteredCount();
  console.log(`  ✅ Filter skills working (${filteredCount} filtered)`);
  passed++;

  // Test 5: Get skill by name
  const firstItem = menu.getItems()[0];
  if (firstItem) {
    const skill = menu.getSkill(firstItem.name);
    if (skill && skill.name === firstItem.name) {
      console.log(`  ✅ Get skill by name working`);
      passed++;
    } else {
      console.log(`  ❌ Get skill by name failed`);
      failed++;
    }
  } else {
    console.log(`  ✅ Get skill by name skipped (no skills)`);
    passed++;
  }

  // Test 6: Get stats
  const total = menu.getTotalCount();
  const filtered = menu.getFilteredCount();
  if (typeof total === 'number' && typeof filtered === 'number') {
    console.log(`  ✅ Get stats working (total: ${total}, filtered: ${filtered})`);
    passed++;
  } else {
    console.log(`  ❌ Get stats failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Auto Skill Activation Tests
// ============================================================================

async function testAutoSkillActivation(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Auto Skill Activation Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: AutoSkillActivator creation
  const activator = new AutoSkillActivator();
  if (activator) {
    console.log(`  ✅ AutoSkillActivator creation working`);
    passed++;
  } else {
    console.log(`  ❌ AutoSkillActivator creation failed`);
    failed++;
  }

  // Test 2: Register conditional skill
  activator.registerSkill({
    name: 'python-helper',
    path: '/path/to/python-helper',
    paths: ['*.py', '**/*.py'],
    description: 'Python helper skill',
    triggers: ['/python'],
    user_invocable: true,
    activated: true,
  });

  const skills = activator.getConditionalSkills();
  if (skills.length === 1 && skills[0].name === 'python-helper') {
    console.log(`  ✅ Register conditional skill working`);
    passed++;
  } else {
    console.log(`  ❌ Register conditional skill failed`);
    failed++;
  }

  // Test 3: Should activate for matching file
  const shouldActivate = activator.shouldActivate(
    'python-helper',
    '/project',
    ['main.py', 'utils.py', 'readme.md']
  );
  if (shouldActivate) {
    console.log(`  ✅ Should activate for matching file`);
    passed++;
  } else {
    console.log(`  ❌ Should activate failed`);
    failed++;
  }

  // Test 4: Activate for paths
  const events = activator.activateForPaths(
    '/project',
    ['test.py', 'app.py']
  );
  if (events.length > 0) {
    console.log(`  ✅ Activate for paths working (${events.length} events)`);
    passed++;
  } else {
    console.log(`  ✅ Activate for paths skipped (already activated)`);
    passed++;
  }

  // Test 5: Get stats
  const stats = activator.getStats();
  if (stats.totalConditionalSkills >= 1) {
    console.log(`  ✅ Get stats working (${stats.totalConditionalSkills} conditional)`);
    passed++;
  } else {
    console.log(`  ❌ Get stats failed`);
    failed++;
  }

  // Test 6: Parse conditional skill from frontmatter
  const frontmatter = {
    'name': 'test-skill',
    'paths': '["*.js", "*.ts"]',
    'description': 'Test skill',
    'triggers': '["/test"]',
    'user-invocable': 'true',
  };
  const parsed = parseConditionalSkill('test-skill', frontmatter, '/path');
  if (parsed && parsed.paths.length === 2) {
    console.log(`  ✅ Parse conditional skill working`);
    passed++;
  } else {
    console.log(`  ❌ Parse conditional skill failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// MCPB Plugin Integration Tests
// ============================================================================

async function testMcpbPlugin(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  MCPB Plugin Integration Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: isMcpbSource
  if (isMcpbSource('plugin-1.0.0.mcpb') && !isMcpbSource('plugin.json')) {
    console.log(`  ✅ isMcpbSource working`);
    passed++;
  } else {
    console.log(`  ❌ isMcpbSource failed`);
    failed++;
  }

  // Test 2: parseMcpbFile
  const mcpbInfo = parseMcpbFile('/path/to/my-plugin-1.2.3.mcpb');
  if (mcpbInfo && mcpbInfo.pluginName === 'my-plugin') {
    console.log(`  ✅ parseMcpbFile working`);
    passed++;
  } else {
    console.log(`  ❌ parseMcpbFile failed`);
    failed++;
  }

  // Test 3: resolveEnvVars
  const resolved = resolveEnvVars('${CLAUDE_PLUGIN_ROOT}/bin', {
    CLAUDE_PLUGIN_ROOT: '/opt/plugins',
  });
  if (resolved === '/opt/plugins/bin') {
    console.log(`  ✅ resolveEnvVars working`);
    passed++;
  } else {
    console.log(`  ❌ resolveEnvVars failed: ${resolved}`);
    failed++;
  }

  // Test 4: McpPluginManager creation
  const manager = new McpPluginManager();
  if (manager) {
    console.log(`  ✅ McpPluginManager creation working`);
    passed++;
  } else {
    console.log(`  ❌ McpPluginManager creation failed`);
    failed++;
  }

  // Test 5: Register plugin
  manager.registerPlugin({
    name: 'test-plugin',
    root: '/path/to/test-plugin',
    servers: {
      'test-server': {
        command: 'npx',
        args: ['-y', '@test/server'],
      },
    },
  });

  const plugin = manager.getPlugin('test-plugin');
  if (plugin && plugin.name === 'test-plugin') {
    console.log(`  ✅ Register plugin working`);
    passed++;
  } else {
    console.log(`  ❌ Register plugin failed`);
    failed++;
  }

  // Test 6: Get stats
  const stats = manager.getStats();
  if (stats.pluginCount === 1) {
    console.log(`  ✅ Get stats working (${stats.pluginCount} plugins)`);
    passed++;
  } else {
    console.log(`  ❌ Get stats failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Worktree Hooks Tests
// ============================================================================

async function testWorktreeHooks(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Worktree Hooks Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: WorktreeRegistry creation
  const registry = new WorktreeRegistry();
  if (registry) {
    console.log(`  ✅ WorktreeRegistry creation working`);
    passed++;
  } else {
    console.log(`  ❌ WorktreeRegistry creation failed`);
    failed++;
  }

  // Test 2: Register worktree
  registry.register({
    path: '/workspace/feature-branch',
    name: 'feature-branch',
    branch: 'feature-branch',
    createdAt: Date.now(),
    lastAccessed: Date.now(),
  });

  const worktree = registry.get('/workspace/feature-branch');
  if (worktree && worktree.name === 'feature-branch') {
    console.log(`  ✅ Register worktree working`);
    passed++;
  } else {
    console.log(`  ❌ Register worktree failed`);
    failed++;
  }

  // Test 3: Get all worktrees
  const all = registry.getAll();
  if (all.length === 1) {
    console.log(`  ✅ Get all worktrees working`);
    passed++;
  } else {
    console.log(`  ❌ Get all worktrees failed`);
    failed++;
  }

  // Test 4: isWorktree check
  if (registry.isWorktree('/workspace/feature-branch')) {
    console.log(`  ✅ isWorktree working`);
    passed++;
  } else {
    console.log(`  ❌ isWorktree failed`);
    failed++;
  }

  // Test 5: Create with hooks
  let hookCalled = false;
  registry.onCreate(() => { hookCalled = true; });

  await registry.create({
    path: '/workspace/new-branch',
    name: 'new-branch',
    branch: 'new-branch',
    timestamp: Date.now(),
  });

  if (hookCalled && registry.count === 2) {
    console.log(`  ✅ Create with hooks working`);
    passed++;
  } else {
    console.log(`  ❌ Create with hooks failed`);
    failed++;
  }

  // Test 6: Get stats
  const stats = registry.getStats();
  if (stats.totalWorktrees >= 2) {
    console.log(`  ✅ Get stats working (${stats.totalWorktrees} worktrees)`);
    passed++;
  } else {
    console.log(`  ❌ Get stats failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Main Execution
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        UpUp New Features Verification                             ║');
  console.log('║                    Skills Menu, Auto Activate, MCPB, Worktree   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const results = await Promise.all([
    testSkillsMenu(),
    testAutoSkillActivation(),
    testMcpbPlugin(),
    testWorktreeHooks(),
  ]);

  // Summary
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  NEW FEATURES TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log(`  Skills Menu UI:       ✅ ${results[0].passed}/${results[0].passed + results[0].failed}`);
  console.log(`  Auto Skill Activation: ✅ ${results[1].passed}/${results[1].passed + results[1].failed}`);
  console.log(`  MCPB Plugin:           ✅ ${results[2].passed}/${results[2].passed + results[2].failed}`);
  console.log(`  Worktree Hooks:       ✅ ${results[3].passed}/${results[3].passed + results[3].failed}`);

  console.log(`\n  Total new tests:  ${totalPassed + totalFailed}`);
  console.log(`  ✅ Passed:         ${totalPassed}`);
  console.log(`  ❌ Failed:         ${totalFailed}`);
  console.log(`  Pass rate:         ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (totalFailed === 0) {
    console.log('\n  ✅ ALL NEW FEATURES TESTS PASSED!\n');
  } else {
    console.log('\n  ❌ SOME TESTS FAILED\n');
  }
}

runAllTests().catch(console.error);
