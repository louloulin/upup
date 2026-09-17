/**
 * Pi Event Coverage Extension — plan §1.2.
 *
 * Subscribes the high-value Pi canonical events that the existing
 * UpUp packages had not yet wired. Each handler is intentionally cheap
 * (no I/O, no LLM call) — they only persist audit breadcrumbs so the
 * rest of the stack can reason about the session lifecycle.
 *
 * Why this lives in pi-investment-workflow and not pi-platform: every
 * event here is part of a `/invest` flow, a plan resume, or an
 * investment review. Plan §1.2 explicitly groups the events under the
 * workflow domain so the event-router test can colocate with the
 * orchestration logic it covers.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
/** Names of the events this extension subscribes. Exported so the
 *  event-coverage guard script can count what is wired. */
export declare const PI_EVENT_COVERAGE_EVENTS: readonly ["session_before_switch", "session_before_fork", "session_compact", "session_compact_failed", "session_tree", "agent_start", "agent_end", "agent_settled", "ui_prompt_start", "turn_start", "turn_end", "message_start", "message_update", "message_end", "before_provider_request", "after_provider_response", "context", "tool_execution_start", "tool_execution_end", "thinking_level_select"];
export type PiEventCoverageEvent = (typeof PI_EVENT_COVERAGE_EVENTS)[number];
export default function piEventCoverageExtension(pi: ExtensionAPI): void;
//# sourceMappingURL=pi-event-coverage.d.ts.map