import { DefaultResourceLoader, loadSkills } from '@earendil-works/pi-coding-agent';
import { resolveConfiguredPiPackages } from './package-config';
import { PiPackageCatalog } from './package-catalog';
import { verifyPiResourceTrust } from './plugin-trust';

export interface PiSkillCommand {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
}

function packageSkillPaths(cwd: string): string[] {
  const configured = resolveConfiguredPiPackages(cwd);
  if (!configured) return [];
  const catalog = new PiPackageCatalog();
  for (const packagePath of configured.piPackagePaths) {
    catalog.register(packagePath, configured.piPackageTrust, cwd);
  }
  const resources = catalog.resources();
  return verifyPiResourceTrust(resources.skills, configured.piPackageTrust, cwd).paths;
}

function toSkillCommands(skills: readonly { name: string; description: string; disableModelInvocation: boolean }[]): readonly PiSkillCommand[] {
  return skills
    .filter((skill) => !skill.disableModelInvocation)
    .map((skill) => ({ name: skill.name, description: skill.description }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listPiSkillCommandsSync(cwd = process.cwd()): readonly PiSkillCommand[] {
  const result = loadSkills({
    cwd,
    agentDir: cwd,
    skillPaths: packageSkillPaths(cwd),
    includeDefaults: true,
  });
  return toSkillCommands(result.skills);
}

/**
 * Discover the skills visible to Pi for a working directory.
 *
 * This is command discovery only. Execution still happens inside the active
 * Pi AgentSession, which performs the actual `/skill:<name>` expansion.
 */
export async function listPiSkillCommands(cwd = process.cwd()): Promise<readonly PiSkillCommand[]> {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    additionalSkillPaths: packageSkillPaths(cwd),
  });
  await loader.reload();

  return toSkillCommands(loader.getSkills().skills);
}

export async function isPiSkillCommand(name: string, cwd = process.cwd()): Promise<boolean> {
  const normalized = name.trim().toLowerCase().replace(/^skill:/, '');
  if (!normalized) return false;
  const skills = await listPiSkillCommands(cwd);
  return skills.some((skill) => skill.name.toLowerCase() === normalized);
}

export function toPiSkillPrompt(name: string, args = ''): string {
  const normalized = name.trim().replace(/^skill:/i, '');
  const suffix = args.trim();
  return suffix.length > 0 ? `/skill:${normalized} ${suffix}` : `/skill:${normalized}`;
}
