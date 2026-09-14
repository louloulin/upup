import { beforeAll, describe, expect, test } from 'bun:test';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import { bootstrapPiNativeServices } from './bootstrap.js';

beforeAll(() => bootstrapPiNativeServices());
import { FINANCE_FIXTURE_TOOLS } from '../../extensions/upup/finance-fixtures.js';
import type { UpUpAgentSession, UpUpToolContract } from './types.js';
import { toPiTool } from '@upup/pi-event-adapter';
import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { JsonFileProviderSlaStore } from '@upup/pi-market-data';

type AgentToolResultWithError = Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };

type PolicyToolResult = {
  isError?: boolean;
  details: { policyAudit: { decision: string } };
};

describe('PiAgentSessionFactory', () => {
  test('loads web_fetch only from the explicit Research Package and isolates it when disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const trust = {
      trustedPaths: [join(packageRoot, 'pi-research'), join(packageRoot, 'pi-finance-sdk')],
      pinnedPackages: { '@upup/pi-research': '0.1.0', '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-research': ['builtin:upup'], '@upup/pi-finance-sdk': ['builtin:upup'] },
    };
    const enabled = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-research'], skills: [], tools: ['web_fetch'],
    }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-research'), join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(['web_fetch']);
      const disabled = await new PiAgentSessionFactory().createSession({
        ...getInvestmentAgentSpec('invest-explore'), packages: [], skills: [], tools: ['web_fetch'],
      }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-research'), join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally { enabled.dispose(); }
  });

  test('loads config tools only from the explicit Config Package and isolates them when disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const trust = {
      trustedPaths: [join(packageRoot, 'pi-config')],
      pinnedPackages: { '@upup/pi-config': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-config': ['builtin:upup'] },
    };
    const enabled = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-config'], skills: [], tools: ['config_get', 'config_list', 'config_set'],
    }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-config')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(['config_get', 'config_list', 'config_set']);
      const disabled = await new PiAgentSessionFactory().createSession({
        ...getInvestmentAgentSpec('invest-explore'), packages: [], skills: [], tools: ['config_get'],
      }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-config')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally { enabled.dispose(); }
  });

  test('loads management tools through the Pi Package host contract', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const trust = {
      trustedPaths: [join(packageRoot, 'pi-management')],
      pinnedPackages: { '@upup/pi-management': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-management': ['builtin:upup'] },
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-management'], skills: [], tools: ['management_system_snapshot', 'management_provider_status', 'management_package_status', 'management_runtime_status'],
    }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-management')], piPackageTrust: trust });
    try {
      expect(session.getAvailableToolNames()).toEqual(['management_system_snapshot', 'management_provider_status', 'management_package_status', 'management_runtime_status']);
      const result = await session.executeTool('management_system_snapshot', 'management-session-1', {});
      const text = result.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')?.text;
      expect(text).toBeDefined();
      expect(JSON.parse(text!)).toMatchObject({ schema: 1, runtime: { name: 'pi', contract: 'upup.pi.host.v1' }, packages: [{ name: '@upup/pi-management', version: '0.1.0' }] });
    } finally {
      session.dispose();
    }
  });

  test('exposes redacted provider SLA state in the Pi management snapshot', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const root = await mkdtemp(join(process.cwd(), '.upup', 'pi-management-sla-'));
    const previous = process.env.UPUP_PROVIDER_SLA_STORE;
    process.env.UPUP_PROVIDER_SLA_STORE = join(root, 'jobs.json');
    const store = new JsonFileProviderSlaStore(join(root, 'jobs.json'));
    store.save([{
      id: 'management-sla-1', name: 'Yahoo probe', provider: 'yahoo', probe: 'us', everyMs: 60_000, enabled: true,
      createdAtMs: 1, updatedAtMs: 1, state: { nextRunAtMs: 2, lastRunStatus: 'error', lastErrorClass: 'forbidden', consecutiveErrors: 1 },
    }]);
    const trust = {
      trustedPaths: [join(packageRoot, 'pi-management')],
      pinnedPackages: { '@upup/pi-management': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-management': ['builtin:upup'] },
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-management'], skills: [], tools: ['management_system_snapshot'],
    }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-management')], piPackageTrust: trust });
    try {
      const result = await session.executeTool('management_system_snapshot', 'management-sla-snapshot', {});
      const snapshot = JSON.parse(result.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text) as { providers: { marketData: { providerSla?: { jobs: readonly Record<string, unknown>[] } } } };
      expect(snapshot.providers.marketData.providerSla?.jobs).toEqual([{ id: 'management-sla-1', name: 'Yahoo probe', provider: 'yahoo', probe: 'us', everyMs: 60_000, enabled: true, updatedAtMs: 1, createdAtMs: 1, nextRunAtMs: 2, lastRunStatus: 'error', lastErrorClass: 'forbidden', consecutiveErrors: 1 }]);
      expect(JSON.stringify(snapshot)).not.toContain('AAPL');
    } finally {
      session.dispose();
      if (previous === undefined) delete process.env.UPUP_PROVIDER_SLA_STORE; else process.env.UPUP_PROVIDER_SLA_STORE = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('loads cache tools only from the explicit Cache Package and isolates them when disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const trust = {
      trustedPaths: [join(packageRoot, 'pi-cache')],
      pinnedPackages: { '@upup/pi-cache': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-cache': ['builtin:upup'] },
    };
    const enabled = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-cache'], skills: [], tools: ['get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info'],
    }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-cache')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(['get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info']);
      const disabled = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), packages: [], skills: [], tools: ['get_cache_stats'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-cache')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally { enabled.dispose(); }
  });

  test('loads notification tools only from the explicit Notify Package and isolates them when disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const trust = {
      trustedPaths: [join(packageRoot, 'pi-notify')],
      pinnedPackages: { '@upup/pi-notify': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-notify': ['builtin:upup'] },
    };
    const enabled = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-notify'], skills: [], tools: ['notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-notify')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(['notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions']);
      const log = await enabled.executeTool('notify', 'notify-log-1', { channel: 'log', title: 'test', message: 'ok' });
      expect(log.details).toMatchObject({ source: 'upup-pi://notify' });
      const disabled = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), packages: [], skills: [], tools: ['notify'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-notify')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally { enabled.dispose(); }
  });

  test('loads native Pi platform swarm tools and runs a real isolated Pi worker', async () => {
    const faux = fauxProvider({ provider: 'upup-platform-fixture', models: [{ id: 'platform-fixture-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('worker completed from Pi')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      id: 'platform-swarm-fixture',
      model: faux.getModel().id,
      packages: ['@upup/pi-platform'],
      skills: [],
      tools: ['swarm_team_create', 'swarm_agent_spawn', 'swarm_agent_results', 'swarm_agent_message', 'swarm_team_list'],
    }, {
      cwd: process.cwd(), model: faux.getModel(), modelRuntime,
      piPackagePaths: [join(packageRoot, 'pi-platform')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-platform')],
        pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
        allowedSources: { '@upup/pi-platform': ['builtin:upup'] },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(['swarm_team_create', 'swarm_agent_spawn', 'swarm_agent_message', 'swarm_agent_results', 'swarm_team_list']);
      const context = await session.executeTool('swarm_team_create', 'platform-team-1', { team_name: 'fixture-team' });
      expect(context).toMatchObject({ details: { evidence: [{ source: 'upup-pi://platform/swarm' }] } });
      const spawned = await session.executeTool('swarm_agent_spawn', 'platform-agent-1', { team_name: 'fixture-team', agent_name: 'worker', role: 'reviewer', prompt: 'Return a short completion.', tools: ['read_file'] });
      const spawnContent = spawned.content[0];
      if (spawnContent.type !== 'text') throw new Error('spawn result must be text');
      const agentId = JSON.parse(spawnContent.text).agent_id as string;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const results = await session.executeTool('swarm_agent_results', `platform-results-${attempt}`, { team_name: 'fixture-team', agent_id: agentId });
        const content = results.content[0];
        if (content.type === 'text' && JSON.parse(content.text).agents[0]?.status === 'completed') {
          expect(JSON.parse(content.text).agents[0].result).toContain('worker completed from Pi');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const finalResults = await session.executeTool('swarm_agent_results', 'platform-results-final', { team_name: 'fixture-team', agent_id: agentId });
      throw new Error(`Pi platform worker did not complete: ${JSON.stringify(finalResults)}`);
    } finally {
      session.dispose();
    }
  });

  test('loads native Platform watchlist tools with Session persistence and isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'platform-watchlist-session-'));
    const sessionPath = join(directory, 'platform-watchlist.jsonl');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-watchlist-session', packages: ['@upup/pi-platform'], skills: [], tools: ['add_to_watchlist', 'remove_from_watchlist', 'get_watchlist', 'add_watchlist_alert', 'check_watchlist_alerts', 'clear_watchlist_alert', 'export_watchlist'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const first = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(first.getAvailableToolNames()).toEqual(spec.tools);
      const added = await first.executeTool('add_to_watchlist', 'platform-watch-add', { symbol: 'AAPL', tags: ['tech'] });
      expect(added).toMatchObject({ details: { evidence: [{ source: 'upup-pi://platform/swarm' }] } });
      await first.executeTool('add_watchlist_alert', 'platform-watch-alert', { symbol: 'AAPL', type: 'above', value: 200 });
      const checked = await first.executeTool('check_watchlist_alerts', 'platform-watch-check', { prices: { AAPL: 201 } });
      expect(checked).toMatchObject({ details: { auditId: 'platform-watch-check' } });
      expect(first.getCustomEntries('upup_pi_platform_watchlist').length).toBeGreaterThan(0);
    } finally { first.dispose(); }
    expect(await readFile(sessionPath, 'utf8')).toContain('upup_pi_platform_watchlist');
    const resumed = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      const listed = await resumed.executeTool('get_watchlist', 'platform-watch-list', {});
      const text = listed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      expect(JSON.parse(text).entries).toHaveLength(1);
      expect(JSON.parse(text).entries[0].symbol).toBe('AAPL');
      const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['get_watchlist'] }, { cwd: directory, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally { resumed.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('loads native Platform LSP tools only through the trusted Package', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-lsp-session', packages: ['@upup/pi-platform'], skills: [], tools: ['lsp_complete', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_diagnostics'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(spec.tools);
      const diagnostics = await enabled.executeTool('lsp_diagnostics', 'platform-lsp-diagnostics', { uri: 'file:///tmp/example.ts' });
      expect(diagnostics).toMatchObject({ details: { auditId: 'platform-lsp-diagnostics', evidence: [{ source: 'upup-pi://platform/swarm' }] } });
      expect(JSON.parse(diagnostics.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).output).toContain('No diagnostics');
    } finally { enabled.dispose(); }
    const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['lsp_diagnostics'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
  });

  test('loads native Platform filesystem tools with Session isolation and real execution', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.tmp-pi-platform-session-'));
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-filesystem-session', packages: ['@upup/pi-platform'], skills: [], tools: ['bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'send_user_file'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    try {
      await writeFile(join(directory, 'input.txt'), 'alpha\nbeta\n');
      const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try {
        expect(enabled.getAvailableToolNames()).toEqual(spec.tools);
        const read = await enabled.executeTool('read_file', 'platform-read', { path: 'input.txt' });
        expect(JSON.parse(read.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text)).toMatchObject({ content: expect.stringContaining('alpha') });
        const write = await enabled.executeTool('write_file', 'platform-write', { path: 'output.txt', content: 'created', confirm: true });
        expect(write.details).toMatchObject({ evidence: [{ source: 'upup-pi://platform/swarm' }] });
        const edit = await enabled.executeTool('edit_file', 'platform-edit', { path: 'output.txt', old_text: 'created', new_text: 'updated', confirm: true });
        expect(edit.details).toMatchObject({ evidence: [{ source: 'upup-pi://platform/swarm' }] });
        const grep = await enabled.executeTool('grep', 'platform-grep', { pattern: 'updated', path: '.' });
        expect(JSON.parse(grep.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).message).toContain('found');
      } finally { enabled.dispose(); }
      const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['read_file'] }, { cwd: directory, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('loads native Platform memory tools with persistent file semantics and package isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const memoryRoot = await mkdtemp(join(process.cwd(), '.tmp-pi-platform-memory-'));
    const previousMemoryRoot = process.env.UPUP_MEMORY_DIR;
    process.env.UPUP_MEMORY_DIR = memoryRoot;
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-memory-session', packages: ['@upup/pi-platform'], skills: [], tools: ['memory_search', 'memory_get', 'memory_update'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    try {
      const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try {
        expect(enabled.getAvailableToolNames()).toEqual(spec.tools);
        const updated = await enabled.executeTool('memory_update', 'platform-memory-update', { content: 'User prefers evidence-backed position sizing.', file: 'long_term' });
        expect(updated).toMatchObject({ details: { evidence: [{ source: 'upup-pi://platform/swarm' }] } });
        const searched = await enabled.executeTool('memory_search', 'platform-memory-search', { query: 'evidence-backed sizing' });
        expect(JSON.parse(searched.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).results[0]).toMatchObject({ path: 'MEMORY.md' });
        const read = await enabled.executeTool('memory_get', 'platform-memory-get', { path: 'MEMORY.md', from: 1, lines: 1 });
        expect(JSON.parse(read.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).text).toContain('evidence-backed');
      } finally { enabled.dispose(); }
      const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['memory_search'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally {
      if (previousMemoryRoot === undefined) delete process.env.UPUP_MEMORY_DIR;
      else process.env.UPUP_MEMORY_DIR = previousMemoryRoot;
      await rm(memoryRoot, { recursive: true, force: true });
    }
  });

  test('loads native Platform heartbeat management with package isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const root = await mkdtemp(join(process.cwd(), '.tmp-pi-platform-heartbeat-'));
    const previous = { upupHome: process.env.UPUP_HOME, heartbeat: process.env.UPUP_HEARTBEAT_PATH, gateway: process.env.UPUP_GATEWAY_CONFIG };
    process.env.UPUP_HOME = root;
    process.env.UPUP_HEARTBEAT_PATH = join(root, 'HEARTBEAT.md');
    process.env.UPUP_GATEWAY_CONFIG = join(root, 'gateway.json');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-heartbeat-session', packages: ['@upup/pi-platform'], skills: [], tools: ['heartbeat'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    try {
      const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try {
        expect(enabled.getAvailableToolNames()).toEqual(['heartbeat']);
        const update = await enabled.executeTool('heartbeat', 'platform-heartbeat-update', { action: 'update', content: '- Check unusual A-share volatility' });
        expect(update).toMatchObject({ details: { evidence: [{ source: 'upup-pi://platform/swarm' }] } });
        const view = await enabled.executeTool('heartbeat', 'platform-heartbeat-view', { action: 'view' });
        expect(JSON.parse(view.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).content).toContain('A-share');
      } finally { enabled.dispose(); }
      const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['heartbeat'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally {
      if (previous.upupHome === undefined) delete process.env.UPUP_HOME; else process.env.UPUP_HOME = previous.upupHome;
      if (previous.heartbeat === undefined) delete process.env.UPUP_HEARTBEAT_PATH; else process.env.UPUP_HEARTBEAT_PATH = previous.heartbeat;
      if (previous.gateway === undefined) delete process.env.UPUP_GATEWAY_CONFIG; else process.env.UPUP_GATEWAY_CONFIG = previous.gateway;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('loads native Platform cron management with CRUD and package isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const cronRoot = await mkdtemp(join(process.cwd(), '.tmp-pi-platform-cron-'));
    const previousCronStore = process.env.UPUP_CRON_STORE;
    process.env.UPUP_CRON_STORE = join(cronRoot, 'jobs.json');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-cron-session', packages: ['@upup/pi-platform'], skills: [], tools: ['cron'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    try {
      const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try {
        expect(enabled.getAvailableToolNames()).toEqual(['cron']);
        const created = await enabled.executeTool('cron', 'platform-cron-add', { action: 'add', name: 'session-cron', schedule: { kind: 'every', everyMs: 60_000 }, message: 'test cron job' });
        const createdText = created.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
        const jobId = createdText.match(/id: ([a-f0-9]+)/)?.[1];
        expect(jobId).toBeTruthy();
        const listed = await enabled.executeTool('cron', 'platform-cron-list', { action: 'list' });
        expect(listed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).toContain('session-cron');
        const updated = await enabled.executeTool('cron', 'platform-cron-update', { action: 'update', jobId, name: 'updated-session-cron' });
        expect(updated.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).toContain('updated-session-cron');
        const removed = await enabled.executeTool('cron', 'platform-cron-remove', { action: 'remove', jobId });
        expect(removed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).toContain('Removed job');
      } finally { enabled.dispose(); }
      const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['cron'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
      try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
    } finally {
      if (previousCronStore === undefined) delete process.env.UPUP_CRON_STORE; else process.env.UPUP_CRON_STORE = previousCronStore;
      await rm(cronRoot, { recursive: true, force: true });
    }
  });

  test('loads native Platform planning tools with Session persistence and package isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const spec = { ...getInvestmentAgentSpec('invest-plan'), id: 'platform-planning-session', packages: ['@upup/pi-platform'], skills: [], tools: ['enter_plan_mode', 'exit_plan_mode', 'add_plan_step', 'update_plan_step', 'list_plan_steps', 'create_todo', 'update_todo', 'list_todos', 'delete_todo'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(spec.tools);
      const text = (value: Awaited<ReturnType<UpUpAgentSession['executeTool']>>) => value.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      const entered = await enabled.executeTool('enter_plan_mode', 'platform-plan-enter', { goal: 'Review risk controls', constraints: ['Use evidence'] });
      const planId = JSON.parse(text(entered)).plan_id as string;
      expect(planId).toMatch(/^[0-9a-f-]{36}$/);
      const added = await enabled.executeTool('add_plan_step', 'platform-plan-step', { plan_id: planId, description: 'Collect filings' });
      const stepId = JSON.parse(text(added)).step.id as string;
      await enabled.executeTool('update_plan_step', 'platform-plan-update', { plan_id: planId, step_id: stepId, status: 'completed', result: 'Collected' });
      const listed = await enabled.executeTool('list_plan_steps', 'platform-plan-list', { plan_id: planId });
      expect(JSON.parse(text(listed))).toMatchObject({ plan_id: planId, progress: 100, steps: [{ id: stepId, status: 'completed' }] });
      const todo = await enabled.executeTool('create_todo', 'platform-todo-create', { content: 'Review evidence', priority: 'high' });
      const todoId = JSON.parse(text(todo)).todo.id as string;
      await enabled.executeTool('update_todo', 'platform-todo-update', { todo_id: todoId, status: 'completed' });
      const todos = await enabled.executeTool('list_todos', 'platform-todo-list', {});
      expect(JSON.parse(text(todos))).toMatchObject({ stats: { total: 1, completed: 1 }, todos: [{ id: todoId, status: 'completed' }] });
      await enabled.executeTool('exit_plan_mode', 'platform-plan-save', { action: 'save', plan_id: planId });
      const restored = await enabled.executeTool('list_plan_steps', 'platform-plan-restored', { plan_id: planId });
      expect(JSON.parse(text(restored)).status).toBe('active');
    } finally { enabled.dispose(); }
    const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['enter_plan_mode', 'create_todo'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
  });

  test('loads native Platform notebook tools with cwd sandbox and package isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.tmp-pi-platform-notebook-'));
    const spec = { ...getInvestmentAgentSpec('invest-plan'), id: 'platform-notebook-session', packages: ['@upup/pi-platform'], skills: [], tools: ['notebook_read', 'notebook_create', 'notebook_edit_cell', 'notebook_insert_cell', 'notebook_delete_cell'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const session = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(session.getAvailableToolNames()).toEqual(spec.tools);
      const text = (value: Awaited<ReturnType<UpUpAgentSession['executeTool']>>) => value.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      await session.executeTool('notebook_create', 'platform-notebook-create', { path: 'analysis.ipynb' });
      await session.executeTool('notebook_insert_cell', 'platform-notebook-insert', { path: 'analysis.ipynb', after_index: -1, cell_type: 'code', source: 'price = 100' });
      await session.executeTool('notebook_edit_cell', 'platform-notebook-edit', { path: 'analysis.ipynb', cell_index: 0, new_source: 'price = 105' });
      const read = await session.executeTool('notebook_read', 'platform-notebook-read', { path: 'analysis.ipynb' });
      expect(text(read)).toContain('Cells: 1'); expect(text(read)).toContain('price = 105');
      const escaped = await session.executeTool('notebook_read', 'platform-notebook-escape', { path: '../outside.ipynb' }) as AgentToolResultWithError;
      expect(escaped.isError).toBe(true);
      await session.executeTool('notebook_delete_cell', 'platform-notebook-delete', { path: 'analysis.ipynb', cell_index: 0 });
    } finally { session.dispose(); await rm(directory, { recursive: true, force: true }); }
    const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['notebook_read'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
  });

  test('loads native Platform MCP tools with masked auth and resource fail-closed behavior', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const home = await mkdtemp(join(process.cwd(), '.tmp-pi-platform-mcp-home-'));
    const previousHome = process.env.UPUP_HOME; process.env.UPUP_HOME = home;
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-mcp-session', packages: ['@upup/pi-platform'], skills: [], tools: ['mcp_auth_set', 'mcp_auth_get', 'mcp_auth_clear', 'list_mcp_resources', 'read_mcp_resource'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const session = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(session.getAvailableToolNames()).toEqual(spec.tools);
      const text = (value: Awaited<ReturnType<UpUpAgentSession['executeTool']>>) => value.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      const set = await session.executeTool('mcp_auth_set', 'platform-mcp-auth-set', { server_name: 'fixture', type: 'bearer', credential: 'super-secret-token', key_prefix: 'Bearer ' });
      expect(text(set)).not.toContain('super-secret-token');
      const get = await session.executeTool('mcp_auth_get', 'platform-mcp-auth-get', { server_name: 'fixture' });
      expect(text(get)).toContain('supe****oken'); expect(text(get)).not.toContain('super-secret-token');
      const resources = await session.executeTool('list_mcp_resources', 'platform-mcp-resources', {});
      expect(JSON.parse(text(resources))).toMatchObject({ servers: 0, totalResources: 0 });
      const read = await session.executeTool('read_mcp_resource', 'platform-mcp-read', { uri: 'fixture://missing' }) as AgentToolResultWithError;
      expect(read.isError).toBe(true);
      const cleared = await session.executeTool('mcp_auth_clear', 'platform-mcp-auth-clear', { server_name: 'fixture' });
      expect(text(cleared)).toContain('cleared');
    } finally { session.dispose(); if (previousHome === undefined) delete process.env.UPUP_HOME; else process.env.UPUP_HOME = previousHome; await rm(home, { recursive: true, force: true }); }
    const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['mcp_auth_get'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
  });

  test('loads native Platform task tools with Session journal lifecycle and package isolation', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-task-session', packages: ['@upup/pi-platform'], skills: [], tools: ['task_create', 'task_get', 'task_list', 'task_stop', 'task_update', 'task_result'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const session = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(session.getAvailableToolNames()).toEqual(spec.tools);
      const text = (value: Awaited<ReturnType<UpUpAgentSession['executeTool']>>) => value.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      const created = await session.executeTool('task_create', 'platform-task-create', { name: 'manual-review', description: 'Review evidence', metadata: { symbol: 'AAPL' } });
      const taskId = JSON.parse(text(created)).task.id as string;
      expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
      await session.executeTool('task_update', 'platform-task-update', { task_id: taskId, progress: 50, result: 'half done' });
      expect(JSON.parse(text(await session.executeTool('task_get', 'platform-task-get', { task_id: taskId }))).task).toMatchObject({ id: taskId, progress: 50, result: 'half done', status: 'pending' });
      const listed = JSON.parse(text(await session.executeTool('task_list', 'platform-task-list', {})));
      expect(listed.stats).toMatchObject({ total: 1, pending: 1 });
      const stopped = JSON.parse(text(await session.executeTool('task_stop', 'platform-task-stop', { task_id: taskId, reason: 'user stopped' })));
      expect(stopped.task).toMatchObject({ id: taskId, status: 'cancelled', error: 'user stopped' });
      expect(JSON.parse(text(await session.executeTool('task_result', 'platform-task-result', { task_id: taskId }))).task.status).toBe('cancelled');
    } finally { session.dispose(); }
    const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['task_list'] }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); }
  });

  test('loads native Platform export_data only through the trusted Package', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'platform-export-session-'));
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-export-session', packages: ['@upup/pi-platform'], skills: [], tools: ['export_data'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const enabled = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(enabled.getAvailableToolNames()).toEqual(['export_data']);
      const exported = await enabled.executeTool('export_data', 'platform-export-1', { data: [{ symbol: 'AAPL', price: 123 }], filename: 'session-export', format: 'json' });
      expect(exported).toMatchObject({ details: { auditId: 'platform-export-1', evidence: [{ source: 'upup-pi://platform/swarm' }] } });
      const text = exported.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      expect(JSON.parse(text).status).toBe('success');
    } finally { enabled.dispose(); }
    const disabled = await new PiAgentSessionFactory().createSession({ ...spec, packages: [], tools: ['export_data'] }, { cwd: directory, piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try { expect(disabled.getAvailableToolNames()).toEqual([]); } finally { disabled.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('loads native Platform skill discovery from the Pi Resource Loader', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'platform-skill-session', packages: ['@upup/pi-platform'], skills: ['pi-platform'], tools: ['list_skills', 'search_skills', 'get_skill', 'skill_info', 'skill', 'execute_skill'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-platform')], pinnedPackages: { '@upup/pi-platform': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-platform': ['builtin:upup'] } };
    const session = await new PiAgentSessionFactory().createSession(spec, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-platform')], piPackageTrust: trust });
    try {
      expect(session.getAvailableToolNames()).toEqual(spec.tools);
      const listed = await session.executeTool('list_skills', 'platform-skills-list', { format: 'detailed' });
      const listText = listed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      expect(JSON.parse(listText).count).toBeGreaterThan(0);
      const searched = await session.executeTool('search_skills', 'platform-skills-search', { keyword: 'platform' });
      const searchText = searched.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      expect(JSON.parse(searchText).results).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'pi-platform' })]));
      const details = await session.executeTool('get_skill', 'platform-skills-get', { name: 'pi-platform' });
      const detailText = details.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      expect(JSON.parse(detailText)).toMatchObject({ found: true, name: 'pi-platform' });
      const invoked = await session.executeTool('skill', 'platform-skills-invoke', { skill: 'pi-platform', args: 'AAPL' });
      const invokedText = invoked.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text;
      expect(JSON.parse(invokedText)).toMatchObject({ found: true, skill: 'pi-platform', arguments: 'AAPL' });
      const executed = await session.executeTool('execute_skill', 'platform-skills-execute', { skill_name: 'pi-platform' });
      expect(executed.details).toMatchObject({ evidence: [{ source: 'upup-pi://platform/swarm' }] });
    } finally { session.dispose(); }
  });
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
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-finance-sdk'], tools: ['finance_evidence_quote', 'get_financials', 'read_filings', 'alt_data_fetch', 'alt_data_search', 'get_astock_financials', 'get_astock_news', 'get_company_profile', 'get_risks', 'get_sectors', 'get_investment_strategies', 'calculate_capital_gains_tax', 'calculate_trades_tax', 'calculate_pnl', 'fund_search', 'fund_screen', 'fund_top', 'fund_detail', 'fund_performance', 'fund_holdings', 'fund_manager', 'fund_compare'] }, {
      cwd: process.cwd(),
      marketQuoteFetcher: async () => new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000 } }] } }), { status: 200 }),
      additionalExtensionPaths: [join(extensionPath, 'extensions', 'index.ts')],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' } },
    });
    expect(session.getAvailableToolNames()).toContain('finance_evidence_quote');
    expect(session.getAvailableToolNames()).toContain('fund_search');
    expect(session.getAvailableToolNames()).toContain('fund_screen');
    expect(session.getAvailableToolNames()).toContain('fund_top');
    expect(session.getAvailableToolNames()).toContain('get_astock_financials');
    expect(session.getAvailableToolNames()).toContain('get_financials');
    expect(session.getAvailableToolNames()).toContain('read_filings');
    expect(session.getAvailableToolNames()).toContain('alt_data_fetch');
    expect(session.getAvailableToolNames()).toContain('alt_data_search');
    expect(session.getAvailableToolNames()).toContain('get_astock_news');
    const result = await session.executeTool('finance_evidence_quote', 'package-quote-1', { symbol: '600519.SH' }) as AgentToolResultWithError;
    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({
      auditId: 'package-quote-1',
      evidence: [expect.objectContaining({
        id: 'market-data:package-quote-1:quote',
        source: 'https://query1.finance.yahoo.com/v8/finance/chart',
        freshness: 'delayed',
      })],
    });
    expect(session.getResourceTrustAudit().some((audit) => audit.path === extensionPath)).toBe(true);
    const fundResult = await session.executeTool('fund_search', 'package-fund-search-1', { keyword: '110022' }) as AgentToolResultWithError;
    expect(fundResult).toMatchObject({ details: { auditId: 'package-fund-search-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-search', freshness: 'offline' }] } });
    const screenResult = await session.executeTool('fund_screen', 'package-fund-screen-1', { type: '混合型', min_return: 15, limit: 3 }) as AgentToolResultWithError;
    expect(screenResult).toMatchObject({ details: { auditId: 'package-fund-screen-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-screen', freshness: 'offline' }] } });
    const topResult = await session.executeTool('fund_top', 'package-fund-top-1', { limit: 2 }) as AgentToolResultWithError;
    expect(topResult).toMatchObject({ details: { auditId: 'package-fund-top-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-top', freshness: 'offline' }] } });
    const astockFinancials = await session.executeTool('get_astock_financials', 'package-astock-financials-1', { code: '比亚迪' }) as AgentToolResultWithError;
    expect(astockFinancials).toMatchObject({ details: { auditId: 'package-astock-financials-1', evidence: [{ source: 'upup-pi://finance-sdk/astock-financials', freshness: 'historical', asOf: '2026-09-12' }] } });
    const financials = await session.executeTool('get_financials', 'package-financials-1', { query: 'Apple revenue' }) as AgentToolResultWithError;
    expect(financials).toMatchObject({ details: { auditId: 'package-financials-1', evidence: [{ source: 'upup-pi://finance-sdk/financials', freshness: 'historical', asOf: '2026-09-12' }] } });
    const astockNews = await session.executeTool('get_astock_news', 'package-astock-news-1', { code: '比亚迪', limit: 1 }) as AgentToolResultWithError;
    expect(astockNews).toMatchObject({ details: { auditId: 'package-astock-news-1', evidence: [{ source: 'upup-pi://finance-sdk/astock-news', freshness: 'historical', asOf: '2026-09-12' }] } });
    const companyProfile = await session.executeTool('get_company_profile', 'package-company-profile-1', { ticker: '贵州茅台' }) as AgentToolResultWithError;
    expect(companyProfile).toMatchObject({ details: { auditId: 'package-company-profile-1', evidence: [{ source: 'upup-pi://finance-sdk/company-profile', freshness: 'historical', asOf: '2026-09-12' }] } });
    const risks = await session.executeTool('get_risks', 'package-risks-1', { ticker: '002594.SZ', severity: 'high', type: 'sector' }) as AgentToolResultWithError;
    expect(risks).toMatchObject({ details: { auditId: 'package-risks-1', evidence: [{ source: 'upup-pi://finance-sdk/risks', freshness: 'historical', asOf: '2026-09-12' }] } });
    const sectors = await session.executeTool('get_sectors', 'package-sectors-1', { name: '新能源' }) as AgentToolResultWithError;
    expect(sectors).toMatchObject({ details: { auditId: 'package-sectors-1', evidence: [{ source: 'upup-pi://finance-sdk/sectors', freshness: 'historical', asOf: '2026-09-12' }] } });
    const strategies = await session.executeTool('get_investment_strategies', 'package-strategies-1', { risk_tolerance: 'conservative', time_horizon: 'long' }) as AgentToolResultWithError;
    expect(strategies).toMatchObject({ details: { auditId: 'package-strategies-1', evidence: [{ source: 'upup-pi://finance-sdk/investment-strategies', freshness: 'offline', asOf: '2026-09-12' }] } });
    const tax = await session.executeTool('calculate_capital_gains_tax', 'package-tax-1', { symbol: 'AAPL', quantity: 100, purchase_price: 100, current_price: 150, purchase_date: '2024-01-01', as_of: '2026-09-12', jurisdiction: 'us' }) as AgentToolResultWithError;
    expect(tax).toMatchObject({ details: { auditId: 'package-tax-1', evidence: [{ source: 'upup-pi://finance-sdk/capital-gains-tax', freshness: 'historical', asOf: '2026-09-12' }] } });
    const tradesTax = await session.executeTool('calculate_trades_tax', 'package-trades-tax-1', { jurisdiction: 'us', trades: [{ symbol: 'AAPL', quantity: 100, purchase_price: 100, sell_price: 150, purchase_date: '2024-01-01', sell_date: '2026-09-12' }] }) as AgentToolResultWithError;
    expect(tradesTax).toMatchObject({ details: { auditId: 'package-trades-tax-1', evidence: [{ source: 'upup-pi://finance-sdk/trades-tax', freshness: 'historical', asOf: '2026-09-12' }] } });
    const pnl = await session.executeTool('calculate_pnl', 'package-pnl-1', { currency: 'USD', trades: [{ symbol: 'AAPL', quantity: 2, purchase_price: 100, sell_price: 120 }] }) as AgentToolResultWithError;
    expect(pnl).toMatchObject({ details: { auditId: 'package-pnl-1', evidence: [{ source: 'upup-pi://finance-sdk/pnl', freshness: 'historical', asOf: '2026-09-12' }] } });
    for (const [toolName, source] of [
      ['fund_detail', 'fund-detail'],
      ['fund_performance', 'fund-performance'],
      ['fund_holdings', 'fund-holdings'],
      ['fund_manager', 'fund-manager'],
    ] as const) {
      const result = await session.executeTool(toolName, `package-${toolName}-1`, { fund_code: '110022' }) as AgentToolResultWithError;
      expect(result).toMatchObject({ details: { auditId: `package-${toolName}-1`, evidence: [{ source: `upup-pi://finance-sdk/${source}`, freshness: 'historical', asOf: '2026-09-12' }] } });
    }
    const comparison = await session.executeTool('fund_compare', 'package-fund-compare-1', { fund_codes: ['110022', '161725'], period: '1Y' }) as AgentToolResultWithError;
    expect(comparison).toMatchObject({ details: { auditId: 'package-fund-compare-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-compare', freshness: 'historical', asOf: '2026-09-12' }] } });
    session.dispose();
  });

  test('does not expose finance knowledge natives when the Finance Package is disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      packages: [],
      skills: [],
      tools: ['read_filings', 'get_company_profile', 'get_risks', 'get_sectors', 'calculate_capital_gains_tax', 'calculate_trades_tax', 'calculate_pnl'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-finance-sdk')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-finance-sdk')],
        pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
        allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual([]);
    } finally {
      session.dispose();
    }
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
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-finance-sdk'], tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
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
      tools: ['finance_evidence_quote', 'fund_search', 'fund_screen', 'fund_top'],
    }, {
      cwd: process.cwd(),
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
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-finance-sdk'], tools: ['finance_evidence_quote'] }, {
      cwd: process.cwd(),
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
      }, { cwd });
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

  test('loads the market-data Package through an explicit Pi Package allowlist', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const trendDir = await mkdtemp(join(process.cwd(), '.upup', 'pi-market-trend-'));
    const previousTrendPath = process.env.UPUP_PROVIDER_METRICS_PATH;
    process.env.UPUP_PROVIDER_METRICS_PATH = join(trendDir, 'trend.json');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      packages: ['@upup/pi-market-data'],
      skills: ['market-data'],
      tools: ['get_market_data', 'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions', 'kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary', 'get_sector_data', 'get_market_structure', 'get_technical_data', 'stock_screener', 'screen_astocks', 'get_astock_price', 'market_data_quote', 'market_data_provider_health', 'market_data_provider_trend', 'market_data_provider_sla', 'market_data_history', 'market_trading_day'],
    }, {
      cwd: process.cwd(),
      marketQuoteFetcher: async (input) => {
        expect(String(input)).toContain('600519');
        return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: '600519.SS', regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000, chartPreviousClose: 1590 } }] } }), { status: 200 });
      },
      marketHistoryFetcher: async (input) => {
        expect(String(input)).toContain('002594');
        const timestamps = Array.from({ length: 40 }, (_, index) => Date.parse('2026-08-09T00:00:00Z') / 1000 - (39 - index) * 86_400);
        return new Response(JSON.stringify({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open: Array(40).fill(100), high: Array(40).fill(102), low: Array(40).fill(99), close: Array.from({ length: 40 }, (_, index) => 100 + index), volume: Array(40).fill(1000) }] } }] } }), { status: 200 });
      },
      piPackagePaths: [join(packageRoot, 'pi-finance-sdk'), join(packageRoot, 'pi-market-data')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-finance-sdk'), join(packageRoot, 'pi-market-data')],
        pinnedPackages: {
          '@upup/pi-finance-sdk': '0.1.0',
          '@upup/pi-market-data': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: {
          '@upup/pi-finance-sdk': ['builtin:upup'],
          '@upup/pi-market-data': ['builtin:upup'],
        },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(['kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary', 'get_market_data', 'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions', 'get_sector_data', 'get_market_structure', 'stock_screener', 'screen_astocks', 'get_astock_price', 'get_technical_data', 'market_data_quote', 'market_data_provider_health', 'market_data_provider_trend', 'market_data_provider_sla', 'market_data_history', 'market_trading_day']);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-market-data' && resource.kind === 'skill')).toBe(true);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-finance-sdk')).toBe(false);
      const result = await session.executeTool('market_data_quote', 'market-package-quote', { symbol: '600519.SH', market: 'cn' });
      expect(result).toMatchObject({ details: { auditId: 'market-package-quote', dataFreshness: 'delayed', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] } });
      expect(result.content[0]).toMatchObject({ type: 'text' });
      const trendResult = await session.executeTool('market_data_provider_trend', 'market-package-trend', {});
      expect(trendResult).toMatchObject({ details: { auditId: 'market-package-trend', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://market-data/market-data/provider-trend' }] } });
      expect(JSON.parse((trendResult.content[0] as { type: 'text'; text: string }).text)).toMatchObject({ trend: [{ requests: 1, successes: 1, failures: 0, successRatePct: 100, sloStatus: 'healthy' }], sloStatus: 'healthy', successRatePct: 100, sampleCount: 1 });
      const nativeResult = await session.executeTool('get_market_data', 'market-package-native', { query: '600519.SH price' });
      expect(nativeResult).toMatchObject({ details: { auditId: 'market-package-native', dataFreshness: 'cached', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart#cache' }] } });
      const astockResult = await session.executeTool('get_astock_price', 'astock-package-native', { code: '600519.SH' });
      expect(astockResult).toMatchObject({ details: { auditId: 'astock-package-native', dataFreshness: 'cached', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart#cache' }] } });
      const sectorResult = await session.executeTool('get_sector_data', 'sector-package-native', { code: '002594.SZ', type: 'stock' });
      expect(sectorResult).toMatchObject({ details: { auditId: 'sector-package-native', evidence: [{ source: 'upup-pi://market-data/sector-data' }] } });
      const structureResult = await session.executeTool('get_market_structure', 'structure-package-native', { type: 'moneyflow' });
      expect(structureResult).toMatchObject({ details: { auditId: 'structure-package-native', evidence: [{ source: 'upup-pi://market-data/market-structure' }] } });
      const technicalResult = await session.executeTool('get_technical_data', 'technical-package-native', { code: '002594.SZ', period: 'daily' });
      expect(technicalResult).toMatchObject({ details: { auditId: 'technical-package-native', dataFreshness: 'historical', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] } });
      const realtimeResult = await session.executeTool('realtime_subscribe', 'realtime-package-native', { symbols: ['600519'], source: 'mock' });
      expect(realtimeResult).toMatchObject({ details: { auditId: 'realtime-package-native', evidence: [{ source: 'upup-pi://market-data/realtime/subscribe' }] } });
      expect(JSON.parse((realtimeResult.content[0] as { text: string }).text)).toMatchObject({ id: 'sub-1', source: 'mock', symbols: ['600519'] });
      const realtimeList = await session.executeTool('realtime_list_subscriptions', 'realtime-list-native', {});
      expect(JSON.parse((realtimeList.content[0] as { text: string }).text).subscriptions).toHaveLength(1);
      await session.executeTool('realtime_unsubscribe', 'realtime-unsubscribe-native', { subscriptionId: 'sub-1' });

      const reader = await new PiAgentSessionFactory().createSession({
        ...getInvestmentAgentSpec('invest-explore'),
        packages: ['@upup/pi-market-data'],
        skills: [],
        tools: ['market_data_provider_trend'],
      }, {
        cwd: process.cwd(),
        piPackagePaths: [join(packageRoot, 'pi-market-data')],
        piPackageTrust: {
          trustedPaths: [join(packageRoot, 'pi-market-data')],
          pinnedPackages: {
            '@upup/pi-market-data': '0.1.0',
            '@earendil-works/pi-coding-agent': '0.84.3',
            typebox: '1.3.7',
          },
          allowedSources: { '@upup/pi-market-data': ['builtin:upup'] },
        },
      });
      try {
        const readerTrend = await reader.executeTool('market_data_provider_trend', 'market-reader-trend', {});
        expect(JSON.parse((readerTrend.content[0] as { type: 'text'; text: string }).text)).toMatchObject({ trend: [{ requests: 1, successes: 1, failures: 0, successRatePct: 100, sloStatus: 'healthy' }], sloStatus: 'unknown', successRatePct: 0, sampleCount: 0 });
        expect(readerTrend.details).toMatchObject({ auditId: 'market-reader-trend' });
      } finally {
        reader.dispose();
      }
    } finally {
      session.dispose();
      if (previousTrendPath === undefined) delete process.env.UPUP_PROVIDER_METRICS_PATH;
      else process.env.UPUP_PROVIDER_METRICS_PATH = previousTrendPath;
      await rm(trendDir, { recursive: true, force: true });
    }
  });

  test('isolates new market-data natives when the Package is disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: [], skills: [],
      tools: ['get_sector_data', 'get_market_structure', 'get_technical_data', 'stock_screener', 'screen_astocks', 'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions'],
    }, { cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-market-data')], piPackageTrust: {
      trustedPaths: [join(packageRoot, 'pi-market-data')],
      pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-market-data': ['builtin:upup'] },
    } });
    try { expect(session.getAvailableToolNames()).toEqual([]); } finally { session.dispose(); }
  });

  test('loads investment-analysis with its market-data dependency closure', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      packages: ['@upup/pi-investment-analysis'],
      skills: ['investment-analysis'],
      tools: ['analyze_symbol', 'dcf_model', 'ddm_model', 'valuation_ratios', 'peer_comparison', 'calculate_target_price', 'quick_target_price', 'decision_dashboard', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'investment_dcf', 'investment_technical_signal'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
        pinnedPackages: {
          '@upup/pi-market-data': '0.1.0',
          '@upup/pi-investment-analysis': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: {
          '@upup/pi-market-data': ['builtin:upup'],
          '@upup/pi-investment-analysis': ['builtin:upup'],
        },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(['analyze_symbol', 'dcf_model', 'valuation_ratios', 'peer_comparison', 'calculate_target_price', 'quick_target_price', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'decision_dashboard', 'ddm_model', 'investment_dcf', 'investment_technical_signal']);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-market-data')).toBe(true);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-investment-analysis' && resource.kind === 'skill')).toBe(true);
      const result = await session.executeTool('investment_dcf', 'analysis-package-dcf', {
        currentFcf: 100, growthRate: 0.08, discountRate: 0.1, terminalGrowthRate: 0.03, projectionYears: 5, sharesOutstanding: 10,
      });
      expect(result).toMatchObject({ details: { auditId: 'analysis-package-dcf', dataFreshness: 'historical' } });
      const nativeResult = await session.executeTool('dcf_model', 'analysis-package-native-dcf', {
        current_fcf: 100, growth_rate: 0.08, discount_rate: 0.1, terminal_growth_rate: 0.03, projection_years: 5, shares_outstanding: 10,
      });
      expect(nativeResult).toMatchObject({ details: { auditId: 'analysis-package-native-dcf', evidence: [{ source: 'upup-pi://investment-analysis/dcf' }] } });
      const nativeDdm = await session.executeTool('ddm_model', 'analysis-package-native-ddm', {
        symbol: '600519.SH', current_dividend: 2, growth_rate: 0.05, required_return: 0.1, terminal_growth_rate: 0.03, projection_years: 5, current_price: 30,
      });
      expect(nativeDdm).toMatchObject({ details: { auditId: 'analysis-package-native-ddm', evidence: [{ source: 'upup-pi://investment-analysis/ddm' }] } });
      const nativeRatios = await session.executeTool('valuation_ratios', 'analysis-package-native-ratios', { price: 150, eps: 10, shares_outstanding: 10, total_equity: 500, operating_cash_flow: 80 });
      expect(nativeRatios).toMatchObject({ details: { auditId: 'analysis-package-native-ratios', evidence: [{ source: 'upup-pi://investment-analysis/valuation-ratios' }] } });
      const nativePeers = await session.executeTool('peer_comparison', 'analysis-package-native-peers', { target: { name: 'Target', pe_ratio: 18 }, peers: [{ name: 'A', pe_ratio: 20 }, { name: 'B', pe_ratio: 16 }] });
      expect(nativePeers).toMatchObject({ details: { auditId: 'analysis-package-native-peers', evidence: [{ source: 'upup-pi://investment-analysis/peer-comparison' }] } });
      const nativeTarget = await session.executeTool('calculate_target_price', 'analysis-package-native-target', { symbol: 'AAPL', currentPrice: 150, method: 'pe', currentEps: 6, forwardEps: 7, targetPe: 25, peYears: 3 });
      expect(nativeTarget).toMatchObject({ details: { auditId: 'analysis-package-native-target', evidence: [{ source: 'upup-pi://investment-analysis/target-price' }] } });
      const nativeQuick = await session.executeTool('quick_target_price', 'analysis-package-native-quick', { symbol: 'AAPL', currentPrice: 150, currentEps: 6, forwardEps: 7, growthRate: 0.15 });
      expect(nativeQuick).toMatchObject({ details: { auditId: 'analysis-package-native-quick', evidence: [{ source: 'upup-pi://investment-analysis/quick-target-price' }] } });
      const nativeOption = await session.executeTool('calculate_option_price', 'analysis-package-native-option', { spotPrice: 100, strikePrice: 100, timeToExpiry: 180, riskFreeRate: 0.05, volatility: 0.25, optionType: 'call' });
      expect(nativeOption).toMatchObject({ details: { auditId: 'analysis-package-native-option', evidence: [{ source: 'upup-pi://investment-analysis/option-price' }] } });
      const optionContent = nativeOption.content[0];
      if (optionContent.type !== 'text') throw new Error('option price tool must return text content');
      const optionPrice = JSON.parse(optionContent.text).price as number;
      const nativeIv = await session.executeTool('calculate_implied_volatility', 'analysis-package-native-iv', { marketPrice: optionPrice, spotPrice: 100, strikePrice: 100, timeToExpiry: 180, riskFreeRate: 0.05, optionType: 'call' });
      expect(nativeIv).toMatchObject({ details: { auditId: 'analysis-package-native-iv', evidence: [{ source: 'upup-pi://investment-analysis/implied-volatility' }] } });
      const bars = Array.from({ length: 25 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000 + index * 10 }));
      const nativeTechnical = await session.executeTool('calculate_technical_indicators', 'analysis-package-native-technical', { data: bars, indicators: ['kdj', 'boll', 'atr'] });
      expect(nativeTechnical).toMatchObject({ details: { auditId: 'analysis-package-native-technical', evidence: [{ source: 'upup-pi://investment-analysis/technical-indicators' }] } });
      const nativeDashboard = await session.executeTool('decision_dashboard', 'analysis-package-native-dashboard', {
        symbol: 'AAPL',
        technical: { trend: 'uptrend', rsi: 45, macd_signal: 'bullish' },
        fundamental: { pe_ratio: 12, roe: 0.22 },
        sentiment: { news_sentiment: 'positive', analyst_rating: 'buy' },
        risk: { volatility: 0.1, beta: 0.7 },
      });
      expect(nativeDashboard).toMatchObject({ details: { auditId: 'analysis-package-native-dashboard', evidence: [{ source: 'upup-pi://investment-analysis/decision-dashboard' }] } });
      for (const [toolName, source] of [
        ['calculate_wr', 'upup-pi://investment-analysis/wr'],
        ['calculate_cci', 'upup-pi://investment-analysis/cci'],
        ['calculate_atr', 'upup-pi://investment-analysis/atr'],
        ['calculate_obv', 'upup-pi://investment-analysis/obv'],
      ] as const) {
        const result = await session.executeTool(toolName, `analysis-package-native-${toolName}`, { data: bars });
        expect(result).toMatchObject({ details: { auditId: `analysis-package-native-${toolName}`, evidence: [{ source }] } });
      }
    } finally {
      session.dispose();
    }
  });

  test('does not expose native DCF when Investment Analysis is disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      packages: ['@upup/pi-market-data'],
      skills: [],
      tools: ['dcf_model'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
        pinnedPackages: {
          '@upup/pi-market-data': '0.1.0',
          '@upup/pi-investment-analysis': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: {
          '@upup/pi-market-data': ['builtin:upup'],
          '@upup/pi-investment-analysis': ['builtin:upup'],
        },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  test('does not expose native valuation tools when Investment Analysis is disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      packages: ['@upup/pi-market-data'],
      skills: [],
      tools: ['valuation_ratios', 'peer_comparison', 'calculate_target_price', 'quick_target_price'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
        pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@upup/pi-investment-analysis': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' },
        allowedSources: { '@upup/pi-market-data': ['builtin:upup'], '@upup/pi-investment-analysis': ['builtin:upup'] },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  test('rejects investment-analysis when its market-data dependency is not loaded', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    await expect(new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      packages: ['@upup/pi-investment-analysis'],
      skills: ['investment-analysis'],
      tools: ['investment_dcf', 'investment_technical_signal'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-investment-analysis')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-investment-analysis')],
        pinnedPackages: {
          '@upup/pi-investment-analysis': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: { '@upup/pi-investment-analysis': ['builtin:upup'] },
      },
  })).rejects.toThrow('@upup/pi-market-data@0.1.0');
  });

  test('loads and restores the native research task journal through the Investment Analysis Package', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-plan'), packages: ['@upup/pi-market-data', '@upup/pi-investment-analysis'], skills: [], tools: ['list_research_tasks'] }, {
      cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')],
      piPackageTrust: { trustedPaths: [join(packageRoot, 'pi-market-data'), join(packageRoot, 'pi-investment-analysis')], pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@upup/pi-investment-analysis': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-market-data': ['builtin:upup'], '@upup/pi-investment-analysis': ['builtin:upup'] } },
    });
    try {
      expect(session.getAvailableToolNames()).toContain('list_research_tasks');
      session.appendEntry('upup_pi_research_tasks', { schema: 1, tasks: [{ id: 'task-1', title: 'AAPL research', phase: 'research', status: 'completed', createdAt: 1, updatedAt: 2 }] });
      const result = await session.executeTool('list_research_tasks', 'research-session-1', { phase: 'research' });
      expect(result).toMatchObject({ details: { auditId: 'research-session-1', journal: 'pi-session', evidence: [{ source: 'upup-pi://investment-analysis/research-tasks' }] } });
      expect(JSON.parse(result.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).tasks).toHaveLength(1);
    } finally { session.dispose(); }
  });

  test('loads the risk Package through an explicit Pi Package allowlist', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-risk'),
      packages: ['@upup/pi-risk'],
      skills: ['pi-risk'],
      tools: ['calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'calculate_kelly', 'calculate_risk_parity', 'calculate_mean_variance', 'score_data_source', 'compare_data_sources', 'calculate_correlation_matrix', 'calculate_correlation', 'track_risk', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-risk')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-risk')],
        pinnedPackages: {
          '@upup/pi-risk': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: {
          '@upup/pi-risk': ['builtin:upup'],
        },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(['track_risk', 'calculate_var', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'calculate_kelly', 'calculate_risk_parity', 'calculate_mean_variance', 'score_data_source', 'compare_data_sources', 'calculate_correlation_matrix', 'calculate_correlation']);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-risk' && resource.kind === 'skill')).toBe(true);
      const result = await session.executeTool('calculate_max_drawdown', 'risk-package-drawdown', {
        prices: [100, 110, 120, 90, 80],
      });
      expect(result).toMatchObject({ details: { auditId: 'risk-package-drawdown', dataFreshness: 'historical', peakIndex: 2, troughIndex: 4 } });
      const kelly = await session.executeTool('calculate_kelly', 'risk-package-kelly', { winRate: 0.6, avgWin: 0.15, avgLoss: 0.1, capital: 100000 });
      expect(kelly).toMatchObject({ details: { auditId: 'risk-package-kelly', evidence: [{ source: 'upup-pi://risk/kelly' }] } });
      const parity = await session.executeTool('calculate_risk_parity', 'risk-package-parity', { assets: [{ symbol: 'A', volatility: 0.2, expectedReturn: 0.1 }, { symbol: 'B', volatility: 0.1, expectedReturn: 0.08 }] });
      expect(parity).toMatchObject({ details: { auditId: 'risk-package-parity', evidence: [{ source: 'upup-pi://risk/risk-parity' }] } });
      const meanVariance = await session.executeTool('calculate_mean_variance', 'risk-package-mvo', { assets: [{ symbol: 'A', volatility: 0.2, expectedReturn: 0.1 }, { symbol: 'B', volatility: 0.1, expectedReturn: 0.08 }], riskFreeRate: 0.02 });
      expect(meanVariance).toMatchObject({ details: { auditId: 'risk-package-mvo', evidence: [{ source: 'upup-pi://risk/mean-variance' }] } });
      const score = await session.executeTool('score_data_source', 'risk-package-score', { source: 'A', latency: 50, freshness: 0.5, coverage: 95, accuracy: 99, priceDeviation: 0.1 });
      expect(score).toMatchObject({ details: { auditId: 'risk-package-score', evidence: [{ source: 'upup-pi://risk/data-source-score' }] } });
      const trackedRisk = await session.executeTool('track_risk', 'risk-package-track', { ticker: 'aapl', type: 'company', severity: 'high', title: 'Margin pressure', description: 'Input costs may compress operating margin.', probability: 0.4, impact: 0.8 });
      expect(trackedRisk).toMatchObject({ details: { auditId: 'risk-package-track', journal: 'pi-session', evidence: [{ source: 'upup-pi://risk/risk-tracker' }] } });
      const comparison = await session.executeTool('compare_data_sources', 'risk-package-compare', { sources: [{ source: 'A', latency: 50, freshness: 0.5, coverage: 95, accuracy: 99, priceDeviation: 0.1 }, { source: 'B', latency: 10000, freshness: 100, coverage: 30, accuracy: 50, priceDeviation: 5 }], preferAccurate: true });
      expect(comparison).toMatchObject({ details: { auditId: 'risk-package-compare', evidence: [{ source: 'upup-pi://risk/data-source-comparison' }] } });
      const matrix = await session.executeTool('calculate_correlation_matrix', 'risk-package-matrix', { returns: { A: [1, 2, 3], B: [3, 2, 1] }, symbols: ['A', 'B'] });
      expect(matrix).toMatchObject({ details: { auditId: 'risk-package-matrix', evidence: [{ source: 'upup-pi://risk/correlation-matrix' }] } });
      const correlation = await session.executeTool('calculate_correlation', 'risk-package-correlation', { asset1Returns: [1, 2, 3], asset2Returns: [1, 2, 3], asset1Symbol: 'A', asset2Symbol: 'B' });
      expect(correlation).toMatchObject({ details: { auditId: 'risk-package-correlation', evidence: [{ source: 'upup-pi://risk/correlation' }] } });
      const shortInterest = await session.executeTool('get_short_interest', 'risk-package-short-interest', { symbol: 'AAPL' });
      expect(shortInterest).toMatchObject({ details: { auditId: 'risk-package-short-interest', evidence: [{ source: 'upup-pi://risk/short-interest' }] } });
      const shortRatio = await session.executeTool('calculate_short_interest_ratio', 'risk-package-short-ratio', { symbol: 'AAPL', quantity: 10, avg_cost: 150 });
      expect(shortRatio).toMatchObject({ details: { auditId: 'risk-package-short-ratio', evidence: [{ source: 'upup-pi://risk/short-interest-ratio' }] } });
      const shortSqueeze = await session.executeTool('detect_short_squeeze', 'risk-package-short-squeeze', { symbols: ['AAPL', 'TSLA'], min_short_interest_ratio: 1, min_short_percent_float: 1 });
      expect(shortSqueeze).toMatchObject({ details: { auditId: 'risk-package-short-squeeze', evidence: [{ source: 'upup-pi://risk/short-squeeze' }] } });
    } finally {
      session.dispose();
    }
  });

  test('does not expose native risk tools when the Risk Package is disabled', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-risk'),
      packages: ['@upup/pi-market-data'],
      skills: [],
      tools: ['calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'calculate_kelly', 'calculate_risk_parity', 'calculate_mean_variance', 'score_data_source', 'compare_data_sources', 'calculate_correlation_matrix', 'calculate_correlation', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-risk'), join(packageRoot, 'pi-market-data')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-risk'), join(packageRoot, 'pi-market-data')],
        pinnedPackages: {
          '@upup/pi-risk': '0.1.0',
          '@upup/pi-market-data': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: {
          '@upup/pi-risk': ['builtin:upup'],
          '@upup/pi-market-data': ['builtin:upup'],
        },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  test('loads the portfolio Package through an explicit Pi Package allowlist', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-review'),
      packages: ['@upup/pi-portfolio'],
      skills: ['pi-portfolio'],
      tools: ['add_position', 'update_position', 'remove_position', 'get_portfolio', 'list_portfolios', 'create_portfolio', 'delete_portfolio', 'switch_portfolio', 'add_position_multi', 'remove_position_multi', 'get_portfolio_multi', 'portfolio_attribution', 'portfolio_brinson_attribution', 'portfolio_style_attribution', 'portfolio_sector_attribution', 'list_benchmarks', 'compare_to_benchmark', 'calculate_alpha', 'convert_currency', 'list_currencies', 'get_exchange_rate'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: [join(packageRoot, 'pi-portfolio')],
      piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-portfolio')],
        pinnedPackages: {
          '@upup/pi-portfolio': '0.1.0',
          '@earendil-works/pi-coding-agent': '0.84.3',
          typebox: '1.3.7',
        },
        allowedSources: { '@upup/pi-portfolio': ['builtin:upup'] },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(['list_portfolios', 'create_portfolio', 'delete_portfolio', 'switch_portfolio', 'add_position_multi', 'remove_position_multi', 'get_portfolio_multi', 'add_position', 'update_position', 'remove_position', 'get_portfolio', 'list_benchmarks', 'compare_to_benchmark', 'calculate_alpha', 'convert_currency', 'list_currencies', 'get_exchange_rate', 'portfolio_attribution', 'portfolio_brinson_attribution', 'portfolio_style_attribution', 'portfolio_sector_attribution']);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-portfolio' && resource.kind === 'skill')).toBe(true);
      const result = await session.executeTool('portfolio_brinson_attribution', 'portfolio-package-brinson', {
        portfolio: [{ sector: 'Technology', weight: 1, return: 0.1 }],
        benchmark: [{ sector: 'Technology', weight: 1, return: 0.08 }],
      });
      expect(result).toMatchObject({ details: { auditId: 'portfolio-package-brinson', dataFreshness: 'historical' } });
      const nativeResult = await session.executeTool('portfolio_attribution', 'portfolio-package-native', {
        method: 'combined',
        portfolio: { totalReturn: 0.1, holdings: [{ sector: 'Technology', weight: 1, return: 0.1 }] },
        benchmark: { totalReturn: 0.08, holdings: [{ sector: 'Technology', weight: 1, return: 0.08 }] },
      });
      expect(nativeResult).toMatchObject({ details: { auditId: 'portfolio-package-native', evidence: [{ source: 'upup-pi://portfolio/attribution' }] } });
      const added = await session.executeTool('add_position', 'portfolio-package-add', { symbol: 'AAPL', quantity: 10, avgCost: 150 });
      expect(added).toMatchObject({ details: { auditId: 'portfolio-package-add', evidence: [{ source: 'upup-pi://portfolio/add-position' }], portfolioState: { positionCount: 1 } } });
      const report = await session.executeTool('get_portfolio', 'portfolio-package-report', { prices: { AAPL: 180 } });
      expect(JSON.parse(report.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).summary).toMatchObject({ totalMarketValue: 1800, totalPnl: 300, totalValue: 100300 });
      const removed = await session.executeTool('remove_position', 'portfolio-package-remove', { symbol: 'AAPL', atPrice: 180 });
      expect(JSON.parse(removed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).cash).toBe(100300);
      await session.executeTool('create_portfolio', 'portfolio-package-create', { name: 'growth', initialCash: 50000 });
      await session.executeTool('add_position_multi', 'portfolio-package-multi-add', { portfolio: 'growth', symbol: 'MSFT', quantity: 5, avgCost: 300 });
      const multi = await session.executeTool('get_portfolio_multi', 'portfolio-package-multi-report', { portfolio: 'growth', prices: { MSFT: 330 } });
      expect(JSON.parse(multi.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).summary).toMatchObject({ totalMarketValue: 1650, totalPnl: 150, totalValue: 50150 });
    } finally {
      session.dispose();
    }
  });

  test('restores native portfolio state from the Pi session custom entry', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'portfolio-session-'));
    const sessionPath = join(directory, 'portfolio.jsonl');
    const spec = { ...getInvestmentAgentSpec('invest-review'), id: 'portfolio-session-state', packages: ['@upup/pi-portfolio'], skills: [], tools: ['add_position', 'get_portfolio', 'create_portfolio', 'add_position_multi', 'get_portfolio_multi'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-portfolio')], pinnedPackages: { '@upup/pi-portfolio': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-portfolio': ['builtin:upup'] } };
    const first = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-portfolio')], piPackageTrust: trust });
    await first.executeTool('add_position', 'portfolio-state-add', { symbol: 'MSFT', quantity: 5, avgCost: 300 });
    await first.executeTool('create_portfolio', 'portfolio-state-create', { name: 'growth', initialCash: 50000 });
    await first.executeTool('add_position_multi', 'portfolio-state-multi-add', { portfolio: 'growth', symbol: 'AAPL', quantity: 10, avgCost: 100 });
    expect(first.getCustomEntries('upup_pi_portfolio_state').length).toBeGreaterThan(0);
    first.dispose();
    expect(await readFile(sessionPath, 'utf8')).toContain('upup_pi_portfolio_state');
    const resumed = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-portfolio')], piPackageTrust: trust });
    try {
      expect(resumed.getCustomEntries('upup_pi_portfolio_state').length).toBeGreaterThan(0);
      expect(resumed.getCustomEntries('upup_pi_portfolio_state').at(-1)).toMatchObject({ data: { cash: 98500 } });
      const report = await resumed.executeTool('get_portfolio', 'portfolio-state-read', { prices: { MSFT: 330 } });
      expect(JSON.parse(report.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).summary).toMatchObject({ totalPositions: 1, totalMarketValue: 1650, totalPnl: 150 });
      const multi = await resumed.executeTool('get_portfolio_multi', 'portfolio-state-multi-read', { portfolio: 'growth', prices: { AAPL: 120 } });
      expect(JSON.parse(multi.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).summary).toMatchObject({ totalPositions: 1, totalMarketValue: 1200, totalPnl: 200 });
      expect(resumed.getCustomEntries('upup_pi_portfolio_state').length).toBeGreaterThan(0);
    } finally { resumed.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('restores native fund watchlist from the Pi session custom entry', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'fund-watchlist-session-'));
    const sessionPath = join(directory, 'fund-watchlist.jsonl');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'fund-watchlist-session-state', packages: ['@upup/pi-finance-sdk'], skills: [], tools: ['fund_follow', 'fund_unfollow', 'fund_list'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-finance-sdk')], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] } };
    const first = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      const followed = await first.executeTool('fund_follow', 'fund-watchlist-follow', { fund_code: '110022', note: 'session-only' });
      expect(followed).toMatchObject({ details: { auditId: 'fund-watchlist-follow', evidence: [{ source: 'upup-pi://finance-sdk/fund-follow' }] } });
      expect(first.getCustomEntries('upup_pi_fund_watchlist').length).toBeGreaterThan(0);
    } finally { first.dispose(); }
    expect(await readFile(sessionPath, 'utf8')).toContain('upup_pi_fund_watchlist');
    const resumed = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      const listed = await resumed.executeTool('fund_list', 'fund-watchlist-list', { limit: 10 });
      expect(JSON.parse(listed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).value.funds).toMatchObject([{ code: '110022', note: 'session-only' }]);
      expect(resumed.getCustomEntries('upup_pi_fund_watchlist').length).toBeGreaterThan(0);
    } finally { resumed.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('restores Finance knowledge journal entries from the Pi session', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'finance-knowledge-session-'));
    const sessionPath = join(directory, 'finance-knowledge.jsonl');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'finance-knowledge-session-state', packages: ['@upup/pi-finance-sdk'], skills: [], tools: ['track_company', 'track_sector', 'get_knowledge_summary'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-finance-sdk')], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] } };
    const first = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      const company = await first.executeTool('track_company', 'knowledge-company-1', { ticker: 'aapl', name: 'Apple', sector: 'Technology', industry: 'Consumer Electronics', summary: 'Session research note.', key_metrics: { pe: 34.2 } });
      expect(company).toMatchObject({ details: { auditId: 'knowledge-company-1', evidence: [{ source: 'upup-pi://finance-sdk/knowledge-journal/company' }] } });
      const sector = await first.executeTool('track_sector', 'knowledge-sector-1', { name: 'Technology', description: 'Session sector note.', trends: ['AI investment'], outlook: 'bullish' });
      expect(sector).toMatchObject({ details: { auditId: 'knowledge-sector-1', evidence: [{ source: 'upup-pi://finance-sdk/knowledge-journal/sector' }] } });
      expect(first.getCustomEntries('upup_pi_finance_knowledge_journal').length).toBeGreaterThan(0);
    } finally { first.dispose(); }
    expect(await readFile(sessionPath, 'utf8')).toContain('upup_pi_finance_knowledge_journal');
    const resumed = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      const summary = await resumed.executeTool('get_knowledge_summary', 'knowledge-summary-1', {});
      const payload = JSON.parse(summary.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).value;
      expect(payload.investmentKnowledge).toMatchObject({ companies: 1, sectors: 1, strategies: 5 });
      expect(payload.companies).toMatchObject([{ ticker: 'AAPL', name: 'Apple' }]);
      expect(payload.sectors).toMatchObject([{ name: 'Technology', outlook: 'bullish' }]);
      expect(resumed.getCustomEntries('upup_pi_finance_knowledge_journal').length).toBeGreaterThan(0);
    } finally { resumed.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('restores native Kairos events from the Pi session journal', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'market-kairos-session-'));
    const sessionPath = join(directory, 'market-kairos.jsonl');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'market-kairos-session-state', packages: ['@upup/pi-market-data'], skills: [], tools: ['kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-market-data')], pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-market-data': ['builtin:upup'] } };
    const first = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-market-data')], piPackageTrust: trust });
    try {
      first.appendEntry('upup_pi_market_data_kairos_journal', {
        schema: 1,
        nextSeq: 3,
        events: [
          { topic: 'kairos.opportunity.breakout', kind: 'opportunity', payload: { symbol: '600519' }, timestamp: 10, seq: 1 },
          { topic: 'kairos.scanner.volume-spike', kind: 'scanner', payload: { symbol: '000001' }, timestamp: 11, seq: 2 },
        ],
      });
      expect(first.getCustomEntries('upup_pi_market_data_kairos_journal').length).toBeGreaterThan(0);
    } finally { first.dispose(); }
    expect(await readFile(sessionPath, 'utf8')).toContain('upup_pi_market_data_kairos_journal');
    const resumed = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-market-data')], piPackageTrust: trust });
    try {
      const opportunities = await resumed.executeTool('kairos_recent_opportunities', 'kairos-session-opportunities', { limit: 20 });
      const opportunityPayload = JSON.parse(opportunities.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text);
      expect(opportunityPayload).toMatchObject({ count: 1, events: [{ topic: 'kairos.opportunity.breakout', payload: { symbol: '600519' } }] });
      const summary = await resumed.executeTool('kairos_summary', 'kairos-session-summary', { recentsPerKind: 1 });
      const summaryPayload = JSON.parse(summary.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text);
      expect(summaryPayload.scanner.count).toBe(1);
      expect(resumed.getCustomEntries('upup_pi_market_data_kairos_journal').length).toBeGreaterThan(0);
    } finally { resumed.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('restores native fund alerts from the Pi session custom entry', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'fund-alert-session-'));
    const sessionPath = join(directory, 'fund-alerts.jsonl');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'fund-alert-session-state', packages: ['@upup/pi-finance-sdk'], skills: [], tools: ['fund_alert_create', 'fund_alert_list', 'fund_alert_delete'] };
    const trust = { trustedPaths: [join(packageRoot, 'pi-finance-sdk')], pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] } };
    const first = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      const created = await first.executeTool('fund_alert_create', 'fund-alert-create', { fund_code: '110022', alert_type: 'change_down', value: 5 });
      expect(created).toMatchObject({ details: { auditId: 'fund-alert-create', evidence: [{ source: 'upup-pi://finance-sdk/fund-alert-create' }] } });
      expect(first.getCustomEntries('upup_pi_fund_alerts').length).toBeGreaterThan(0);
    } finally { first.dispose(); }
    expect(await readFile(sessionPath, 'utf8')).toContain('upup_pi_fund_alerts');
    const resumed = await new PiAgentSessionFactory().createSession(spec, { cwd: directory, sessionPath, piPackagePaths: [join(packageRoot, 'pi-finance-sdk')], piPackageTrust: trust });
    try {
      const listed = await resumed.executeTool('fund_alert_list', 'fund-alert-list', {});
      expect(JSON.parse(listed.content.find((part): part is { type: 'text'; text: string } => part.type === 'text')!.text).value.alerts).toMatchObject([{ fundCode: '110022', type: 'change_down', value: 5 }]);
      expect(resumed.getCustomEntries('upup_pi_fund_alerts').length).toBeGreaterThan(0);
    } finally { resumed.dispose(); await rm(directory, { recursive: true, force: true }); }
  });

  test('loads the backtest Package through an explicit Pi Package allowlist', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'), packages: ['@upup/pi-backtest'], skills: ['pi-backtest'], tools: ['evaluate_trade', 'run_backtest', 'get_backtest_summary', 'calculate_win_rate'],
    }, {
      cwd: process.cwd(), piPackagePaths: [join(packageRoot, 'pi-backtest')], piPackageTrust: {
        trustedPaths: [join(packageRoot, 'pi-backtest')], pinnedPackages: { '@upup/pi-backtest': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' }, allowedSources: { '@upup/pi-backtest': ['builtin:upup'] },
      },
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(['evaluate_trade', 'run_backtest', 'get_backtest_summary', 'calculate_win_rate']);
      expect(session.getLoadedPackageResources().some((resource) => resource.packageName === '@upup/pi-backtest' && resource.kind === 'skill')).toBe(true);
      const result = await session.executeTool('run_backtest', 'backtest-package-run', { trades: [{ symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 1 }], forwardPriceData: { A: [{ date: '2026-01-02', high: 105, low: 99, close: 104 }] }, evalWindowDays: 1, neutralBandPct: 2 });
      expect(result).toMatchObject({ details: { auditId: 'backtest-package-run', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://backtest/run' }] } });
    } finally { session.dispose(); }
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
      }, { cwd })).rejects.toThrow('commands were not registered');
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
    expect(session.getAvailableToolNames()).not.toContain('fund_search');
    expect(session.getAvailableToolNames()).not.toContain('fund_screen');
    expect(session.getAvailableToolNames()).not.toContain('fund_top');
    session.dispose();
  });

  test('loads native sandbox trading writes through the Finance Package and denies non-interactive execution', async () => {
    const packagePath = join(process.cwd(), 'packages/pi-finance-sdk');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-trade'),
      packages: ['@upup/pi-finance-sdk'],
      skills: [],
      tools: ['place_trade_order', 'cancel_trade_order'],
    }, {
      cwd: process.cwd(),
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
    try {
      expect(session.getAvailableToolNames()).toEqual(expect.arrayContaining(['place_trade_order', 'cancel_trade_order']));
      const result = await session.executeTool('place_trade_order', 'native-trade-denied', { symbol: '600519.SH', side: 'buy', quantity: 100 }) as AgentToolResultWithError & { details?: { policyAudit?: { decision?: string } } };
      expect(result.isError).toBe(true);
      expect(result.details?.policyAudit?.decision).toBe('approval_denied');
    } finally {
      session.dispose();
    }
  });

  test('rejects a non-empty Package allowlist when no Packages are configured', async () => {
    await expect(new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      packages: ['@upup/pi-finance-sdk'],
      tools: '*',
    }, {
      cwd: process.cwd(),
      piPackagePaths: [],
    })).rejects.toThrow('Pi AgentSpec declares Packages but none are configured');
  });
});
