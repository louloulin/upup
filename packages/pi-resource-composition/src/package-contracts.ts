import type { PiPackageResourceSnapshot } from './package-catalog.js';

export interface PiWorkflowContract {
  packageName: string;
  packageVersion: string;
  path: string;
  name: string;
  phases: readonly string[];
  instructions: string;
}

export interface PiPolicyContract {
  packageName: string;
  packageVersion: string;
  path: string;
  name: string;
  rules: readonly string[];
  text: string;
}

export interface PiEvalCase {
  id: string;
  requires?: readonly string[];
  forbidden?: readonly string[];
}

export interface PiEvalContract {
  packageName: string;
  packageVersion: string;
  path: string;
  name: string;
  version: string;
  cases: readonly PiEvalCase[];
}

export interface PiPackageContracts {
  workflows: readonly PiWorkflowContract[];
  policies: readonly PiPolicyContract[];
  evals: readonly PiEvalContract[];
}

function frontMatter(source: string, key: string): string | undefined {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
  return match?.[1]?.trim();
}

function markdownTitle(source: string, fallback: string): string {
  return source.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}

function markdownRules(source: string): string[] {
  return source.split('\n')
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim())
    .filter((rule): rule is string => Boolean(rule));
}

function workflowPhases(source: string): string[] {
  const explicit = source.match(/(?:phases?|阶段)\s*[:：]\s*([^\n]+)/i)?.[1]
    ?.split(/[,，>→]/)
    .map((phase) => phase.trim().replace(/[`*_.,;:：。；]+$/g, ''))
    .filter(Boolean);
  if (explicit?.length) return explicit;
  return ['detect', 'plan', 'execute', 'verify', 'report'].filter((phase) => new RegExp(`\\b${phase}\\b`, 'i').test(source));
}

function parseEval(snapshot: PiPackageResourceSnapshot): PiEvalContract {
  const parsed = JSON.parse(snapshot.content) as { name?: unknown; version?: unknown; cases?: unknown };
  if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string' || !Array.isArray(parsed.cases)) {
    throw new Error(`Pi eval resource is invalid: ${snapshot.path}`);
  }
  const cases = parsed.cases.map((item) => {
    if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') {
      throw new Error(`Pi eval case is invalid: ${snapshot.path}`);
    }
    const value = item as { id: string; requires?: unknown; forbidden?: unknown };
    return {
      id: value.id,
      ...(Array.isArray(value.requires) ? { requires: value.requires.filter((entry): entry is string => typeof entry === 'string') } : {}),
      ...(Array.isArray(value.forbidden) ? { forbidden: value.forbidden.filter((entry): entry is string => typeof entry === 'string') } : {}),
    };
  });
  return {
    packageName: snapshot.packageName,
    packageVersion: snapshot.packageVersion,
    path: snapshot.path,
    name: parsed.name,
    version: parsed.version,
    cases,
  };
}

export function loadPiPackageContracts(resources: readonly PiPackageResourceSnapshot[]): PiPackageContracts {
  const workflows: PiWorkflowContract[] = [];
  const policies: PiPolicyContract[] = [];
  const evals: PiEvalContract[] = [];
  for (const resource of resources) {
    if (resource.kind === 'workflow') {
      workflows.push({
        packageName: resource.packageName,
        packageVersion: resource.packageVersion,
        path: resource.path,
        name: frontMatter(resource.content, 'name') ?? markdownTitle(resource.content, resource.path),
        phases: workflowPhases(resource.content),
        instructions: resource.content,
      });
    } else if (resource.kind === 'policy') {
      policies.push({
        packageName: resource.packageName,
        packageVersion: resource.packageVersion,
        path: resource.path,
        name: markdownTitle(resource.content, resource.path),
        rules: markdownRules(resource.content),
        text: resource.content,
      });
    } else if (resource.kind === 'eval') {
      evals.push(parseEval(resource));
    }
  }
  return { workflows, policies, evals };
}

export interface PiEvalResult {
  contract: string;
  passed: boolean;
  cases: readonly { id: string; passed: boolean; missing: readonly string[]; forbidden: readonly string[] }[];
}

export function evaluatePiPackage(contract: PiEvalContract, value: unknown): PiEvalResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const cases = contract.cases.map((testCase) => {
    const missing = (testCase.requires ?? []).filter((required) => !text.includes(required));
    const forbidden = (testCase.forbidden ?? []).filter((entry) => text.toLowerCase().includes(entry.toLowerCase()));
    return { id: testCase.id, passed: missing.length === 0 && forbidden.length === 0, missing, forbidden };
  });
  return { contract: `${contract.packageName}@${contract.packageVersion}/${contract.name}`, passed: cases.every((testCase) => testCase.passed), cases };
}
