export type ResearchRole = 'technical-analysis' | 'fundamental-analysis' | 'capital-flow' | 'sentiment-analysis';
export type ResearchWorkerStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface ResearchWorkerRequest {
  readonly role: ResearchRole;
  readonly symbol: string;
  readonly question: string;
  readonly systemPrompt: string;
  readonly allowedTools: readonly string[];
}

export interface ResearchWorkerResult {
  readonly role: ResearchRole;
  readonly output: string;
  readonly evidence: readonly unknown[];
  readonly sessionId?: string;
}

export type ResearchWorkerRunner = (request: ResearchWorkerRequest, signal?: AbortSignal) => Promise<ResearchWorkerResult>;

export interface ResearchWorkerRecord {
  readonly role: ResearchRole;
  readonly status: ResearchWorkerStatus;
  readonly output?: string;
  readonly evidence: readonly unknown[];
  readonly error?: string;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly sessionId?: string;
}

export interface ResearchCoordinatorResult {
  readonly schema: 1;
  readonly symbol: string;
  readonly question: string;
  readonly workers: readonly ResearchWorkerRecord[];
  readonly failedWorkers: readonly ResearchRole[];
  readonly evidence: readonly unknown[];
  readonly startedAt: number;
  readonly completedAt: number;
}

const ALL_ROLES: readonly ResearchRole[] = ['technical-analysis', 'fundamental-analysis', 'capital-flow', 'sentiment-analysis'];
const ROLE_TOOLS: Readonly<Record<ResearchRole, readonly string[]>> = {
  'technical-analysis': ['get_market_data', 'get_technical_data', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv'],
  'fundamental-analysis': ['get_financials', 'read_filings', 'get_company_profile', 'dcf_model', 'ddm_model', 'valuation_ratios', 'peer_comparison'],
  'capital-flow': ['get_market_data', 'get_market_structure', 'get_sector_data', 'get_astock_price'],
  'sentiment-analysis': ['web_fetch', 'browser', 'get_astock_news', 'get_market_data'],
};

const ROLE_PROMPTS: Readonly<Record<ResearchRole, string>> = {
  'technical-analysis': '你是技术分析研究员。只基于工具返回的证据分析趋势、动量、波动与关键价位，明确区分事实和推断。',
  'fundamental-analysis': '你是基本面研究员。分析财务质量、估值、竞争地位与催化剂，所有结论必须引用工具证据并标注不确定性。',
  'capital-flow': '你是资金流研究员。分析市场结构、板块轮动、成交与资金行为，避免把推测写成事实。',
  'sentiment-analysis': '你是情绪与事件研究员。检索近期新闻和事件，评估情绪、风险与可能影响，保留来源证据。',
};

export const researchRoles = ALL_ROLES;

export function createResearchWorkerRequest(role: ResearchRole, symbol: string, question: string): ResearchWorkerRequest {
  return { role, symbol, question, systemPrompt: ROLE_PROMPTS[role], allowedTools: ROLE_TOOLS[role] };
}

export type ResearchNeeds = Readonly<Record<string, readonly string[]>>;

export interface ResearchCoordinatorOptions {
  workers?: readonly ResearchRole[];
  signal?: AbortSignal;
  now?: () => number;
  needs?: ResearchNeeds;
}

/**
 * Topological sort of roles by `needs` edges. When no `needs` is given,
 * returns the roles in their natural order so the flat parallel path is
 * preserved. Roles are selected from `options.workers` (or ALL_ROLES).
 * Cycles throw; the caller is expected to validate before passing.
 */
export function topologicalResearchRoles(roles: readonly ResearchRole[], needs?: ResearchNeeds): readonly ResearchRole[] {
  if (!needs) return [...roles];
  const roleSet = new Set(roles);
  const edges = new Map<string, readonly string[]>();
  for (const [id, deps] of Object.entries(needs)) {
    if (!roleSet.has(id as ResearchRole)) continue;
    edges.set(id, deps.filter((d) => roleSet.has(d as ResearchRole)));
  }
  const sorted: ResearchRole[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(role: ResearchRole): void {
    if (visited.has(role)) return;
    if (visiting.has(role)) throw new Error(`research DAG cycle at ${role}`);
    visiting.add(role);
    for (const dep of edges.get(role) ?? []) {
      visit(dep as ResearchRole);
    }
    visiting.delete(role);
    visited.add(role);
    sorted.push(role);
  }
  for (const role of roles) visit(role);
  return sorted;
}

/** Group topologically sorted roles into sequential batches of parallelizable roles. */
export function batchResearchRoles(roles: readonly ResearchRole[], needs?: ResearchNeeds): readonly (readonly ResearchRole[])[] {
  if (!needs) return [roles];
  const sorted = topologicalResearchRoles(roles, needs);
  const batches: ResearchRole[][] = [];
  const done = new Set<string>();
  let remaining = [...sorted];
  while (remaining.length > 0) {
    const batch = remaining.filter((role) => {
      const deps = (needs[role] ?? []).filter((d) => (done.has(d as ResearchRole) ? false : roleSetHas(roles, d as ResearchRole)));
      return deps.length === 0;
    });
    if (batch.length === 0) throw new Error('research DAG batch empty — cyclic needs?');
    for (const role of batch) done.add(role);
    batches.push(batch);
    remaining = remaining.filter((r) => !batch.includes(r));
  }
  return batches;
}

function roleSetHas(roles: readonly ResearchRole[], role: ResearchRole): boolean {
  return roles.includes(role);
}

export async function runResearchCoordinator(
  symbol: string,
  question: string,
  runner: ResearchWorkerRunner | undefined,
  options: ResearchCoordinatorOptions = {},
): Promise<ResearchCoordinatorResult> {
  if (!runner) throw new Error('research-worker capability is unavailable; analyze_symbol is fail-closed');
  const selected = options.workers?.length ? [...new Set(options.workers)] : [...ALL_ROLES];
  const batches = batchResearchRoles(selected, options.needs);
  const now = options.now ?? Date.now;
  const startedAt = now();
  const records: ResearchWorkerRecord[] = [];

  const abortedAtStart = options.signal?.aborted === true;
  for (const batch of batches) {
    if (abortedAtStart) {
      // Preserve original contract: every selected role still produces a
      // record (status 'blocked') so callers see the full worker set.
      for (const role of batch) {
        records.push({ role, status: 'blocked', evidence: [], error: 'aborted', startedAt: startedAt, completedAt: now() });
      }
      continue;
    }
    const batchResults = await Promise.all(batch.map(async (role): Promise<ResearchWorkerRecord> => {
      const started = now();
      if (options.signal?.aborted) return { role, status: 'blocked' as const, evidence: [], error: 'aborted', startedAt: started, completedAt: now() };
      try {
        const result = await runner(createResearchWorkerRequest(role, symbol, question), options.signal ?? new AbortController().signal);
        return { role, status: 'completed' as const, output: result.output, evidence: [...result.evidence], sessionId: result.sessionId, startedAt: started, completedAt: now() };
      } catch (error) {
        return { role, status: options.signal?.aborted ? 'blocked' : 'failed', evidence: [], error: error instanceof Error ? error.message : String(error), startedAt: started, completedAt: now() };
      }
    }));
    records.push(...batchResults);
  }
  return {
    schema: 1,
    symbol,
    question,
    workers: records,
    failedWorkers: records.filter((record) => record.status !== 'completed').map((record) => record.role),
    evidence: records.flatMap((record) => record.evidence),
    startedAt,
    completedAt: now(),
  };
}
