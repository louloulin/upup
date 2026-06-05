import { buildSkillMetadataSection, discoverSkills } from '@upup/skills/index';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChannelProfile } from './channels.js';
import { upupPath, globalUpupPath } from '@upup/utils/paths';
import { loadMergedInvestmentConfig, formatInvestmentConfig } from './investment-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns the current date formatted for prompts.
 */
export function getCurrentDate(): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date().toLocaleDateString('en-US', options);
}

/**
 * Load SOUL.md content with global/project fallback.
 * Priority: project .upup/ > global ~/.upup/ > bundled
 */
export async function loadSoulDocument(): Promise<string | null> {
  // 1. Try project config first
  const userSoulPath = upupPath('SOUL.md');
  try {
    return await readFile(userSoulPath, 'utf-8');
  } catch {
    // Continue to global fallback
  }

  // 2. Try global config
  const globalSoulPath = globalUpupPath('SOUL.md');
  try {
    return await readFile(globalSoulPath, 'utf-8');
  } catch {
    // Continue to bundled fallback
  }

  // 3. Try bundled fallback
  const bundledSoulPath = join(__dirname, '../../SOUL.md');
  try {
    return await readFile(bundledSoulPath, 'utf-8');
  } catch {
    // SOUL.md is optional; keep prompt behavior unchanged when absent.
  }

  return null;
}

/**
 * Load user-defined research rules from .upup/RULES.md.
 * Falls back to global ~/.upup/RULES.md if project config doesn't exist.
 * Returns null if neither file exists (rules are optional).
 */
export async function loadRulesDocument(): Promise<string | null> {
  // 1. Try project config first
  const rulesPath = upupPath('RULES.md');
  try {
    return await readFile(rulesPath, 'utf-8');
  } catch {
    // Continue to global fallback
  }

  // 2. Try global config
  const globalRulesPath = globalUpupPath('RULES.md');
  try {
    return await readFile(globalRulesPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build the skills section for the system prompt.
 * Only includes skill metadata if skills are available.
 */
function buildSkillsSection(): string {
  const skills = discoverSkills();
  
  if (skills.length === 0) {
    return '';
  }

  const skillList = buildSkillMetadataSection();
  
  return `## Available Skills

${skillList}

## Skill Usage Policy

- Check if available skills can help complete the task more effectively
- When a skill is relevant, invoke it IMMEDIATELY as your first action
- Skills provide specialized workflows for complex tasks (e.g., DCF valuation)
- Do not invoke a skill that has already been invoked for the current query`;
}

function buildMemorySection(memoryFiles: string[], memoryContext?: string | null): string {
  const fileListSection = memoryFiles.length > 0
    ? `\nMemory files on disk: ${memoryFiles.join(', ')}`
    : '';

  const contextSection = memoryContext
    ? `\n\n### What you know about the user\n\n${memoryContext}`
    : '';

  return `## Memory

You have persistent memory stored as Markdown files in .upup/memory/.${fileListSection}${contextSection}

### Recalling memories
Use memory_search to recall stored facts, preferences, or notes. The search covers all
memory files (long-term and daily logs) AND past conversation transcripts.

**IMPORTANT:** Before giving any personalized financial advice — buy/sell decisions,
portfolio suggestions, stock recommendations, or trade sizing — ALWAYS call memory_search
first to recall the user's goals, risk tolerance, position limits, and prior decisions.
The user expects you to know them. Do not give generic advice when personalized context exists.

Follow up with memory_get to read full sections when you need exact text.

### Storing and managing memories
Use **memory_update** to add, edit, or delete memories. Do NOT use write_file or
edit_file for memory files.
- To remember something, just pass content (defaults to appending to long-term memory).
- For daily notes, pass file="daily".
- For edits/deletes, pass action="edit" or action="delete" with old_text.
Before editing or deleting, use memory_get to verify the exact text to match.`;
}

// ============================================================================
// Default System Prompt (for backward compatibility)
// ============================================================================

/**
 * Default system prompt used when no specific prompt is provided.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are UpUp, a helpful AI assistant.

Current date: ${getCurrentDate()}

Your output is displayed on a command line interface. Keep responses short and concise.

## Behavior

- Prioritize accuracy over validation
- Use professional, objective tone
- Be thorough but efficient

## Response Format

- Keep responses brief and direct
- For non-comparative information, prefer plain text or simple lists over tables
- Do not use markdown headers or *italics* - use **bold** sparingly for emphasis

## Tables (for comparative/tabular data)

Use markdown tables. They will be rendered as formatted box tables.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

| Ticker | Rev    | OM  |
|--------|--------|-----|
| AAPL   | 416.2B | 31% |

Keep tables compact:
- Max 2-3 columns; prefer multiple small tables over one wide table
- Headers: 1-3 words max. "FY Rev" not "Most recent fiscal year revenue"
- Tickers not names: "AAPL" not "Apple Inc."
- Abbreviate: Rev, Op Inc, Net Inc, OCF, FCF, GM, OM, EPS
- Numbers compact: 102.5B not $102,466,000,000
- Omit units in cells if header has them`;

// ============================================================================
// Group Chat Context
// ============================================================================

export type GroupContext = {
  groupName?: string;
  membersList?: string;
  activationMode: 'mention';
};

/**
 * Build a system prompt section for group chat context.
 */
export function buildGroupSection(ctx: GroupContext): string {
  const lines: string[] = ['## Group Chat'];
  lines.push('');
  if (ctx.groupName) {
    lines.push(`You are participating in the WhatsApp group "${ctx.groupName}".`);
  } else {
    lines.push('You are participating in a WhatsApp group chat.');
  }
  lines.push('You were activated because someone @-mentioned you.');
  lines.push('');
  lines.push('### Group behavior');
  lines.push('- Address the person who mentioned you by name');
  lines.push('- Reference recent group context when relevant');
  lines.push('- Keep responses concise — this is a group chat, not a 1:1 conversation');
  lines.push('- Do not repeat information that was already shared in the group');

  if (ctx.membersList) {
    lines.push('');
    lines.push('### Group members');
    lines.push(ctx.membersList);
  }

  return lines.join('\n');
}

// ============================================================================
// System Prompt
// ============================================================================

/**
 * Build the system prompt for the agent.
 * @param model - The model name (used to get appropriate tool descriptions)
 * @param soulContent - Optional SOUL.md identity content
 * @param channel - Delivery channel (e.g., 'whatsapp', 'cli') — selects formatting profile
 */
export async function buildSystemPrompt(
  model: string,
  soulContent?: string | null,
  channel?: string,
  groupContext?: GroupContext,
  memoryFiles?: string[],
  memoryContext?: string | null,
  rulesContent?: string | null,
): Promise<string> {
  const { buildCompactToolDescriptions } = await import('../tools/registry/index.js');
  const toolDescriptions = await buildCompactToolDescriptions(model);
  const { buildInvestmentCapabilitiesSection } = await import('./capability-manifest.js');
  const investmentCapabilities = await buildInvestmentCapabilitiesSection();
  const profile = getChannelProfile(channel);

  const behaviorBullets = profile.behavior.map(b => `- ${b}`).join('\n');
  const formatBullets = profile.responseFormat.map(b => `- ${b}`).join('\n');

  const tablesSection = profile.tables
    ? `\n## Tables (for comparative/tabular data)\n\n${profile.tables}`
    : '';

  return `You are UpUp, a ${profile.label} assistant with access to research tools.

Current date: ${getCurrentDate()}

${profile.preamble}

## Available Tools

${toolDescriptions}
${investmentCapabilities ? `\n\n${investmentCapabilities}` : ''}

## Tool Usage Policy

- Call get_financials or get_market_data ONCE with the full natural language query — they handle multi-company/multi-metric requests internally. Do NOT break up queries into multiple calls.
- Only use web_fetch when headlines are insufficient (need quotes, deal specifics, earnings details).
- Tool results are automatically capped. If a result says "persisted to file", use read_file to access specific sections rather than processing the full dataset.
- Only respond directly for conceptual definitions, stable historical facts, or conversational queries.

## Shell Command Tool Selection

Use the bash tool for ALL shell commands:
- ls, pwd, whoami → bash (listing directories)
- cat, head, tail, less, more → bash (reading files)
- find, grep, rg, ag → bash (searching)
- mkdir, rm, cp, mv, touch, chmod → bash (file operations)
- echo, printf, date, uname → bash (system info)
- Any command with pipes (|) or redirects (>) → bash

Use the glob tool ONLY for glob patterns:
- **/*.ts, **/*.tsx → glob (find files by pattern)
- src/**/*.js → glob (find files in directory tree)
- Do NOT use glob for ls/cat/grep — use bash instead

Use the grep tool for text content search:
- grep pattern across files → grep

Use read_file for reading individual files:
- read_file with path → read_file

${buildSkillsSection()}

${buildMemorySection(memoryFiles ?? [], memoryContext)}

## Chinese A-Share & HK Stock Quick Reference

When the user mentions a Chinese stock by name, use the dedicated A-share tools (get_astock_price, get_astock_financials, etc.) instead of US stock tools.

**Popular A-share companies**:
- 比亚迪 BYD → 002594.SZ | 贵州茅台 Kweichow Moutai → 600519.SH
- 宁德时代 CATL → 300750.SZ | 中国平安 Ping An → 601318.SH
- 招商银行 CMB → 600036.SH | 美的集团 Midea → 000333.SZ
- 格力电器 Gree → 000651.SZ | 中芯国际 SMIC → 688981.SH
- 海康威视 Hikvision → 002415.SZ | 药明康德 WuXi AppTec → 603259.SH
- 五粮液 Wuliangye → 000858.SZ | 泸州老窖 Luzhou Laojiao → 000568.SZ
- 腾讯控股 Tencent → 00700.HK | 阿里巴巴 Alibaba → 09988.HK
- 美团 Meituan → 03690.HK | 小米集团 Xiaomi → 01810.HK

**Stock code patterns**:
- 6-digit codes: 600xxx=Shanghai, 000xxx/002xxx/300xxx=Shenzhen, 688xxx=STAR Market
- 5-digit + .HK: Hong Kong (e.g., 00700.HK)

## Behavior

${behaviorBullets}

${rulesContent ? `## Research Rules

The following rules were set by the user. Follow them on every query.

${rulesContent}

To manage these rules, the user can say "add a rule", "show my rules", "remove rule about X".
Rules are stored in .upup/RULES.md — use write_file or edit_file to modify them.
` : ''}
${soulContent ? `## Identity

${soulContent}

Embody the identity and investing philosophy described above. Let it shape your tone, your values, and how you engage with financial questions.
` : ''}
${await (async () => {
  try {
    const investConfig = await loadMergedInvestmentConfig();
    return formatInvestmentConfig(investConfig);
  } catch {
    return '';
  }
})()}

## Response Format

${formatBullets}${tablesSection}${groupContext ? '\n\n' + buildGroupSection(groupContext) : ''}`;
}

// ============================================================================
// User Prompts
// ============================================================================


