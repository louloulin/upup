export interface StockAnalysisInput {
  readonly symbol: string;
  readonly name: string;
  readonly depth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface StockAnalysisWorkerRequest {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly prompt: string;
  readonly tools: readonly string[] | '*';
}

export interface StockAnalysisWorkerResult {
  readonly agentId: string;
  readonly output: string;
  readonly sessionId: string;
}

export interface StockAnalysisResult {
  readonly symbol: string;
  readonly name: string;
  readonly team: string;
  readonly researcherReport?: string;
  readonly analystReport?: string;
  readonly recommendation?: string;
  readonly completedAt: number;
  readonly success: boolean;
  readonly workerSessions?: readonly string[];
  readonly error?: string;
}

export type StockAnalysisWorker = (request: StockAnalysisWorkerRequest, signal: AbortSignal) => Promise<StockAnalysisWorkerResult>;

function maxIterations(depth: StockAnalysisInput['depth']): number {
  return depth === 'comprehensive' ? 15 : depth === 'detailed' ? 10 : 5;
}

function workerId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'stock-analysis-worker';
}

export async function runNativeStockAnalysis(input: StockAnalysisInput, runWorker: StockAnalysisWorker, signal: AbortSignal): Promise<StockAnalysisResult> {
  const depth = input.depth ?? 'basic';
  const team = `pi-stock-analysis-${input.symbol}`;
  const base = { symbol: input.symbol, name: input.name, team, completedAt: Date.now(), success: false as const };
  if (!input.symbol.trim() || !input.name.trim()) return { ...base, completedAt: Date.now(), error: 'symbol and name are required' };
  if (signal.aborted) return { ...base, completedAt: Date.now(), error: 'stock analysis request aborted' };
  const context = `标的：${input.symbol}（${input.name}）\n分析深度：${depth}`;
  const iterations = maxIterations(depth);
  const run = (agentId: string, name: string, role: string, prompt: string) => runWorker({ agentId, name, role, prompt: `${prompt}\n\n最大工具迭代次数：${iterations}`, tools: '*' }, signal);
  try {
    const [researcher, analyst] = await Promise.all([
      run(workerId(`${team}:researcher`), 'Stock Fundamental Researcher', 'fundamental-analysis', `你是 Pi 投资研究员。${context}\n请完成基本面研究：公司业务、行业地位、竞争优势、近期事件和治理结构。只使用可核验数据，标注数据时间与证据来源，输出结构化中文报告。`),
      run(workerId(`${team}:analyst`), 'Stock Financial Analyst', 'financial-analysis', `你是 Pi 财务分析师。${context}\n请分析营收、利润、现金流、ROE、毛利率、估值和关键风险。只使用可核验数据，标注数据时间与证据来源，输出结构化中文报告。`),
    ]);
    if (signal.aborted) return { ...base, completedAt: Date.now(), error: 'stock analysis request aborted' };
    const recommendation = await run(workerId(`${team}:recommendation`), 'Stock Portfolio Advisor', 'portfolio-advisor', `你是 Pi 投资组合顾问。${context}\n以下是两个独立 Pi Session 的研究结果。\n\n【基本面研究】\n${researcher.output}\n\n【财务分析】\n${analyst.output}\n\n请综合判断投资逻辑，给出买入/持有/卖出倾向、关键假设、风险清单和需要继续验证的问题。不得编造目标价或数据，输出结构化中文投资建议。`);
    return { ...base, researcherReport: researcher.output, analystReport: analyst.output, recommendation: recommendation.output, workerSessions: [researcher.sessionId, analyst.sessionId, recommendation.sessionId], completedAt: Date.now(), success: true };
  } catch (error) {
    return { ...base, completedAt: Date.now(), error: error instanceof Error ? error.message : String(error) };
  }
}
