/**
 * Skill Discovery Tools
 *
 * Exports skill discovery and search tools
 */

export {
  discoverSkills,
  searchSkills,
  createListSkillsTool,
  createSearchSkillsTool,
  createGetSkillTool,
  discoveryTools,
} from './skill-discovery.js';

export const LIST_SKILLS_DESCRIPTION = `
List all available skills in the system.

## When to Use
- Finding available capabilities
- Checking what skills are registered
- Listing invocable commands

## Output Formats
- simple: Shows skill names
- detailed: Shows names, descriptions, and metadata
`.trim();

export const SEARCH_SKILLS_DESCRIPTION = `
Search for skills by keyword.

## When to Use
- Finding skills related to a topic
- Discovering relevant capabilities

## Matches
Searches skill names and descriptions.
`.trim();

export const GET_SKILL_DESCRIPTION = `
Get detailed information about a specific skill.

## When to Use
- Learning how to use a skill
- Getting skill metadata
- Finding usage instructions
`.trim();
