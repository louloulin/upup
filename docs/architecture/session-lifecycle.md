# Pi5 Session Lifecycle and Migration

This document records how UpUp production Sessions are produced, persisted,
read back, migrated from legacy storage, audited, and retired. The single
authoritative format is the Pi JSONL Session; UpUp metadata is layered on top
via Pi custom entries.

## Session write path

```mermaid
flowchart LR
  Q[User prompt / API call]
  Q --> F[PiAgentSessionFactory]
  F --> S[Pi AgentSession]
  S --> C[custom entry: upup_session_metadata]
  S --> R[Pi runtime turn]
  R --> J[Pi JSONL append]
  C --> J
  R --> C2[custom entry: upup_session_lifecycle]
  C2 --> J
  J --> FS[(.upup/sessions/*.jsonl)]
```

The Pi runtime owns the JSONL append. UpUp only writes two kinds of custom
entries: `upup_session_metadata` (project, tag, first prompt, customTitle) and
`upup_session_lifecycle` (state, lastActivity). Both are tiny key/value blobs,
never used to smuggle tool results or large research content.

## Session read path

```mermaid
flowchart LR
  CLI[CLI / stdio / SDK / Gateway]
  CLI -->|getSessionManager| SP[StatePort]
  SP --> PSS[PiSessionService.list]
  PSS --> SM[Pi SessionManager.list]
  SM --> FS[(.upup/sessions/*.jsonl)]
  SM --> PSS
  PSS -->|id / customTitle / firstPrompt| SP
  SP --> CLI
```

`StatePort.getSessionManager().listSessions(limit)` is now a pure pass-through
to `PiSessionService.list(cwd)` followed by a slice. There is no second
session store in production.

## Migration from legacy UpUp JSON / JSONL

```mermaid
flowchart TB
  L[(legacy UpUp JSON / JSONL)]
  L --> M[migrate-to-pi CLI]
  M --> R[read-only source file]
  R --> H[hash + manifest]
  M --> N[Pi JSONL writer]
  N --> FS[(.upup/sessions/*.jsonl)]
  M --> MR[migration report]
  M --> B[(backup dir)]
  H --> MR
  N --> MR
```

Rules enforced by the migrator:

- Source file is opened read-only; the original is never overwritten.
- Each converted file produces a hash + migration report.
- `parentUuid` is mapped to Pi `parentId`; tool `toolUseId` is preserved
  in the custom details of the Pi tool call entry.
- `context_collapse_snapshot` becomes a Pi compaction entry; the legacy
  summary is preserved as a custom `upup_compaction_legacy` entry.
- `file_history_snapshot` is externalized as a custom entry referencing the
  snapshot file in `.upup/runs/<runId>/`.
- Migration can be replayed from the report; failure of any record aborts the
  whole file and leaves the original untouched.

## Session operations

| Operation | Path | Notes |
|---|---|---|
| List | `PiSessionService.list(cwd)` | Returns Pi session summaries |
| Create | `PiSessionService.create({cwd, firstPrompt})` | New Pi AgentSession |
| Resume | `PiSessionService.resume(id)` | Reuses persisted JSONL |
| Fork | `PiSessionService.fork(id, entryId?)` | Native Pi tree fork |
| Compact | `PiSessionService.compact(id, instructions?)` | Native Pi compaction |
| Rename | `PiSessionService.rename(id, title)` | Custom metadata + session info |
| Tag | `PiSessionService.tag(id, tag)` | Custom metadata |
| Remove | `PiSessionService.remove(id)` | Unlinks JSONL + drops cache |
| Export | `PiSessionService.exportSession(id, jsonl/html)` | Native Pi export |

## Concurrent writer policy

Only the Pi runtime writes the JSONL. UpUp custom entries are appended via
`session.appendEntry()` and serialized by Pi's own append loop, so concurrent
calls from the CLI and stdio are linearly serialized at the file level.

## Crash and recovery invariants

- A Pi Session file always opens in a recoverable state: a partial trailing
  line is discarded on read.
- `reliability.test.ts` exercises dispose + reopen, asserting
  message continuity and freshness within fixture budgets.
- Legacy sessions are read-only after migration: any subsequent edits go
  through Pi.
