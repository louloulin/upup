import { describe, expect, test } from 'bun:test';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import { FINANCE_FIXTURE_TOOLS } from '../../extensions/upup/finance-fixtures.js';
import type { UpUpAgentSession, UpUpToolContract } from './types.js';
import { toPiTool } from './agent-session-factory.js';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

type AgentToolResultWithError = Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };

type PolicyToolResult = {
  isError?: boolean;
  details: { policyAudit: { decision: string } };
};

describe('PiAgentSessionFactory', () => {
  test('creates an in-memory Pi session with the finance extension', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      tools: '*',
    }, {
      cwd: process.cwd(),
      tools: FINANCE_FIXTURE_TOOLS,
    });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.spec.id).toBe('invest-explore');
    expect(session.getAvailableToolNames()).toEqual(expect.arrayContaining([
      'fixture_market_quote',
      'fixture_fundamentals',
      'fixture_news',
      'fixture_search',
      'fixture_trading_day',
      'finance_evidence_quote',
      'finance_evidence_fundamentals',
      'finance_evidence_news',
      'finance_evidence_search',
      'finance_evidence_trading_day',
    ]));
    const events: string[] = [];
    session.subscribe((event) => events.push(event.type));
    expect(events).toContain('session_start');
    session.dispose();
  });

  test('treats AgentSpec system prompts as content even when they match a directory', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      systemPrompt: process.cwd(),
      tools: '*',
    }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
    });
    try {
      expect((session as unknown as { session: { systemPrompt: string } }).session.systemPrompt).toContain(process.cwd());
    } finally {
      session.dispose();
    }
  });

  test('keeps generated identity instructions as prompt content', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      name: process.cwd(),
      tools: '*',
    }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
    });
    try {
      const prompt = (session as unknown as { session: { systemPrompt: string } }).session.systemPrompt;
      expect(prompt).toContain(`You are the ${process.cwd()} investment agent.`);
    } finally {
      session.dispose();
    }
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
      additionalExtensionPaths: [join(extensionPath, 'extensions', 'index.ts')],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    expect(session.getAvailableToolNames()).toContain('finance_evidence_quote');
    const result = await session.executeTool('finance_evidence_quote', 'package-quote-1', { symbol: '600519.SH' }) as AgentToolResultWithError;
    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({
      auditId: 'package-quote-1',
      evidence: [expect.objectContaining({
        id: 'pi-finance-quote-600519-sh',
        source: 'upup-fixture://pi-finance-sdk/quote',
        freshness: 'historical',
      })],
    });
    expect(session.getResourceTrustAudit().some((audit) => audit.path === extensionPath)).toBe(true);
    session.dispose();
  });

  test('lets the trusted finance package register a host production tool through Pi', async () => {
    const tool: UpUpToolContract = {
      name: 'host_production_quote',
      label: 'Host production quote',
      description: 'A host-owned production finance contract registered by the Pi package.',
      category: 'market',
      safetyLevel: 'safe',
      parameters: FINANCE_FIXTURE_TOOLS[0].parameters,
      hasFinancialImpact: false,
      async execute(input, context) {
        return {
          value: input,
          text: JSON.stringify(input),
          details: {
            evidence: [{
              id: `${context.auditId}:evidence:0`,
              source: 'upup-host://production-quote',
              retrievedAt: '2026-09-13T00:00:00.000Z',
              asOf: '2026-09-12',
              query: 'host_production_quote',
              confidence: 'high',
            }],
            dataFreshness: 'historical',
            auditId: context.auditId,
          },
        };
      },
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      tools: ['host_production_quote'],
    }, {
      cwd: process.cwd(),
      tools: [tool],
    });
    try {
      expect(session.getAvailableToolNames()).toContain('host_production_quote');
      const result = await session.executeTool('host_production_quote', 'host-quote-1', { symbol: '600519.SH' }) as AgentToolResultWithError;
      expect(result.isError).not.toBe(true);
      expect(result.details).toMatchObject({
        auditId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        policyAudit: { decision: 'allowed', tool: 'host_production_quote' },
      });
    } finally {
      session.dispose();
    }
  });

  test('isolates host finance tools when multiple Pi sessions load the package concurrently', async () => {
    const createTool = (name: string): UpUpToolContract => ({
      name,
      label: name,
      description: `Concurrent host tool ${name}`,
      category: 'market',
      safetyLevel: 'safe',
      parameters: FINANCE_FIXTURE_TOOLS[0].parameters,
      hasFinancialImpact: false,
      async execute(input, context) {
        return {
          value: input,
          text: JSON.stringify(input),
          details: {
            evidence: [{
              id: `${context.auditId}:evidence:0`,
              source: `upup-host://${name}`,
              retrievedAt: '2026-09-13T00:00:00.000Z',
              asOf: '2026-09-12',
              query: name,
              confidence: 'high',
            }],
            dataFreshness: 'historical',
            auditId: context.auditId,
          },
        };
      },
    });
    const factory = new PiAgentSessionFactory();
    const [left, right] = await Promise.all([
      factory.createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['host_left'] }, { tools: [createTool('host_left')] }),
      factory.createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['host_right'] }, { tools: [createTool('host_right')] }),
    ]);
    try {
      expect(left.getAvailableToolNames()).toContain('host_left');
      expect(left.getAvailableToolNames()).not.toContain('host_right');
      expect(right.getAvailableToolNames()).toContain('host_right');
      expect(right.getAvailableToolNames()).not.toContain('host_left');
    } finally {
      left.dispose();
      right.dispose();
    }
  });

  test('discovers the package skill and prompt resources', async () => {
    const extensionPath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      additionalExtensionPaths: [join(extensionPath, 'extensions', 'index.ts')],
      additionalSkillPaths: [join(extensionPath, 'skills')],
      additionalPromptTemplatePaths: [join(extensionPath, 'prompts')],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    const nativeSession = session as unknown as { session: { promptTemplates: readonly { name: string }[]; resourceLoader: { getSkills(): { skills: readonly { name: string }[] } } } };
    expect(nativeSession.session.resourceLoader.getSkills().skills.map((skill) => skill.name)).toContain('finance-evidence');
    expect(nativeSession.session.promptTemplates.map((prompt) => prompt.name)).toContain('finance-report');
    session.dispose();
  });

  test('enforces an explicit empty AgentSpec skill allowlist', async () => {
    const extensionPath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      skills: [],
      tools: ['finance_evidence_quote'],
    }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      additionalExtensionPaths: [join(extensionPath, 'extensions', 'index.ts')],
      additionalSkillPaths: [join(extensionPath, 'skills')],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    try {
      const nativeSession = session as unknown as { session: { resourceLoader: { getSkills(): { skills: readonly { name: string }[] } } } };
      expect(nativeSession.session.resourceLoader.getSkills().skills).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  test('rejects an AgentSpec when a declared Skill is unavailable', async () => {
    await expect(new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      skills: ['missing-finance-skill'],
      packages: [],
      tools: '*',
    }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      piPackagePaths: [join(process.cwd(), 'packages/pi-finance-sdk')],
      piPackageTrust: {
        trustedPaths: [process.cwd()],
        pinnedPackages: {
          '@upup/pi-finance-sdk': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
      },
    })).rejects.toThrow('skills are not loaded');
  });

  test('loads package-declared resources through the pinned package catalog', async () => {
    const packagePath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      piPackagePaths: [packagePath],
      piPackageTrust: {
        trustedPaths: [process.cwd()],
        pinnedPackages: {
          '@upup/pi-finance-sdk': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
      },
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

  test('loads a project .pi/settings.json package into a real Pi session', async () => {
    const cwd = await mkdtemp(join(process.cwd(), '.upup', 'pi-project-package-'));
    try {
      const packageRoot = join(cwd, 'packages', 'fixture');
      await mkdir(join(cwd, '.pi'), { recursive: true });
      await mkdir(join(packageRoot, 'extensions'), { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@upup/project-fixture',
        version: '1.0.0',
        peerDependencies: { '@earendil-works/pi-coding-agent': '0.84.3' },
        pi: { source: 'internal:project', extensions: ['./extensions'], commands: ['project-fixture-command'] },
      }));
      await writeFile(join(packageRoot, 'extensions', 'index.js'), `export default function fixtureExtension(pi) {
        pi.registerCommand('project-fixture-command', { description: 'Project fixture command', handler: async () => {} });
        pi.registerTool({
          name: 'project_fixture_tool',
          label: 'Project fixture tool',
          description: 'A project-local Pi package fixture tool.',
          parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
          async execute(toolCallId, params) { return { content: [{ type: 'text', text: params.value }], details: { auditId: toolCallId } }; },
        });
      }`);
      await writeFile(join(cwd, '.pi', 'settings.json'), JSON.stringify({
        packages: [{ source: './packages/fixture', autoload: true }],
        upupPiPackages: {
          trustedPaths: ['./packages/fixture'],
          pinnedPackages: {
            '@upup/project-fixture': '1.0.0',
            '@earendil-works/pi-coding-agent': '0.84.3',
          },
          allowedSources: { '@upup/project-fixture': ['internal:project'] },
        },
      }));

      const session = await new PiAgentSessionFactory().createSession({
        ...getInvestmentAgentSpec('invest-explore'),
        skills: [],
        packages: ['@upup/project-fixture'],
        tools: ['project_fixture_tool'],
      }, { cwd, loadRegisteredTools: false });
      try {
        expect(session.getAvailableToolNames()).toContain('project_fixture_tool');
        const result = await session.executeTool('project_fixture_tool', 'project-call-1', { value: 'loaded-from-project-settings' });
        expect(result.content).toEqual([{ type: 'text', text: 'loaded-from-project-settings' }]);
        expect(result.details).toMatchObject({ auditId: 'project-call-1' });
        expect(session.getResourceTrustAudit().some((audit) => audit.packageName === '@upup/project-fixture' && audit.packageSource === 'internal:project')).toBe(true);
      } finally {
        session.dispose();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('rejects a Pi package when its declared command is not registered', async () => {
    const cwd = await mkdtemp(join(process.cwd(), '.upup', 'pi-project-package-invalid-'));
    try {
      const packageRoot = join(cwd, 'packages', 'fixture');
      await mkdir(join(cwd, '.pi'), { recursive: true });
      await mkdir(join(packageRoot, 'extensions'), { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@upup/project-invalid-fixture',
        version: '1.0.0',
        peerDependencies: { '@earendil-works/pi-coding-agent': '0.84.3' },
        pi: { source: 'internal:project', extensions: ['./extensions'], commands: ['missing-command'] },
      }));
      await writeFile(join(packageRoot, 'extensions', 'index.js'), 'export default function fixtureExtension() {}');
      await writeFile(join(cwd, '.pi', 'settings.json'), JSON.stringify({
        packages: [{ source: './packages/fixture', autoload: true }],
        upupPiPackages: {
          trustedPaths: ['./packages/fixture'],
          pinnedPackages: {
            '@upup/project-invalid-fixture': '1.0.0',
            '@earendil-works/pi-coding-agent': '0.84.3',
          },
          allowedSources: { '@upup/project-invalid-fixture': ['internal:project'] },
        },
      }));
      await expect(new PiAgentSessionFactory().createSession({
        ...getInvestmentAgentSpec('invest-explore'),
        packages: ['@upup/project-invalid-fixture'],
        skills: [],
        tools: '*',
      }, { cwd, loadRegisteredTools: false })).rejects.toThrow('commands were not registered');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('does not load the finance fallback when an Agent explicitly excludes all Packages', async () => {
    const packagePath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      packages: [],
      skills: [],
      tools: ['finance_evidence_quote'],
    }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      piPackagePaths: [packagePath],
      piPackageTrust: {
        trustedPaths: [process.cwd()],
        pinnedPackages: {
          '@upup/pi-finance-sdk': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
      },
    });
    expect(session.getAvailableToolNames()).not.toContain('finance_evidence_quote');
    session.dispose();
  });

  test('rejects a non-empty Package allowlist when no Packages are configured', async () => {
    await expect(new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      packages: ['@upup/pi-finance-sdk'],
      tools: '*',
    }, {
      cwd: process.cwd(),
      loadRegisteredTools: false,
      piPackagePaths: [],
    })).rejects.toThrow('Pi AgentSpec declares Packages but none are configured');
  });
});
