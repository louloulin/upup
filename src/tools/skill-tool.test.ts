/**
 * Tests for SkillTool
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import {
  SkillListSchema,
  SkillExecuteSchema,
  SkillInfoSchema,
  SKILL_LIST_DESCRIPTION,
  SKILL_EXECUTE_DESCRIPTION,
  SKILL_INFO_DESCRIPTION,
  createSkillListTool,
  createSkillExecuteTool,
  createSkillInfoTool,
} from './skill-tool.js';

// ---------------------------------------------------------------------------
// Mock the skills registry (requires filesystem access at runtime)
// ---------------------------------------------------------------------------

const mockSkillMetadata = {
  name: 'dcf',
  description: 'Discounted Cash Flow valuation analysis',
  path: '/mock/skills/dcf/SKILL.md',
  source: 'builtin' as const,
  model: 'sonnet' as const,
  userInvocable: true,
  argumentHint: '<ticker>',
};

const mockSkillFull = {
  ...mockSkillMetadata,
  instructions: 'You are a DCF analysis expert. Analyze the given company...',
};

vi.mock('../skills/registry.js', () => ({
  discoverSkills: vi.fn(),
  getSkill: vi.fn(),
}));

// Import mocked functions for per-test control
import { discoverSkills, getSkill } from '../skills/registry.js';

// bun:test does not support vi.mocked() - use type assertion instead
const mockedDiscoverSkills = discoverSkills as unknown as ReturnType<typeof vi.fn>;
const mockedGetSkill = getSkill as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('SkillListSchema', () => {
  it('should parse input without category', () => {
    const result = SkillListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse input with category', () => {
    const result = SkillListSchema.safeParse({ category: 'builtin' });
    expect(result.success).toBe(true);
  });

  it('should accept all valid categories', () => {
    for (const cat of ['builtin', 'user', 'project']) {
      const result = SkillListSchema.safeParse({ category: cat });
      expect(result.success).toBe(true);
    }
  });
});

describe('SkillExecuteSchema', () => {
  it('should parse input with name only', () => {
    const result = SkillExecuteSchema.safeParse({ name: 'dcf' });
    expect(result.success).toBe(true);
  });

  it('should parse input with name and args', () => {
    const result = SkillExecuteSchema.safeParse({ name: 'dcf', args: 'AAPL' });
    expect(result.success).toBe(true);
  });

  it('should require name', () => {
    const result = SkillExecuteSchema.safeParse({ args: 'AAPL' });
    expect(result.success).toBe(false);
  });
});

describe('SkillInfoSchema', () => {
  it('should parse valid input', () => {
    const result = SkillInfoSchema.safeParse({ name: 'dcf' });
    expect(result.success).toBe(true);
  });

  it('should require name', () => {
    const result = SkillInfoSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Description tests
// ---------------------------------------------------------------------------

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(SKILL_LIST_DESCRIPTION.length).toBeGreaterThan(10);
    expect(SKILL_EXECUTE_DESCRIPTION.length).toBeGreaterThan(10);
    expect(SKILL_INFO_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention skills', () => {
    expect(SKILL_LIST_DESCRIPTION).toContain('skill');
    expect(SKILL_EXECUTE_DESCRIPTION).toContain('skill');
    expect(SKILL_INFO_DESCRIPTION).toContain('skill');
  });
});

// ---------------------------------------------------------------------------
// Tool name tests
// ---------------------------------------------------------------------------

describe('createSkillListTool', () => {
  it('should create tool with correct name', () => {
    const tool = createSkillListTool();
    expect(tool.name).toBe('skill_list');
  });

  it('should have a callable func', () => {
    const tool = createSkillListTool();
    expect(typeof tool.func).toBe('function');
  });
});

describe('createSkillExecuteTool', () => {
  it('should create tool with correct name', () => {
    const tool = createSkillExecuteTool();
    expect(tool.name).toBe('skill_execute');
  });

  it('should have a callable func', () => {
    const tool = createSkillExecuteTool();
    expect(typeof tool.func).toBe('function');
  });
});

describe('createSkillInfoTool', () => {
  it('should create tool with correct name', () => {
    const tool = createSkillInfoTool();
    expect(tool.name).toBe('skill_info');
  });

  it('should have a callable func', () => {
    const tool = createSkillInfoTool();
    expect(typeof tool.func).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Functional tests
// ---------------------------------------------------------------------------

describe('skill_list tool execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return formatted list of skills', async () => {
    mockedDiscoverSkills.mockReturnValue([mockSkillMetadata]);

    const tool = createSkillListTool();
    const result = await tool.invoke({});

    expect(result).toContain('dcf');
    expect(result).toContain('Discounted Cash Flow');
    expect(result).toContain('builtin');
    expect(mockedDiscoverSkills).toHaveBeenCalled();
  });

  it('should return message when no skills found', async () => {
    mockedDiscoverSkills.mockReturnValue([]);

    const tool = createSkillListTool();
    const result = await tool.invoke({});

    expect(result).toContain('No skills available');
  });

  it('should filter by category', async () => {
    const userSkill = { ...mockSkillMetadata, name: 'my-skill', source: 'user' as const };
    mockedDiscoverSkills.mockReturnValue([mockSkillMetadata, userSkill]);

    const tool = createSkillListTool();
    const result = await tool.invoke({ category: 'user' });

    expect(result).toContain('my-skill');
    expect(result).not.toContain('dcf');
  });

  it('should include model preference in output', async () => {
    mockedDiscoverSkills.mockReturnValue([mockSkillMetadata]);

    const tool = createSkillListTool();
    const result = await tool.invoke({});

    expect(result).toContain('[sonnet]');
  });
});

describe('skill_execute tool execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return full skill instructions for valid name', async () => {
    mockedGetSkill.mockReturnValue(mockSkillFull);

    const tool = createSkillExecuteTool();
    const result = await tool.invoke({ name: 'dcf' });

    expect(result).toContain('DCF analysis expert');
    expect(result).toContain('Skill: dcf');
    expect(mockedGetSkill).toHaveBeenCalledWith('dcf');
  });

  it('should include args when provided', async () => {
    mockedGetSkill.mockReturnValue(mockSkillFull);

    const tool = createSkillExecuteTool();
    const result = await tool.invoke({ name: 'dcf', args: 'AAPL' });

    expect(result).toContain('Arguments: AAPL');
  });

  it('should return error for invalid skill name', async () => {
    mockedGetSkill.mockReturnValue(undefined);

    const tool = createSkillExecuteTool();
    const result = await tool.invoke({ name: 'nonexistent' });

    expect(result).toContain('Skill not found');
    expect(result).toContain('nonexistent');
  });

  it('should include source in output', async () => {
    mockedGetSkill.mockReturnValue(mockSkillFull);

    const tool = createSkillExecuteTool();
    const result = await tool.invoke({ name: 'dcf' });

    expect(result).toContain('Source: builtin');
  });
});

describe('skill_info tool execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return detailed metadata for valid skill', async () => {
    mockedDiscoverSkills.mockReturnValue([mockSkillMetadata]);

    const tool = createSkillInfoTool();
    const result = await tool.invoke({ name: 'dcf' });

    expect(result).toContain('Name: dcf');
    expect(result).toContain('Description: Discounted Cash Flow valuation analysis');
    expect(result).toContain('Source: builtin');
    expect(result).toContain('Model: sonnet');
    expect(result).toContain('User-invocable: yes');
    expect(result).toContain('Argument hint: <ticker>');
    expect(result).toContain('/mock/skills/dcf/SKILL.md');
  });

  it('should return error for invalid skill name', async () => {
    mockedDiscoverSkills.mockReturnValue([]);

    const tool = createSkillInfoTool();
    const result = await tool.invoke({ name: 'nonexistent' });

    expect(result).toContain('Skill not found');
    expect(result).toContain('nonexistent');
  });

  it('should show "no" for non-user-invocable skill', async () => {
    const internalSkill = { ...mockSkillMetadata, name: 'internal', userInvocable: false };
    mockedDiscoverSkills.mockReturnValue([internalSkill]);

    const tool = createSkillInfoTool();
    const result = await tool.invoke({ name: 'internal' });

    expect(result).toContain('User-invocable: no');
  });

  it('should show "default" when no model preference', async () => {
    const noModelSkill = { ...mockSkillMetadata, name: 'basic', model: undefined };
    mockedDiscoverSkills.mockReturnValue([noModelSkill]);

    const tool = createSkillInfoTool();
    const result = await tool.invoke({ name: 'basic' });

    expect(result).toContain('Model: default');
  });

  it('should show "(none)" when no argument hint', async () => {
    const noHintSkill = { ...mockSkillMetadata, name: 'no-hint', argumentHint: undefined };
    mockedDiscoverSkills.mockReturnValue([noHintSkill]);

    const tool = createSkillInfoTool();
    const result = await tool.invoke({ name: 'no-hint' });

    expect(result).toContain('Argument hint: (none)');
  });
});
