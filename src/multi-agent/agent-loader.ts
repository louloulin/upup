/**
 * Agent Loader - 从Markdown文件加载Agent定义 (v1.2)
 * 
 * 支持从两个位置加载Agent:
 * 1. 全局: ~/.upup/agents/*.md
 * 2. 项目级: ./.agents/*.md 或 ./agents/*.md
 * 
 * 支持Agent配置Skills (引用已注册的Skills)
 * 
 * 格式参考SKILL.md:
 * ---
 * name: my-agent
 * description: My Pi agent
 * agentType: researcher
 * context: fork
 * model: gpt-5.4
 * skills:
 *   - dream
 *   - verify
 * ---
 * 
 * # Agent System Prompt
 * 
 * Your role is...
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { AGENTS_DIR, projectAgentsDir, projectAgentsDirAlt } from '../utils/storage-paths.js';
import { info, warn, error as logError } from '../utils/logging/logger.js';
import { getPiAgentRegistry, type PiAgentSpecInput } from './agent-registry.js';
import { getAllSpecializedSkills } from '../skills/bundled/index.js';
import type { UpUpAgentMode, UpUpDataPolicy, UpUpOutputContract, UpUpPermissionProfile } from '../runtime/pi/types.js';

export interface PiAgentFileSpec {
  /** Unique agent ID (from filename or frontmatter) */
  id: string;
  /** Agent name (from frontmatter or filename) */
  name: string;
  /** Agent description */
  description: string;
  /** Agent type */
  agentType?: 'researcher' | 'reviewer' | 'debugger' | 'coordinator' | 'executor' | 'analyst';
  /** Context mode */
  context?: 'inline' | 'fork' | 'swarm';
  /** Preferred model */
  model?: string;
  /** Tools */
  tools?: string[];
  /** Skills (references to registered skills) */
  skills?: string[];
  /** Max iterations */
  maxIterations?: number;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Full Pi execution metadata from optional frontmatter */
  mode?: UpUpAgentMode;
  workflow?: string;
  dataPolicy?: UpUpDataPolicy;
  outputContract?: UpUpOutputContract;
  permissions?: UpUpPermissionProfile;
  /** System prompt from markdown body */
  systemPrompt: string;
  /** Source file path */
  source: string;
  /** Scope: 'global' or 'project' */
  scope: 'global' | 'project';
  /** File modification time */
  modifiedAt: number;
}

export interface AgentLoaderConfig {
  /** Enable global agents loading */
  enableGlobal?: boolean;
  /** Enable project agents loading */
  enableProject?: boolean;
  /** Auto-register loaded agents */
  autoRegister?: boolean;
  /** File extensions to look for */
  extensions?: string[];
}

const DEFAULT_CONFIG: AgentLoaderConfig = {
  enableGlobal: true,
  enableProject: true,
  autoRegister: true,
  extensions: ['.md', '.markdown'],
};

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];
  
  // Simple YAML parser for basic types
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterStr.split('\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim();
    const valueStr: string = line.slice(colonIndex + 1).trim();
    
    // Parse array
    if (valueStr === '') {
      continue;
    } else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      frontmatter[key] = valueStr.slice(1, -1).split(',').map((v: string) => v.trim());
    } else if (valueStr === 'true') {
      frontmatter[key] = true;
    } else if (valueStr === 'false') {
      frontmatter[key] = false;
    } else if (!isNaN(Number(valueStr))) {
      frontmatter[key] = Number(valueStr);
    } else {
      frontmatter[key] = valueStr;
    }
  }
  return { frontmatter, body };
}

/**
 * Load a single markdown agent file
 */
function loadMarkdownAgent(filePath: string, scope: 'global' | 'project'): PiAgentFileSpec | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);
    const stats = statSync(filePath);
    const filename = basename(filePath, '.md');

    // Extract name from frontmatter or filename
    const name = (frontmatter.name as string) || filename.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Generate ID from frontmatter.id or filename
    const id = (frontmatter.id as string) || `agent-${scope}-${filename}`;

    // Parse skills array (can be simple array in frontmatter or embedded in body)
    let skills = frontmatter.skills as string[] | undefined;
    
    // If no skills in frontmatter, try to extract from body
    if (!skills || skills.length === 0) {
      skills = extractSkillsFromBody(body);
    }

    const agent: PiAgentFileSpec = {
      id,
      name,
      description: (frontmatter.description as string) || '',
      agentType: frontmatter.agentType as PiAgentFileSpec['agentType'],
      context: frontmatter.context as PiAgentFileSpec['context'],
      model: frontmatter.model as string,
      tools: frontmatter.tools as string[] | undefined,
      skills,
      maxIterations: frontmatter.maxIterations as number | undefined,
      timeoutMs: frontmatter.timeoutMs as number | undefined,
      mode: frontmatter.mode as PiAgentFileSpec['mode'],
      workflow: frontmatter.workflow as string | undefined,
      dataPolicy: frontmatter.dataPolicy as PiAgentFileSpec['dataPolicy'],
      outputContract: frontmatter.outputContract as PiAgentFileSpec['outputContract'],
      systemPrompt: body.trim(),
      source: filePath,
      scope,
      modifiedAt: stats.mtimeMs,
    };

    return agent;
  } catch (error) {
    warn('agent-loader', `Failed to load agent from ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Extract skills from markdown body
 * Searches for skill references in the format:
 * - skills: [dream, verify]
 * - Uses: /dream, /verify
 */
function extractSkillsFromBody(body: string): string[] | undefined {
  const skills: string[] = [];
  
  // Look for skill references in the body
  const skillPatterns = [
    /(?:skills|uses|with)\s*:\s*\[([^\]]+)\]/gi,
    /\/(\w+)/g,  // Match /skill-name pattern
  ];
  
  for (const pattern of skillPatterns) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      if (match[1]) {
        // First pattern: extract from array
        const parts = match[1].split(',').map(s => s.trim());
        for (const part of parts) {
          if (part && !skills.includes(part)) {
            skills.push(part);
          }
        }
      } else if (match[1]) {
        // Second pattern: extract from /skill-name
        const skillName = match[1].toLowerCase();
        if (!skills.includes(skillName)) {
          skills.push(skillName);
        }
      }
    }
  }
  
  return skills.length > 0 ? skills : undefined;
}

/**
 * Find all markdown agent files in a directory
 */
function findAgentFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recurse into subdirectories
        files.push(...findAgentFiles(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    warn('agent-loader', `Failed to read directory ${dir}: ${error}`);
  }
  
  return files;
}

/**
 * Agent Loader - 加载Markdown格式的Agent定义
 */
export class AgentLoader {
  private config: AgentLoaderConfig;
  private loadedAgents: Map<string, PiAgentFileSpec> = new Map();
  private globalDir: string;
  private projectDirs: string[];

  constructor(config: Partial<AgentLoaderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.globalDir = AGENTS_DIR;
    this.projectDirs = [projectAgentsDir(), projectAgentsDirAlt()];
  }

  /**
   * Load all agents from configured sources
   */
  loadAll(): PiAgentFileSpec[] {
    const agents: PiAgentFileSpec[] = [];

    // Load global agents
    if (this.config.enableGlobal) {
      const globalAgents = this.loadGlobalAgents();
      for (const agent of globalAgents) {
        this.loadedAgents.set(agent.id, agent);
        agents.push(agent);
      }
    }

    // Load project agents (project-level overrides global)
    if (this.config.enableProject) {
      const projectAgents = this.loadProjectAgents();
      for (const agent of projectAgents) {
        // Project agents override global ones with same ID
        this.loadedAgents.set(agent.id, agent);
        agents.push(agent);
      }
    }

    info('agent-loader', `Loaded ${agents.length} agents from markdown files`);
    return agents;
  }

  /**
   * Load agents from global directory (~/.upup/agents/)
   */
  loadGlobalAgents(): PiAgentFileSpec[] {
    const files = findAgentFiles(this.globalDir, this.config.extensions || ['.md', '.markdown']);
    const agents: PiAgentFileSpec[] = [];

    for (const file of files) {
      const agent = loadMarkdownAgent(file, 'global');
      if (agent) {
        agents.push(agent);
        info('agent-loader', `Loaded global agent: ${agent.name} from ${agent.source}`);
      }
    }

    return agents;
  }

  /**
   * Load agents from project directories (.agents/ or agents/)
   */
  loadProjectAgents(): PiAgentFileSpec[] {
    const agents: PiAgentFileSpec[] = [];

    for (const dir of this.projectDirs) {
      const files = findAgentFiles(dir, this.config.extensions || ['.md', '.markdown']);
      
      for (const file of files) {
        const agent = loadMarkdownAgent(file, 'project');
        if (agent) {
          agents.push(agent);
          info('agent-loader', `Loaded project agent: ${agent.name} from ${agent.source}`);
        }
      }
    }

    return agents;
  }

  /**
   * Get a specific agent by ID
   */
  getAgent(id: string): PiAgentFileSpec | undefined {
    return this.loadedAgents.get(id);
  }

  /**
   * Get all loaded agents
   */
  getAllAgents(): PiAgentFileSpec[] {
    return Array.from(this.loadedAgents.values());
  }

  /**
   * Get agents by scope
   */
  getAgentsByScope(scope: 'global' | 'project'): PiAgentFileSpec[] {
    return this.getAllAgents().filter(a => a.scope === scope);
  }

  /**
   * Get agents by skill
   */
  getAgentsBySkill(skillName: string): PiAgentFileSpec[] {
    return this.getAllAgents().filter(a => 
      a.skills && a.skills.some(s => s.toLowerCase() === skillName.toLowerCase())
    );
  }

  /**
   * Reload all agents
   */
  reload(): PiAgentFileSpec[] {
    this.loadedAgents.clear();
    return this.loadAll();
  }

  /**
   * Register loaded agents with PiAgentRegistry
   */
  registerAll(): number {
    const registry = getPiAgentRegistry();
    let registered = 0;

    for (const agentDef of this.loadedAgents.values()) {
      try {
        const config: PiAgentSpecInput = {
          id: agentDef.id,
          name: agentDef.name,
          description: agentDef.description,
          systemPrompt: this.buildSystemPromptWithSkills(agentDef),
          agentType: agentDef.agentType || 'executor',
          context: agentDef.context || 'inline',
          maxIterations: agentDef.maxIterations,
          timeoutMs: agentDef.timeoutMs,
          tools: agentDef.tools,
          skills: agentDef.skills,
          model: agentDef.model,
          mode: agentDef.mode,
          workflow: agentDef.workflow,
          dataPolicy: agentDef.dataPolicy,
          outputContract: agentDef.outputContract,
          permissions: agentDef.permissions,
        };

        registry.register(config);
        registered++;
      } catch (error) {
        logError('agent-loader', `Failed to register agent ${agentDef.id}`, error instanceof Error ? error : undefined);
      }
    }

    info('agent-loader', `Registered ${registered} markdown agents`);
    return registered;
  }

  /**
   * Build system prompt with skills section
   */
  buildSystemPromptWithSkills(agent: PiAgentFileSpec): string {
    let prompt = agent.systemPrompt;
    
    if (agent.skills && agent.skills.length > 0) {
      // Get specialized skills info
      const allSkills = getAllSpecializedSkills();
      const availableSkills = allSkills.filter(s => 
        agent.skills!.some(requested => 
          s.name.toLowerCase() === requested.toLowerCase() ||
          s.aliases?.some((a: string) => a.toLowerCase() === requested.toLowerCase())
        )
      );
      
      if (availableSkills.length > 0) {
        const skillsSection = `\n\n## Available Skills\n` +
          availableSkills.map(s => 
            `- **${s.name}**: ${s.description}${s.aliases?.length ? ` (aliases: ${s.aliases.join(', ')})` : ''}`
          ).join('\n') +
          `\n\nYou can invoke skills using the skill tool with the skill name or alias.`;
        
        prompt += skillsSection;
      }
    }
    
    return prompt;
  }

  /**
   * Get the global agents directory
   */
  getGlobalDir(): string {
    return this.globalDir;
  }

  /**
   * Get project agent directories
   */
  getProjectDirs(): string[] {
    return this.projectDirs;
  }

  /**
   * Get all available skills (for display)
   */
  getAvailableSkills(): Array<{ name: string; description: string; aliases?: string[] }> {
    const allSkills = getAllSpecializedSkills();
    return allSkills.map(s => ({
      name: s.name,
      description: s.description,
      aliases: s.aliases,
    }));
  }

  /**
   * Create a sample agent markdown file with skills in the global directory
   */
  createSampleGlobalAgent(): string {
    const sampleContent = `---
name: Financial Researcher with Skills
description: Analyzes financial data and provides investment insights using advanced skills
agentType: researcher
context: fork
model: gpt-5.4
tools:
  - financial_search
  - web_search
skills:
  - dream
  - verify
maxIterations: 15
---

# Financial Researcher Agent with Skills

You are a specialized financial research agent with access to advanced skills.

## Core Responsibilities
- Research companies, industries, and market trends
- Analyze financial statements and reports
- Gather real-time market data
- Provide data-driven investment insights

## Skills Usage
Use the following skills when appropriate:
- **/dream**: For deep autonomous analysis
- **/verify**: For verification and validation

## Guidelines
- Always cite your data sources
- Use tables for structured data presentation
- Include risk assessments when appropriate
- Think step by step before making conclusions

## Tools
Use the available financial tools to gather accurate and up-to-date information.
`;

    const dir = this.getGlobalDir();
    const filePath = join(dir, 'financial-researcher-with-skills.md');
    
    const { writeFileSync, mkdirSync } = require('fs');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, sampleContent, 'utf8');
    
    info('agent-loader', `Created sample agent with skills at ${filePath}`);
    return filePath;
  }

  /**
   * Create a sample agent markdown file with skills in the project directory
   */
  createSampleProjectAgent(): string {
    const sampleContent = `---
name: Code Reviewer with Skills
description: Reviews code for bugs, security issues, and best practices using verification skills
agentType: reviewer
context: inline
model: gpt-5.4
skills:
  - verify
  - hunter
---

# Code Reviewer Agent with Skills

You are a code review agent specialized in security and quality.

## Review Focus
- Security vulnerabilities
- Code quality and maintainability
- Best practices adherence
- Performance considerations

## Skills Integration
- **/verify**: Run verification checks
- **/hunter**: Hunt for bugs and issues

## Feedback Format
Provide clear, actionable feedback with:
- Issue severity (Critical/High/Medium/Low)
- Line-specific comments
- Suggested fixes
`;

    const dir = projectAgentsDir();
    const filePath = join(dir, 'code-reviewer-with-skills.md');
    
    const { writeFileSync, mkdirSync } = require('fs');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, sampleContent, 'utf8');
    
    info('agent-loader', `Created sample project agent with skills at ${filePath}`);
    return filePath;
  }
}

// Singleton instance
let loaderInstance: AgentLoader | null = null;

export function getAgentLoader(config?: Partial<AgentLoaderConfig>): AgentLoader {
  if (!loaderInstance) {
    loaderInstance = new AgentLoader(config);
  }
  return loaderInstance;
}

export function resetAgentLoader(): void {
  loaderInstance = null;
}
