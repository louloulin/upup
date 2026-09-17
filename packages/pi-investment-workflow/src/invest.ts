/**
 * /invest [TICKER] [intent]
 *
 * v5 Sprint 3.2 — 5 步研究闭环命令
 * /invest NVDA                 → 5 步全跑(detect/plan/execute/verify/report)
 * /invest NVDA 估值            → fast lane(只跑估值相关 phase)
 * /invest --resume <planId>    → 从 checkpoint 恢复
 *
 * 调 Pi-backed investment workflow
 * 通过 Pi Session 调用 investment-workflow Package 的 canonical 五阶段工具。
 *
 * 模块边界:
 * - 通过注入的 InvestmentSessionFactory 使用 Pi Session（无 root src 依赖）
 * - 调 src/plan/plan-executor(读 plan 状态)
 * - 零跨包
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS_DIR } from '@upup/utils';
import {
  resumeWorkflow,
  runInvestmentWorkflow,
  WORKFLOW_PHASES,
  type InvestmentWorkflowOptions,
  type WorkflowResult,
} from './orchestration';
import { loadPlan } from '@upup/pi-planning';
import { extractTicker } from '@upup/pi-planning';
import { INVESTMENT_PROFILES, getInvestmentAgentSpec } from './agent-spec';
import { loadSops, loadUserAgentSpecs, mergeAgentCatalog } from './sop-loader';
import { executeSop, type SopPhaseRunner, type SopResult, type SopSynthesizerRunner } from './sop-executor';
import { SopValidationError, validateSopSpec, type SopSpec } from './sop-spec';

export type InvestMode = 'full' | 'fast' | 'resume' | 'sop' | 'sops';



function parseArgs(input: string): { mode: InvestMode; ticker?: string; intent: string; planId?: string; sopId?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { mode: 'full', intent: '分析投资机会' };

  // --sops (list available SOPs)
  if (trimmed === '--sops' || trimmed === '--list-sops') {
    return { mode: 'sops', intent: 'list sops' };
  }

  // --sop <name> / --sop=<name>
  const sopMatch = trimmed.match(/--sop=(\S+)/) ?? trimmed.match(/--sop\s+(\S+)/);
  if (sopMatch) {
    const sopId = sopMatch[1]!;
    const rest = trimmed.replace(sopMatch[0], '').trim();
    const ticker = extractTicker(rest);
    const intent = ticker
      ? rest.replace(new RegExp(ticker.replace(/\./g, '\\.'), 'i'), '').trim() || 'SOP 分析'
      : rest || 'SOP 分析';
    return { mode: 'sop', intent, sopId, ...(ticker ? { ticker } : {}) };
  }

  // --resume <planId>
  if (trimmed.startsWith('--resume')) {
    const m = trimmed.match(/--resume\s+(\S+)/);
    return { mode: 'resume', intent: 'resume', planId: m?.[1] };
  }

  // --fast
  const isFast = trimmed.startsWith('--fast');
  const rest = isFast ? trimmed.replace('--fast', '').trim() : trimmed;

  // ticker 抽取
  const ticker = extractTicker(rest);
  // 去掉 ticker 后的剩余 = intent
  const intent = ticker
    ? rest.replace(new RegExp(ticker.replace(/\./g, '\\.'), 'i'), '').trim() || '分析'
    : rest;

  return {
    mode: isFast ? 'fast' : 'full',
    ...(ticker ? { ticker } : {}),
    intent: intent || '分析',
  };
}

/** 渲染 WorkflowResult 为可读文本 */
function renderResult(result: WorkflowResult): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    `  Investment Workflow`,
    `  ${result.ticker ? `Ticker: ${result.ticker}` : '(无 ticker)'}  Intent: ${result.intent}`,
    `  Plan ID: ${result.planId.slice(0, 8)}`,
    '═══════════════════════════════════════',
    '',
  ];

  if (result.phases.length === 0) {
    lines.push('  (无 phase 结果)');
  } else {
    lines.push(`  5 步 canonical phase 进度:`);
    lines.push('');
    for (const p of result.phases) {
      const icon = p.status === 'completed' ? '✓' : p.status === 'failed' ? '✗' : p.status === 'skipped' ? '⊘' : '○';
      const bar = '█'.repeat(Math.min(Math.round(p.output.length / 4), 10));
      const dur = `${p.durationMs}ms`;
      const err = p.error ? ` ⚠ ${p.error.slice(0, 40)}` : '';
      lines.push(`  ${icon} ${p.phase.padEnd(10)} [${bar.padEnd(10)}] ${dur.padStart(8)}${err}`);
      if (p.output) {
        // Phases carry real provider payloads (价格 / 报告期基本面 / 回测区间 …): show
        // enough lines that the numbers survive, not just the phase heading.
        const out = p.output.split('\n').slice(0, 12).map(l => `      ${l}`).join('\n');
        lines.push(out);
      }
    }
  }
  lines.push('');

  const successCount = result.phases.filter(p => p.status === 'completed').length;
  const failedCount = result.phases.filter(p => p.status === 'failed').length;
  lines.push(`  总耗时:   ${result.totalDurationMs}ms`);
  lines.push(`  成功:     ${successCount}/${result.phases.length}`);
  if (failedCount > 0) lines.push(`  失败:     ${failedCount}`);
  lines.push(`  最终状态: ${result.finalPlanState}  进度: ${result.progress}%`);
  lines.push('');
  lines.push(`  💡 完整执行 /invest --resume ${result.planId} 继续/重跑`);
  lines.push('');

  return lines.join('\n');
}

/** 渲染列表:当前所有 plan 的 5 步状态(给 /invest --list 用) */
function renderList(): string {
  if (!existsSync(PLANS_DIR)) return '\n  (无 plan — /invest NVDA 开始五阶段投研)\n';
  const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return '\n  (无 plan — /invest NVDA 开始五阶段投研)\n';

  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    '  Plans',
    '═══════════════════════════════════════',
    '',
  ];
  for (const f of files.slice(0, 10)) {
    const id = f.replace(/\.json$/, '');
    const p = loadPlan(id);
    if (!p) continue;
    const date = p.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    const t = p.ticker ?? '?';
    const state = p.phase;
    const steps = p.steps.length;
    lines.push(`  ${date}  ${t.padEnd(10)}  [${state.padEnd(8)}]  ${steps} 步  ${id.slice(0, 8)}`);
  }
  lines.push('');
  return lines.join('\n');
}


/**
 * Read the final assistant turn out of a Pi session's message list.
 *
 * Returns `{ text, error }`: `error` is set when the provider reported a
 * failure (`stopReason: 'error'` / `errorMessage`, e.g. a 429 rate limit or a
 * missing credential). Callers must treat that as a failed phase — otherwise
 * a rejected request renders as an empty-but-successful phase, which silently
 * violates the fail-closed contract the rest of the workflow upholds.
 */
function extractAssistantOutcome(messages: readonly unknown[]): { text: string; error?: string } {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: unknown; content?: unknown; stopReason?: unknown; errorMessage?: unknown } | undefined;
    if (!message || message.role !== 'assistant') continue;
    const errorMessage = typeof message.errorMessage === 'string' && message.errorMessage.trim() ? message.errorMessage.trim() : undefined;
    const error = errorMessage ?? (message.stopReason === 'error' ? 'model request failed' : undefined);
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .filter((part): part is { type: 'text'; text: string } =>
          Boolean(part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string'))
        .map((part) => part.text)
        .join('\n');
    }
    return error ? { text, error } : { text };
  }
  return { text: '' };
}

const SOP_SESSION_DIR = join(PLANS_DIR, 'sops');

/**
 * Build a Pi-backed SopPhaseRunner. Each phase gets its own Pi session so a
 * failing phase cannot poison the phase that follows it.
 */
function createPiSopRunner(
  sessionFactory: NonNullable<InvestmentWorkflowOptions['sessionFactory']>,
  cwd: string,
): SopPhaseRunner {
  return async ({ sop, phase, agent, intent, ticker, dependencies, signal }) => {
    const spec = agent ?? getInvestmentAgentSpec('invest-plan');
    const sessionPath = join(SOP_SESSION_DIR, `${sop.id}-${phase.id.replace(/[^a-z0-9-]/gi, '_')}.pi.jsonl`);
    const session = await sessionFactory(sessionPath);
    try {
      const depBlock = dependencies.length
        ? `\n\n前序阶段结论:\n${dependencies.map((d) => `### ${d.phaseId}\n${d.output}`).join('\n\n')}`
        : '';
      const tickerBlock = ticker ? `\n标的: ${ticker}` : '';
      const input = `${intent}${tickerBlock}${depBlock}`;
      session.setFinanceContext({ ...(ticker ? { ticker } : {}) });
      await session.prompt(input, signal ? { signal } : {});
      const outcome = extractAssistantOutcome(session.getMessages());
      if (outcome.error) throw new Error(`phase ${phase.id} (${spec.id}) failed: ${outcome.error}`);
      if (!outcome.text.trim()) throw new Error(`phase ${phase.id} (${spec.id}) returned no output`);
      return { output: outcome.text, evidence: [{ phase: phase.id, agent: spec.id }], sessionId: session.id };
    } finally {
      session.dispose();
      void cwd;
    }
  };
}

/**
 * Build a Pi-backed SopSynthesizerRunner: one session consumes every parallel
 * branch and arbitrates per the group's reduce mode.
 */
function createPiSopSynthesizer(
  sessionFactory: NonNullable<InvestmentWorkflowOptions['sessionFactory']>,
): SopSynthesizerRunner {
  return async ({ sop, group, synthesizer, ticker, inputs, signal }) => {
    const spec = synthesizer ?? getInvestmentAgentSpec('invest-plan');
    const sessionPath = join(SOP_SESSION_DIR, `${sop.id}-${group.id}-synth.pi.jsonl`);
    const session = await sessionFactory(sessionPath);
    try {
      const branchBlock = inputs.map((i) => `### ${i.agent} (${i.status})\n${i.output}`).join('\n\n');
      const reduceInstruction = group.reduce === 'llm-arbiter'
        ? '以仲裁者身份综合以下分歧，给出倾向性结论与仍然存在的关键不确定性。'
        : group.reduce === 'weighted'
          ? `加权综合（权重 ${JSON.stringify(group.weights ?? {})}）以下观点。`
          : '按多数意见综合以下观点，并标注少数派异议。';
      const input = `${reduceInstruction}\n${ticker ? `标的: ${ticker}\n` : ''}\n${branchBlock}`;
      session.setFinanceContext({ ...(ticker ? { ticker } : {}) });
      await session.prompt(input, signal ? { signal } : {});
      const outcome = extractAssistantOutcome(session.getMessages());
      if (outcome.error) throw new Error(`synthesis ${group.id} (${spec.id}) failed: ${outcome.error}`);
      if (!outcome.text.trim()) throw new Error(`synthesis ${group.id} (${spec.id}) returned no output`);
      return { output: outcome.text, evidence: inputs.map((i) => ({ phase: i.phaseId })), sessionId: session.id };
    } finally {
      session.dispose();
    }
  };
}

/** Render the SOP list (`/invest --sops`). */
function renderSopList(): string {
  const userAgents = loadUserAgentSpecs();
  const catalog = mergeAgentCatalog(Object.values(INVESTMENT_PROFILES), userAgents.agents);
  const knownIds = new Set(catalog.map((a) => a.id));
  const { sops, sources, warnings } = loadSops();
  const lines: string[] = ['', '═══════════════════════════════════════', '  Available SOPs', '═══════════════════════════════════════', ''];
  if (sops.length === 0) {
    lines.push('  (无 SOP — 用 /sop new <id> 生成模板，或 /sop install <url|path> 安装)');
  }
  for (const sop of sops) {
    let validity = '✓';
    try {
      validateSopSpec(sop, knownIds);
    } catch (error) {
      validity = error instanceof SopValidationError ? `✗ ${error.issues.length} issue(s)` : '✗ invalid';
    }
    const source = sources.get(sop.id) === 'builtin' ? 'builtin' : 'user';
    const groups = sop.parallelGroups?.length ? `, ${sop.parallelGroups.length} parallel group(s)` : '';
    lines.push(`  ${validity} ${sop.id.padEnd(18)} [${source}]  ${sop.phases.length} phases${groups}`);
    lines.push(`      ${sop.name} — ${sop.description.split('\n')[0]!.trim()}`);
  }
  if (warnings.length) {
    lines.push('');
    lines.push('  ⚠ 加载警告:');
    for (const w of warnings) lines.push(`      ${w}`);
  }
  lines.push('');
  lines.push('  💡 运行: /invest --sop <id> <TICKER>');
  lines.push('     管理: /sop list · /sop show <id> · /sop install <source> · /sop new <id>');
  lines.push('');
  return lines.join('\n');
}

/** Render a SopResult. */
function renderSopResult(result: SopResult, sop: SopSpec): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    `  SOP: ${sop.name} (${result.sopId})`,
    `  ${result.ticker ? `Ticker: ${result.ticker}` : '(无 ticker)'}`,
    '═══════════════════════════════════════',
    '',
  ];
  for (const phase of result.phases) {
    const icon = phase.status === 'completed' ? '✓' : phase.status === 'failed' ? '✗' : phase.status === 'approval_required' ? '⏸' : '⊘';
    lines.push(`  ${icon} ${phase.phaseId.padEnd(22)} ${phase.agent.padEnd(18)} ${`${phase.durationMs}ms`.padStart(9)}`);
    if (phase.error) lines.push(`      ⚠ ${phase.error}`);
    if (phase.output) lines.push(
      phase.output.split('\n').slice(0, 12).map((l) => `      ${l}`).join('\n'),
    );
  }
  for (const synth of result.syntheses) {
    const icon = synth.status === 'completed' ? '⚖' : '✗';
    lines.push(`  ${icon} ${`${synth.phaseId} (synthesis)`.padEnd(22)} ${synth.agent.padEnd(18)} ${`${synth.durationMs}ms`.padStart(9)}`);
    if (synth.error) lines.push(`      ⚠ ${synth.error}`);
    if (synth.output) lines.push(synth.output.split('\n').slice(0, 16).map((l) => `      ${l}`).join('\n'));
  }
  lines.push('');
  if (result.pendingApproval) {
    lines.push(`  ⏸ 已暂停，等待人工批准: ${result.pendingApproval.phaseId}`);
    lines.push('     在 Pi 会话中批准后可用 --sop 重跑（已完成的阶段会自动跳过）。');
  }
  lines.push(`  总耗时: ${result.totalDurationMs}ms   成功: ${result.success ? 'yes' : 'no'}`);
  lines.push('');
  return lines.join('\n');
}

/** CLI 入口 */
export async function runInvest(args: string, options: InvestmentWorkflowOptions = {}): Promise<string> {
  const trimmed = args.trim();

  // --help
  if (trimmed === '--help' || trimmed === '-h') {
    return [
      '',
      '  /invest — 五阶段投研闭环 + 可自定义 SOP',
      '',
      '  用法:',
      '    /invest <TICKER> [intent]            五阶段全跑 (detect → plan → execute → verify → report)',
      '    /invest --fast <TICKER> [intent]     仅跑意图相关阶段',
      '    /invest --resume <planId>            从 checkpoint 恢复',
      '    /invest --list                       列出所有 plan',
      '    /invest --sops                       列出所有可用 SOP（内置 + 用户自定义）',
      '    /invest --sop <id> <TICKER>          用指定 SOP 运行',
      '',
      '  自定义 SOP: ~/.upup/sops/*.yaml 或 <cwd>/.upup/sops/*.yaml',
      '  自定义 Agent: ~/.upup/agents/*.json 或 <cwd>/.upup/agents/*.json',
      '',
    ].join('\n');
  }

  // --list
  if (trimmed === '--list' || trimmed === '-l') return renderList();

  const { mode, ticker, intent, planId, sopId } = parseArgs(trimmed);

  if (mode === 'sops') return renderSopList();

  if (mode === 'sop') {
    if (!sopId) return '\n  用法: /invest --sop <name> <TICKER>（/invest --sops 查看全部）\n';
    const userAgents = loadUserAgentSpecs();
    const catalog = mergeAgentCatalog(Object.values(INVESTMENT_PROFILES), userAgents.agents);
    const knownIds = new Set(catalog.map((a) => a.id));
    const { sops } = loadSops();
    const sop = sops.find((item) => item.id === sopId);
    if (!sop) {
      return `\n  ✗ 未知 SOP: ${sopId}\n     可用: ${sops.map((item) => item.id).join(', ') || '(none)'}\n`;
    }
    try {
      validateSopSpec(sop, knownIds);
    } catch (error) {
      return `\n  ✗ SOP "${sopId}" 校验失败:\n${error instanceof Error ? error.message : String(error)}\n`;
    }
    if (!options.sessionFactory) {
      return `\n  ✗ SOP "${sopId}" 需要 Pi session 工厂；请通过 upup invest / TUI /invest 运行。\n`;
    }
    const agentMap = new Map(catalog.map((a) => [a.id, a] as const));
    const runner = createPiSopRunner(options.sessionFactory, process.cwd());
    const synthesizerRunner = createPiSopSynthesizer(options.sessionFactory);
    const result = await executeSop(sop, runner, {
      ...(ticker ? { ticker } : {}),
      agents: agentMap,
      synthesizerRunner,
    });
    void intent;
    return renderSopResult(result, sop);
  }

  if (mode === 'resume') {
    if (!planId) {
      return [
        '',
        '  用法: /invest --resume <planId>',
        '  或 /invest --list 查看所有 plan',
        '',
      ].join('\n');
    }
    try {
      const result = await resumeWorkflow(planId, options);
      return renderResult(result);
    } catch (e) {
      return `\n  ✗ Resume 失败: ${e instanceof Error ? e.message : String(e)}\n`;
    }
  }

  const result = await runInvestmentWorkflow(intent, {
    ...options,
    ...(ticker ? { ticker } : {}),
    mode,
  });
  return renderResult(result);
}

/** 导出 phase 顺序(给 help 用) */
export const INVEST_PHASES = WORKFLOW_PHASES;
