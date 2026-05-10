/**
 * Investment Configuration Loader Tests
 *
 * Tests for loading and parsing investment configuration documents:
 * - GOALS.md: Investment goals and preferences
 * - RULES.md: Analysis rules and guidelines
 * - GOVERN.md: Agent governance rules
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Test configuration paths
const TEST_CONFIG_DIR = join(process.cwd(), '.upup-test-config');

// Import the module under test
import { loadInvestmentConfig, type InvestmentConfig, type InvestmentGoals, type AnalysisRules, type GovernanceRules } from './investment-config.js';

describe('Investment Configuration Loader', () => {
  beforeEach(() => {
    // Create test config directory
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  describe('loadInvestmentConfig', () => {
    it('should return empty config when no files exist', async () => {
      // Point to empty test directory
      const config = await loadInvestmentConfig(TEST_CONFIG_DIR);

      expect(config).toBeDefined();
      expect(config.goals).toBeNull();
      expect(config.rules).toBeNull();
      expect(config.governance).toBeNull();
    });

    it('should load GOALS.md when present', async () => {
      const goalsContent = `# Investment Goals

## Core Objectives
- Long-term capital appreciation
- Value investing approach
- Systematic research driven

## Analysis Depth
- Fundamental analysis first
- Quantitative validation secondary
- Risk assessment before decision

## Interaction Style
- Direct and concise
- Data-driven decisions
- Proactive risk warnings
`;

      writeFileSync(join(TEST_CONFIG_DIR, 'GOALS.md'), goalsContent, 'utf-8');

      const config = await loadInvestmentConfig(TEST_CONFIG_DIR);

      expect(config.goals).toBeDefined();
      expect(config.goals?.objectives).toContain('Long-term capital appreciation');
      expect(config.goals?.analysisDepth).toContain('Fundamental analysis first');
    });

    it('should load RULES.md when present', async () => {
      const rulesContent = `# Analysis Rules

## Research Rules
1. Data before conclusions
2. Multi-source verification
3. Explicit assumptions
4. Clear scope definition

## Risk Rules
1. Negative information priority
2. Opposing viewpoint analysis
3. Sensitivity testing
4. Tail risk assessment

## Output Rules
1. Conclusion first
2. Evidence support
3. Uncertainty annotation
4. Actionable recommendations
`;

      writeFileSync(join(TEST_CONFIG_DIR, 'RULES.md'), rulesContent, 'utf-8');

      const config = await loadInvestmentConfig(TEST_CONFIG_DIR);

      expect(config.rules).toBeDefined();
      expect(config.rules?.researchRules).toHaveLength(4);
      expect(config.rules?.riskRules).toHaveLength(4);
      expect(config.rules?.outputRules).toHaveLength(4);
    });

    it('should load GOVERN.md when present', async () => {
      const governContent = `# Agent Governance

## Decision Boundaries
- Maximum position: 20% of portfolio
- Industry concentration: max 30%
- Single investment limit: 10%

## Review Process
1. Initial screening
2. Deep research
3. Risk assessment
4. Investment decision

## Monitoring Rules
- Quarterly rebalancing
- Abnormal alert threshold: 15%
- Risk level reassessment: annually
`;

      writeFileSync(join(TEST_CONFIG_DIR, 'GOVERN.md'), governContent, 'utf-8');

      const config = await loadInvestmentConfig(TEST_CONFIG_DIR);

      expect(config.governance).toBeDefined();
      expect(config.governance?.decisionBoundaries.maxPosition).toBe(20);
      expect(config.governance?.decisionBoundaries.industryConcentration).toBe(30);
    });

    it('should load all three files when present', async () => {
      writeFileSync(join(TEST_CONFIG_DIR, 'GOALS.md'), '# Goals\n- Goal 1\n- Goal 2', 'utf-8');
      writeFileSync(join(TEST_CONFIG_DIR, 'RULES.md'), '# Rules\n1. Rule 1\n2. Rule 2', 'utf-8');
      writeFileSync(join(TEST_CONFIG_DIR, 'GOVERN.md'), '# Govern\n- Max: 10%', 'utf-8');

      const config = await loadInvestmentConfig(TEST_CONFIG_DIR);

      expect(config.goals).toBeDefined();
      expect(config.rules).toBeDefined();
      expect(config.governance).toBeDefined();
    });
  });
});