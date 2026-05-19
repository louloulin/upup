/**
 * 完整的 Skills 系统生命周期测试
 * 验证所有 skills 功能和执行流程
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  // Registry functions
  discoverSkills,
  getSkill,
  clearSkillCache,
  buildSkillMetadataSection,
  // Executor functions
  createSkillCommand,
  getPromptForCommand,
  substituteArguments,
  parseArgumentNames,
  executeSkill,
  executeSkillInline,
  shouldUseForkMode,
  getSessionId,
  setSessionId,
  // Shell execution
  executeShellCommandsInPrompt,
  containsShellCommands,
  extractShellCommands,
  isCommandAllowed,
  // Commands functions
  initializeSkills,
  getSkillCommand,
  getAllSkillCommands,
  getCommandsBySource,
  hasCommand,
  searchCommands,
  executeSkillCommand,
  getRegisteredCommandCount,
  isInitialized,
  resetInitialization,
} from '../src/skills/index.js';

// ============================================================================
// 1. Registry Tests - 技能发现和加载
// ============================================================================

describe('Skills Registry', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  it('should discover skills from all directories', () => {
    const skills = discoverSkills();
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should discover at least 12 skills', () => {
    const skills = discoverSkills();
    expect(skills.length).toBeGreaterThanOrEqual(12);
  });

  it('should return skill metadata with required fields', () => {
    const skills = discoverSkills();
    const skill = skills[0];

    expect(skill.name).toBeDefined();
    expect(typeof skill.name).toBe('string');
    expect(skill.name.length).toBeGreaterThan(0);

    expect(skill.path).toBeDefined();
    expect(skill.path).toContain('SKILL.md');

    expect(skill.description).toBeDefined();
    expect(typeof skill.description).toBe('string');

    expect(skill.source).toBeDefined();
  });

  it('should load full skill with instructions', () => {
    const skills = discoverSkills();
    const firstSkill = skills[0];
    const skill = getSkill(firstSkill.name);

    expect(skill).toBeDefined();
    expect(skill.instructions).toBeDefined();
    expect(skill.instructions.length).toBeGreaterThan(0);
  });

  it('should return undefined for non-existent skill', () => {
    const skill = getSkill('non-existent-skill-xyz-123');
    expect(skill).toBeUndefined();
  });

  it('should cache discovered skills', () => {
    const skills1 = discoverSkills();
    const skills2 = discoverSkills();
    // Should return same data (same cache)
    expect(skills1.length).toBe(skills2.length);
    expect(skills1[0].name).toBe(skills2[0].name);
  });

  it('should clear cache on clearSkillCache()', () => {
    discoverSkills(); // Populate cache
    clearSkillCache();
    // Should not error on re-discovery
    const skills = discoverSkills();
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should build skill metadata section for system prompt', () => {
    const section = buildSkillMetadataSection();
    expect(section).toBeDefined();
    expect(typeof section).toBe('string');
    expect(section.length).toBeGreaterThan(0);
    // Should contain skill names
    const skills = discoverSkills();
    if (skills.length > 0) {
      expect(section).toContain(skills[0].name);
    }
  });
});

// ============================================================================
// 2. Skill Command Creation Tests - 命令创建
// ============================================================================

describe('Skill Command Creation', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  it('should create SkillCommand with correct type', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    expect(cmd.type).toBe('prompt');
  });

  it('should preserve skill name and description', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    expect(cmd.name).toBe(skill.name);
    expect(cmd.description).toBe(skill.description);
  });

  it('should set skillRoot from skill path', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    expect(cmd.skillRoot).toBeDefined();
    expect(cmd.skillRoot).not.toContain('SKILL.md');
    expect(cmd.skillRoot).toContain(skill.name);
  });

  it('should have getPromptForCommand method', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    expect(typeof cmd.getPromptForCommand).toBe('function');
  });

  it('should preserve allowedTools if defined', () => {
    const skills = discoverSkills();
    for (const meta of skills) {
      const skill = getSkill(meta.name);
      if (skill?.allowedTools && skill.allowedTools.length > 0) {
        const cmd = createSkillCommand(skill);
        expect(cmd.allowedTools).toEqual(skill.allowedTools);
        break;
      }
    }
  });

  it('should preserve effort if defined', () => {
    const skills = discoverSkills();
    for (const meta of skills) {
      const skill = getSkill(meta.name);
      if (skill?.effort) {
        const cmd = createSkillCommand(skill);
        expect(cmd.effort).toBe(skill.effort);
        break;
      }
    }
  });
});

// ============================================================================
// 3. Prompt Generation Tests - 提示生成
// ============================================================================

describe('Prompt Generation', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  it('should return ContentBlock array from getPromptForCommand', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    const result = await cmd.getPromptForCommand('');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe('text');
    expect(typeof result[0].text).toBe('string');
  });

  it('should include Base directory prefix', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    const result = await cmd.getPromptForCommand('');

    expect(result[0].text).toContain('Base directory for this skill:');
    expect(result[0].text).toContain(cmd.skillRoot);
  });

  it('should include skill instructions', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    const result = await cmd.getPromptForCommand('');

    expect(result[0].text).toContain(skill.instructions);
  });

  it('should substitute args in content', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    const testArgs = '贵州茅台 600519.SH';
    const result = await cmd.getPromptForCommand(testArgs);

    // Args should be appended (via substituteArguments with allowArbitraryArgs=true)
    // The result should contain the args in some form
    expect(result[0].text.length).toBeGreaterThan(skill.instructions.length);
  });

  it('should replace CLAUDE_SKILL_DIR variable', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    const result = await cmd.getPromptForCommand('');

    expect(result[0].text).not.toContain('${CLAUDE_SKILL_DIR}');
  });

  it('should replace CLAUDE_SESSION_ID variable', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    const cmd = createSkillCommand(skill);

    // First, create a skill with ${CLAUDE_SESSION_ID} in instructions
    const testSkill = {
      ...skill,
      instructions: 'Session: ${CLAUDE_SESSION_ID}',
    };
    const testCmd = createSkillCommand(testSkill);

    // Set known session ID
    setSessionId('test-session-123');
    const result = await testCmd.getPromptForCommand('');

    expect(result[0].text).not.toContain('${CLAUDE_SESSION_ID}');
    expect(result[0].text).toContain('test-session-123');
  });

  it('should handle standalone getPromptForCommand', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;

    const result = await getPromptForCommand(skill, 'test args');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe('text');
  });
});

// ============================================================================
// 4. Argument Substitution Tests - 参数替换
// ============================================================================

describe('Argument Substitution', () => {
  it('should replace {{args}} placeholder', () => {
    const content = 'Task: {{args}}';
    const result = substituteArguments(content, 'my args');
    expect(result).toBe('Task: my args');
  });

  it('should replace {{argument}} placeholder', () => {
    const content = 'Argument: {{argument}}';
    const result = substituteArguments(content, 'my argument');
    expect(result).toBe('Argument: my argument');
  });

  it('should replace named arguments', () => {
    const content = 'Stock: {{stock}}, Price: {{price}}';
    const result = substituteArguments(content, '贵州茅台 100', true, ['stock', 'price']);
    expect(result).toContain('贵州茅台 100');
  });

  it('should replace multiple {{args}} occurrences', () => {
    const content = '{{args}} and {{args}}';
    const result = substituteArguments(content, 'test');
    expect(result).toBe('test and test');
  });

  it('should handle empty args', () => {
    const content = 'Task: {{args}}';
    const result = substituteArguments(content, '');
    expect(result).toBe('Task: ');
  });

  it('should handle special characters in args', () => {
    const content = 'Code: {{args}}';
    const result = substituteArguments(content, 'echo "hello" | grep world');
    expect(result).toBe('Code: echo "hello" | grep world');
  });

  it('should parse argument names from angle brackets', () => {
    const result = parseArgumentNames('<stock>');
    expect(result).toEqual(['stock']);
  });

  it('should parse multiple argument names', () => {
    const result = parseArgumentNames('<stock> <date> <format>');
    expect(result).toEqual(['stock', 'date', 'format']);
  });

  it('should return empty array for undefined', () => {
    const result = parseArgumentNames(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    const result = parseArgumentNames('');
    expect(result).toEqual([]);
  });
});

// ============================================================================
// 5. Shell Command Execution Tests - Shell 命令执行
// ============================================================================

describe('Shell Command Execution', () => {
  it('should detect shell commands with !` syntax', () => {
    expect(containsShellCommands('Hello !`echo world`')).toBe(true);
  });

  it('should detect shell commands with ```! block syntax', () => {
    expect(containsShellCommands('```!\necho test\n```')).toBe(true);
  });

  it('should return false for text without shell commands', () => {
    expect(containsShellCommands('Hello world')).toBe(false);
  });

  it('should extract inline shell commands', () => {
    const text = 'Before !`echo first` after';
    const commands = extractShellCommands(text);

    expect(commands.length).toBeGreaterThanOrEqual(1);
    expect(commands[0]).toContain('echo');
  });

  it('should extract block shell commands', () => {
    const text = '```!\necho block\n```';
    const commands = extractShellCommands(text);

    expect(commands.length).toBeGreaterThanOrEqual(1);
    expect(commands[0]).toContain('echo');
  });

  it('should execute inline shell command and replace', async () => {
    const text = 'Value: !`echo 12345`';
    const result = await executeShellCommandsInPrompt(text, undefined, '/test');

    // Should contain the echo output
    expect(result).toContain('12345');
  }, 10000);

  it('should execute block shell command and replace', async () => {
    const text = '```!\necho hello\n```';
    const result = await executeShellCommandsInPrompt(text, undefined, '/test');

    expect(result).toContain('hello');
  });

  it('should allow specific commands', () => {
    expect(isCommandAllowed('echo hello', ['echo', 'cat'])).toBe(true);
  });

  it('should deny disallowed commands', () => {
    expect(isCommandAllowed('rm -rf /', ['echo', 'cat'])).toBe(false);
  });

  it('should allow all when no restrictions', () => {
    expect(isCommandAllowed('rm -rf /', undefined)).toBe(true);
    expect(isCommandAllowed('rm -rf /', [])).toBe(true);
  });
});

// ============================================================================
// 6. Session ID Tests - 会话 ID
// ============================================================================

describe('Session ID', () => {
  it('should generate session ID', () => {
    // Reset to generate new ID
    setSessionId('');
    const id = getSessionId();

    expect(id).toBeDefined();
    expect(id.length).toBeGreaterThan(5);
  });

  it('should allow setting custom session ID', () => {
    setSessionId('custom-session-123');
    const id = getSessionId();
    expect(id).toBe('custom-session-123');

    // Reset
    setSessionId('sess-reset');
  });

  it('should return same ID on multiple calls', () => {
    setSessionId('test-id-456');
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBe(id2);
  });
});

// ============================================================================
// 7. Skills Initialization Tests - 初始化
// ============================================================================

describe('Skills Initialization', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  it('should initialize all skills', async () => {
    const count = await initializeSkills();
    expect(count).toBeGreaterThan(0);
  });

  it('should return cached count on second call', async () => {
    const count1 = await initializeSkills();
    const count2 = await initializeSkills();
    expect(count1).toBe(count2);
  });

  it('should set initialized flag', async () => {
    expect(isInitialized()).toBe(false);
    await initializeSkills();
    expect(isInitialized()).toBe(true);
  });

  it('should register all discovered skills', async () => {
    await initializeSkills();
    const count = getRegisteredCommandCount();
    const skills = discoverSkills();
    // Note: discoverSkills() only returns file-based skills,
    // while registered commands include both bundled and file-based.
    // Total should be bundled (6) + file-based (12) = 18
    // The test verifies registration works, not exact count match
    expect(count).toBeGreaterThanOrEqual(skills.length);
  });

  it('should reset initialization state', async () => {
    await initializeSkills();
    expect(isInitialized()).toBe(true);

    resetInitialization();
    expect(isInitialized()).toBe(false);
  });
});

// ============================================================================
// 8. Command Retrieval Tests - 命令检索
// ============================================================================

describe('Command Retrieval', () => {
  beforeEach(async () => {
    clearSkillCache();
    resetInitialization();
    await initializeSkills();
  });

  it('should get command by name', () => {
    const skills = discoverSkills();
    const cmd = getSkillCommand(skills[0].name);
    expect(cmd).toBeDefined();
  });

  it('should get all commands', () => {
    const commands = getAllSkillCommands();
    expect(commands.length).toBeGreaterThan(0);
  });

  it('should filter commands by source', () => {
    const builtin = getCommandsBySource('builtin');
    const user = getCommandsBySource('user');
    const all = builtin.length + user.length;
    expect(all).toBeGreaterThan(0);
  });

  it('should check command existence', () => {
    const skills = discoverSkills();
    expect(hasCommand(skills[0].name)).toBe(true);
    expect(hasCommand('non-existent-xyz-123')).toBe(false);
  });

  it('should search commands by prefix', () => {
    const results = searchCommands('a');
    expect(results.length).toBeGreaterThan(0);
    // All results should start with 'a'
    for (const cmd of results) {
      expect(cmd.name.startsWith('a')).toBe(true);
    }
  });

  it('should execute skill command', async () => {
    const skills = discoverSkills();
    const result = await executeSkillCommand(skills[0].name, 'test');
    expect(result).toBeDefined();
    expect(result![0].type).toBe('text');
  });
});

// ============================================================================
// 9. Execution Mode Tests - 执行模式
// ============================================================================

describe('Execution Mode', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  it('should return true for fork context', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    skill.context = 'fork';

    expect(shouldUseForkMode(skill)).toBe(true);
  });

  it('should return false for inline context', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    skill.context = 'inline';

    expect(shouldUseForkMode(skill)).toBe(false);
  });

  it('should execute skill inline', async () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;

    const result = await executeSkillInline({ skill, args: 'test' });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it('should handle custom agent type', () => {
    const skills = discoverSkills();
    const skill = getSkill(skills[0].name)!;
    skill.agent = 'general';

    expect(shouldUseForkMode(skill)).toBe(true);
  });
});

// ============================================================================
// 10. Skills Menu Tests - 技能菜单
// ============================================================================

describe('Skills Menu', () => {
  beforeEach(async () => {
    clearSkillCache();
    resetInitialization();
    await initializeSkills();
  });

  it('should import SkillsMenu functions', async () => {
    const { getSkillsMenu, listSkills, showSkill, searchSkills } = await import('../src/skills/skills-menu.js');

    expect(typeof getSkillsMenu).toBe('function');
    expect(typeof listSkills).toBe('function');
    expect(typeof showSkill).toBe('function');
    expect(typeof searchSkills).toBe('function');
  });

  it('should list skills with menu', async () => {
    const { listSkills } = await import('../src/skills/skills-menu.js');

    const output = listSkills();
    expect(output).toContain('Skills Menu');
    expect(output).toContain('Total:');
  });

  it('should search skills', async () => {
    const { searchSkills } = await import('../src/skills/skills-menu.js');

    const output = searchSkills('stock');
    expect(output).toBeDefined();
  });

  it('should show skill details', async () => {
    const { showSkill } = await import('../src/skills/skills-menu.js');

    const skills = discoverSkills();
    const output = showSkill(skills[0].name);
    expect(output).toBeDefined();
  });
});

// ============================================================================
// 11. Full Integration Tests - 完整集成测试
// ============================================================================

describe('Full Integration', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  it('should complete full skill lifecycle', async () => {
    // 1. Discover skills
    const skills = discoverSkills();
    expect(skills.length).toBeGreaterThan(0);

    // 2. Get skill
    const skill = getSkill(skills[0].name);
    expect(skill).toBeDefined();

    // 3. Create command
    const cmd = createSkillCommand(skill!);
    expect(cmd.name).toBe(skill!.name);

    // 4. Initialize
    const count = await initializeSkills();
    // Note: count includes bundled + file-based skills, while discoverSkills() only returns file-based
    expect(count).toBeGreaterThanOrEqual(skills.length);

    // 5. Execute
    const result = await cmd.getPromptForCommand('test args');
    expect(result[0].text).toContain(skill!.instructions);

    // 6. Verify command is registered
    const registered = getSkillCommand(skill!.name);
    expect(registered).toBeDefined();
  });

  it('should execute multiple skills in sequence', async () => {
    await initializeSkills();
    const commands = getAllSkillCommands();

    for (const cmd of commands.slice(0, 3)) {
      const result = await cmd.getPromptForCommand(`Testing ${cmd.name}`);
      expect(result[0].text).toBeDefined();
      expect(result[0].text.length).toBeGreaterThan(0);
    }
  });

  it('should handle concurrent skill loading', async () => {
    const skills = discoverSkills();

    // Load multiple skills concurrently
    const loadedSkills = await Promise.all(
      skills.slice(0, 5).map(meta => getSkill(meta.name))
    );

    for (const skill of loadedSkills) {
      expect(skill).toBeDefined();
      expect(skill!.instructions.length).toBeGreaterThan(0);
    }
  });

  it('should verify all skills have valid instructions', async () => {
    const skills = discoverSkills();

    for (const meta of skills) {
      const skill = getSkill(meta.name);
      expect(skill).toBeDefined();
      expect(skill!.instructions.length).toBeGreaterThan(10);
    }
  });

  it('should verify all skills can generate prompts', async () => {
    await initializeSkills();
    const commands = getAllSkillCommands();

    for (const cmd of commands) {
      const result = await cmd.getPromptForCommand('integration test');
      expect(result[0].text.length).toBeGreaterThan(100);
    }
  });
});
