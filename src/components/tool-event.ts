import { Container, Spacer, Text, type TUI } from '@mariozechner/pi-tui';
import type { ApprovalDecision } from '../agent/types.js';
import { theme } from '../theme.js';
import { subscribeSpinner, SPINNER_INTERVAL_MS } from '../utils/spinner.js';

const CIRCLE = '⏺';

// Module-level pending approval decision — set when user presses Enter/Esc
// before the approval UI is rendered. Cleared when consumePendingApprovalDecision runs.
let _pendingApprovalDecision: ApprovalDecision | null = null;

export function setPendingApprovalDecision(decision: ApprovalDecision): void {
  _pendingApprovalDecision = decision;
}

export function consumePendingApprovalDecision(): ApprovalDecision | null {
  const d = _pendingApprovalDecision;
  _pendingApprovalDecision = null;
  return d;
}

function formatToolName(name: string): string {
  const stripped = name.replace(/^(get)_/, '');
  return stripped
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function truncateAtWord(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  const lastSpace = str.lastIndexOf(' ', maxLength);
  if (lastSpace > maxLength * 0.5) {
    return `${str.slice(0, lastSpace)}...`;
  }
  return `${str.slice(0, maxLength)}...`;
}

function formatArgs(tool: string, args: Record<string, unknown>): string {
  if ('query' in args) {
    const query = String(args.query);
    return theme.muted(`"${truncateAtWord(query, 60)}"`);
  }
  if (tool === 'memory_update') {
    const text = String(args.content ?? args.old_text ?? '').replace(/\n/g, ' ');
    if (text) return theme.muted(truncateAtWord(text, 80));
  }
  return theme.muted(
    Object.entries(args)
      .map(([key, value]) => `${key}=${truncateAtWord(String(value).replace(/\n/g, '\\n'), 60)}`)
      .join(', '),
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function approvalLabel(decision: ApprovalDecision): string {
  switch (decision) {
    case 'allow-once':
      return 'Approved';
    case 'allow-session':
      return 'Approved (session)';
    case 'deny':
      return 'Denied';
  }
}

const MAX_SUB_AGENT_DETAILS = 6;
const SUB_AGENT_INDENT = '  ';

export class ToolEventComponent extends Container {
  private readonly header: Text;
  private readonly toolTitle: string;
  private completedDetails: Text[] = [];
  private activeDetail: Text | null = null;
  private subAgentDetails: Text[] = [];
  private unsubscribeSpinner: (() => void) | null = null;
  private blinkVisible: boolean = true;
  private blinkCounter: number = 0;

  constructor(_tui: TUI, tool: string, args: Record<string, unknown>) {
    super();
    this.addChild(new Spacer(1));
    this.toolTitle = `${formatToolName(tool)}${args ? `${theme.muted('(')}${formatArgs(tool, args)}${theme.muted(')')}` : ''}`;
    this.header = new Text(`${theme.success(CIRCLE)} ${this.toolTitle}`, 0, 0);
    this.addChild(this.header);
  }

  setActive(progressMessage?: string) {
    this.clearDetail();
    // Pulsing circle: blink the header circle using the shared spinner clock
    this.blinkCounter = 0;
    this.blinkVisible = true;
    this.header.setText(`${theme.success(CIRCLE)} ${this.toolTitle}`);
    // Toggle visibility every ~600ms regardless of the spinner tick rate.
    const ticksPerHalfPeriod = Math.max(1, Math.round(600 / SPINNER_INTERVAL_MS));
    this.unsubscribeSpinner = subscribeSpinner(() => {
      this.blinkCounter++;
      if (this.blinkCounter % ticksPerHalfPeriod === 0) {
        this.blinkVisible = !this.blinkVisible;
        const circle = this.blinkVisible ? theme.success(CIRCLE) : ' ';
        this.header.setText(`${circle} ${this.toolTitle}`);
      }
    });
    if (progressMessage) {
      this.activeDetail = new Text(`${theme.muted('⎿  ')}${progressMessage}`, 0, 0);
      this.addChild(this.activeDetail);
    }
  }

  setComplete(summary: string, duration: number) {
    this.clearDetail();
    this.header.setText(`${theme.primary(CIRCLE)} ${this.toolTitle}`);
    const detail = new Text(
      `${theme.muted('⎿  ')}${summary}${theme.muted(` in ${formatDuration(duration)}`)}`,
      0,
      0
    );
    this.completedDetails.push(detail);
    this.addChild(detail);
  }

  setError(error: string) {
    this.clearDetail();
    // Solid red circle
    this.header.setText(`${theme.error(CIRCLE)} ${this.toolTitle}`);
    const detail = new Text(`${theme.muted('⎿  ')}${theme.error(`Error: ${truncateAtWord(error, 80)}`)}`, 0, 0);
    this.completedDetails.push(detail);
    this.addChild(detail);
  }

  setLimitWarning(warning?: string) {
    this.clearDetail();
    this.activeDetail = new Text(
      `${theme.muted('⎿  ')}${theme.warning(truncateAtWord(warning || 'Approaching suggested limit', 100))}`,
      0,
      0,
    );
    this.addChild(this.activeDetail);
  }

  setDenied(path: string, tool: string) {
    this.clearDetail();
    this.header.setText(`${theme.error(CIRCLE)} ${this.toolTitle}`);
    const action = tool === 'write_file' ? 'write to' : tool === 'edit_file' ? 'edit of' : tool;
    const detail = new Text(`${theme.muted('⎿  ')}${theme.warning(`User denied ${action} ${path}`)}`, 0, 0);
    this.completedDetails.push(detail);
    this.addChild(detail);
  }

  setApproval(decision: ApprovalDecision) {
    this.clearDetail();
    const color = decision !== 'deny' ? theme.primary : theme.warning;
    const circle = decision !== 'deny' ? theme.success(CIRCLE) : theme.error(CIRCLE);
    this.header.setText(`${circle} ${this.toolTitle}`);
    const detail = new Text(`${theme.muted('⎿  ')}${color(approvalLabel(decision))}`, 0, 0);
    this.completedDetails.push(detail);
    this.addChild(detail);
  }

  /**
   * Show an inline approval prompt in the chat.
   * The user can press 1/2/3 + Enter or click in the editor.
   */
  setApprovalPending(onSelect: (decision: ApprovalDecision) => void, preStoredDecision?: ApprovalDecision | null) {
    this.clearDetail();
    this.header.setText(`${theme.warning('⏺')} ${this.toolTitle}`);

    const line1 = new Text(
      `${theme.muted('⎿  ')}${theme.warning('Permission required')}`,
      0, 0,
    );
    const line2 = new Text(
      `${theme.muted('⎿  ')}  ${theme.muted('1.')} Yes  ${theme.muted('2.')} Yes, allow all this session  ${theme.muted('3.')} No`,
      0, 0,
    );
    const line3 = new Text(
      `${theme.muted('⎿  ')}${theme.muted('Enter to confirm · esc to deny')}`,
      0, 0,
    );
    this.addChild(line1);
    this.addChild(line2);
    this.addChild(line3);

    // Store callback so the editor can call it
    (this as any)._approvalCallback = onSelect;

    // If user already pressed Enter/Esc before this UI was rendered,
    // their decision was stored in preStoredDecision — invoke onSelect immediately.
    const pending = preStoredDecision ?? consumePendingApprovalDecision();
    if (pending !== null) {
      onSelect(pending);
    }
  }

  /**
   * Get the stored approval callback (set by setApprovalPending).
   */
  getApprovalCallback(): ((decision: ApprovalDecision) => void) | null {
    return (this as any)._approvalCallback ?? null;
  }

  /**
   * Add an indented sub-agent detail line (e.g., "→ read_file()").
   * Accumulates up to MAX_SUB_AGENT_DETAILS lines, removing the oldest
   * when the limit is exceeded.
   */
  addSubAgentDetail(message: string) {
    const detail = new Text(`${theme.muted('⎿  ')}${theme.muted(SUB_AGENT_INDENT + message)}`, 0, 0);
    this.subAgentDetails.push(detail);
    this.addChild(detail);

    // Trim oldest if over limit
    if (this.subAgentDetails.length > MAX_SUB_AGENT_DETAILS) {
      const oldest = this.subAgentDetails.shift()!;
      this.removeChild(oldest);
    }
  }

  dispose() {
    this.clearDetail();
    this.clearSubAgentDetails();
  }

  private clearDetail() {
    if (this.unsubscribeSpinner) {
      this.unsubscribeSpinner();
      this.unsubscribeSpinner = null;
    }
    if (this.activeDetail) {
      this.removeChild(this.activeDetail);
      this.activeDetail = null;
    }
  }

  private clearSubAgentDetails() {
    for (const detail of this.subAgentDetails) {
      this.removeChild(detail);
    }
    this.subAgentDetails = [];
  }
}
