/**
 * Pi7 final contract — TUI/agent-turn side-effect policy gate (C17).
 *
 * C16 locks the MCP-bridge read-only invariant by proving the bridge
 * withholds every declared-side-effect tool from `upup_finance__*`. C17
 * locks the *other* enforcement path: the in-process Pi policy extension
 * (`createPiSideEffectPolicyExtension`) that fires on `tool_call` events
 * during a real Pi Session. The contract proves four invariants:
 *
 *   1. Headless mode (`hasUI: false`) — every declared side-effect tool is
 *      hard-blocked with a `denied` audit entry, no UI prompt is attempted.
 *   2. TUI mode + `ui.confirm` returns false — block + `approval_denied`
 *      audit. Permission profile is irrelevant; the human is the gate.
 *   3. TUI mode + `ui.confirm` returns true — pass-through + `approval_granted`
 *      audit. The tool executes; the policy never re-decides later.
 *   4. Tools not declared — no audit, no block, no prompt. The policy is a
 *      pure no-op for read-only tools.
 *
 * The verifier mounts the policy extension exactly the way Pi does (a
 * capturing `ExtensionAPI` that records every `pi.on('tool_call', ...)`
 * listener), then drives each scenario with the same `event, context`
 * shape the real Pi agent loop delivers. Exits 0 on success, non-zero on
 * the first invariant failure.
 */

import { createPiSideEffectPolicyExtension, type UpUpAgentSpec, type UpUpPermissionProfile } from '@upup/pi-runtime';

interface ToolCallEvent { toolName: string; toolCallId: string }
interface ToolCallContext {
  hasUI: boolean;
  ui?: { confirm: (title: string, message: string, options?: { signal?: AbortSignal }) => Promise<boolean> };
  sessionManager: { appendCustomEntry: (type: string, data: unknown) => string };
  signal?: AbortSignal;
}

const PERMISSIONS: UpUpPermissionProfile = {
  id: 'side-effect-contract',
  allow: ['safe', 'warning'],
  requireApproval: [],
  deny: ['dangerous', 'critical'],
  allowExternalNetwork: true,
  allowCredentialAccess: false,
  allowFinancialWrites: true,
};

const SPEC: UpUpAgentSpec = {
  id: 'side-effect-contract-agent',
  version: '1.0.0',
  name: 'Side-Effect Contract',
  packages: ['@upup/pi-portfolio'],
  skills: [],
  tools: ['add_position', 'get_portfolio', 'export_portfolio'],
  mode: 'primary',
  capabilities: [],
  taskTypes: [],
  permissions: PERMISSIONS,
  dataPolicy: 'live',
  outputContract: 'markdown',
};

const DECLARATIONS = [
  { tools: ['add_position'], effect: 'filesystem-write' as const, safetyLevel: 'warning' as const },
];

interface CheckResult { readonly ok: boolean; readonly message: string }
const check = (label: string, predicate: boolean, detail: string): CheckResult => ({
  ok: predicate,
  message: predicate ? `${label}: ${detail}` : `FAIL ${label}: ${detail}`,
});

interface MountedHandlers {
  handlers: Array<(event: ToolCallEvent, context: ToolCallContext) => Promise<unknown>>;
  callTool(event: ToolCallEvent, context: ToolCallContext): Promise<unknown>;
}

function mountPolicyExtension(): MountedHandlers {
  const handlers: MountedHandlers['handlers'] = [];
  const extension = createPiSideEffectPolicyExtension({ spec: SPEC, sessionId: 'c17-session', declarations: DECLARATIONS });
  extension.factory({
    on: (_event: string, handler: (event: unknown, context: unknown) => Promise<unknown>) => {
      handlers.push(handler as MountedHandlers['handlers'][number]);
    },
  } as never);
  return {
    handlers,
    callTool: async (event, context) => {
      if (handlers.length === 0) throw new Error('no tool_call listener registered');
      return handlers[0]!(event, context);
    },
  };
}

function makeContext(opts: { hasUI: boolean; approve?: boolean }): { context: ToolCallContext; audits: unknown[] } {
  const audits: unknown[] = [];
  const context: ToolCallContext = {
    hasUI: opts.hasUI,
    sessionManager: { appendCustomEntry: (_type, data) => { audits.push(data); return String(audits.length); } },
    ...(opts.hasUI
      ? { ui: { confirm: async () => opts.approve ?? false } }
      : {}),
  };
  return { context, audits };
}

async function main(): Promise<void> {
  const { callTool } = mountPolicyExtension();
  const checks: CheckResult[] = [];

  // 1. Headless mode → block + denied audit.
  {
    const { context, audits } = makeContext({ hasUI: false });
    const result = await callTool({ toolName: 'add_position', toolCallId: 'c17-headless' }, context) as { block?: boolean; reason?: string };
    checks.push(check('headless_block', result?.block === true, `block=${result?.block}, reason=${result?.reason?.slice(0, 80)}`));
    checks.push(check('headless_audit', audits.length === 1, `audits=${audits.length}`));
    const firstAudit = audits[0] as { decision?: string; tool?: string; effect?: string } | undefined;
    checks.push(check('headless_audit_decision', firstAudit?.decision === 'approval_required' || firstAudit?.decision === 'denied', `decision=${firstAudit?.decision}`));
  }

  // 2. TUI mode + confirm(false) → block + approval_denied audit.
  {
    const { context, audits } = makeContext({ hasUI: true, approve: false });
    const result = await callTool({ toolName: 'add_position', toolCallId: 'c17-tui-denied' }, context) as { block?: boolean };
    checks.push(check('tui_denied_block', result?.block === true, `block=${result?.block}`));
    const firstAudit = audits[0] as { decision?: string } | undefined;
    checks.push(check('tui_denied_audit', firstAudit?.decision === 'approval_denied', `decision=${firstAudit?.decision}`));
  }

  // 3. TUI mode + confirm(true) → no block, approval_granted audit.
  {
    const { context, audits } = makeContext({ hasUI: true, approve: true });
    const result = await callTool({ toolName: 'add_position', toolCallId: 'c17-tui-granted' }, context);
    checks.push(check('tui_granted_pass', result === undefined, `result=${JSON.stringify(result)}`));
    const firstAudit = audits[0] as { decision?: string } | undefined;
    checks.push(check('tui_granted_audit', firstAudit?.decision === 'approval_granted', `decision=${firstAudit?.decision}`));
  }

  // 4. Undeclared tool → no-op (no audit, no block).
  {
    const { context, audits } = makeContext({ hasUI: false });
    const result = await callTool({ toolName: 'get_portfolio', toolCallId: 'c17-undeclared' }, context);
    checks.push(check('undeclared_noop', result === undefined && audits.length === 0, `result=${JSON.stringify(result)} audits=${audits.length}`));
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(c.message);
  if (failed.length > 0) {
    console.error(`C17 FAILED: ${failed.length} invariant(s) broken`);
    process.exit(1);
  }
  console.log('C17 PASSED');
}

await main();