/**
 * Tests for TeamTools
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  TeamCreateSchema,
  TeamDeleteSchema,
  TeamListSchema,
  TeamAddMemberSchema,
  TeamRemoveMemberSchema,
  TeamStatusSchema,
  TeamUpdateStatusSchema,
  TEAM_CREATE_DESCRIPTION,
  TEAM_DELETE_DESCRIPTION,
  TEAM_LIST_DESCRIPTION,
  TEAM_ADD_MEMBER_DESCRIPTION,
  TEAM_REMOVE_MEMBER_DESCRIPTION,
  TEAM_STATUS_DESCRIPTION,
  TEAM_UPDATE_STATUS_DESCRIPTION,
} from './team-tools.js';

// Note: Store operations tested via tool factory tests
// The module-level teamStore is shared; we reset via team_delete

describe('TeamCreateSchema', () => {
  it('should parse valid input with name only', () => {
    const result = TeamCreateSchema.safeParse({ name: 'Research Team' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input with name and description', () => {
    const result = TeamCreateSchema.safeParse({
      name: 'Research Team',
      description: 'Market analysis team',
    });
    expect(result.success).toBe(true);
  });

  it('should require name', () => {
    const result = TeamCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = TeamCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject name too long', () => {
    const result = TeamCreateSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('TeamDeleteSchema', () => {
  it('should parse valid team_name', () => {
    const result = TeamDeleteSchema.safeParse({ team_name: 'my-team' });
    expect(result.success).toBe(true);
  });

  it('should require team_name', () => {
    const result = TeamDeleteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty team_name', () => {
    const result = TeamDeleteSchema.safeParse({ team_name: '' });
    expect(result.success).toBe(false);
  });
});

describe('TeamListSchema', () => {
  it('should parse empty input', () => {
    const result = TeamListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse with status filter', () => {
    const result = TeamListSchema.safeParse({ status: 'active' });
    expect(result.success).toBe(true);
  });

  it('should accept all status values', () => {
    for (const status of ['active', 'paused', 'completed']) {
      const result = TeamListSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should parse with limit', () => {
    const result = TeamListSchema.safeParse({ limit: 10 });
    expect(result.success).toBe(true);
  });

  it('should reject limit below 1', () => {
    const result = TeamListSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const result = TeamListSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });
});

describe('TeamAddMemberSchema', () => {
  it('should parse valid input', () => {
    const result = TeamAddMemberSchema.safeParse({
      team_name: 'my-team',
      name: 'Alice',
      role: 'researcher',
    });
    expect(result.success).toBe(true);
  });

  it('should require all fields', () => {
    const result = TeamAddMemberSchema.safeParse({ team_name: 'my-team' });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = TeamAddMemberSchema.safeParse({
      team_name: 'my-team',
      name: '',
      role: 'researcher',
    });
    expect(result.success).toBe(false);
  });
});

describe('TeamRemoveMemberSchema', () => {
  it('should parse valid input', () => {
    const result = TeamRemoveMemberSchema.safeParse({
      team_name: 'my-team',
      member_name: 'alice',
    });
    expect(result.success).toBe(true);
  });

  it('should require both fields', () => {
    const result = TeamRemoveMemberSchema.safeParse({ team_id: 'team-123' });
    expect(result.success).toBe(false);
  });
});

describe('TeamStatusSchema', () => {
  it('should parse valid team_name', () => {
    const result = TeamStatusSchema.safeParse({ team_name: 'my-team' });
    expect(result.success).toBe(true);
  });

  it('should require team_id', () => {
    const result = TeamStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('TeamUpdateStatusSchema', () => {
  it('should parse valid input', () => {
    const result = TeamUpdateStatusSchema.safeParse({
      team_id: 'team-123',
      status: 'paused',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all status values', () => {
    for (const status of ['active', 'paused', 'completed']) {
      const result = TeamUpdateStatusSchema.safeParse({ team_id: 'team-123', status });
      expect(result.success).toBe(true);
    }
  });

  it('should require both fields', () => {
    const result = TeamUpdateStatusSchema.safeParse({ team_id: 'team-123' });
    expect(result.success).toBe(false);
  });
});

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(TEAM_CREATE_DESCRIPTION.length).toBeGreaterThan(10);
    expect(TEAM_DELETE_DESCRIPTION.length).toBeGreaterThan(10);
    expect(TEAM_LIST_DESCRIPTION.length).toBeGreaterThan(10);
    expect(TEAM_ADD_MEMBER_DESCRIPTION.length).toBeGreaterThan(10);
    expect(TEAM_REMOVE_MEMBER_DESCRIPTION.length).toBeGreaterThan(10);
    expect(TEAM_STATUS_DESCRIPTION.length).toBeGreaterThan(10);
    expect(TEAM_UPDATE_STATUS_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention team or members', () => {
    expect(TEAM_CREATE_DESCRIPTION).toMatch(/team/i);
    expect(TEAM_DELETE_DESCRIPTION).toMatch(/team/i);
    expect(TEAM_LIST_DESCRIPTION).toMatch(/team/i);
    expect(TEAM_ADD_MEMBER_DESCRIPTION).toMatch(/member|team/i);
  });
});
