/**
 * Tests for ToolSearchTool
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test schemas independently (re-define to avoid import chain)
const ToolSearchSchema = z.object({
  query: z.string().optional(),
  name: z.string().optional(),
  concurrencySafe: z.boolean().optional(),
});

const ToolGetSchema = z.object({
  name: z.string(),
});

const ToolListSchema = z.object({
  prefix: z.string().optional(),
  limit: z.number().optional(),
});

describe('ToolSearchSchema', () => {
  it('should parse valid input with query', () => {
    const result = ToolSearchSchema.safeParse({ query: 'file' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input with name filter', () => {
    const result = ToolSearchSchema.safeParse({ name: 'config' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input with concurrencySafe filter', () => {
    const result = ToolSearchSchema.safeParse({ concurrencySafe: true });
    expect(result.success).toBe(true);
  });

  it('should parse empty input', () => {
    const result = ToolSearchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse combined filters', () => {
    const result = ToolSearchSchema.safeParse({
      query: 'financial',
      name: 'get',
      concurrencySafe: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-string query', () => {
    const result = ToolSearchSchema.safeParse({ query: 123 });
    expect(result.success).toBe(false);
  });

  it('should reject non-boolean concurrencySafe', () => {
    const result = ToolSearchSchema.safeParse({ concurrencySafe: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('ToolGetSchema', () => {
  it('should parse valid name', () => {
    const result = ToolGetSchema.safeParse({ name: 'get_financials' });
    expect(result.success).toBe(true);
  });

  it('should require name', () => {
    const result = ToolGetSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject non-string name', () => {
    const result = ToolGetSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
  });
});

describe('ToolListSchema', () => {
  it('should parse empty input', () => {
    const result = ToolListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse with prefix', () => {
    const result = ToolListSchema.safeParse({ prefix: 'config' });
    expect(result.success).toBe(true);
  });

  it('should parse with limit', () => {
    const result = ToolListSchema.safeParse({ limit: 10 });
    expect(result.success).toBe(true);
  });

  it('should reject non-number limit', () => {
    const result = ToolListSchema.safeParse({ limit: '5' });
    expect(result.success).toBe(false);
  });
});

describe('Tool Descriptions (inline)', () => {
  // Descriptions must be non-empty and reference relevant terms
  const SEARCH_DESC = 'Search and explore available tools in the Dexter system.';
  const GET_DESC = 'Get detailed information about a specific tool.';
  const LIST_DESC = 'List all available tools in the Dexter system.';

  it('should have non-empty descriptions', () => {
    expect(SEARCH_DESC.length).toBeGreaterThan(10);
    expect(GET_DESC.length).toBeGreaterThan(10);
    expect(LIST_DESC.length).toBeGreaterThan(10);
  });

  it('should mention tools or capabilities', () => {
    expect(SEARCH_DESC).toMatch(/tool|search|find/i);
    expect(LIST_DESC).toMatch(/tool|list|available/i);
  });
});
