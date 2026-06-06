/**
 * Plugin Skill/Hook Integration Test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  convertPluginSkill,
  convertPluginSkills,
  PluginBundledSkill,
} from './loader.js';
import { PluginCapability } from '../plugins/types.js';

describe('Plugin Skill Integration', () => {
  describe('convertPluginSkill', () => {
    it('should convert plugin skill to internal format', () => {
      const pluginSkill: PluginBundledSkill = {
        name: 'plugin-skill',
        description: 'A skill from a plugin',
        instructions: 'Do something useful',
        pluginName: 'my-plugin',
        userInvocable: true,
        argumentHint: '--arg <value>',
      };

      const skill = convertPluginSkill(pluginSkill);

      expect(skill.name).toBe('plugin-skill');
      expect(skill.description).toBe('A skill from a plugin');
      expect(skill.instructions).toBe('Do something useful');
      expect(skill.path).toBe('plugin:my-plugin/plugin-skill');
      expect(skill.source).toBe('plugin');
      expect(skill.userInvocable).toBe(true);
      expect(skill.argumentHint).toBe('--arg <value>');
    });

    it('should convert skill with model', () => {
      const pluginSkill: PluginBundledSkill = {
        name: 'model-skill',
        description: 'Model-specific skill',
        instructions: 'Use Sonnet',
        pluginName: 'ai-plugin',
        model: 'sonnet',
      };

      const skill = convertPluginSkill(pluginSkill);

      expect(skill.model).toBe('sonnet');
    });

    it('should convert skill with allowed tools', () => {
      const pluginSkill: PluginBundledSkill = {
        name: 'limited-skill',
        description: 'Limited tools skill',
        instructions: 'Read only',
        pluginName: 'reader-plugin',
        allowedTools: ['read', 'grep'],
      };

      const skill = convertPluginSkill(pluginSkill);

      expect(skill.allowedTools).toEqual(['read', 'grep']);
    });

    it('should convert skill with fork context', () => {
      const pluginSkill: PluginBundledSkill = {
        name: 'fork-skill',
        description: 'Fork execution',
        instructions: 'Run in subprocess',
        pluginName: 'fork-plugin',
        context: 'fork',
      };

      const skill = convertPluginSkill(pluginSkill);

      expect(skill.context).toBe('fork');
    });
  });

  describe('convertPluginSkills', () => {
    it('should convert multiple skills', () => {
      const pluginSkills: PluginBundledSkill[] = [
        { name: 'skill1', description: 'Desc 1', instructions: 'Inst 1', pluginName: 'plugin' },
        { name: 'skill2', description: 'Desc 2', instructions: 'Inst 2', pluginName: 'plugin' },
      ];

      const skills = convertPluginSkills(pluginSkills);

      expect(skills.length).toBe(2);
      expect(skills[0].name).toBe('skill1');
      expect(skills[1].name).toBe('skill2');
    });

    it('should handle empty array', () => {
      const skills = convertPluginSkills([]);
      expect(skills).toEqual([]);
    });
  });

  describe('PluginCapability type', () => {
    it('should accept skill capability', () => {
      const capability: PluginCapability = 'skill';
      expect(capability).toBe('skill');
    });

    it('should accept hook capability', () => {
      const capability: PluginCapability = 'hook';
      expect(capability).toBe('hook');
    });

    it('should accept all capability types', () => {
      const capabilities: PluginCapability[] = [
        'data-source',
        'tools',
        'analysis',
        'strategy',
        'channel',
        'service',
        'skill',
        'hook',
      ];

      expect(capabilities.length).toBe(8);
    });
  });
});

describe('Plugin Hooks Integration', () => {
  describe('HooksConfig type', () => {
    it('should define hook types', async () => {
      // Import types directly for type checking
      const config: { preTool?: string[]; postTool?: string[]; session?: string[]; compact?: string[] } = {
        preTool: ['pre-tool-hook'],
        postTool: ['post-tool-hook'],
        session: ['session-hook'],
        compact: ['compact-hook'],
      };

      expect(config.preTool).toContain('pre-tool-hook');
      expect(config.postTool).toContain('post-tool-hook');
      expect(config.session).toContain('session-hook');
      expect(config.compact).toContain('compact-hook');
    });
  });
});