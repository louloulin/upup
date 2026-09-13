import { describe, expect, test } from 'bun:test';
import platformExtension from './index.js';

describe('Pi platform extension', () => {
  function loadTools(worker = false) {
    const registered = new Map<string, { execute: (...args: never[]) => Promise<{ content: readonly { text: string }[] }> }>();
    const previous = (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts;
    (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts = new Map([
      ['@upup/pi-platform', {
        contract: 'upup.pi.host.v1', packageName: '@upup/pi-platform', packageVersion: '0.1.0', sessionId: 'platform-session',
        capabilities: worker ? ['tool-definitions', 'agent-worker'] : ['tool-definitions'],
        getToolDefinitions: () => [], getToolMetadata: () => [], getSkillDefinitions: () => [],
        ...(worker ? { runAgentWorker: async (request: { agentId: string; name: string; role: string; prompt: string; tools: readonly string[] | '*'; model?: string }, _signal: AbortSignal) => ({ agentId: request.agentId, output: `worker:${request.prompt}`, sessionId: `session:${request.agentId}` }) } : {}),
      }],
    ]);
    platformExtension({ registerTool: (tool: { name: string; execute: (...args: never[]) => Promise<{ content: readonly { text: string }[] }> }) => registered.set(tool.name, tool) } as never);
    if (previous === undefined) delete (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts;
    else (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts = previous;
    return registered;
  }

  test('loads only the exact session-scoped host tools', () => {
    const tools: string[] = [];
    const previous = (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts;
    (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts = new Map([
      ['@upup/pi-platform', {
        contract: 'upup.pi.host.v1', packageName: '@upup/pi-platform', packageVersion: '0.1.0', sessionId: 'platform-session', capabilities: ['tool-definitions'],
        getToolDefinitions(request: unknown) {
          expect(request).toEqual({ contract: 'upup.pi.host.v1', packageName: '@upup/pi-platform', packageVersion: '0.1.0', sessionId: 'platform-session', capability: 'tool-definitions' });
          return [{ name: 'read_file' }, { name: 'enter_plan_mode' }];
        },
        getToolMetadata: () => [{ name: 'read_file', description: 'Read files', concurrencySafe: true }],
        getSkillDefinitions: () => [{ name: 'platform-skill', description: 'Platform skill', instructions: 'trusted' }],
      }],
    ]);
    try {
      platformExtension({ registerTool: (tool: { name: string }) => tools.push(tool.name) } as never);
      expect(tools).toEqual(['read_file', 'enter_plan_mode', 'tool_search', 'list_skills', 'search_skills', 'get_skill', 'skill_info', 'skill', 'execute_skill', 'bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'send_user_file', 'memory_search', 'memory_get', 'memory_update', 'enter_plan_mode', 'exit_plan_mode', 'add_plan_step', 'update_plan_step', 'list_plan_steps', 'create_todo', 'update_todo', 'list_todos', 'delete_todo', 'notebook_read', 'notebook_create', 'notebook_edit_cell', 'notebook_insert_cell', 'notebook_delete_cell', 'task_create', 'task_get', 'task_list', 'task_stop', 'task_update', 'task_result', 'mcp_auth_set', 'mcp_auth_get', 'mcp_auth_clear', 'list_mcp_resources', 'read_mcp_resource', 'heartbeat', 'sleep', 'monitor', 'send_message', 'snip_tool', 'ask_confirm', 'ask_select', 'ask_multi_select', 'ask_input', 'ask_response', 'agent', 'fork_subagent', 'resume_agent', 'agent_memory', 'list_agents', 'run_builtin_agent', 'cron', 'tool_get', 'tool_list', 'export_data', 'create_worktree', 'remove_worktree', 'list_worktree', 'add_to_watchlist', 'remove_from_watchlist', 'get_watchlist', 'add_watchlist_alert', 'check_watchlist_alerts', 'clear_watchlist_alert', 'export_watchlist', 'lsp_complete', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_diagnostics', 'run_workflow', 'swarm_team_create', 'swarm_agent_spawn', 'swarm_agent_message', 'swarm_agent_results', 'swarm_team_list']);
    } finally {
      if (previous === undefined) delete (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts;
      else (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts = previous;
    }
  });

  test('fails closed when the package identity is stale', () => {
    const tools: string[] = [];
    const previous = (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts;
    (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts = new Map([
      ['@upup/pi-platform', { contract: 'upup.pi.host.v1', packageName: '@upup/pi-platform', packageVersion: '9.9.9', sessionId: 'stale', capabilities: ['tool-definitions'], getToolDefinitions: () => [{ name: 'must-not-load' }], getToolMetadata: () => [], getSkillDefinitions: () => [] }],
    ]);
    try {
      platformExtension({ registerTool: (tool: { name: string }) => tools.push(tool.name) } as never);
      expect(tools).toEqual([]);
    } finally {
      if (previous === undefined) delete (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts;
      else (globalThis as typeof globalThis & { __upupPiHosts?: unknown }).__upupPiHosts = previous;
    }
  });

  test('persists send_message in the active Pi Session journal', async () => {
    const tools = loadTools();
    const entries: unknown[] = [];
    const result = await tools.get('send_message')!.execute('message-1', { to: 'worker-1', content: 'Review risk', type: 'task' }, new AbortController().signal, undefined, { sessionManager: { getEntries: () => entries, appendCustomEntry: (_type: string, data: unknown) => entries.push({ type: 'custom', customType: 'upup_pi_platform_messages', data }) } } as never);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ success: true, persisted: true, message: { to: 'worker-1', content: 'Review risk', type: 'task' } });
    expect(entries).toHaveLength(1);
  });

  test('persists run_workflow plans in the active Pi Session journal', async () => {
    const tools = loadTools();
    const entries: unknown[] = [];
    const context = { sessionManager: { getEntries: () => entries, appendCustomEntry: (customType: string, data: unknown) => entries.push({ type: 'custom', customType, data }) } } as never;
    const response = JSON.parse((await tools.get('run_workflow')!.execute('workflow-1', { name: 'research', steps: [{ name: 'quote', tool: 'get_market_data', input: { symbol: 'AAPL' }, onError: 'abort' }] }, new AbortController().signal, undefined, context)).content[0]!.text);
    expect(response).toMatchObject({ type: 'Workflow Plan', name: 'research', stepCount: 1, status: 'planned' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ customType: 'upup_pi_platform_workflows' });
  });

  test('reads live context and requests Pi compaction for snip_tool', async () => {
    const tools = loadTools();
    let compacted = false;
    const result = await tools.get('snip_tool')!.execute('snip-1', { dry_run: false, threshold: 1, preserve_first: 1, preserve_last: 1, max_remove: 10 }, new AbortController().signal, undefined, { sessionManager: { buildSessionContext: () => ({ messages: [{ role: 'assistant', content: 'system' }, { role: 'user', content: 'Sure' }, { role: 'assistant', content: 'answer' }] }) }, compact: () => { compacted = true; } } as never);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ mode: 'compact_requested', candidate_removals: 1 });
    expect(compacted).toBe(true);
  });

  test('uses Pi UI for confirmation, selection, multi-selection, and input', async () => {
    const tools = loadTools();
    const entries: unknown[] = [];
    const context = {
      hasUI: true,
      ui: {
        confirm: async () => true,
        select: async (_title: string, options: string[]) => options.at(0),
        input: async () => 'user answer',
      },
      sessionManager: { getEntries: () => entries, appendCustomEntry: (_type: string, data: unknown) => entries.push({ type: 'custom', customType: 'upup_pi_platform_ask', data }) },
    } as never;
    const signal = new AbortController().signal;
    const confirm = JSON.parse((await tools.get('ask_confirm')!.execute('ask-confirm', { question: 'Continue?' }, signal, undefined, context)).content[0]!.text);
    const select = JSON.parse((await tools.get('ask_select')!.execute('ask-select', { question: 'Pick one', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }, signal, undefined, context)).content[0]!.text);
    const multi = JSON.parse((await tools.get('ask_multi_select')!.execute('ask-multi', { question: 'Pick many', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], min_selections: 1, max_selections: 1 }, signal, undefined, context)).content[0]!.text);
    const input = JSON.parse((await tools.get('ask_input')!.execute('ask-input', { question: 'Describe' }, signal, undefined, context)).content[0]!.text);
    expect(confirm).toMatchObject({ confirmed: true, skipped: false });
    expect(select).toMatchObject({ value: 'a', skipped: false });
    expect(multi).toMatchObject({ value: ['a'], skipped: false });
    expect(input).toMatchObject({ value: 'user answer', skipped: false });
    expect(entries).toHaveLength(4);
  });

  test('fails closed for ask tools without Pi UI and supports ask_response persistence', async () => {
    const tools = loadTools();
    const noUi = JSON.parse((await tools.get('ask_confirm')!.execute('ask-no-ui', { question: 'Continue?' }, new AbortController().signal, undefined, { hasUI: false } as never)).content[0]!.text);
    expect(noUi.error).toContain('UI is unavailable');
    const entries: unknown[] = [];
    const context = { sessionManager: { getEntries: () => entries, appendCustomEntry: (_type: string, data: unknown) => entries.push({ type: 'custom', customType: 'upup_pi_platform_ask', data }) } } as never;
    const submitted = JSON.parse((await tools.get('ask_response')!.execute('ask-response', { request_id: 'external-1', value: 'yes' }, new AbortController().signal, undefined, context)).content[0]!.text);
    expect(submitted).toMatchObject({ request_id: 'external-1', value: 'yes', skipped: false, already_submitted: false });
    const duplicate = JSON.parse((await tools.get('ask_response')!.execute('ask-response-duplicate', { request_id: 'external-1', value: 'no' }, new AbortController().signal, undefined, context)).content[0]!.text);
    expect(duplicate).toMatchObject({ request_id: 'external-1', value: 'yes', already_submitted: true });
  });
  test('runs Pi agents through the host worker and persists lifecycle/memory', async () => {
    const tools = loadTools(true);
    const entries: unknown[] = [];
    const context = { sessionManager: { getEntries: () => entries, appendCustomEntry: (_type: string, data: unknown) => entries.push({ type: 'custom', customType: 'upup_pi_platform_agents', data }) } } as never;
    const agent = JSON.parse((await tools.get('agent')!.execute('agent-1', { description: 'Research', prompt: 'Find evidence', run_in_background: false }, new AbortController().signal, undefined, context)).content[0]!.text);
    expect(agent).toMatchObject({ status: 'completed', output: 'worker:Find evidence' });
    const stored = JSON.parse((await tools.get('agent_memory')!.execute('memory-1', { action: 'store', agent_id: 'main-agent', content: 'Important result', memory_type: 'result' }, new AbortController().signal, undefined, context)).content[0]!.text);
    expect(stored.stored).toBe(true);
    const listed = JSON.parse((await tools.get('list_agents')!.execute('list-1', { filter: 'builtin' }, new AbortController().signal, undefined, context)).content[0]!.text);
    expect(listed.builtins.length).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  test('fails closed for agent execution without worker capability', async () => {
    const tools = loadTools(false);
    const response = JSON.parse((await tools.get('agent')!.execute('agent-no-worker', { description: 'Research', prompt: 'Do work' }, new AbortController().signal, undefined, {} as never)).content[0]!.text);
    expect(response.error).toContain('agent-worker capability is unavailable');
  });

});
