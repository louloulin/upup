import { describe, expect, test } from 'bun:test';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import { FINANCE_FIXTURE_TOOLS } from '../../extensions/upup/finance-fixtures.js';
import type { UpUpAgentSession, UpUpToolContract } from './types.js';
import { toPiTool } from './agent-session-factory.js';
import { join } from 'node:path';

type AgentToolResultWithError = Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };

type PolicyToolResult = {
  isError?: boolean;
  details: { policyAudit: { decision: string } };
};

describe('PiAgentSessionFactory', () => {
  test('creates an in-memory Pi session with the finance extension', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      tools: FINANCE_FIXTURE_TOOLS.map((tool) => tool.name),
    }, {
      cwd: process.cwd(),
      tools: FINANCE_FIXTURE_TOOLS,
    });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.spec.id).toBe('invest-explore');
    expect(session.getAvailableToolNames()).toEqual([
      'fixture_market_quote',
      'fixture_fundamentals',
      'fixture_news',
      'fixture_search',
      'fixture_trading_day',
    ]);
    const events: string[] = [];
    session.subscribe((event) => events.push(event.type));
    expect(events).toContain('session_start');
    session.dispose();
  });

  test('enforces profile tool allowlists before Pi registration', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      tools: ['fixture_market_quote', 'fixture_fundamentals'],
    }, {
      cwd: process.cwd(),
      tools: FINANCE_FIXTURE_TOOLS,
    });
    expect(session.getAvailableToolNames()).toEqual(['fixture_market_quote', 'fixture_fundamentals']);
    session.dispose();
  });

  test('creates every investment profile through the same Pi session factory', async () => {
    for (const profileId of ['invest-explore', 'invest-plan', 'invest-risk', 'invest-trade', 'invest-review']) {
      const session = await new PiAgentSessionFactory().createSession({
        ...getInvestmentAgentSpec(profileId),
        tools: FINANCE_FIXTURE_TOOLS.map((tool) => tool.name),
      }, {
        cwd: process.cwd(),
        tools: FINANCE_FIXTURE_TOOLS,
      });
      try {
        expect(session.spec.id).toBe(profileId);
        expect(session.getAvailableToolNames().every((name) => FINANCE_FIXTURE_TOOLS.some((tool) => tool.name === name))).toBe(true);
      } finally {
        session.dispose();
      }
    }
  });

  test('returns an auditable error for a tool blocked by policy', async () => {
    const dangerousTool: UpUpToolContract = {
      name: 'fixture_dangerous',
      label: 'Fixture dangerous',
      description: 'A blocked fixture tool.',
      category: 'trading',
      safetyLevel: 'dangerous',
      parameters: FINANCE_FIXTURE_TOOLS[0].parameters,
      hasFinancialImpact: true,
      async execute() {
        throw new Error('must not execute');
      },
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      tools: ['fixture_market_quote'],
    }, {
      cwd: process.cwd(),
      tools: [dangerousTool],
    });
    expect(session.getAvailableToolNames()).toEqual([]);
    session.dispose();
  });

  test('denies critical financial writes by default', async () => {
    const criticalTool: UpUpToolContract = {
      name: 'fixture_external_order',
      label: 'Fixture external order',
      description: 'A critical tool that must never run without explicit policy.',
      category: 'trading',
      safetyLevel: 'critical',
      parameters: FINANCE_FIXTURE_TOOLS[0].parameters,
      hasFinancialImpact: true,
      async execute() {
        throw new Error('must not execute');
      },
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-trade'),
      tools: ['fixture_external_order'],
    }, {
      cwd: process.cwd(),
      tools: [criticalTool],
    });
    try {
      const result = await session.executeTool('fixture_external_order', 'critical-call', { symbol: '600519.SH' }) as {
        isError?: boolean;
        details?: { policyAudit?: { decision?: string } };
      };
      expect(result.isError).toBe(true);
      expect(result.details?.policyAudit?.decision).toBe('denied');
    } finally {
      session.dispose();
    }
  });

  test('returns an auditable error when an allowlisted tool violates policy', async () => {
    const dangerousTool: UpUpToolContract = {
      name: 'fixture_market_quote',
      label: 'Fixture dangerous quote',
      description: 'A policy-blocked fixture tool.',
      category: 'trading',
      safetyLevel: 'dangerous',
      parameters: FINANCE_FIXTURE_TOOLS[0].parameters,
      hasFinancialImpact: true,
      async execute() {
        throw new Error('must not execute');
      },
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      tools: ['fixture_market_quote'],
    }, {
      cwd: process.cwd(),
      tools: [dangerousTool],
    });
    expect(session.getAvailableToolNames()).toEqual(['fixture_market_quote']);
    session.dispose();
  });

  test('audits denied, approved, and rejected tool execution without exposing input secrets', async () => {
    let executions = 0;
    const tool: UpUpToolContract = {
      name: 'fixture_approval',
      label: 'Fixture approval',
      description: 'A tool requiring approval.',
      category: 'trading',
      safetyLevel: 'dangerous',
      parameters: FINANCE_FIXTURE_TOOLS[0].parameters,
      hasFinancialImpact: true,
      async execute(_input, context) {
        executions += 1;
        return { value: 'ok', text: 'executed', details: { evidence: [], dataFreshness: 'offline', auditId: context.auditId } };
      },
    };
    const readOnlyDenied = await toPiTool(getInvestmentAgentSpec('invest-explore'), tool)
      .execute('call-policy-denied', { symbol: 'SECRET' }, new AbortController().signal, undefined, {} as never) as PolicyToolResult;
    expect(readOnlyDenied.isError).toBe(true);
    expect(readOnlyDenied.details.policyAudit.decision).toBe('denied');
    expect(JSON.stringify(readOnlyDenied.details)).not.toContain('SECRET');

    const spec = getInvestmentAgentSpec('invest-plan');
    const approvalDenied = await toPiTool(spec, tool)
      .execute('call-denied', { symbol: 'SECRET' }, new AbortController().signal, undefined, {} as never) as PolicyToolResult;
    expect(approvalDenied.isError).toBe(true);
    expect(approvalDenied.details.policyAudit.decision).toBe('approval_denied');
    expect(JSON.stringify(approvalDenied.details)).not.toContain('SECRET');

    const approved = await toPiTool(spec, tool, async (request) => {
      expect(request.auditId).toMatch(/^[0-9a-f-]{36}$/);
      expect(request.permissionProfile).toBe('investment-plan');
      return true;
    }).execute('call-approved', { symbol: 'SECRET' }, new AbortController().signal, undefined, {} as never) as PolicyToolResult;
    expect(approved.isError).not.toBe(true);
    expect(approved.details.policyAudit.decision).toBe('approval_granted');
    expect(executions).toBe(1);
  });

  test('loads the pinned Pi finance package extension through the trusted resource boundary', async () => {
    const extensionPath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      additionalExtensionPaths: [extensionPath],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    expect(session.getAvailableToolNames()).toContain('finance_evidence_quote');
    const result = await session.executeTool('finance_evidence_quote', 'package-quote-1', { symbol: '600519.SH' }) as AgentToolResultWithError;
    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({
      auditId: 'package-quote-1',
      evidence: [expect.objectContaining({
        id: 'pi-finance-quote-600519.sh',
        source: 'upup-fixture://pi-finance-sdk/quote',
        freshness: 'historical',
      })],
    });
    expect(session.getResourceTrustAudit().some((audit) => audit.path === extensionPath)).toBe(true);
    session.dispose();
  });

  test('discovers the package skill and prompt resources', async () => {
    const extensionPath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      additionalExtensionPaths: [extensionPath],
      additionalSkillPaths: [join(extensionPath, 'skills')],
      additionalPromptTemplatePaths: [join(extensionPath, 'prompts')],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    const nativeSession = session as unknown as { session: { promptTemplates: readonly { name: string }[]; resourceLoader: { getSkills(): { skills: readonly { name: string }[] } } } };
    expect(nativeSession.session.resourceLoader.getSkills().skills.map((skill) => skill.name)).toContain('finance-evidence');
    expect(nativeSession.session.promptTemplates.map((prompt) => prompt.name)).toContain('finance-report');
    session.dispose();
  });

  test('loads package-declared resources through the pinned package catalog', async () => {
    const packagePath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      piPackagePaths: [packagePath],
      piPackageTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    expect(session.getAvailableToolNames()).toContain('finance_evidence_quote');
    expect(session.getResourceTrustAudit().some((audit) => audit.packageName === '@upup/pi-finance-sdk')).toBe(true);
    expect(session.getLoadedPackageResources().map((resource) => resource.kind)).toEqual([
      'extension', 'skill', 'prompt', 'workflow', 'policy', 'eval',
    ]);
    expect(session.getLoadedPackageResources().find((resource) => resource.kind === 'policy')?.content).toContain('Live brokers remain disabled');
    expect(session.getLoadedPackageContracts().workflows[0]?.phases).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
    expect(session.getLoadedPackageContracts().policies[0]?.rules.length).toBeGreaterThan(0);
    expect(session.getLoadedPackageContracts().evals[0]?.name).toBe('finance-evidence-contract');
    expect(session.evaluatePackage('finance-evidence-contract', {
      evidence: [{ source: 'upup-fixture://quote', retrievedAt: '2026-09-13', asOf: '2026-09-12' }],
      auditId: 'audit-1',
      text: 'UPUP_TRADING_MODE=live UPUP_ALLOW_LIVE_TRADING=true',
    }).passed).toBe(true);
    expect((session as unknown as { session: { systemPrompt: string } }).session.systemPrompt).toContain('Trusted Pi workflow');
    expect((session as unknown as { session: { systemPrompt: string } }).session.systemPrompt).toContain('Trusted Pi policy');
    session.dispose();
  });
});
