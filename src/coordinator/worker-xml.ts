/**
 * Worker XML Injection Protocol — `<task-notification>`.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D2)
 *      + analysis-comprehensive.md (Sprint 2.1.3)
 *
 * When a Worker (technical-analysis, fundamental-analysis, capital-flow,
 * sentiment-analysis, or any future role) finishes, the result is wrapped
 * in a `<task-notification>` XML block and injected into the Coordinator's
 * conversation. The Coordinator reads these blocks, NOT the raw Worker
 * output, so the 4-phase protocol has a stable wire format.
 *
 * Format (attribute on `<task-notification>` are the stable fields; child
 * elements are the bulk content):
 *
 *   <task-notification task-id="..." worker-role="..." status="completed"
 *                      attempts="1">
 *     <summary>one-line summary</summary>
 *     <result>... full worker text ...</result>
 *     <artifacts>
 *       <artifact path="..." kind="chart"/>
 *     </artifacts>
 *     <usage>
 *       <total_tokens>1234</total_tokens>
 *       <duration_ms>5000</duration_ms>
 *     </usage>
 *     <verification ok="true" notes="all checks passed"/>
 *   </task-notification>
 *
 * The parser is intentionally narrow: it only knows the schema above, no
 * general XML. That keeps the dependency surface at zero and the tests
 * small. We escape `<>&"'` in text content; attributes are double-quoted.
 */

export type TaskStatus = 'completed' | 'failed' | 'killed' | 'timeout';

export type ArtifactKind = 'report' | 'code' | 'data' | 'chart' | 'log';

export interface TaskNotification {
  taskId: string;
  workerRole: string;
  status: TaskStatus;
  attempts: number;
  summary: string;
  result: string;
  artifacts: Array<{ path: string; kind: ArtifactKind }>;
  usage: { totalTokens: number; durationMs: number };
  verification?: { ok: boolean; notes?: string };
}

// ---------------------------------------------------------------------------
// XML escaping
// ---------------------------------------------------------------------------

function escapeText(s: string): string {
  // Order matters: & must be replaced first so we don't double-escape the
  // entities below it.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

function attr(name: string, value: string | number | boolean): string {
  return ` ${name}="${escapeAttr(String(value))}"`;
}

export function serializeTaskNotification(n: TaskNotification): string {
  const head =
    '<task-notification' +
    attr('task-id', n.taskId) +
    attr('worker-role', n.workerRole) +
    attr('status', n.status) +
    attr('attempts', n.attempts) +
    '>';

  const summary = `<summary>${escapeText(n.summary)}</summary>`;
  const result = `<result>${escapeText(n.result)}</result>`;

  let artifacts = '<artifacts></artifacts>';
  if (n.artifacts.length > 0) {
    const items = n.artifacts
      .map((a) => `<artifact${attr('path', a.path)}${attr('kind', a.kind)}/>`)
      .join('');
    artifacts = `<artifacts>${items}</artifacts>`;
  }

  const usage =
    `<usage>` +
    `<total_tokens>${n.usage.totalTokens}</total_tokens>` +
    `<duration_ms>${n.usage.durationMs}</duration_ms>` +
    `</usage>`;

  let verification = '';
  if (n.verification) {
    verification =
      `<verification${attr('ok', n.verification.ok)}` +
      (n.verification.notes ? attr('notes', n.verification.notes) : '') +
      `/>`;
  }

  return `${head}${summary}${result}${artifacts}${usage}${verification}</task-notification>`;
}

// ---------------------------------------------------------------------------
// Parse (narrow: only the schema above)
// ---------------------------------------------------------------------------

const OPEN_RE = /<task-notification\b([^>]*)>([\s\S]*?)<\/task-notification>/g;

function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    out[m[1]!] = unescape(m[2]!);
  }
  return out;
}

function matchChild(body: string, name: string): string | null {
  // Non-greedy, no nesting assumption (children are flat in this schema).
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
  const m = body.match(re);
  return m ? unescape(m[1]!) : null;
}

function matchChildren(body: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*\\/?>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function parseArtifactTag(tag: string): { path: string; kind: ArtifactKind } | null {
  const m = tag.match(/<artifact\b([^>]*?)\/?>/);
  if (!m) return null;
  const a = parseAttrs(m[1]!);
  if (!a['path'] || !a['kind']) return null;
  return { path: a['path'], kind: a['kind'] as ArtifactKind };
}

function parseVerificationTag(body: string): { ok: boolean; notes?: string } | undefined {
  const m = body.match(/<verification\b([^>]*?)\/>/);
  if (!m) return undefined;
  const a = parseAttrs(m[1]!);
  return {
    ok: a['ok'] === 'true',
    notes: a['notes'],
  };
}

const KNOWN_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'completed',
  'failed',
  'killed',
  'timeout',
]);

const KNOWN_ARTIFACT_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'report',
  'code',
  'data',
  'chart',
  'log',
]);

export function parseTaskNotification(xml: string): TaskNotification {
  const m = xml.match(/<task-notification\b([^>]*)>([\s\S]*?)<\/task-notification>/);
  if (!m) throw new Error('worker-xml: missing <task-notification> root');
  const attrs = parseAttrs(m[1]!);
  const body = m[2]!;

  const status = attrs['status'];
  if (!status || !KNOWN_STATUSES.has(status as TaskStatus)) {
    throw new Error(`worker-xml: bad status "${status}"`);
  }
  const role = attrs['worker-role'];
  if (!role) throw new Error('worker-xml: missing worker-role');
  const taskId = attrs['task-id'];
  if (!taskId) throw new Error('worker-xml: missing task-id');

  const summary = matchChild(body, 'summary') ?? '';
  const result = matchChild(body, 'result') ?? '';

  // artifacts
  const artifacts: Array<{ path: string; kind: ArtifactKind }> = [];
  const artMatch = body.match(/<artifacts>([\s\S]*?)<\/artifacts>/);
  if (artMatch) {
    for (const tag of matchChildren(artMatch[1]!, 'artifact')) {
      const a = parseArtifactTag(tag);
      if (a && KNOWN_ARTIFACT_KINDS.has(a.kind)) artifacts.push(a);
    }
  }

  // usage
  const usageMatch = body.match(/<usage>([\s\S]*?)<\/usage>/);
  let totalTokens = 0;
  let durationMs = 0;
  if (usageMatch) {
    const tt = matchChild(usageMatch[1]!, 'total_tokens');
    const dm = matchChild(usageMatch[1]!, 'duration_ms');
    totalTokens = tt ? Number.parseInt(tt, 10) || 0 : 0;
    durationMs = dm ? Number.parseInt(dm, 10) || 0 : 0;
  }

  return {
    taskId,
    workerRole: role,
    status: status as TaskStatus,
    attempts: Number.parseInt(attrs['attempts'] ?? '1', 10) || 1,
    summary,
    result,
    artifacts,
    usage: { totalTokens, durationMs },
    verification: parseVerificationTag(body),
  };
}

/**
 * Extract every `<task-notification>` block from a larger text (e.g. a
 * Coordinator's full conversation buffer). Order is preserved; overlapping
 * or malformed blocks are skipped silently — callers can detect skips by
 * comparing input length vs. sum of block lengths.
 */
export function extractTaskNotifications(text: string): TaskNotification[] {
  const out: TaskNotification[] = [];
  // Reset the global regex state before each call so concurrent / repeated
  // use doesn't share lastIndex.
  OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_RE.exec(text)) !== null) {
    try {
      // Re-parse via parseTaskNotification so we get a single, consistent
      // codepath. m[0] is the full block including <task-notification> tags.
      out.push(parseTaskNotification(m[0]));
    } catch {
      // Skip malformed blocks. The caller can still count via raw <task-
      // notification> in the input if it needs a "missed" signal.
    }
  }
  return out;
}

/**
 * Convenience: wrap a structured Worker result (e.g. a ResearchResult) into
 * the XML envelope and return the rendered block. Useful as the final
 * step in `WorkerExecutor.runResearch` so the Coordinator sees XML, not
 * raw JSON.
 */
export function wrapWorkerResult(input: {
  taskId: string;
  workerRole: string;
  status?: TaskStatus;
  attempts?: number;
  summary: string;
  result: string;
  artifacts?: Array<{ path: string; kind: ArtifactKind }>;
  usage?: { totalTokens: number; durationMs: number };
  verification?: { ok: boolean; notes?: string };
}): string {
  return serializeTaskNotification({
    taskId: input.taskId,
    workerRole: input.workerRole,
    status: input.status ?? 'completed',
    attempts: input.attempts ?? 1,
    summary: input.summary,
    result: input.result,
    artifacts: input.artifacts ?? [],
    usage: input.usage ?? { totalTokens: 0, durationMs: 0 },
    verification: input.verification,
  });
}
