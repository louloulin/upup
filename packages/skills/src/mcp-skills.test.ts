/**
 * MCP Skills Module Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  setMCPClient,
  getMCPClient,
  hasMCPClient,
  getMCPSkill,
  getAllMCPSkills,
  clearMCPSkills,
  mcpToolToSkill,
  type MCPSkillMetadata,
} from './mcp-skills.js';

describe('MCP Skills Module', () => {
  beforeEach(() => {
    clearMCPSkills();
  });

  // =========================================================================
  // MCP Client Management Tests
  // =========================================================================
  describe('MCP Client Management', () => {
    test('hasMCPClient returns false when no client set', () => {
      expect(hasMCPClient()).toBe(false);
    });

    test('getMCPClient returns null when no client set', () => {
      expect(getMCPClient()).toBeNull();
    });

    test('clearMCPSkills clears the registry', () => {
      clearMCPSkills();
      const skills = getAllMCPSkills();
      expect(skills).toEqual([]);
    });
  });

  // =========================================================================
  // Skill Registry Tests
  // =========================================================================
  describe('Skill Registry', () => {
    test('getMCPSkill returns undefined for non-existent skill', () => {
      const skill = getMCPSkill('non-existent');
      expect(skill).toBeUndefined();
    });

    test('getAllMCPSkills returns empty array initially', () => {
      const skills = getAllMCPSkills();
      expect(skills).toEqual([]);
    });

    test('clearMCPSkills removes all skills', () => {
      clearMCPSkills();
      expect(getAllMCPSkills().length).toBe(0);
    });
  });

  // =========================================================================
  // MCP Skill Metadata Tests
  // =========================================================================
  describe('MCPSkillMetadata', () => {
    test('MCPSkillMetadata has correct structure', () => {
      const metadata: MCPSkillMetadata = {
        name: 'test_skill',
        description: 'A test MCP skill',
        source: 'mcp',
        serverName: 'test_server',
        toolName: 'test_tool',
      };

      expect(metadata.name).toBe('test_skill');
      expect(metadata.description).toBe('A test MCP skill');
      expect(metadata.source).toBe('mcp');
      expect(metadata.serverName).toBe('test_server');
      expect(metadata.toolName).toBe('test_tool');
    });

    test('MCPSkillMetadata supports different sources', () => {
      const sources: MCPSkillMetadata['source'][] = ['mcp', 'builtin', 'user', 'project', 'plugin', 'agent'];
      
      for (const source of sources) {
        const metadata: MCPSkillMetadata = {
          name: 'test',
          description: 'test',
          source,
          serverName: 'test',
          toolName: 'test',
        };
        expect(metadata.source).toBe(source);
      }
    });
  });

  // =========================================================================
  // mcpToolToSkill Tests
  // =========================================================================
  describe('mcpToolToSkill', () => {
    test('creates skill from MCP tool metadata', () => {
      const metadata: MCPSkillMetadata = {
        name: 'filesystem_read',
        description: 'Read a file from the filesystem',
        source: 'mcp',
        serverName: 'filesystem',
        toolName: 'read',
      };

      const executeTool = async () => 'file content';
      const skill = mcpToolToSkill(metadata, executeTool);

      expect(skill.name).toBe('filesystem_read');
      expect(skill.description).toBe('Read a file from the filesystem');
      expect(skill.source).toBe('mcp');
      expect(skill.path).toBe('mcp:filesystem/read');
      expect(skill.userInvocable).toBe(true);
      expect(skill.argumentHint).toBe('Arguments for the MCP tool');
    });

    test('skill path includes server and tool names', () => {
      const metadata: MCPSkillMetadata = {
        name: 'custom_tool',
        description: 'A custom MCP tool',
        source: 'mcp',
        serverName: 'my_server',
        toolName: 'my_tool',
      };

      const executeTool = async () => 'result';
      const skill = mcpToolToSkill(metadata, executeTool);

      expect(skill.path).toContain('my_server');
      expect(skill.path).toContain('my_tool');
    });

    test('skill has instructions with tool name', () => {
      const metadata: MCPSkillMetadata = {
        name: 'api_fetch',
        description: 'Fetch data from an API',
        source: 'mcp',
        serverName: 'api',
        toolName: 'fetch',
      };

      const executeTool = async () => 'data';
      const skill = mcpToolToSkill(metadata, executeTool);

      // Instructions include the tool name
      expect(skill.instructions).toContain('fetch');
      expect(skill.instructions).toContain('api');
    });

    test('skill instructions include description', () => {
      const metadata: MCPSkillMetadata = {
        name: 'test',
        description: 'This is a test description',
        source: 'mcp',
        serverName: 'test_server',
        toolName: 'test_tool',
      };

      const executeTool = async () => '';
      const skill = mcpToolToSkill(metadata, executeTool);

      expect(skill.instructions).toContain('This is a test description');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    test('handles empty metadata values', () => {
      const metadata: MCPSkillMetadata = {
        name: '',
        description: '',
        source: 'mcp',
        serverName: '',
        toolName: '',
      };

      const executeTool = async () => '';
      const skill = mcpToolToSkill(metadata, executeTool);

      expect(skill.name).toBe('');
      expect(skill.description).toBe('');
    });

    test('handles long tool names and descriptions', () => {
      const longDescription = 'A'.repeat(1000);
      const metadata: MCPSkillMetadata = {
        name: 'long_name_tool',
        description: longDescription,
        source: 'mcp',
        serverName: 'long_server',
        toolName: 'long_tool',
      };

      const executeTool = async () => '';
      const skill = mcpToolToSkill(metadata, executeTool);

      expect(skill.description.length).toBe(1000);
    });

    test('handles special characters in names', () => {
      const metadata: MCPSkillMetadata = {
        name: 'tool-with-dashes_and_underscores',
        description: 'Tool with special chars: @#$%',
        source: 'mcp',
        serverName: 'server-123',
        toolName: 'tool_abc',
      };

      const executeTool = async () => '';
      const skill = mcpToolToSkill(metadata, executeTool);

      expect(skill.name).toContain('tool-with-dashes');
    });
  });
});
