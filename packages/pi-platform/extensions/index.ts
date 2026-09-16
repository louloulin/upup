import { Type } from 'typebox';
import { buildSessionContext, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { definePiCapabilityHost, resolvePiCapabilityHost } from '@upup/pi-capability-registry';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addPlatformAgentMemory, addPlatformPlanStep, addPlatformSwarmAgent, addPlatformSwarmMessage, addPlatformWatchlistAlert, addPlatformWatchlistEntry, addPlatformWorkflowPlan, appendPlatformMessage, appendPlatformAskResponse, checkPlatformWatchlistAlerts, clearPlatformWatchlistAlert, createInitialPlatformAgentState, createInitialPlatformAskState, createInitialPlatformMessageState, createInitialPlatformPlanningState, createInitialPlatformSwarmState, createInitialPlatformTaskState, createInitialPlatformWatchlistState, createInitialPlatformWorkflowState, createPlatformAgent, createPlatformPlan, createPlatformSwarmTeam, createPlatformTask, createPlatformTodo, createPlatformWorktree, createPlatformWorkflowPlan, currentPlatformWorktree, deletePlatformTodo, listPlatformWorktrees, estimatePlatformSnipSavings, exportPlatformData, formatPlatformLspCompletions, formatPlatformLspDefinitions, formatPlatformLspDiagnostics, formatPlatformLspHover, formatPlatformLspReferences, getPlatformAgent, getPlatformAskResponse, getPlatformLspClient, getPlatformPlan, getPlatformSkill, getPlatformTask, getPlatformTool, invokePlatformSkill, listPlatformAgentMemories, listPlatformAgents, listPlatformMessages, listPlatformSkills, listPlatformTodos, listPlatformTools, listPlatformTasks, parsePlatformAgentState, parsePlatformAskState, parsePlatformMessageState, parsePlatformPlanningState, parsePlatformSwarmState, parsePlatformTaskState, parsePlatformWatchlistState, parsePlatformWorkflowState, platformMcpAuthClear, platformMcpAuthGet, platformMcpAuthSet, platformMcpListResources, platformMcpReadResource, platformSnipMessages, platformTaskStats, PLATFORM_BUILTIN_AGENTS, searchPlatformSkills, searchPlatformTools, shouldPlatformSnip, listPlatformWatchlistEntries, platformNotebookCreate, platformNotebookDeleteCell, platformNotebookEditCell, platformNotebookInsertCell, platformNotebookRead, platformPlanProgress, platformTodoStats, removePlatformWatchlistEntry, removePlatformWorktree, serializePlatformWatchlist, TOOL_GET_DESCRIPTION, TOOL_LIST_DESCRIPTION, TOOL_SEARCH_DESCRIPTION, GET_SKILL_DESCRIPTION, LIST_SKILLS_DESCRIPTION, SEARCH_SKILLS_DESCRIPTION, SKILL_EXECUTE_DESCRIPTION, SKILL_INFO_DESCRIPTION, updatePlatformAgent, updatePlatformPlanStep, updatePlatformTask, updatePlatformTodo, updatePlatformSwarmAgent, platformBash, platformEditFile, platformGlob, platformGrep, platformReadFile, platformSendUserFile, platformWriteFile, platformMemoryGet, platformMemorySearch, platformMemoryUpdate, platformHeartbeat, platformCron, platformSleep, platformMonitor, PLATFORM_SLEEP_DESCRIPTION, PLATFORM_MONITOR_DESCRIPTION, type PlatformCronJob, type PlatformExportCell, type PlatformMcpResourceGroup, type PlatformMcpResourceRead, type PlatformPlanOutputFormat, type PlatformPlanStepStatus, type PlatformPlanningState, type PlatformTaskState, type PlatformTaskStatus, type PlatformTodoPriority, type PlatformTodoStatus, type PlatformSkillDefinition, type PlatformSwarmState, type PlatformToolMetadata, type PlatformWatchlistState, type PlatformWorkflowState } from '../src/index';

const PACKAGE = '@upup/pi-platform';
const VERSION = '0.1.0';

/**
 * Resolve the active Pi Session message list for the LLM.
 *
 * Pi's `SessionManager` exposes `buildSessionContext()`; `ReadonlySessionManager`
 * (the type surfaced on `ExtensionContext`) narrows that away. Prefer the
 * runtime method when present, otherwise fall back to Pi's exported
 * `buildSessionContext(entries, leafId)` — never silently degrade to an empty
 * context, which would make `snip_tool`/`fork_subagent` no-op.
 */
function readSessionMessages(context: PlatformContext | undefined): readonly unknown[] {
  const manager = context?.sessionManager as
    | (ExtensionContext['sessionManager'] & {
        buildSessionContext?: () => { messages?: readonly unknown[] };
        getEntries?: () => readonly unknown[];
        getLeafId?: () => string | null;
      })
    | undefined;
  if (!manager) return [];
  if (typeof manager.buildSessionContext === 'function') return manager.buildSessionContext().messages ?? [];
  if (typeof manager.getEntries === 'function') {
    const entries = manager.getEntries();
    const leafId = typeof manager.getLeafId === 'function' ? manager.getLeafId() : null;
    return buildSessionContext(entries as Parameters<typeof buildSessionContext>[0], leafId).messages ?? [];
  }
  return [];
}

type PlatformContext = ExtensionContext & {
  sessionManager?: (ExtensionContext['sessionManager'] & {
    appendCustomEntry?: (customType: string, data?: unknown) => void;
  }) | undefined;
};
function appendContextEntry(context: PlatformContext | undefined, customType: string, state: unknown): void {
  const manager = context?.sessionManager as (ExtensionContext['sessionManager'] & { appendCustomEntry?: (customType: string, data?: unknown) => void }) | undefined;
  manager?.appendCustomEntry?.(customType, state);
}
function readContextEntries(context: PlatformContext | undefined): readonly unknown[] {
  return context?.sessionManager?.getEntries() ?? [];
}

interface PlatformHost {
  readonly contract: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly string[];
  providers: {
    tools: { getToolDefinitions(request: unknown): readonly unknown[]; getToolMetadata(request: unknown): readonly PlatformToolMetadata[]; getSkillDefinitions?(request: unknown): readonly PlatformSkillDefinition[] };
    workers?: { runAgentWorker?: (request: { agentId: string; name: string; role: string; prompt: string; tools: readonly string[] | '*'; model?: string }, signal: AbortSignal | undefined) => Promise<{ agentId: string; output: string; sessionId: string }> };
    scheduling?: { runCronJob?: (request: { job: unknown }, signal: AbortSignal | undefined) => Promise<void> };
    mcp?: { listMcpResources?: (server?: string, signal?: AbortSignal) => Promise<readonly PlatformMcpResourceGroup[]>; readMcpResource?: (uri: string, server?: string, signal?: AbortSignal) => Promise<PlatformMcpResourceRead> };
  };
}

const SWARM_ENTRY = 'upup_pi_platform_swarm';
const WATCHLIST_ENTRY = 'upup_pi_platform_watchlist';
const PLANNING_ENTRY = 'upup_pi_platform_planning';
const TASK_ENTRY = 'upup_pi_platform_tasks';
const MESSAGE_ENTRY = 'upup_pi_platform_messages';
const ASK_ENTRY = 'upup_pi_platform_ask';
const AGENT_ENTRY = 'upup_pi_platform_agents';
const WORKFLOW_ENTRY = 'upup_pi_platform_workflows';
const teamCreateParameters = Type.Object({ team_name: Type.String({ minLength: 1, maxLength: 100 }), description: Type.Optional(Type.String({ maxLength: 2_000 })), agent_type: Type.Optional(Type.String({ maxLength: 100 })) });
const agentSpawnParameters = Type.Object({ team_name: Type.String({ minLength: 1, maxLength: 100 }), agent_name: Type.String({ minLength: 1, maxLength: 100 }), role: Type.String({ minLength: 1, maxLength: 100 }), prompt: Type.String({ minLength: 1, maxLength: 20_000 }), tools: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 })), model: Type.Optional(Type.String({ maxLength: 200 })) });
const agentMessageParameters = Type.Object({ from_agent: Type.String({ minLength: 1, maxLength: 200 }), to_agent: Type.String({ minLength: 1, maxLength: 200 }), message: Type.String({ minLength: 1, maxLength: 20_000 }) });
const agentResultsParameters = Type.Object({ team_name: Type.String({ minLength: 1, maxLength: 100 }), agent_id: Type.Optional(Type.String({ maxLength: 200 })) });
const createWorktreeParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 2_000 }), branch: Type.String({ minLength: 1, maxLength: 500 }), createBranch: Type.Optional(Type.Boolean()) });
const removeWorktreeParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 2_000 }), force: Type.Optional(Type.Boolean()) });
const listWorktreeParameters = Type.Object({ format: Type.Optional(Type.Union([Type.Literal('simple'), Type.Literal('detailed')])) });
const watchlistEntryParameters = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 32 }), notes: Type.Optional(Type.String({ maxLength: 2_000 })), tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 50 })) });
const watchlistSymbolParameters = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 32 }) });
const watchlistListParameters = Type.Object({ tag: Type.Optional(Type.String({ maxLength: 100 })) });
const watchlistAlertParameters = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 32 }), type: Type.Union([Type.Literal('above'), Type.Literal('below'), Type.Literal('percent_change')]), value: Type.Number(), reference_price: Type.Optional(Type.Number()) });
const watchlistCheckParameters = Type.Object({ prices: Type.Record(Type.String({ minLength: 1, maxLength: 32 }), Type.Number()) });
const watchlistClearParameters = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 32 }), alert_index: Type.Integer({ minimum: 0 }) });
const exportWatchlistParameters = Type.Object({ format: Type.Optional(Type.Union([Type.Literal('csv'), Type.Literal('json')])), include_alerts: Type.Optional(Type.Boolean()) });
const lspPositionParameters = Type.Object({ uri: Type.String({ minLength: 1, maxLength: 4_000 }), line: Type.Integer({ minimum: 0 }), column: Type.Integer({ minimum: 0 }) });
const lspReferencesParameters = Type.Object({ uri: Type.String({ minLength: 1, maxLength: 4_000 }), line: Type.Integer({ minimum: 0 }), column: Type.Integer({ minimum: 0 }), include_declaration: Type.Optional(Type.Boolean()) });
const lspDiagnosticsParameters = Type.Object({ uri: Type.String({ minLength: 1, maxLength: 4_000 }) });
const toolSearchParameters = Type.Object({ query: Type.Optional(Type.String()), name: Type.Optional(Type.String()), concurrencySafe: Type.Optional(Type.Boolean()) });
const toolGetParameters = Type.Object({ name: Type.String({ minLength: 1 }) });
const toolListParameters = Type.Object({ prefix: Type.Optional(Type.String()), limit: Type.Optional(Type.Number({ minimum: 1 })) });
const exportCell = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]);
const exportDataParameters = Type.Object({ data: Type.Array(Type.Record(Type.String(), exportCell), { maxItems: 10_000 }), filename: Type.Optional(Type.String({ maxLength: 200 })), format: Type.Optional(Type.Union([Type.Literal('csv'), Type.Literal('json')])) });
const listSkillsParameters = Type.Object({ format: Type.Optional(Type.Union([Type.Literal('simple'), Type.Literal('detailed')])) });
const searchSkillsParameters = Type.Object({ keyword: Type.String({ maxLength: 200 }) });
const getSkillParameters = Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }) });
const skillInfoParameters = Type.Object({ skill_name: Type.String({ minLength: 1, maxLength: 200 }) });
const skillParameters = Type.Object({ skill: Type.String({ minLength: 1, maxLength: 200 }), args: Type.Optional(Type.String({ maxLength: 20_000 })) });
const executeSkillParameters = Type.Object({ skill_name: Type.String({ minLength: 1, maxLength: 200 }), args: Type.Optional(Type.String({ maxLength: 20_000 })) });
const readFileParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), offset: Type.Optional(Type.Integer({ minimum: 1 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })) });
const writeFileParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), content: Type.String({ maxLength: 2_000_000 }), confirm: Type.Boolean({ description: 'Must be true after explicit user approval.' }) });
const editFileParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), old_text: Type.String({ minLength: 1, maxLength: 500_000 }), new_text: Type.String({ maxLength: 500_000 }), replace_all: Type.Optional(Type.Boolean()), confirm: Type.Boolean({ description: 'Must be true after explicit user approval.' }) });
const globParameters = Type.Object({ pattern: Type.String({ minLength: 1, maxLength: 500 }), path: Type.Optional(Type.String({ maxLength: 4_000 })) });
const grepParameters = Type.Object({ pattern: Type.String({ minLength: 1, maxLength: 1_000 }), path: Type.Optional(Type.String({ maxLength: 4_000 })), glob: Type.Optional(Type.String({ maxLength: 500 })), output_mode: Type.Optional(Type.Union([Type.Literal('content'), Type.Literal('files_with_matches'), Type.Literal('count')])), '-i': Type.Optional(Type.Boolean()), '-C': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })), head_limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000 })) });
const sendUserFileParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), destination: Type.Optional(Type.String({ maxLength: 4_000 })), confirm: Type.Boolean({ description: 'Must be true after explicit user approval.' }) });
const bashParameters = Type.Object({ command: Type.String({ minLength: 1, maxLength: 20_000 }), timeout: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 120_000 })) });
const sleepParameters = Type.Object({ seconds: Type.Number({ minimum: 0, maximum: 3_600 }), reason: Type.Optional(Type.String({ maxLength: 2_000 })) });
const monitorParameters = Type.Object({ metric: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('cpu'), Type.Literal('memory'), Type.Literal('uptime')])) });
const sendMessageParameters = Type.Object({ to: Type.String({ minLength: 1, maxLength: 200 }), content: Type.String({ minLength: 1, maxLength: 20_000 }), type: Type.Optional(Type.Union([Type.Literal('task'), Type.Literal('status'), Type.Literal('request'), Type.Literal('response'), Type.Literal('broadcast')])), task_id: Type.Optional(Type.String({ maxLength: 200 })), from: Type.Optional(Type.String({ maxLength: 200 })) });
const snipParameters = Type.Object({ dry_run: Type.Optional(Type.Boolean()), threshold: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })), preserve_first: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })), preserve_last: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })), max_remove: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })) });
const askConfirmParameters = Type.Object({ question: Type.String({ minLength: 1, maxLength: 20_000 }), timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3_600_000 })) });
const askSelectParameters = Type.Object({ question: Type.String({ minLength: 1, maxLength: 20_000 }), options: Type.Array(Type.Object({ value: Type.String({ minLength: 1, maxLength: 200 }), label: Type.String({ minLength: 1, maxLength: 500 }), description: Type.Optional(Type.String({ maxLength: 2_000 })), recommended: Type.Optional(Type.Boolean()) }), { minItems: 2, maxItems: 4 }), header: Type.Optional(Type.String({ maxLength: 200 })), timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3_600_000 })) });
const askMultiSelectParameters = Type.Object({ question: Type.String({ minLength: 1, maxLength: 20_000 }), options: Type.Array(Type.Object({ value: Type.String({ minLength: 1, maxLength: 200 }), label: Type.String({ minLength: 1, maxLength: 500 }), description: Type.Optional(Type.String({ maxLength: 2_000 })) }), { minItems: 2, maxItems: 6 }), header: Type.Optional(Type.String({ maxLength: 200 })), min_selections: Type.Optional(Type.Integer({ minimum: 0, maximum: 6 })), max_selections: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })), timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3_600_000 })) });
const askInputParameters = Type.Object({ question: Type.String({ minLength: 1, maxLength: 20_000 }), placeholder: Type.Optional(Type.String({ maxLength: 1_000 })), default_value: Type.Optional(Type.String({ maxLength: 20_000 })), multiline: Type.Optional(Type.Boolean()), timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3_600_000 })) });
const askResponseParameters = Type.Object({ request_id: Type.String({ minLength: 1, maxLength: 200 }), value: Type.Optional(Type.String({ maxLength: 20_000 })), skip: Type.Optional(Type.Boolean()) });
const agentParameters = Type.Object({ description: Type.String({ minLength: 1, maxLength: 500 }), prompt: Type.String({ minLength: 1, maxLength: 20_000 }), subagent_type: Type.Optional(Type.Union([Type.Literal('general'), Type.Literal('specialized'), Type.Literal('fork')])), model: Type.Optional(Type.String({ maxLength: 200 })), run_in_background: Type.Optional(Type.Boolean()), max_turns: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })), tools: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 })), isolation: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('worktree')])), cwd: Type.Optional(Type.String({ maxLength: 4_000 })) });
const forkSubagentParameters = Type.Object({ prompt: Type.String({ minLength: 1, maxLength: 20_000 }), tools: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 })), max_turns: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })), cwd: Type.Optional(Type.String({ maxLength: 4_000 })) });
const resumeAgentParameters = Type.Object({ task_id: Type.String({ minLength: 1, maxLength: 200 }), additional_prompt: Type.Optional(Type.String({ maxLength: 20_000 })) });
const agentMemoryParameters = Type.Object({ action: Type.Union([Type.Literal('store'), Type.Literal('get'), Type.Literal('list'), Type.Literal('clear')]), agent_id: Type.Optional(Type.String({ maxLength: 200 })), content: Type.Optional(Type.String({ maxLength: 200_000 })), memory_type: Type.Optional(Type.Union([Type.Literal('context'), Type.Literal('result'), Type.Literal('intermediate'), Type.Literal('summary')])), memory_id: Type.Optional(Type.String({ maxLength: 200 })) });
const listAgentsParameters = Type.Object({ filter: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('builtin'), Type.Literal('custom')])) });
const runBuiltinAgentParameters = Type.Object({ agent_type: Type.String({ minLength: 1, maxLength: 100 }), prompt: Type.String({ minLength: 1, maxLength: 20_000 }), max_turns: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })), cwd: Type.Optional(Type.String({ maxLength: 4_000 })) });
const heartbeatParameters = Type.Object({ action: Type.Union([Type.Literal('view'), Type.Literal('update')]), content: Type.Optional(Type.String({ maxLength: 200_000 })) });
const scheduleParameters = Type.Union([Type.Object({ kind: Type.Literal('at'), at: Type.String({ minLength: 1, maxLength: 100 }) }), Type.Object({ kind: Type.Literal('every'), everyMs: Type.Integer({ minimum: 60_000 }), anchorMs: Type.Optional(Type.Integer()) }), Type.Object({ kind: Type.Literal('cron'), expr: Type.String({ minLength: 1, maxLength: 200 }), tz: Type.Optional(Type.String({ maxLength: 100 })) })]);
const cronParameters = Type.Object({ action: Type.Union([Type.Literal('list'), Type.Literal('add'), Type.Literal('update'), Type.Literal('remove'), Type.Literal('run')]), name: Type.Optional(Type.String({ maxLength: 200 })), description: Type.Optional(Type.String({ maxLength: 2_000 })), schedule: Type.Optional(scheduleParameters), message: Type.Optional(Type.String({ maxLength: 20_000 })), model: Type.Optional(Type.String({ maxLength: 200 })), modelProvider: Type.Optional(Type.String({ maxLength: 100 })), fulfillment: Type.Optional(Type.Union([Type.Literal('keep'), Type.Literal('once'), Type.Literal('ask')])), jobId: Type.Optional(Type.String({ maxLength: 200 })), enabled: Type.Optional(Type.Boolean()) });
const enterPlanModeParameters = Type.Object({ goal: Type.String({ minLength: 1, maxLength: 10_000 }), description: Type.Optional(Type.String({ maxLength: 20_000 })), constraints: Type.Optional(Type.Array(Type.String({ maxLength: 2_000 }), { maxItems: 100 })), output_format: Type.Optional(Type.Union([Type.Literal('markdown'), Type.Literal('structured'), Type.Literal('checklist')])) });
const exitPlanModeParameters = Type.Object({ action: Type.Union([Type.Literal('save'), Type.Literal('discard'), Type.Literal('show')]), plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const addPlanStepParameters = Type.Object({ description: Type.String({ minLength: 1, maxLength: 10_000 }), plan_id: Type.Optional(Type.String({ maxLength: 200 })), depends_on: Type.Optional(Type.Array(Type.String({ maxLength: 200 }), { maxItems: 100 })), notes: Type.Optional(Type.String({ maxLength: 10_000 })) });
const updatePlanStepParameters = Type.Object({ step_id: Type.String({ minLength: 1, maxLength: 200 }), status: Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed'), Type.Literal('skipped'), Type.Literal('failed')]), result: Type.Optional(Type.String({ maxLength: 20_000 })), plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const listPlanStepsParameters = Type.Object({ plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const createTodoParameters = Type.Object({ content: Type.String({ minLength: 1, maxLength: 10_000 }), priority: Type.Optional(Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])), notes: Type.Optional(Type.String({ maxLength: 10_000 })), plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const updateTodoParameters = Type.Object({ todo_id: Type.String({ minLength: 1, maxLength: 200 }), status: Type.Optional(Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed'), Type.Literal('failed'), Type.Literal('cancelled')])), content: Type.Optional(Type.String({ maxLength: 10_000 })), priority: Type.Optional(Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])), notes: Type.Optional(Type.String({ maxLength: 10_000 })), plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const listTodosParameters = Type.Object({ status: Type.Optional(Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed'), Type.Literal('failed'), Type.Literal('cancelled')])), plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const deleteTodoParameters = Type.Object({ todo_id: Type.String({ minLength: 1, maxLength: 200 }), plan_id: Type.Optional(Type.String({ maxLength: 200 })) });
const notebookReadParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }) });
const notebookCreateParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), kernel: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })) });
const notebookEditCellParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), cell_index: Type.Integer({ minimum: 0 }), new_source: Type.String({ maxLength: 1_000_000 }), cell_type: Type.Optional(Type.Union([Type.Literal('code'), Type.Literal('markdown')])) });
const notebookInsertCellParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), after_index: Type.Integer({ minimum: -1 }), cell_type: Type.Union([Type.Literal('code'), Type.Literal('markdown')]), source: Type.String({ maxLength: 1_000_000 }) });
const notebookDeleteCellParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_000 }), cell_index: Type.Integer({ minimum: 0 }) });
const mcpAuthSetParameters = Type.Object({ server_name: Type.String({ minLength: 1, maxLength: 200 }), type: Type.Union([Type.Literal('api_key'), Type.Literal('bearer'), Type.Literal('basic'), Type.Literal('oauth2'), Type.Literal('none')]), credential: Type.Optional(Type.String({ maxLength: 20_000 })), header_name: Type.Optional(Type.String({ maxLength: 200 })), key_prefix: Type.Optional(Type.String({ maxLength: 200 })) });
const mcpAuthGetParameters = Type.Object({ server_name: Type.Optional(Type.String({ maxLength: 200 })) });
const mcpAuthClearParameters = Type.Object({ server_name: Type.String({ minLength: 1, maxLength: 200 }) });
const mcpListResourcesParameters = Type.Object({ server: Type.Optional(Type.String({ maxLength: 200 })) });
const mcpReadResourceParameters = Type.Object({ uri: Type.String({ minLength: 1, maxLength: 4_000 }), server: Type.Optional(Type.String({ maxLength: 200 })) });
const taskCreateParameters = Type.Object({ name: Type.String({ minLength: 1, maxLength: 500 }), description: Type.Optional(Type.String({ maxLength: 20_000 })), metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())), prompt: Type.Optional(Type.String({ maxLength: 20_000 })), tools: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 })), model: Type.Optional(Type.String({ maxLength: 200 })) });
const taskGetParameters = Type.Object({ task_id: Type.String({ minLength: 1, maxLength: 200 }) });
const taskListParameters = Type.Object({ status: Type.Optional(Type.Union([Type.Literal('pending'), Type.Literal('running'), Type.Literal('completed'), Type.Literal('failed'), Type.Literal('cancelled')])) });
const taskStopParameters = Type.Object({ task_id: Type.String({ minLength: 1, maxLength: 200 }), reason: Type.Optional(Type.String({ maxLength: 2_000 })) });
const taskUpdateParameters = Type.Object({ task_id: Type.String({ minLength: 1, maxLength: 200 }), progress: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })), result: Type.Optional(Type.String({ maxLength: 20_000 })), metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())) });
const taskResultParameters = Type.Object({ task_id: Type.String({ minLength: 1, maxLength: 200 }) });
const memorySearchParameters = Type.Object({ query: Type.String({ minLength: 1, maxLength: 2_000 }), use_rag: Type.Optional(Type.Boolean()) });
const memoryGetParameters = Type.Object({ path: Type.String({ minLength: 1, maxLength: 500 }), from: Type.Optional(Type.Integer({ minimum: 1 })), lines: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })) });
const memoryUpdateParameters = Type.Object({ content: Type.Optional(Type.String({ maxLength: 200_000 })), action: Type.Optional(Type.Union([Type.Literal('append'), Type.Literal('edit'), Type.Literal('delete')])), file: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })), old_text: Type.Optional(Type.String({ maxLength: 200_000 })), new_text: Type.Optional(Type.String({ maxLength: 200_000 })) });
const workflowParameters = Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }), steps: Type.Array(Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }), tool: Type.String({ minLength: 1, maxLength: 200 }), input: Type.Record(Type.String(), Type.Unknown()), condition: Type.Optional(Type.String({ maxLength: 2_000 })), onError: Type.Optional(Type.Union([Type.Literal('skip'), Type.Literal('abort'), Type.Literal('retry')])) }), { minItems: 1, maxItems: 100 }), stopOnError: Type.Optional(Type.Boolean()) });

function getSessionState(context?: ExtensionContext): PlatformSwarmState {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === SWARM_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformSwarmState(entry?.data);
}

function appendSessionState(context: ExtensionContext | undefined, state: PlatformSwarmState): void {
  appendContextEntry(context, SWARM_ENTRY, state);
}

function getWatchlistState(context?: ExtensionContext): PlatformWatchlistState {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === WATCHLIST_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformWatchlistState(entry?.data);
}

function appendWatchlistState(context: ExtensionContext | undefined, state: PlatformWatchlistState): void {
  appendContextEntry(context, WATCHLIST_ENTRY, state);
}

function getPlanningState(context?: ExtensionContext): PlatformPlanningState {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === PLANNING_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformPlanningState(entry?.data);
}

function appendPlanningState(context: ExtensionContext | undefined, state: PlatformPlanningState): void {
  appendContextEntry(context, PLANNING_ENTRY, state);
}

function getTaskState(context?: ExtensionContext): PlatformTaskState {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === TASK_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformTaskState(entry?.data);
}

function appendTaskState(context: ExtensionContext | undefined, state: PlatformTaskState): void {
  appendContextEntry(context, TASK_ENTRY, state);
}

function getMessageState(context?: ExtensionContext): ReturnType<typeof createInitialPlatformMessageState> {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === MESSAGE_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformMessageState(entry?.data);
}

function appendMessageState(context: ExtensionContext | undefined, state: ReturnType<typeof createInitialPlatformMessageState>): void {
  appendContextEntry(context, MESSAGE_ENTRY, state);
}

function getAskState(context?: ExtensionContext): ReturnType<typeof createInitialPlatformAskState> {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === ASK_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformAskState(entry?.data);
}

function appendAskState(context: ExtensionContext | undefined, state: ReturnType<typeof createInitialPlatformAskState>): void {
  appendContextEntry(context, ASK_ENTRY, state);
}

function getAgentState(context?: ExtensionContext): ReturnType<typeof createInitialPlatformAgentState> {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === AGENT_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformAgentState(entry?.data);
}

function appendAgentState(context: ExtensionContext | undefined, state: ReturnType<typeof createInitialPlatformAgentState>): void {
  appendContextEntry(context, AGENT_ENTRY, state);
}

function getWorkflowState(context?: ExtensionContext): ReturnType<typeof createInitialPlatformWorkflowState> {
  const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === WORKFLOW_ENTRY;
  }) as { data?: unknown } | undefined;
  return parsePlatformWorkflowState(entry?.data);
}

function appendWorkflowState(context: ExtensionContext | undefined, state: ReturnType<typeof createInitialPlatformWorkflowState>): void {
  appendContextEntry(context, WORKFLOW_ENTRY, state);
}

function result(toolCallId: string, value: unknown, extra: Record<string, unknown> = {}) {
  const { isError, ...details } = extra;
  const evidence = { id: `pi-platform:${toolCallId}`, source: 'upup-pi://platform/swarm', retrievedAt: new Date().toISOString(), auditId: toolCallId };
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(isError ? { isError: true, details: undefined } : {}), details: { auditId: toolCallId, evidence: [evidence], ...details } };
}

function registerPlatformExtension(pi: ExtensionAPI, host: PlatformHost): void {
  if (host.contract !== 'upup.pi.host.v1' || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.sessionId || !host.capabilities.includes('tool-definitions')) return;
  const tools = host.providers.tools.getToolDefinitions({
    contract: 'upup.pi.host.v1',
    packageName: PACKAGE,
    packageVersion: VERSION,
    sessionId: host.sessionId,
    capability: 'tool-definitions',
  });
  const toolMetadata = host.providers.tools.getToolMetadata({
    contract: 'upup.pi.host.v1', packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions',
  });
  const skillRequest = { contract: 'upup.pi.host.v1' as const, packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions' as const };
  const loadSkillDefinitions = () => host.providers.tools.getSkillDefinitions?.(skillRequest) ?? [];
  for (const tool of tools) pi.registerTool(tool as never);
  const sessionHost = host;

  let state = createInitialPlatformSwarmState();
  let watchlistState = createInitialPlatformWatchlistState();
  let planningState = createInitialPlatformPlanningState();
  let taskState = createInitialPlatformTaskState();
  let messageState = createInitialPlatformMessageState();
  let askState = createInitialPlatformAskState();
  let agentState = createInitialPlatformAgentState();
  const taskAbortControllers = new Map<string, AbortController>();
  const readState = (context?: ExtensionContext) => { state = getSessionState(context); return state; };
  const readWatchlistState = (context?: ExtensionContext) => { watchlistState = getWatchlistState(context); return watchlistState; };
  const readPlanningState = (context?: ExtensionContext) => { planningState = getPlanningState(context); return planningState; };
  const readTaskState = (context?: ExtensionContext) => { taskState = getTaskState(context); return taskState; };
  const readMessageState = (context?: ExtensionContext) => { messageState = getMessageState(context); return messageState; };
  const readAskState = (context?: ExtensionContext) => { askState = getAskState(context); return askState; };
  const readAgentState = (context?: ExtensionContext) => { agentState = getAgentState(context); return agentState; };
  if (typeof pi.on === 'function') pi.on('session_start', (_event, context) => { readState(context); readWatchlistState(context); readPlanningState(context); readTaskState(context); readMessageState(context); readAskState(context); readAgentState(context); });

  pi.registerTool({ name: 'tool_search', label: 'Search Tools', description: TOOL_SEARCH_DESCRIPTION, parameters: toolSearchParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, { output: searchPlatformTools(toolMetadata, params) });
  } });
  pi.registerTool({ name: 'list_skills', label: 'List Skills', description: LIST_SKILLS_DESCRIPTION, parameters: listSkillsParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, listPlatformSkills(loadSkillDefinitions(), params.format));
  } });
  pi.registerTool({ name: 'search_skills', label: 'Search Skills', description: SEARCH_SKILLS_DESCRIPTION, parameters: searchSkillsParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, searchPlatformSkills(loadSkillDefinitions(), params.keyword));
  } });
  pi.registerTool({ name: 'get_skill', label: 'Get Skill', description: GET_SKILL_DESCRIPTION, parameters: getSkillParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, getPlatformSkill(loadSkillDefinitions(), params.name));
  } });
  pi.registerTool({ name: 'skill_info', label: 'Skill Info', description: SKILL_INFO_DESCRIPTION, parameters: skillInfoParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, getPlatformSkill(loadSkillDefinitions(), params.skill_name));
  } });
  pi.registerTool({ name: 'skill', label: 'Invoke Skill', description: SKILL_EXECUTE_DESCRIPTION, parameters: skillParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, invokePlatformSkill(loadSkillDefinitions(), params.skill, params.args));
  } });
  pi.registerTool({ name: 'execute_skill', label: 'Execute Skill', description: SKILL_EXECUTE_DESCRIPTION, parameters: executeSkillParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, invokePlatformSkill(loadSkillDefinitions(), params.skill_name, params.args));
  } });
  const filesystemTools = [
    { name: 'platformBash', label: 'Run Shell Command', description: 'Pi `core/tools/bash.ts` execution with the UpUp workspace command policy applied through `BashOperations`.', parameters: bashParameters, handler: platformBash },
    { name: 'read_file', label: 'Read File', description: 'Read a workspace file with safe pagination.', parameters: readFileParameters, handler: platformReadFile },
    { name: 'write_file', label: 'Write File', description: 'Create or atomically overwrite a workspace file.', parameters: writeFileParameters, handler: platformWriteFile },
    { name: 'edit_file', label: 'Edit File', description: 'Replace unique text in a workspace file.', parameters: editFileParameters, handler: platformEditFile },
    { name: 'glob', label: 'Find Files', description: 'Find workspace files matching a glob pattern.', parameters: globParameters, handler: platformGlob },
    { name: 'grep', label: 'Search Files', description: 'Search workspace file contents using a regular expression.', parameters: grepParameters, handler: platformGrep },
    { name: 'send_user_file', label: 'Send File', description: 'Copy a workspace file to a user destination.', parameters: sendUserFileParameters, handler: platformSendUserFile },
  ] as const;
  for (const tool of filesystemTools) {
    pi.registerTool({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters, async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try { return result(id, await tool.handler(params as never, context?.cwd ?? process.cwd())); }
      catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    } });
  }
  const memoryTools = [
    { name: 'memory_search', label: 'Search Memory', description: 'Search persistent memory with bounded keyword retrieval.', parameters: memorySearchParameters, handler: platformMemorySearch },
    { name: 'memory_get', label: 'Read Memory', description: 'Read an exact line range from persistent memory.', parameters: memoryGetParameters, handler: platformMemoryGet },
    { name: 'memory_update', label: 'Update Memory', description: 'Append, edit, or delete persistent memory entries.', parameters: memoryUpdateParameters, handler: platformMemoryUpdate },
  ] as const;
  for (const tool of memoryTools) {
    pi.registerTool({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters, async execute(id, params, signal) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try { return result(id, await tool.handler(params as never)); }
      catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    } });
  }
  pi.registerTool({ name: 'enter_plan_mode', label: 'Enter Plan Mode', description: 'Create a structured plan in the current Pi Session.', parameters: enterPlanModeParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const plan = createPlatformPlan({ goal: params.goal, description: params.description, constraints: params.constraints, outputFormat: params.output_format });
    planningState.plans.push(plan);
    planningState.currentPlanId = plan.id;
    appendPlanningState(context, planningState);
    return result(id, { plan_id: plan.id, goal: plan.goal, status: plan.status, message: 'Entered Plan Mode. Add steps, then save the plan with exit_plan_mode.' });
  } });
  pi.registerTool({ name: 'exit_plan_mode', label: 'Exit Plan Mode', description: 'Show, save, or discard the current Pi Session plan.', parameters: exitPlanModeParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const plan = getPlatformPlan(planningState, params.plan_id);
    if (!plan) return result(id, { error: 'No active plan. Use enter_plan_mode first.' }, { isError: true, details: undefined });
    if (params.action === 'discard') {
      planningState.plans = planningState.plans.filter((candidate) => candidate.id !== plan.id);
      planningState.todos = planningState.todos.filter((todo) => todo.planId !== plan.id);
      planningState.currentPlanId = planningState.plans.at(-1)?.id;
      appendPlanningState(context, planningState);
      return result(id, { plan_id: plan.id, status: 'discarded', goal: plan.goal });
    }
    if (params.action === 'save') { plan.status = 'active'; plan.updatedAt = new Date().toISOString(); appendPlanningState(context, planningState); }
    return result(id, { plan_id: plan.id, goal: plan.goal, status: plan.status, progress: platformPlanProgress(plan), steps: plan.steps });
  } });
  pi.registerTool({ name: 'add_plan_step', label: 'Add Plan Step', description: 'Add a dependency-aware step to the current Pi Session plan.', parameters: addPlanStepParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const plan = getPlatformPlan(planningState, params.plan_id);
    if (!plan) return result(id, { error: 'No active plan. Use enter_plan_mode first.' }, { isError: true, details: undefined });
    try { const step = addPlatformPlanStep(plan, { description: params.description, dependsOn: params.depends_on, notes: params.notes }); appendPlanningState(context, planningState); return result(id, { plan_id: plan.id, step, total_steps: plan.steps.length }); }
    catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'update_plan_step', label: 'Update Plan Step', description: 'Update a plan step status and result.', parameters: updatePlanStepParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const plan = getPlatformPlan(planningState, params.plan_id);
    if (!plan) return result(id, { error: 'No active plan. Use enter_plan_mode first.' }, { isError: true, details: undefined });
    if (!updatePlatformPlanStep(plan, params.step_id, params.status, params.result)) return result(id, { error: `Step not found: ${params.step_id}` }, { isError: true, details: undefined });
    appendPlanningState(context, planningState);
    return result(id, { plan_id: plan.id, step_id: params.step_id, status: params.status, progress: platformPlanProgress(plan) });
  } });
  pi.registerTool({ name: 'list_plan_steps', label: 'List Plan Steps', description: 'List steps and progress for a Pi Session plan.', parameters: listPlanStepsParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const plan = getPlatformPlan(planningState, params.plan_id);
    if (!plan) return result(id, { error: 'No active plan. Use enter_plan_mode first.' }, { isError: true, details: undefined });
    return result(id, { plan_id: plan.id, goal: plan.goal, status: plan.status, progress: platformPlanProgress(plan), steps: plan.steps });
  } });
  pi.registerTool({ name: 'create_todo', label: 'Create Todo', description: 'Create a persistent Todo in the current Pi Session.', parameters: createTodoParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const todo = createPlatformTodo({ content: params.content, priority: params.priority, notes: params.notes, planId: params.plan_id });
    planningState.todos.push(todo); appendPlanningState(context, planningState);
    const stats = platformTodoStats(listPlatformTodos(planningState, params.plan_id));
    return result(id, { todo, stats });
  } });
  pi.registerTool({ name: 'update_todo', label: 'Update Todo', description: 'Update a persistent Todo in the current Pi Session.', parameters: updateTodoParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context);
    const todo = updatePlatformTodo(planningState, params.todo_id, { status: params.status, content: params.content, priority: params.priority, notes: params.notes }, params.plan_id);
    if (!todo) return result(id, { error: `Todo not found: ${params.todo_id}` }, { isError: true, details: undefined });
    appendPlanningState(context, planningState); return result(id, { todo, stats: platformTodoStats(listPlatformTodos(planningState, params.plan_id)) });
  } });
  pi.registerTool({ name: 'list_todos', label: 'List Todos', description: 'List persistent Todos from the current Pi Session.', parameters: listTodosParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context); const todos = listPlatformTodos(planningState, params.plan_id, params.status);
    return result(id, { todos, stats: platformTodoStats(listPlatformTodos(planningState, params.plan_id)) });
  } });
  pi.registerTool({ name: 'delete_todo', label: 'Delete Todo', description: 'Delete a persistent Todo from the current Pi Session.', parameters: deleteTodoParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    planningState = getPlanningState(context); const todo = deletePlatformTodo(planningState, params.todo_id, params.plan_id);
    if (!todo) return result(id, { error: `Todo not found: ${params.todo_id}` }, { isError: true, details: undefined });
    appendPlanningState(context, planningState); return result(id, { deleted: todo, stats: platformTodoStats(listPlatformTodos(planningState, params.plan_id)) });
  } });
  const notebookTools = [
    { name: 'notebook_read', label: 'Read Notebook', description: 'Read a Jupyter notebook from the current Pi workspace.', parameters: notebookReadParameters, handler: platformNotebookRead },
    { name: 'notebook_create', label: 'Create Notebook', description: 'Create an empty Jupyter notebook in the current Pi workspace.', parameters: notebookCreateParameters, handler: platformNotebookCreate },
    { name: 'notebook_edit_cell', label: 'Edit Notebook Cell', description: 'Edit a Jupyter notebook cell in the current Pi workspace.', parameters: notebookEditCellParameters, handler: platformNotebookEditCell },
    { name: 'notebook_insert_cell', label: 'Insert Notebook Cell', description: 'Insert a Jupyter notebook cell in the current Pi workspace.', parameters: notebookInsertCellParameters, handler: platformNotebookInsertCell },
    { name: 'notebook_delete_cell', label: 'Delete Notebook Cell', description: 'Delete a Jupyter notebook cell in the current Pi workspace.', parameters: notebookDeleteCellParameters, handler: platformNotebookDeleteCell },
  ] as const;
  for (const tool of notebookTools) {
    pi.registerTool({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters, async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try { return result(id, await tool.handler(params as never, context?.cwd ?? process.cwd())); }
      catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    } });
  }
  pi.registerTool({ name: 'task_create', label: 'Create Task', description: 'Create a Session-scoped task, optionally executed by a Pi worker.', parameters: taskCreateParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    taskState = getTaskState(context);
    const task = createPlatformTask({ name: params.name, description: params.description, metadata: params.metadata });
    taskState.tasks.push(task); appendTaskState(context, taskState);
    if (params.prompt) {
      if (!sessionHost.capabilities.includes('agent-worker') || !sessionHost.providers.workers?.runAgentWorker) return result(id, { task, warning: 'agent-worker capability is unavailable; task remains pending', policy: 'fail-closed' });
      const controller = new AbortController(); taskAbortControllers.set(task.id, controller); updatePlatformTask(taskState, task.id, { status: 'running' }); appendTaskState(context, taskState);
      void sessionHost.providers.workers?.runAgentWorker({ agentId: task.id, name: params.name, role: 'background-task', prompt: params.prompt, tools: params.tools ?? '*', model: params.model }, controller.signal).then((worker) => {
        taskState = getTaskState(context); updatePlatformTask(taskState, task.id, { status: 'completed', result: worker.output, progress: 100 }); appendTaskState(context, taskState); taskAbortControllers.delete(task.id);
      }).catch((error: unknown) => {
        taskState = getTaskState(context); updatePlatformTask(taskState, task.id, { status: controller.signal?.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error) }); appendTaskState(context, taskState); taskAbortControllers.delete(task.id);
      });
    }
    return result(id, { task });
  } });
  pi.registerTool({ name: 'task_get', label: 'Get Task', description: 'Get a Session-scoped task status and result.', parameters: taskGetParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); taskState = getTaskState(context); const task = getPlatformTask(taskState, params.task_id); return task ? result(id, { task }) : result(id, { error: `Task not found: ${params.task_id}` }, { isError: true, details: undefined });
  } });
  pi.registerTool({ name: 'task_list', label: 'List Tasks', description: 'List Session-scoped tasks.', parameters: taskListParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); taskState = getTaskState(context); const tasks = listPlatformTasks(taskState, params.status); return result(id, { tasks, stats: platformTaskStats(listPlatformTasks(taskState)) });
  } });
  pi.registerTool({ name: 'task_stop', label: 'Stop Task', description: 'Stop a running Pi worker task.', parameters: taskStopParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); taskState = getTaskState(context); const task = getPlatformTask(taskState, params.task_id); if (!task) return result(id, { error: `Task not found: ${params.task_id}` }, { isError: true, details: undefined }); taskAbortControllers.get(task.id)?.abort(params.reason); updatePlatformTask(taskState, task.id, { status: 'cancelled', error: params.reason ?? 'Task stopped by user' }); appendTaskState(context, taskState); return result(id, { task });
  } });
  pi.registerTool({ name: 'task_update', label: 'Update Task', description: 'Update task progress, result, or metadata.', parameters: taskUpdateParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); taskState = getTaskState(context); const current = getPlatformTask(taskState, params.task_id); if (!current) return result(id, { error: `Task not found: ${params.task_id}` }, { isError: true, details: undefined }); const task = updatePlatformTask(taskState, params.task_id, { progress: params.progress, result: params.result, metadata: params.metadata ? { ...current.metadata, ...params.metadata } : undefined }); appendTaskState(context, taskState); return result(id, { task });
  } });
  pi.registerTool({ name: 'task_result', label: 'Get Task Result', description: 'Get the result of a Session-scoped background task.', parameters: taskResultParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); taskState = getTaskState(context); const task = getPlatformTask(taskState, params.task_id); if (!task) return result(id, { error: `Task not found: ${params.task_id}` }, { isError: true, details: undefined }); return result(id, { task, output: task.result, error: task.error });
  } });
  pi.registerTool({ name: 'mcp_auth_set', label: 'Set MCP Auth', description: 'Store local MCP server authentication with credentials masked in output.', parameters: mcpAuthSetParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, await platformMcpAuthSet(params)); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'mcp_auth_get', label: 'Get MCP Auth', description: 'Inspect MCP authentication metadata without exposing credentials.', parameters: mcpAuthGetParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, await platformMcpAuthGet(params)); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'mcp_auth_clear', label: 'Clear MCP Auth', description: 'Remove local MCP server authentication.', parameters: mcpAuthClearParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, await platformMcpAuthClear(params)); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'list_mcp_resources', label: 'List MCP Resources', description: 'List resources from the current Session MCP host.', parameters: mcpListResourcesParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    if (!sessionHost.capabilities.includes('mcp-resources') || !sessionHost.providers.mcp?.listMcpResources) return result(id, { error: 'mcp-resources capability is unavailable' }, { isError: true, capability: 'mcp-resources', policy: 'fail-closed' });
    try { return result(id, await platformMcpListResources(params, (server) => sessionHost.providers.mcp!.listMcpResources!(server, signal))); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'read_mcp_resource', label: 'Read MCP Resource', description: 'Read a resource through the current Session MCP host.', parameters: mcpReadResourceParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    if (!sessionHost.capabilities.includes('mcp-resources') || !sessionHost.providers.mcp?.readMcpResource) return result(id, { error: 'mcp-resources capability is unavailable' }, { isError: true, capability: 'mcp-resources', policy: 'fail-closed' });
    try { return result(id, await platformMcpReadResource(params, (uri, server) => sessionHost.providers.mcp!.readMcpResource!(uri, server, signal))); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'heartbeat', label: 'Manage Heartbeat', description: 'View or update the persistent heartbeat checklist and synchronize its gateway settings.', parameters: heartbeatParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, await platformHeartbeat(params)); }
    catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'sleep', label: 'Sleep', description: PLATFORM_SLEEP_DESCRIPTION, parameters: sleepParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, await platformSleep(params, signal)); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'monitor', label: 'Monitor System', description: PLATFORM_MONITOR_DESCRIPTION, parameters: monitorParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, { metric: params.metric ?? 'all', output: platformMonitor(params.metric ?? 'all') }); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'send_message', label: 'Send Message', description: 'Send a message to another Pi agent, task, or broadcast recipient and persist it in the current Session.', parameters: sendMessageParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const current = context ? readMessageState(context) : messageState;
    const messageId = randomUUID();
    const message = { id: messageId, from: params.from?.trim() || 'main-agent', to: params.to.trim(), type: params.type ?? 'request', content: params.content, timestamp: Date.now(), ...(params.task_id ? { taskId: params.task_id } : {}) } as const;
    messageState = appendPlatformMessage(current, message);
    appendMessageState(context, messageState);
    return result(id, { success: true, message: messageState.messages.at(-1), recipient: message.to, persisted: Boolean(context?.sessionManager) });
  } });
  pi.registerTool({ name: 'snip_tool', label: 'Snip Context', description: 'Analyze and compact low-value confirmation messages from the current Pi Session context.', parameters: snipParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const messages = readSessionMessages(context) as readonly { role?: string; content: string | readonly unknown[] }[];
    const options = { preserveFirstN: params.preserve_first ?? 1, preserveLastN: params.preserve_last ?? 2, maxRemove: params.max_remove ?? 10 };
    const preview = platformSnipMessages(messages, options);
    const savings = estimatePlatformSnipSavings(messages);
    const recommended = shouldPlatformSnip(messages, params.threshold ?? 3);
    if (params.dry_run ?? false) return result(id, { mode: 'dry_run', total: messages.length, would_remove: preview.removed, removed_indices: preview.removedIndices, estimated_tokens_saved: savings.estimatedTokensSaved, recommended });
    if (!recommended || preview.removed === 0) return result(id, { mode: 'noop', total: messages.length, removed: 0, estimated_tokens_saved: 0, recommended, message: 'No compaction requested: the current context does not contain enough low-value messages.' });
    if (!context?.compact) return result(id, { error: 'Pi compaction capability is unavailable; snip_tool is fail-closed' }, { isError: true, capability: 'compact', policy: 'fail-closed' });
    context.compact({ customInstructions: `Preserve the first ${options.preserveFirstN} and last ${options.preserveLastN} messages. Remove low-value confirmations and acknowledgments when safe. Do not remove financial evidence, tool results, user requirements, decisions, assumptions, or risk statements.` });
    return result(id, { mode: 'compact_requested', total: messages.length, candidate_removals: preview.removed, estimated_tokens_saved: savings.estimatedTokensSaved, recommended });
  } });
  pi.registerTool({ name: 'ask_confirm', label: 'Ask Confirmation', description: 'Ask the user for a yes/no confirmation through the current Pi UI.', parameters: askConfirmParameters, executionMode: 'sequential', async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    if (!context?.hasUI) return result(id, { error: 'Pi UI is unavailable; ask_confirm is fail-closed' }, { isError: true, capability: 'ui', policy: 'fail-closed' });
    const requestId = randomUUID();
    const value = await context.ui.confirm('Confirmation required', params.question, { signal, timeout: params.timeout });
    const response = { requestId, question: params.question, kind: 'confirm' as const, value: value ? 'yes' : 'no', skipped: false, timestamp: Date.now() };
    askState = appendPlatformAskResponse(context ? getAskState(context) : askState, response);
    appendAskState(context, askState);
    return result(id, { request_id: requestId, value: response.value, confirmed: value, skipped: false });
  } });
  pi.registerTool({ name: 'ask_select', label: 'Ask Selection', description: 'Ask the user to select one option through the current Pi UI.', parameters: askSelectParameters, executionMode: 'sequential', async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    if (!context?.hasUI) return result(id, { error: 'Pi UI is unavailable; ask_select is fail-closed' }, { isError: true, capability: 'ui', policy: 'fail-closed' });
    const requestId = randomUUID();
    const labels = params.options.map((option) => `${option.label}${option.recommended ? ' (recommended)' : ''}`);
    const selected = await context.ui.select(params.header ? `${params.header}: ${params.question}` : params.question, labels, { signal, timeout: params.timeout });
    const index = selected ? labels.indexOf(selected) : -1;
    const option = index >= 0 ? params.options[index] : undefined;
    const response = { requestId, question: params.question, kind: 'select' as const, ...(option ? { value: option.value } : {}), skipped: !option, timestamp: Date.now() };
    askState = appendPlatformAskResponse(context ? getAskState(context) : askState, response);
    appendAskState(context, askState);
    return result(id, { request_id: requestId, ...(option ? { value: option.value, label: option.label } : {}), skipped: !option });
  } });
  pi.registerTool({ name: 'ask_multi_select', label: 'Ask Multiple Selection', description: 'Ask the user to select multiple options through the current Pi UI.', parameters: askMultiSelectParameters, executionMode: 'sequential', async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    if (!context?.hasUI) return result(id, { error: 'Pi UI is unavailable; ask_multi_select is fail-closed' }, { isError: true, capability: 'ui', policy: 'fail-closed' });
    const minimum = params.min_selections ?? 0;
    const maximum = Math.min(params.max_selections ?? params.options.length, params.options.length);
    if (minimum > maximum) return result(id, { error: 'min_selections cannot exceed max_selections' }, { isError: true, details: undefined });
    const requestId = randomUUID();
    const selectedValues = new Set<string>();
    let cancelled = false;
    while (selectedValues.size < maximum) {
      const choices = [...params.options.filter((option) => !selectedValues.has(option.value)).map((option) => `${option.label}`), ...(selectedValues.size >= minimum ? ['Done'] : []), 'Cancel'];
      const selected = await context.ui.select(params.header ? `${params.header}: ${params.question}` : params.question, choices, { signal, timeout: params.timeout });
      if (!selected || selected === 'Cancel') { cancelled = true; break; }
      if (selected === 'Done') break;
      const option = params.options.find((candidate) => candidate.label === selected && !selectedValues.has(candidate.value));
      if (option) selectedValues.add(option.value);
    }
    const response = { requestId, question: params.question, kind: 'multi_select' as const, value: [...selectedValues], skipped: cancelled || selectedValues.size < minimum, timestamp: Date.now() };
    askState = appendPlatformAskResponse(context ? getAskState(context) : askState, response);
    appendAskState(context, askState);
    return result(id, { request_id: requestId, value: response.value, skipped: response.skipped, min_selections: minimum, max_selections: maximum });
  } });
  pi.registerTool({ name: 'ask_input', label: 'Ask Input', description: 'Ask the user for free-form text through the current Pi UI.', parameters: askInputParameters, executionMode: 'sequential', async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    if (!context?.hasUI) return result(id, { error: 'Pi UI is unavailable; ask_input is fail-closed' }, { isError: true, capability: 'ui', policy: 'fail-closed' });
    const requestId = randomUUID();
    const value = await context.ui.input(params.question, params.placeholder, { signal, timeout: params.timeout });
    const resolved = value?.trim() || params.default_value;
    const response = { requestId, question: params.question, kind: 'input' as const, ...(resolved !== undefined ? { value: resolved } : {}), skipped: resolved === undefined, timestamp: Date.now() };
    askState = appendPlatformAskResponse(context ? getAskState(context) : askState, response);
    appendAskState(context, askState);
    return result(id, { request_id: requestId, ...(resolved !== undefined ? { value: resolved } : {}), skipped: resolved === undefined });
  } });
  pi.registerTool({ name: 'ask_response', label: 'Submit Ask Response', description: 'Read or persist a response for a Pi Session-scoped ask request.', parameters: askResponseParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const current = context ? getAskState(context) : askState;
    const existing = getPlatformAskResponse(current, params.request_id);
    if (existing) return result(id, { request_id: params.request_id, value: existing.value, skipped: existing.skipped, already_submitted: true });
    if (!params.skip && !params.value) return result(id, { error: 'value is required unless skip=true' }, { isError: true, details: undefined });
    const value = params.value?.includes(',') ? params.value.split(',').map((item) => item.trim()).filter(Boolean) : params.value;
    const response = { requestId: params.request_id, question: 'Submitted through ask_response', kind: Array.isArray(value) ? 'multi_select' as const : 'input' as const, ...(value !== undefined ? { value } : {}), skipped: params.skip === true, timestamp: Date.now() };
    askState = appendPlatformAskResponse(current, response);
    appendAskState(context, askState);
    return result(id, { request_id: params.request_id, ...(value !== undefined ? { value } : {}), skipped: response.skipped, already_submitted: false });
  } });
  const runAgent = async (agentId: string, name: string, role: string, prompt: string, tools: readonly string[] | '*', model: string | undefined, background: boolean, context: PlatformContext | undefined, signal: AbortSignal | undefined) => {
    if (!sessionHost.capabilities.includes('agent-worker') || !sessionHost.providers.workers?.runAgentWorker) throw new Error('agent-worker capability is unavailable; agent execution is fail-closed');
    const current = context ? getAgentState(context) : agentState;
    agentState = createPlatformAgent(current, { id: agentId, name, role, prompt, tools, ...(model ? { model } : {}), createdAt: Date.now() });
    agentState = updatePlatformAgent(agentState, agentId, { status: 'running' });
    appendAgentState(context, agentState);
    const execute = sessionHost.providers.workers?.runAgentWorker!({ agentId, name, role, prompt, tools, ...(model ? { model } : {}) }, signal).then((worker) => {
      agentState = updatePlatformAgent(getAgentState(context), agentId, { status: 'completed', output: worker.output, sessionId: worker.sessionId });
      appendAgentState(context, agentState);
      return worker;
    }).catch((error: unknown) => {
      agentState = updatePlatformAgent(getAgentState(context), agentId, { status: signal?.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error) });
      appendAgentState(context, agentState);
      throw error;
    });
    if (background) { void execute; return { agentId, status: 'running' as const }; }
    const worker = await execute;
    return { agentId, status: 'completed' as const, output: worker.output, sessionId: worker.sessionId };
  };
  pi.registerTool({ name: 'agent', label: 'Spawn Pi Agent', description: 'Spawn a foreground or background Pi worker in the current Session.', parameters: agentParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try { return result(id, await runAgent(randomUUID(), params.description, params.subagent_type ?? 'general', params.prompt, params.tools?.length === 1 && params.tools[0] === '*' ? '*' : params.tools ?? '*', params.model, params.run_in_background ?? false, context, signal), { capability: 'agent-worker' }); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, capability: 'agent-worker', policy: 'fail-closed' }); }
  } });
  pi.registerTool({ name: 'fork_subagent', label: 'Fork Pi Subagent', description: 'Run a Pi worker with recent current Session context inherited.', parameters: forkSubagentParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const parentMessages = readSessionMessages(context) as readonly { role?: string; content?: unknown }[];
    const inherited = parentMessages.slice(-8).map((message: unknown) => JSON.stringify(message)).join('\n');
    try { return result(id, await runAgent(randomUUID(), 'forked-subagent', 'fork', `Inherited recent Pi Session context:\n${inherited}\n\nTask:\n${params.prompt}`, params.tools ?? '*', undefined, false, context, signal), { capability: 'agent-worker' }); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, capability: 'agent-worker', policy: 'fail-closed' }); }
  } });
  pi.registerTool({ name: 'resume_agent', label: 'Resume Pi Agent', description: 'Resume a paused Pi agent recorded in the current Session.', parameters: resumeAgentParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const current = context ? getAgentState(context) : agentState;
    const agent = getPlatformAgent(current, params.task_id);
    if (!agent || agent.status !== 'paused') return result(id, { error: `No paused task found for: ${params.task_id}` }, { isError: true, details: undefined });
    try { return result(id, await runAgent(agent.id, agent.name, agent.role, `${agent.checkpoint ?? agent.prompt}\n\nContinue from the paused state.\n${params.additional_prompt ?? ''}`, agent.tools, agent.model, false, context, signal), { capability: 'agent-worker' }); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, capability: 'agent-worker', policy: 'fail-closed' }); }
  } });
  pi.registerTool({ name: 'agent_memory', label: 'Agent Memory', description: 'Store, retrieve, list, or clear memory in the current Pi Session.', parameters: agentMemoryParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const current = context ? getAgentState(context) : agentState;
    const agentId = params.agent_id ?? 'main-agent';
    if (params.action === 'store') {
      if (!params.content) return result(id, { error: 'content is required for store action' }, { isError: true, details: undefined });
      agentState = addPlatformAgentMemory(current, { id: randomUUID(), agentId, content: params.content, type: params.memory_type ?? 'intermediate', createdAt: Date.now() }); appendAgentState(context, agentState); return result(id, { stored: true, agent_id: agentId, memory: agentState.memories.at(-1) });
    }
    if (params.action === 'clear') { agentState = { ...current, memories: current.memories.filter((memory) => memory.agentId !== agentId) }; appendAgentState(context, agentState); return result(id, { cleared: true, agent_id: agentId }); }
    if (params.action === 'list') return result(id, { agent_id: agentId, memories: listPlatformAgentMemories(current, agentId) });
    const memory = current.memories.find((item) => item.id === params.memory_id);
    if (!memory) return result(id, { error: `Memory not found: ${params.memory_id ?? ''}` }, { isError: true, details: undefined });
    return result(id, { memory });
  } });
  pi.registerTool({ name: 'list_agents', label: 'List Pi Agents', description: 'List built-in Pi agent profiles and Session agents.', parameters: listAgentsParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const current = context ? getAgentState(context) : agentState;
    return result(id, { builtins: params.filter === 'custom' ? [] : PLATFORM_BUILTIN_AGENTS, agents: params.filter === 'builtin' ? [] : listPlatformAgents(current) });
  } });
  pi.registerTool({ name: 'run_builtin_agent', label: 'Run Built-in Pi Agent', description: 'Run a trusted built-in Pi agent profile through the worker capability.', parameters: runBuiltinAgentParameters, async execute(id, params, signal, _onUpdate, context) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    const builtin = PLATFORM_BUILTIN_AGENTS.find((candidate) => candidate.name === params.agent_type);
    if (!builtin) return result(id, { error: `Unknown agent type: ${params.agent_type}` }, { isError: true, details: undefined });
    try { return result(id, await runAgent(randomUUID(), builtin.name, builtin.name, `${builtin.systemPrompt}\n\nTask:\n${params.prompt}`, builtin.tools, undefined, false, context, signal), { capability: 'agent-worker' }); } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, capability: 'agent-worker', policy: 'fail-closed' }); }
  } });
  pi.registerTool({ name: 'cron', label: 'Manage Cron Jobs', description: 'Create, list, update, remove, or run Pi-backed scheduled jobs.', parameters: cronParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try {
      const runCronJob = sessionHost.providers.scheduling?.runCronJob;
      const runner = sessionHost.capabilities.includes('cron-runner') && runCronJob ? (request: { job: PlatformCronJob }, abortSignal?: AbortSignal) => runCronJob({ job: request.job }, abortSignal) : undefined;
      return result(id, await platformCron(params, runner, signal));
    } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
  } });
  pi.registerTool({ name: 'tool_get', label: 'Get Tool Details', description: TOOL_GET_DESCRIPTION, parameters: toolGetParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, { output: getPlatformTool(toolMetadata, params.name) });
  } });
  pi.registerTool({ name: 'tool_list', label: 'List Tools', description: TOOL_LIST_DESCRIPTION, parameters: toolListParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    return result(id, { output: listPlatformTools(toolMetadata, params) });
  } });
  pi.registerTool({ name: 'export_data', label: 'Export Data', description: 'Export analysis rows to a local CSV or JSON file.', parameters: exportDataParameters, async execute(id, params, signal) {
    if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
    try {
      return result(id, await exportPlatformData({ data: params.data as readonly Record<string, PlatformExportCell>[], filename: params.filename, format: params.format }));
    } catch (error) {
      return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined });
    }
  } });

  pi.registerTool({
    name: 'create_worktree', label: 'Create Worktree', description: 'Create a git worktree for isolated development.', parameters: createWorktreeParameters,
    async execute(id, params, signal) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try { return result(id, { type: 'Worktree Created', ...(await createPlatformWorktree(params)) }); }
      catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    },
  });
  pi.registerTool({
    name: 'remove_worktree', label: 'Remove Worktree', description: 'Remove a git worktree; the current worktree cannot be removed.', parameters: removeWorktreeParameters,
    async execute(id, params, signal) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try { return result(id, { type: 'Worktree Removed', ...(await removePlatformWorktree(params)) }); }
      catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    },
  });
  pi.registerTool({
    name: 'list_worktree', label: 'List Worktrees', description: 'List git worktrees in the current repository.', parameters: listWorktreeParameters,
    async execute(id, params, signal) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      const worktrees = await listPlatformWorktrees();
      const current = await currentPlatformWorktree();
      return result(id, { type: params.format === 'detailed' ? 'Worktree List (Detailed)' : 'Worktree List', count: worktrees.length, worktrees: worktrees.map((worktree) => ({ ...worktree, isCurrent: worktree.path === current })) });
    },
  });

  pi.registerTool({
    name: 'add_to_watchlist', label: 'Add to Watchlist', description: 'Add a symbol to the current Pi Session watchlist.', parameters: watchlistEntryParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try {
        const next = addPlatformWatchlistEntry(context ? readWatchlistState(context) : watchlistState, params, new Date().toISOString());
        watchlistState = next.state;
        appendWatchlistState(context, watchlistState);
        return result(id, { success: next.added, symbol: next.symbol, message: next.added ? `Added ${next.symbol} to watchlist` : `${next.symbol} is already in watchlist` });
      } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    },
  });
  pi.registerTool({
    name: 'remove_from_watchlist', label: 'Remove from Watchlist', description: 'Remove a symbol from the current Pi Session watchlist.', parameters: watchlistSymbolParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try {
        const next = removePlatformWatchlistEntry(context ? readWatchlistState(context) : watchlistState, params.symbol, new Date().toISOString());
        watchlistState = next.state;
        appendWatchlistState(context, watchlistState);
        return result(id, { success: next.removed, symbol: next.symbol, message: next.removed ? `Removed ${next.symbol} from watchlist` : `${next.symbol} not in watchlist` });
      } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    },
  });
  pi.registerTool({
    name: 'get_watchlist', label: 'Get Watchlist', description: 'List symbols and alerts from the current Pi Session watchlist.', parameters: watchlistListParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      const entries = listPlatformWatchlistEntries(context ? readWatchlistState(context) : watchlistState, params.tag);
      return result(id, { count: entries.length, entries, message: `Found ${entries.length} symbols in watchlist${params.tag ? ` tagged "${params.tag}"` : ''}` });
    },
  });
  pi.registerTool({
    name: 'add_watchlist_alert', label: 'Add Watchlist Alert', description: 'Add a price alert to a current Pi Session watchlist symbol.', parameters: watchlistAlertParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try {
        const next = addPlatformWatchlistAlert(context ? readWatchlistState(context) : watchlistState, { symbol: params.symbol, type: params.type, value: params.value, ...(params.reference_price !== undefined ? { referencePrice: params.reference_price } : {}) }, new Date().toISOString());
        if (!next.added) return result(id, { success: false, symbol: next.symbol, error: `${next.symbol} not in watchlist` }, { isError: true, details: undefined });
        watchlistState = next.state;
        appendWatchlistState(context, watchlistState);
        return result(id, { success: true, symbol: next.symbol, alert: next.alert });
      } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    },
  });
  pi.registerTool({
    name: 'check_watchlist_alerts', label: 'Check Watchlist Alerts', description: 'Evaluate current prices against alerts in the Pi Session watchlist.', parameters: watchlistCheckParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      const next = checkPlatformWatchlistAlerts(context ? readWatchlistState(context) : watchlistState, params.prices, new Date().toISOString());
      watchlistState = next.state;
      if (next.triggered.length > 0) appendWatchlistState(context, watchlistState);
      return result(id, { triggeredCount: next.triggered.length, triggered: next.triggered, message: next.triggered.length > 0 ? `⚠️ ${next.triggered.length} alert(s) triggered!` : 'No alerts triggered' });
    },
  });
  pi.registerTool({
    name: 'clear_watchlist_alert', label: 'Clear Watchlist Alert', description: 'Clear a watchlist alert by symbol and zero-based index.', parameters: watchlistClearParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      try {
        const next = clearPlatformWatchlistAlert(context ? readWatchlistState(context) : watchlistState, { symbol: params.symbol, alertIndex: params.alert_index }, new Date().toISOString());
        if (!next.cleared) return result(id, { success: false, symbol: next.symbol, error: 'watchlist entry or alert index not found' }, { isError: true, details: undefined });
        watchlistState = next.state;
        appendWatchlistState(context, watchlistState);
        return result(id, { success: true, symbol: next.symbol, alert_index: params.alert_index });
      } catch (error) { return result(id, { error: error instanceof Error ? error.message : String(error) }, { isError: true, details: undefined }); }
    },
  });
  pi.registerTool({
    name: 'export_watchlist', label: 'Export Watchlist', description: 'Export the current Pi Session watchlist to a local CSV or JSON file.', parameters: exportWatchlistParameters,
    async execute(id, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined });
      const current = context ? readWatchlistState(context) : watchlistState;
      const format = params.format ?? 'csv';
      const includeAlerts = params.include_alerts ?? true;
      const entries = listPlatformWatchlistEntries(current);
      if (entries.length === 0) return result(id, { status: 'empty', message: 'No watchlist data to export' });
      const outputDirectory = join(process.cwd(), '.upup', 'exports');
      await mkdir(outputDirectory, { recursive: true });
      const filePath = join(outputDirectory, `watchlist_${Date.now()}.${format}`);
      await writeFile(filePath, serializePlatformWatchlist(current, format, includeAlerts), 'utf8');
      return result(id, { status: 'success', format, filePath, symbols: entries.length, alerts: entries.reduce((total, entry) => total + (includeAlerts ? entry.alerts.length : 0), 0) });
    },
  });
  pi.registerTool({ name: 'lsp_complete', label: 'LSP Complete', description: 'Get code completions at a file position.', parameters: lspPositionParameters, async execute(id, params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); return result(id, { output: formatPlatformLspCompletions(await getPlatformLspClient().complete(params.uri, params.line, params.column)) }); } });
  pi.registerTool({ name: 'lsp_definition', label: 'LSP Definition', description: 'Find definitions at a file position.', parameters: lspPositionParameters, async execute(id, params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); return result(id, { output: formatPlatformLspDefinitions(await getPlatformLspClient().definition(params.uri, params.line, params.column)) }); } });
  pi.registerTool({ name: 'lsp_references', label: 'LSP References', description: 'Find references at a file position.', parameters: lspReferencesParameters, async execute(id, params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); return result(id, { output: formatPlatformLspReferences(await getPlatformLspClient().references(params.uri, params.line, params.column)) }); } });
  pi.registerTool({ name: 'lsp_hover', label: 'LSP Hover', description: 'Get hover information at a file position.', parameters: lspPositionParameters, async execute(id, params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); return result(id, { output: formatPlatformLspHover(await getPlatformLspClient().hover(params.uri, params.line, params.column)) }); } });
  pi.registerTool({ name: 'lsp_diagnostics', label: 'LSP Diagnostics', description: 'Get diagnostics for a file.', parameters: lspDiagnosticsParameters, async execute(id, params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, { isError: true, details: undefined }); return result(id, { output: formatPlatformLspDiagnostics(await getPlatformLspClient().diagnostics(params.uri)) }); } });

  pi.registerTool({
    name: 'run_workflow', label: 'Run Pi Workflow', description: 'Prepare an ordered multi-step investment or data workflow and persist it in the current Pi Session journal.', parameters: workflowParameters, executionMode: 'sequential',
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(toolCallId, { error: 'request aborted' }, { isError: true, details: undefined });
      const steps = params.steps.map((step) => ({
        name: step.name,
        tool: step.tool,
        input: step.input,
        ...(step.condition === undefined ? {} : { condition: step.condition }),
        ...(step.onError === undefined ? {} : { onError: step.onError }),
      }));
      const current = getWorkflowState(context);
      const plan = createPlatformWorkflowPlan({ id: randomUUID(), name: params.name, steps, stopOnError: params.stopOnError ?? true });
      appendWorkflowState(context, addPlatformWorkflowPlan(current, plan));
      return result(toolCallId, {
        type: 'Workflow Plan',
        id: plan.id,
        name: plan.name,
        stepCount: plan.steps.length,
        steps: plan.steps.map((step, index) => ({ index: index + 1, name: step.name, tool: step.tool, hasCondition: Boolean(step.condition), onError: step.onError ?? 'abort' })),
        stopOnError: plan.stopOnError,
        status: plan.status,
        message: `Workflow "${plan.name}" prepared with ${plan.steps.length} steps. Execute steps sequentially using the specified Pi tools.`,
        instructions: 'Execute each step in order, passing results from previous steps as needed.',
      }, { workflowId: plan.id });
    },
  });

  pi.registerTool({
    name: 'swarm_team_create', label: 'Create Pi Team', description: 'Create a collaboration team in the current Pi Session journal.', parameters: teamCreateParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(toolCallId, { error: 'request aborted' }, { isError: true, details: undefined });
      const current = context ? readState(context) : state;
      const name = params.team_name.trim();
      if (current.teams.some((team) => team.name === name)) return result(toolCallId, { error: `team already exists: ${name}` }, { isError: true, details: undefined });
      state = createPlatformSwarmTeam(current, { name, description: params.description, agentType: params.agent_type }, Date.now(), randomUUID());
      appendSessionState(context, state);
      return result(toolCallId, { team_name: name, lead_agent_id: state.teams.at(-1)?.lead });
    },
  });

  pi.registerTool({
    name: 'swarm_agent_spawn', label: 'Spawn Pi Agent', description: 'Spawn a real Pi worker session in a current-session team.', parameters: agentSpawnParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      const current = context ? readState(context) : state;
      if (signal?.aborted) return result(toolCallId, { error: 'request aborted' }, { isError: true, details: undefined });
      if (!current.teams.some((team) => team.name === params.team_name)) return result(toolCallId, { error: `team not found: ${params.team_name}` }, { isError: true, details: undefined });
      if (!sessionHost.capabilities.includes('agent-worker') || !sessionHost.providers.workers?.runAgentWorker) return result(toolCallId, { error: 'agent-worker capability is unavailable; swarm_agent_spawn is fail-closed' }, { isError: true, capability: 'agent-worker', policy: 'fail-closed' });
      const agentId = randomUUID();
      state = addPlatformSwarmAgent(current, { id: agentId, teamName: params.team_name, name: params.agent_name, role: params.role }, Date.now());
      appendSessionState(context, state);
      void sessionHost.providers.workers?.runAgentWorker({ agentId, name: params.agent_name, role: params.role, prompt: params.prompt, tools: params.tools ?? '*', model: params.model }, signal).then((worker) => {
        state = updatePlatformSwarmAgent(state, agentId, { status: 'completed', result: worker.output, completedAt: Date.now() }, Date.now());
        appendSessionState(context, state);
      }).catch((error: unknown) => {
        state = updatePlatformSwarmAgent(state, agentId, { status: signal?.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error), completedAt: Date.now() }, Date.now());
        appendSessionState(context, state);
      });
      return result(toolCallId, { agent_id: agentId, team_name: params.team_name, status: 'pending' }, { capability: 'agent-worker' });
    },
  });

  pi.registerTool({
    name: 'swarm_agent_message', label: 'Send Pi Agent Message', description: 'Persist a message between Pi workers in the current Session journal.', parameters: agentMessageParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(toolCallId, { error: 'request aborted' }, { isError: true, details: undefined });
      const current = context ? readState(context) : state;
      const next = addPlatformSwarmMessage(current, { from: params.from_agent, to: params.to_agent, content: params.message, timestamp: Date.now() });
      if (next === current) return result(toolCallId, { success: false, delivered: false }, { isError: true, details: undefined });
      state = next; appendSessionState(context, state); return result(toolCallId, { success: true, delivered: true });
    },
  });

  pi.registerTool({
    name: 'swarm_agent_results', label: 'List Pi Agent Results', description: 'List Pi worker results from the current Session journal.', parameters: agentResultsParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(toolCallId, { error: 'request aborted' }, { isError: true, details: undefined });
      const current = context ? readState(context) : state;
      return result(toolCallId, { team_name: params.team_name, agents: current.agents.filter((agent) => agent.teamName === params.team_name && (!params.agent_id || agent.id === params.agent_id)) });
    },
  });

  pi.registerTool({
    name: 'swarm_team_list', label: 'List Pi Teams', description: 'List collaboration teams from the current Pi Session journal.', parameters: Type.Object({}),
    async execute(toolCallId, _params, signal, _onUpdate, context) {
      if (signal?.aborted) return result(toolCallId, { error: 'request aborted' }, { isError: true, details: undefined });
      const current = context ? readState(context) : state;
      return result(toolCallId, { teams: current.teams.map((team) => ({ name: team.name, description: team.description, member_count: team.members.length, status: team.status, created_at: new Date(team.createdAt).toISOString() })) });
    },
  });}

export default function platformExtension(pi: ExtensionAPI): void {
  // Sprint D: self-publish the platform capability host. The host declares
  // the cross-cutting capabilities (agent-worker, cron-runner, mcp-resources)
  // and exposes metadata. Session-level provider implementations (runCronJob,
  // runAgentWorker, etc.) are still injected by the orchestrator — both
  // publishers coexist and last-write-wins.
  definePiCapabilityHost(pi, {
    packageName: PACKAGE,
    packageVersion: VERSION,
    capabilities: ['agent-worker', 'cron-runner', 'mcp-resources'],
    providers: {},
    register: () => undefined,
  });

  let initialized = false;
  const initialize = (host: PlatformHost | undefined): void => {
    if (initialized || !host) return;
    initialized = true;
    registerPlatformExtension(pi, host);
  };
  initialize(resolvePiCapabilityHost<PlatformHost>(pi.events, PACKAGE, undefined));
  if (typeof pi.on === 'function') {
    pi.on('session_start', (_event, context) => {
      initialize(resolvePiCapabilityHost<PlatformHost>(pi.events, PACKAGE, context.sessionManager.getSessionId()));
    });
  } else {
    initialize(resolvePiCapabilityHost<PlatformHost>(pi.events, PACKAGE, undefined));
  }
}
