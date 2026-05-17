/**
 * Unit tests for Skills System
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  initializeSkills,
  getSkillCommand,
  getAllSkillCommands,
  hasCommand,
  searchCommands,
  executeSkillCommand,
  getRegisteredCommandCount,
  isInitialized,
  resetInitialization,
} from '../src/skills/commands.js';
import {
  discoverSkills,
  getSkill,
  clearSkillCache,
} from '../src/skills/registry.js';
import {
  createSkillCommand,
  substituteArguments,
  parseArgumentNames,
  executeSkill,
  shouldUseForkMode,
} from '../src/skills/executor.js';

describe('Skills System', () => {
  beforeEach(() => {
    clearSkillCache();
    resetInitialization();
  });

  describe('discoverSkills', () => {
    it('should discover all available skills', () => {
      const skills = discoverSkills();
      expect(skills.length).toBeGreaterThan(0);
    });

    it('should return skill metadata with name and path', () => {
      const skills = discoverSkills();
      const skill = skills[0];
      expect(skill).toBeDefined();
      expect(skill.name).toBeDefined();
      expect(skill.path).toBeDefined();
    });
  });

  describe('getSkill', () => {
    it('should load full skill with instructions', () => {
      const skills = discoverSkills();
      const skill = getSkill(skills[0].name);
      expect(skill).toBeDefined();
      expect(skill.instructions).toBeDefined();
    });

    it('should return undefined for non-existent skill', () => {
      const skill = getSkill('non-existent-skill-xyz');
      expect(skill).toBeUndefined();
    });
  });

  describe('createSkillCommand', () => {
    it('should create SkillCommand with correct properties', () => {
      const skills = discoverSkills();
      const skill = getSkill(skills[0].name)!;
      const cmd = createSkillCommand(skill);

      expect(cmd.type).toBe('prompt');
      expect(cmd.name).toBe(skill.name);
      expect(typeof cmd.getPromptForCommand).toBe('function');
    });
  });

  describe('getPromptForCommand', () => {
    it('should return ContentBlock array', async () => {
      const skills = discoverSkills();
      const skill = getSkill(skills[0].name)!;
      const cmd = createSkillCommand(skill);

      const result = await cmd.getPromptForCommand('test args');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].type).toBe('text');
    });

    it('should include Base directory prefix', async () => {
      const skills = discoverSkills();
      const skill = getSkill(skills[0].name)!;
      const cmd = createSkillCommand(skill);

      const result = await cmd.getPromptForCommand('');
      expect(result[0].text).toContain('Base directory for this skill:');
    });
  });

  describe('substituteArguments', () => {
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
      const content = 'Stock: {{stock}}';
      const result = substituteArguments(content, '贵州茅台', true, ['stock']);
      expect(result).toBe('Stock: 贵州茅台');
    });
  });

  describe('parseArgumentNames', () => {
    it('should parse angle bracket arguments', () => {
      const result = parseArgumentNames('<stock>');
      expect(result).toEqual(['stock']);
    });

    it('should return empty array for undefined', () => {
      const result = parseArgumentNames(undefined);
      expect(result).toEqual([]);
    });
  });

  describe('initializeSkills', () => {
    it('should initialize and register all skills', async () => {
      const count = await initializeSkills();
      expect(count).toBeGreaterThan(0);
      expect(isInitialized()).toBe(true);
    });
  });

  describe('getAllSkillCommands', () => {
    it('should return all registered commands', async () => {
      await initializeSkills();
      const commands = getAllSkillCommands();
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should return SkillCommand objects with getPromptForCommand', async () => {
      await initializeSkills();
      const commands = getAllSkillCommands();
      const cmd = commands[0];
      expect(typeof cmd.getPromptForCommand).toBe('function');
    });
  });

  describe('hasCommand', () => {
    it('should return true for existing command', async () => {
      await initializeSkills();
      const commands = getAllSkillCommands();
      if (commands.length > 0) {
        expect(hasCommand(commands[0].name)).toBe(true);
      }
    });

    it('should return false for non-existent command', async () => {
      await initializeSkills();
      expect(hasCommand('non-existent-xyz-abc')).toBe(false);
    });
  });

  describe('executeSkillCommand', () => {
    it('should return content blocks for valid command', async () => {
      await initializeSkills();
      const commands = getAllSkillCommands();
      if (commands.length > 0) {
        const result = await executeSkillCommand(commands[0].name, 'test args');
        expect(result).toBeDefined();
        expect(result![0].type).toBe('text');
      }
    });
  });

  describe('getRegisteredCommandCount', () => {
    it('should return correct count after initialization', async () => {
      await initializeSkills();
      const count = getRegisteredCommandCount();
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('shouldUseForkMode', () => {
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
  });
});
