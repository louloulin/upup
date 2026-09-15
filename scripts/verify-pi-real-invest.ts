import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPiNativeApp } from '@upup/pi-app/default';
import {
  INVESTMENT_VERIFICATION_ARTIFACT_SCHEMA,
  createRealInvestVerificationArtifact,
  getInvestmentDossierValidationErrors,
  getRealInvestVerificationArtifactErrors,
  verifyReadOnlySessionSafety,
  verifyInvestmentEvidence,
} from '@upup/pi-investment-workflow';

const enabled = process.env.UPUP_REAL_INVEST === '1';
const confirmed = process.env.UPUP_REAL_INVEST_CONFIRM === 'READ_ONLY';
const configuredTickers = process.env.UPUP_REAL_INVEST_TICKERS ?? process.env.UPUP_REAL_INVEST_TICKER;
const tickers = (configuredTickers ?? '600519.SH,00700.HK,AAPL')
  .split(',')
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const artifactDirectory = process.env.UPUP_REAL_INVEST_ARTIFACT_DIR ?? join(process.cwd(), '.upup', 'real-invest-artifacts');
const requestedMarket = process.env.UPUP_REAL_INVEST_MARKET?.trim().toLowerCase();

function providerForMarket(market: ReturnType<typeof marketForTicker>): string {
  if (market === 'us') return 'financial-datasets';
  if (market === 'cn' || market === 'hk') return 'tushare';
  return `configured-${market}`;
}

function requireMarketCredential(market: ReturnType<typeof marketForTicker>): void {
  if (market !== 'us' && market !== 'cn' && market !== 'hk') {
    throw new Error(`真实投研验收只支持 CN/HK/US；${market} 不在 Pi7 三市场验收范围内。`);
  }
  if (market === 'us' && !process.env.FINANCIAL_DATASETS_API_KEY?.trim()) {
    throw new Error('US 真实只读验收需要 FINANCIAL_DATASETS_API_KEY；未提供时 fail-closed。');
  }
  if ((market === 'cn' || market === 'hk') && !process.env.TUSHARE_TOKEN?.trim()) {
    throw new Error(`${market.toUpperCase()} 真实只读验收需要 TUSHARE_TOKEN；未提供时 fail-closed。`);
  }
}

function marketForTicker(ticker: string): 'cn' | 'hk' | 'us' | 'fund' | 'crypto' {
  if (requestedMarket === 'cn' || requestedMarket === 'hk' || requestedMarket === 'us' || requestedMarket === 'fund' || requestedMarket === 'crypto') return requestedMarket;
  if (ticker.endsWith('.HK')) return 'hk';
  if (/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(ticker)) return 'cn';
  return 'us';
}

function buildNextSteps(tickers: readonly string[]): string[] {
  const needsTushare = tickers.some((t) => t.endsWith('.HK') || /^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(t));
  const needsFinancialDatasets = tickers.some((t) => !t.endsWith('.HK') && !/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(t));
  const steps: string[] = [
    '# Real provider dossier verification is credential-gated. To enable:',
    'export UPUP_REAL_INVEST=1',
    'export UPUP_REAL_INVEST_CONFIRM=READ_ONLY',
  ];
  if (needsTushare) {
    steps.push('export TUSHARE_TOKEN=...   # required for CN/HK tickers');
  }
  if (needsFinancialDatasets) {
    steps.push('export FINANCIAL_DATASETS_API_KEY=...   # required for US tickers');
  }
  steps.push(`export UPUP_REAL_INVEST_TICKERS="${tickers.join(',')}"`);
  steps.push('bun run verify:pi-real-invest');
  steps.push('# Artifacts land in: .upup/real-invest-artifacts/');
  steps.push('# When C15 is plugged into verify:pi7-final, this contract becomes the 21st entry.');
  return steps;
}

if (!enabled || !confirmed) {
  console.log(JSON.stringify({
    schema: INVESTMENT_VERIFICATION_ARTIFACT_SCHEMA,
    status: 'skipped',
    reason: '需要显式设置 UPUP_REAL_INVEST=1 与 UPUP_REAL_INVEST_CONFIRM=READ_ONLY；默认不访问网络。',
    fixtureSeparate: true,
    nextSteps: buildNextSteps(tickers),
    requiredEnv: {
      UPUP_REAL_INVEST: enabled ? '1 (already set)' : 'missing',
      UPUP_REAL_INVEST_CONFIRM: confirmed ? 'READ_ONLY (already set)' : 'missing',
      TUSHARE_TOKEN: process.env.TUSHARE_TOKEN ? 'configured' : 'required for CN/HK tickers',
      FINANCIAL_DATASETS_API_KEY: process.env.FINANCIAL_DATASETS_API_KEY ? 'configured' : 'required for US tickers',
    },
  }, null, 2));
  process.exit(0);
}

if (process.env.UPUP_DRY_RUN === '1' || process.env.UPUP_DRY_RUN === 'true') {
  throw new Error('真实投研验收禁止 UPUP_DRY_RUN；请移除 dry-run 配置后重试。');
}
if (tickers.length !== new Set(tickers).size) {
  throw new Error('真实投研验收的 ticker 列表不得重复；重复输入会破坏独立 artifact 证据。');
}
if (!configuredTickers && requestedMarket) {
  throw new Error('指定 UPUP_REAL_INVEST_MARKET 时必须同时指定 UPUP_REAL_INVEST_TICKERS，避免错误地把同一 ticker 当作多个市场。');
}

// Validate ALL credentials before creating any artifact directory so a
// half-configured environment never leaves a dangling .upup/real-invest-artifacts/.
const markets = tickers.map((ticker) => marketForTicker(ticker));
const uniqueMarkets = new Set(markets);
for (const market of uniqueMarkets) {
  requireMarketCredential(market);
}

mkdirSync(artifactDirectory, { recursive: true });
process.env.UPUP_PLANS_DIR = artifactDirectory;
const startedAt = new Date().toISOString();
const app = getPiNativeApp();
const workflow = app.getInvestmentWorkflow();
const results = [];
try {
for (const ticker of tickers) {
  const market = marketForTicker(ticker);
  // credential already validated above; per-iteration check kept for defensive parity
  requireMarketCredential(market);
  const expectedProvider = providerForMarket(market);
  const modelVersion = process.env.UPUP_MODEL ?? process.env.OPENAI_MODEL ?? 'configured-provider-model';
  const dataAsOf = new Date().toISOString();
  const idempotencyKey = `real-invest:${startedAt}:${ticker}:${market}`;
  const result = await workflow.runInvestmentWorkflow(`分析 ${ticker}`, {
    ticker,
    market,
    idempotencyKey,
    modelVersion,
    dataAsOf,
    assumptions: ['本次验收仅执行只读投研；真实交易、通知、凭证导出和外发文件均禁止。'],
  });
  const resumed = await workflow.resumeWorkflow(result.planId);
  const phaseNames = result.dossier?.phases.map((phase) => phase.phase) ?? [];
  const phaseStatuses = result.dossier?.phases.map((phase) => phase.status) ?? [];
  const dossierErrors = result.dossier ? getInvestmentDossierValidationErrors(result.dossier) : ['dossier is missing'];
  if (!result.dossier || phaseNames.join(',') !== 'detect,plan,execute,verify,report' || phaseStatuses.some((status) => status !== 'completed') || dossierErrors.length > 0) {
    throw new Error(`真实投研 dossier contract failed for ${ticker}: ${dossierErrors.join('; ')}`);
  }
  if (!resumed.dossier || resumed.dossier.artifactHash !== result.dossier.artifactHash || resumed.sessionFile !== result.sessionFile) {
    throw new Error(`真实投研 restart/resume contract failed for ${ticker}`);
  }
  if (!result.sessionFile) throw new Error(`真实投研 session file missing for ${ticker}`);
  const sessionText = readFileSync(result.sessionFile, 'utf8');
  const evidence = verifyInvestmentEvidence({
    dossier: result.dossier,
    sessionText,
    expectedPlanId: result.planId,
    expectedSessionId: result.sessionId,
    requireConcreteModel: true,
  });
  if (!evidence.valid) throw new Error(`真实投研 evidence contract failed for ${ticker}: ${evidence.errors.join('; ')}`);
  const safety = verifyReadOnlySessionSafety(sessionText);
  if (!safety.valid) throw new Error(`真实投研 read-only policy contract failed for ${ticker}: ${safety.errors.join('; ')}`);
  const forkSessionFile = await workflow.forkWorkflowSession(result.planId);
  if (!forkSessionFile || !existsSync(forkSessionFile)) throw new Error(`真实投研 fork contract failed for ${ticker}`);
  const replay = await workflow.runInvestmentWorkflow(`分析 ${ticker}`, {
    ticker,
    market,
    idempotencyKey,
    modelVersion,
    dataAsOf,
    assumptions: ['幂等重放不得创建第二个 Session 或第二份 dossier。'],
  });
  if (replay.planId !== result.planId || replay.dossier?.artifactHash !== result.dossier.artifactHash || replay.sessionFile !== result.sessionFile) {
    throw new Error(`真实投研 idempotency replay contract failed for ${ticker}`);
  }
  const retryEvidence = result.dossier.phases.flatMap((phase) => phase.evidence).filter((item) => typeof item.retryAttempts === 'number' && typeof item.retryMaxAttempts === 'number' && typeof item.retryRecovered === 'boolean');
  if (retryEvidence.length === 0) throw new Error(`真实投研 retry evidence missing for ${ticker}`);
  const providers = [...new Set(result.dossier.phases.flatMap((phase) => phase.evidence).map((item) => item.provider).filter((provider): provider is string => typeof provider === 'string' && provider.length > 0))];
  if (!providers.includes(expectedProvider)) throw new Error(`真实投研 provider evidence missing for ${ticker}: expected ${expectedProvider}`);
  const historyEvidence = result.dossier.phases.find((phase) => phase.phase === 'execute')?.evidence.find((item) => typeof item.provider === 'string' && typeof item.asOf === 'string' && item.source.startsWith('http'));
  if (!historyEvidence || historyEvidence.provider !== expectedProvider || !historyEvidence.asOf || !historyEvidence.retrievedAt) throw new Error(`真实投研 history evidence missing or mismatched for ${ticker}: expected ${expectedProvider}`);
  const provider = providers.join(',');
  results.push({
    ticker,
    market,
    planId: result.planId,
    sessionId: result.sessionId,
    sessionFile: result.sessionFile,
    forkSessionFile,
    dossierFile: result.dossierFile,
    dossierHash: result.dossier.artifactHash,
    resumedHash: resumed.dossier.artifactHash,
    provider,
    phases: result.phases,
    eventActions: evidence.eventActions,
    evidenceSources: evidence.evidenceSources,
    historyEvidence: { provider: historyEvidence.provider!, source: historyEvidence.source, asOf: historyEvidence.asOf!, retrievedAt: historyEvidence.retrievedAt },
    providerRetry: {
      totalAttempts: retryEvidence.reduce((total, item) => total + item.retryAttempts!, 0),
      maxAttempts: retryEvidence.reduce((maximum, item) => Math.max(maximum, item.retryMaxAttempts!), 0),
      recovered: retryEvidence.some((item) => item.retryRecovered === true),
      evidenceCount: retryEvidence.length,
    },
    policyAudit: {
      auditCount: safety.auditCount,
      deniedCount: safety.deniedCount,
      approvalRequiredCount: safety.approvalRequiredCount,
      approvalDeniedCount: safety.approvalDeniedCount,
    },
  });
}
const artifact = createRealInvestVerificationArtifact({
  status: results.length === tickers.length && results.every((result) => result.phases.every((phase) => phase.status !== 'failed')) ? 'completed' : 'failed',
  fixtureSeparate: true,
  readOnly: true,
  provider: [...new Set(results.map((result) => result.provider))].join(','),
  model: process.env.UPUP_MODEL ?? process.env.OPENAI_MODEL ?? 'not-used-by-direct-workflow-tool-run',
  tickers,
  startedAt,
  completedAt: new Date().toISOString(),
  results,
  policy: { decision: 'read_only', approval: 'READ_ONLY', trading: 'denied', outboundNotifications: 'denied', credentialExport: 'denied' },
});
const artifactErrors = getRealInvestVerificationArtifactErrors(artifact);
if (artifactErrors.length > 0) throw new Error(`真实投研 artifact contract failed: ${artifactErrors.join('; ')}`);
const artifactPath = join(artifactDirectory, `real-invest-${Date.now()}.json`);
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...artifact, artifactPath }, null, 2));
if (artifact.status !== 'completed') process.exitCode = 1;
} finally {
  await app.dispose();
}
