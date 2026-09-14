/**
 * Memory Prompts - Extraction and consolidation prompts for Claude Code-style memory
 *
 * Based on Claude Code's memory system with 4-type taxonomy:
 * - user: User preferences, role, knowledge
 * - feedback: User corrections and validations
 * - project: Ongoing work, goals, decisions
 * - reference: External system pointers
 */

/**
 * System prompt for memory extraction (per-turn).
 * Triggered after model produces final response (no tool calls).
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are analyzing a conversation to extract memories.

There are several discrete types of memory that you can store in your memory system:

**user**: Information about the user's role, goals, responsibilities, and knowledge. Great user memories help you tailor your future behavior to the user's preferences and perspective.

**feedback**: Guidance from the user about how to approach work — both what to avoid and what to keep doing. Record from failure AND success. Include *why* so you can judge edge cases later.

**project**: Information about ongoing work, goals, initiatives, bugs, or incidents. Include *why* and *how to apply*.

**reference**: Pointers to where information can be found in external systems.

## What NOT to save in memory

- Code patterns, architecture, git history (can be derived from code)
- Already documented in CLAUDE.md
- Ephemeral task details, current conversation context
- Activity logs, PR lists, status updates

These exclusions apply even when the user explicitly asks you to save. If they ask you to save a PR list or activity summary, ask what was *surprising* or *non-obvious* about it — that is the part worth keeping.

## Memory format

\`\`\`yaml
---
name: {kebab-case-name}
description: {one-line description for AI selection}
type: {user|feedback|project|reference}
---

{memory content with Why:/How to apply: lines for feedback/project types}
\`\`\`

## Guidelines

- Only save memories that would genuinely help future conversations
- Lead with the key fact or decision
- Include *Why* lines to capture motivation (helps judge if still relevant later)
- Include *How to apply* lines to capture guidance
- Use absolute dates ("2026-05-07") instead of relative ("Thursday")
- Be specific — vague memories are not useful

If no worth-saving memories are found, respond with "NONE".`;

/**
 * User prompt for memory extraction.
 * Includes conversation history and existing memories.
 */
export function buildExtractionPrompt(
  messages: { role: string; content: string }[],
  existingMemories: string,
): string {
  const recentMessages = messages
    .slice(-10) // Last 10 messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  return `Analyze this conversation and extract any worth-saving memories.

## Conversation
${recentMessages}

## Existing Memories (avoid duplicates)
${existingMemories || '(none)'}

Respond with worth-saving memories in the format shown above, or "NONE" if nothing is worth remembering.`;
}

/**
 * System prompt for memory consolidation (periodic).
 * Triggered every 24h or after 5+ new sessions.
 */
export const CONSOLIDATION_SYSTEM_PROMPT = `You are consolidating memory files into coherent topics.

Given multiple memory files about related topics, merge them into a single coherent memory file.
Keep only what's still relevant and remove duplicates or outdated information.

## Memory Types

- **user**: User preferences and knowledge (long-lived)
- **feedback**: Work approach guidance (validate over time)
- **project**: Ongoing work (decay fast, keep why/how)
- **reference**: External pointers (may become stale)

## Consolidation Guidelines

1. Merge memories about the same topic
2. Keep the most recent and relevant information
3. Remove outdated or superseded memories
4. Update descriptions to be more accurate
5. Combine *Why* lines to capture full motivation
6. Note conflicts and how they were resolved

## Output Format

\`\`\`
{merged memory files in YAML format}
\`\`\`

If no consolidation is needed, respond with "NONE".`;

/**
 * User prompt for memory consolidation.
 */
export function buildConsolidationPrompt(
  memories: { name: string; type: string; content: string }[],
): string {
  const memoryList = memories
    .map(m => `## ${m.type}/${m.name}\n${m.content}`)
    .join('\n\n');

  return `Consolidate these related memory files:

${memoryList}

Identify memories that should be merged and create updated versions.`;
}

/**
 * System prompt for AI memory selection (AI-Selector).
 * Primary recall method - LLM semantic selection over vector search.
 */
export const SELECT_SYSTEM_PROMPT = `You are selecting memories that will be useful to an AI assistant as it processes a user's query.

You will be given the user's query and a list of available memory files with their filenames, types, and descriptions.

Return a JSON object with a "selected_memories" array containing filenames of the memories that will clearly be useful.

Only include memories that you are certain will be helpful based on their name, type, and description.
- If you are unsure if a memory will be useful, do not include it. Be selective.
- If there are no memories that would clearly be useful, feel free to return an empty list.
- Maximum 5 memories should be selected.

Memory types:
- **user**: User preferences, role, knowledge (usually relevant)
- **feedback**: Work approach guidance (relevant when similar situations arise)
- **project**: Ongoing work (relevant for context on current tasks)
- **reference**: External pointers (relevant when external systems are mentioned)`;

/**
 * User prompt for AI memory selection.
 */
export function buildSelectionPrompt(
  query: string,
  memories: string,
  recentTools?: readonly string[],
): string {
  const toolsSection = recentTools && recentTools.length > 0
    ? `\n\nRecently used tools: ${[...recentTools].join(', ')}`
    : '';

  return `Query: ${query}

Available memories:
${memories}${toolsSection}

Selected memories (JSON):`;
}

/**
 * Prompt for evaluating if a memory is still relevant (trust verification).
 */
export const TRUST_VERIFICATION_PROMPT = `You are verifying if a recalled memory is still accurate and relevant.

Memory name: {name}
Memory type: {type}
Last updated: {lastUpdated}
Content: {content}

Current project state: {projectState}

Evaluate:
1. Is this memory still accurate?
2. Is this memory still relevant to current work?
3. Should this memory be updated or removed?

Respond with:
- "KEEP" if still accurate and relevant
- "UPDATE" if accurate but needs updating
- "REMOVE" if outdated or no longer relevant`;
