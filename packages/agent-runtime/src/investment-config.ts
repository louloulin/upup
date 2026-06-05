/**
 * Investment Configuration Loader
 *
 * Loads and parses investment configuration documents:
 * - GOALS.md: Investment goals and preferences
 * - RULES.md: Analysis rules and guidelines
 * - GOVERN.md: Agent governance rules
 *
 * These documents are loaded from .upup/ directory and their content
 * is injected into the agent's system prompt.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { upupPath } from '@upup/utils/paths';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Investment goals extracted from GOALS.md
 */
export interface InvestmentGoals {
  /** Raw content of GOALS.md */
  rawContent: string;
  /** Core investment objectives */
  objectives: string[];
  /** Analysis depth preferences */
  analysisDepth: string[];
  /** Interaction style preferences */
  interactionStyle: string[];
  /** Risk tolerance level */
  riskTolerance?: string;
}

/**
 * Analysis rules extracted from RULES.md
 */
export interface AnalysisRules {
  /** Raw content of RULES.md */
  rawContent: string;
  /** Research methodology rules */
  researchRules: string[];
  /** Risk assessment rules */
  riskRules: string[];
  /** Output formatting rules */
  outputRules: string[];
}

/**
 * Governance rules extracted from GOVERN.md
 */
export interface GovernanceRules {
  /** Raw content of GOVERN.md */
  rawContent: string;
  /** Decision boundaries */
  decisionBoundaries: {
    maxPosition: number;
    industryConcentration: number;
    singleInvestmentLimit: number;
  };
  /** Review process steps */
  reviewProcess: string[];
  /** Monitoring rules */
  monitoringRules: {
    rebalancingFrequency?: string;
    alertThreshold?: number;
    reassessmentFrequency?: string;
  };
}

/**
 * Complete investment configuration
 */
export interface InvestmentConfig {
  /** Investment goals (null if GOALS.md not found) */
  goals: InvestmentGoals | null;
  /** Analysis rules (null if RULES.md not found) */
  rules: AnalysisRules | null;
  /** Governance rules (null if GOVERN.md not found) */
  governance: GovernanceRules | null;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse GOALS.md content into structured format
 */
function parseGoals(content: string): InvestmentGoals {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  const objectives: string[] = [];
  const analysisDepth: string[] = [];
  const interactionStyle: string[] = [];
  let riskTolerance: string | undefined;

  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').toLowerCase();
      continue;
    }

    // Skip headers and empty lines
    if (line.startsWith('#') || !line) continue;

    // Remove leading bullet points or numbers
    const cleanedLine = line.replace(/^[-*\d.)\s]+/, '').trim();

    if (cleanedLine) {
      switch (currentSection) {
        case 'core objectives':
        case 'objectives':
          objectives.push(cleanedLine);
          break;
        case 'analysis depth':
          analysisDepth.push(cleanedLine);
          break;
        case 'interaction style':
          interactionStyle.push(cleanedLine);
          break;
        case 'risk tolerance':
          riskTolerance = cleanedLine;
          break;
        default:
          // Try to infer section from content
          if (line.match(/fundamental|quantitative|risk assessment/i)) {
            analysisDepth.push(cleanedLine);
          } else if (line.match(/direct|concise|data-driven/i)) {
            interactionStyle.push(cleanedLine);
          } else if (line.match(/long-term|value|growth/i)) {
            objectives.push(cleanedLine);
          }
      }
    }
  }

  return {
    rawContent: content,
    objectives: objectives.length > 0 ? objectives : [content],
    analysisDepth: analysisDepth.length > 0 ? analysisDepth : [],
    interactionStyle: interactionStyle.length > 0 ? interactionStyle : [],
    riskTolerance,
  };
}

/**
 * Parse RULES.md content into structured format
 */
function parseRules(content: string): AnalysisRules {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  const researchRules: string[] = [];
  const riskRules: string[] = [];
  const outputRules: string[] = [];

  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').toLowerCase();
      continue;
    }

    if (line.startsWith('#') || !line) continue;

    // Remove leading numbers/bullets
    const cleanedLine = line.replace(/^\d+[.)\s]+|^[-*]\s+/, '').trim();

    if (cleanedLine) {
      switch (currentSection) {
        case 'research rules':
        case 'research':
          researchRules.push(cleanedLine);
          break;
        case 'risk rules':
        case 'risk':
          riskRules.push(cleanedLine);
          break;
        case 'output rules':
        case 'output':
          outputRules.push(cleanedLine);
          break;
        default:
          if (line.match(/\d+\./)) {
            researchRules.push(cleanedLine);
          } else if (line.match(/risk|uncertainty/i)) {
            riskRules.push(cleanedLine);
          } else {
            researchRules.push(cleanedLine);
          }
      }
    }
  }

  return {
    rawContent: content,
    researchRules: researchRules.length > 0 ? researchRules : [],
    riskRules: riskRules.length > 0 ? riskRules : [],
    outputRules: outputRules.length > 0 ? outputRules : [],
  };
}

/**
 * Parse GOVERN.md content into structured format
 */
function parseGovernance(content: string): GovernanceRules {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  const reviewProcess: string[] = [];
  let maxPosition = 20; // Default
  let industryConcentration = 30; // Default
  let singleInvestmentLimit = 10; // Default
  let rebalancingFrequency: string | undefined;
  let alertThreshold: number | undefined;
  let reassessmentFrequency: string | undefined;

  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').toLowerCase();
      continue;
    }

    if (line.startsWith('#') || !line) continue;

    // Remove leading bullets/numbers
    const cleanedLine = line.replace(/^[-*\d.)\s]+/, '').trim();

    if (cleanedLine) {
      switch (currentSection) {
        case 'decision boundaries':
          if (cleanedLine.match(/position.*?(\d+)%/i)) {
            maxPosition = parseInt(cleanedLine.match(/(\d+)%/)?.[1] || '20');
          }
          if (cleanedLine.match(/industry.*?(\d+)%/i)) {
            industryConcentration = parseInt(cleanedLine.match(/(\d+)%/)?.[1] || '30');
          }
          if (cleanedLine.match(/single.*?limit.*?(\d+)%/i)) {
            singleInvestmentLimit = parseInt(cleanedLine.match(/(\d+)%/)?.[1] || '10');
          }
          break;
        case 'review process':
          reviewProcess.push(cleanedLine);
          break;
        case 'monitoring rules':
          if (cleanedLine.match(/rebalancing.*?(quarterly|annual|monthly)/i)) {
            rebalancingFrequency = cleanedLine.match(/(quarterly|annual|monthly)/i)?.[1];
          }
          if (cleanedLine.match(/alert.*?(\d+)%/i)) {
            alertThreshold = parseInt(cleanedLine.match(/(\d+)%/)?.[1] || '15');
          }
          if (cleanedLine.match(/reassessment.*?(annual|quarterly|monthly)/i)) {
            reassessmentFrequency = cleanedLine.match(/(annual|quarterly|monthly)/i)?.[1];
          }
          break;
        default:
          // Try to parse percentage rules
          if (cleanedLine.match(/(\d+)%/)) {
            const pct = parseInt(cleanedLine.match(/(\d+)%/)?.[1] || '20');
            if (cleanedLine.match(/position/i)) maxPosition = pct;
            else if (cleanedLine.match(/industry/i)) industryConcentration = pct;
            else if (cleanedLine.match(/limit|single/i)) singleInvestmentLimit = pct;
          }
      }
    }
  }

  return {
    rawContent: content,
    decisionBoundaries: {
      maxPosition,
      industryConcentration,
      singleInvestmentLimit,
    },
    reviewProcess: reviewProcess.length > 0 ? reviewProcess : [],
    monitoringRules: {
      rebalancingFrequency,
      alertThreshold,
      reassessmentFrequency,
    },
  };
}

// ============================================================================
// Loader Functions
// ============================================================================

/**
 * Load GOALS.md from specified directory
 */
async function loadGoalsFile(dir: string): Promise<InvestmentGoals | null> {
  const goalsPath = join(dir, 'GOALS.md');

  if (!existsSync(goalsPath)) {
    return null;
  }

  try {
    const content = await readFile(goalsPath, 'utf-8');
    return parseGoals(content);
  } catch {
    return null;
  }
}

/**
 * Load RULES.md from specified directory
 */
async function loadRulesFile(dir: string): Promise<AnalysisRules | null> {
  const rulesPath = join(dir, 'RULES.md');

  if (!existsSync(rulesPath)) {
    return null;
  }

  try {
    const content = await readFile(rulesPath, 'utf-8');
    return parseRules(content);
  } catch {
    return null;
  }
}

/**
 * Load GOVERN.md from specified directory
 */
async function loadGovernFile(dir: string): Promise<GovernanceRules | null> {
  const governPath = join(dir, 'GOVERN.md');

  if (!existsSync(governPath)) {
    return null;
  }

  try {
    const content = await readFile(governPath, 'utf-8');
    return parseGovernance(content);
  } catch {
    return null;
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Load all investment configuration documents
 *
 * @param configDir - Directory containing config files (defaults to .upup/)
 * @returns InvestmentConfig with parsed goals, rules, and governance
 */
export async function loadInvestmentConfig(configDir?: string): Promise<InvestmentConfig> {
  const dir = configDir || upupPath('');

  const [goals, rules, governance] = await Promise.all([
    loadGoalsFile(dir),
    loadRulesFile(dir),
    loadGovernFile(dir),
  ]);

  return { goals, rules, governance };
}

/**
 * Load merged investment configuration (global + project).
 * Project config takes precedence over global config.
 *
 * Load order:
 * 1. Global config from ~/.upup/
 * 2. Project config from .upup/
 * 3. Project config overrides global config where present
 */
export async function loadMergedInvestmentConfig(): Promise<InvestmentConfig> {
  // Dynamically import to avoid circular dependency
  const { globalUpupPath, upupPath } = await import('@upup/utils/paths');

  // Check if global config exists
  const globalExists = existsSync(globalUpupPath(''));

  // Load both configs in parallel
  const [globalConfig, projectConfig] = await Promise.all([
    globalExists ? loadInvestmentConfig(globalUpupPath('')) : Promise.resolve({ goals: null, rules: null, governance: null }),
    loadInvestmentConfig(upupPath('')),
  ]);

  // Merge: project config takes precedence
  // For each section, use project if present, otherwise fall back to global
  return {
    goals: projectConfig.goals ?? globalConfig.goals,
    rules: projectConfig.rules ?? globalConfig.rules,
    governance: projectConfig.governance ?? globalConfig.governance,
  };
}

// ============================================================================
// Formatting Functions (for System Prompt Integration)
// ============================================================================

/**
 * Format investment goals as markdown section for system prompt
 */
export function formatGoalsSection(config: InvestmentConfig): string {
  if (!config.goals) return '';

  const lines = ['## Investment Goals'];

  if (config.goals.objectives.length > 0) {
    lines.push('\n**Core Objectives:**');
    for (const obj of config.goals.objectives) {
      lines.push(`- ${obj}`);
    }
  }

  if (config.goals.analysisDepth.length > 0) {
    lines.push('\n**Analysis Approach:**');
    for (const depth of config.goals.analysisDepth) {
      lines.push(`- ${depth}`);
    }
  }

  if (config.goals.riskTolerance) {
    lines.push(`\n**Risk Tolerance:** ${config.goals.riskTolerance}`);
  }

  return lines.join('\n');
}

/**
 * Format analysis rules as markdown section for system prompt
 */
export function formatRulesSection(config: InvestmentConfig): string {
  if (!config.rules) return '';

  const lines = ['## Analysis Rules'];

  if (config.rules.researchRules.length > 0) {
    lines.push('\n**Research Methodology:**');
    for (let i = 0; i < config.rules.researchRules.length; i++) {
      lines.push(`${i + 1}. ${config.rules.researchRules[i]}`);
    }
  }

  if (config.rules.riskRules.length > 0) {
    lines.push('\n**Risk Assessment:**');
    for (const rule of config.rules.riskRules) {
      lines.push(`- ${rule}`);
    }
  }

  if (config.rules.outputRules.length > 0) {
    lines.push('\n**Output Format:**');
    for (let i = 0; i < config.rules.outputRules.length; i++) {
      lines.push(`${i + 1}. ${config.rules.outputRules[i]}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format governance rules as markdown section for system prompt
 */
export function formatGovernanceSection(config: InvestmentConfig): string {
  if (!config.governance) return '';

  const lines = ['## Governance Rules'];

  const { decisionBoundaries, reviewProcess, monitoringRules } = config.governance;

  lines.push('\n**Decision Boundaries:**');
  lines.push(`- Max position size: ${decisionBoundaries.maxPosition}% of portfolio`);
  lines.push(`- Industry concentration: ${decisionBoundaries.industryConcentration}% max`);
  lines.push(`- Single investment limit: ${decisionBoundaries.singleInvestmentLimit}%`);

  if (reviewProcess.length > 0) {
    lines.push('\n**Review Process:**');
    for (let i = 0; i < reviewProcess.length; i++) {
      lines.push(`${i + 1}. ${reviewProcess[i]}`);
    }
  }

  if (monitoringRules.rebalancingFrequency) {
    lines.push(`\n**Rebalancing:** ${monitoringRules.rebalancingFrequency}`);
  }

  return lines.join('\n');
}

/**
 * Format complete investment configuration for system prompt
 */
export function formatInvestmentConfig(config: InvestmentConfig): string {
  const sections = [
    formatGoalsSection(config),
    formatRulesSection(config),
    formatGovernanceSection(config),
  ].filter(Boolean);

  if (sections.length === 0) return '';

  return `\n\n---\n\n${sections.join('\n\n')}\n`;
}