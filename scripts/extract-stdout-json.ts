/**
 * Extract the single top-level JSON object a verification worker prints to
 * stdout.
 *
 * Verification workers are spawned as OS-level child processes, so their
 * stdout also carries anything the process prints while booting — most
 * notably the dotenv banner emitted by `@upup/utils`. That banner ends in a
 * "tip" drawn at random from 16 candidates, and 6 of them embed braces
 * (e.g. `⚙️  suppress all logs with { quiet: true }`).
 *
 * A naive `indexOf('{')` therefore sliced from *inside* a log line and handed
 * `JSON.parse` a malformed blob, which made the cross-process policy audit
 * smoke fail on most runs for reasons unrelated to the audited behaviour.
 *
 * Anchor on an opening brace that constitutes a line of its own instead: every
 * producer here pretty-prints with `JSON.stringify(value, null, 2)`, so the
 * payload's first line is exactly `{` and log output can never be mistaken for
 * payload.
 *
 * `T` is the *unvalidated* shape of the payload; callers must narrow the
 * fields they depend on (each consumer below asserts its own `schema`).
 */
export function extractStdoutJson<T extends object>(raw: string, label: string): T {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${label} produced empty stdout`);
  const firstBrace = trimmed.search(/^\{[ \t]*$/m);
  if (firstBrace < 0) {
    throw new Error(`${label} produced no JSON object: ${trimmed.slice(0, 200)}`);
  }
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace <= firstBrace) {
    throw new Error(`${label} produced a truncated JSON object: ${trimmed.slice(firstBrace, firstBrace + 200)}`);
  }
  const blob = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    // SAFETY: this helper only locates the blob; `JSON.parse` cannot know the
    // shape, and each caller validates the fields it reads before using them.
    return JSON.parse(blob) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} produced unparsable JSON (${detail}): ${blob.slice(0, 200)}`);
  }
}
