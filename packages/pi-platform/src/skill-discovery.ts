export interface PlatformSkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly instructions?: string;
  readonly disableModelInvocation?: boolean;
}

export type PlatformSkillListFormat = 'simple' | 'detailed';

export const LIST_SKILLS_DESCRIPTION = 'List all skills currently loaded by the Pi Resource Loader.';
export const SEARCH_SKILLS_DESCRIPTION = 'Search the current Pi skill catalog by name or description.';
export const GET_SKILL_DESCRIPTION = 'Get metadata and trusted instructions for a loaded Pi skill.';
export const SKILL_INFO_DESCRIPTION = 'Get detailed metadata and trusted instructions for a loaded Pi skill.';
export const SKILL_EXECUTE_DESCRIPTION = 'Load a trusted Pi skill and return its instructions with optional arguments.';

export function listPlatformSkills(skills: readonly PlatformSkillDefinition[], format: PlatformSkillListFormat = 'simple'): unknown {
  return {
    count: skills.length,
    skills: skills.map((skill) => format === 'simple'
      ? { name: skill.name, invocable: !skill.disableModelInvocation }
      : { name: skill.name, description: skill.description, invocable: !skill.disableModelInvocation }),
  };
}

export function searchPlatformSkills(skills: readonly PlatformSkillDefinition[], keyword: string): unknown {
  const normalized = keyword.trim().toLowerCase();
  const results = skills.filter((skill) => skill.name.toLowerCase().includes(normalized) || skill.description.toLowerCase().includes(normalized));
  return { keyword, count: results.length, results: results.map(({ name, description, disableModelInvocation }) => ({ name, description, invocable: !disableModelInvocation })) };
}

export function getPlatformSkill(skills: readonly PlatformSkillDefinition[], name: string): unknown {
  const normalized = name.trim().toLowerCase();
  const skill = skills.find((candidate) => candidate.name.toLowerCase() === normalized);
  if (!skill) {
    const suggestions = skills.filter((candidate) => candidate.name.toLowerCase().includes(normalized.slice(0, 3))).slice(0, 3).map((candidate) => candidate.name);
    return { found: false, name, suggestions, message: `Skill "${name}" not found.${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ''}` };
  }
  return {
    found: true,
    name: skill.name,
    description: skill.description,
    invocable: !skill.disableModelInvocation,
    ...(skill.instructions !== undefined ? { instructions: skill.instructions } : {}),
  };
}

export function invokePlatformSkill(skills: readonly PlatformSkillDefinition[], name: string, args?: string): unknown {
  const normalized = name.trim().toLowerCase();
  const skill = skills.find((candidate) => candidate.name.toLowerCase() === normalized);
  if (!skill) return getPlatformSkill(skills, name);
  if (skill.disableModelInvocation) return { found: false, name: skill.name, error: 'skill invocation is disabled by its Pi Skill policy' };
  return {
    found: true,
    skill: skill.name,
    ...(args?.trim() ? { arguments: args.trim() } : {}),
    instructions: `${args?.trim() ? `Arguments provided: ${args.trim()}\n\n` : ''}${skill.instructions ?? ''}`,
  };
}
