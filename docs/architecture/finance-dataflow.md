# Pi5 Financial Data Flow

This document records how a single investment query propagates through the Pi
runtime, the UpUp domain adapter, the finance data layer, and back into the
session / report / audit pipeline.

## End-to-end flow

```mermaid
flowchart TB
  Q[Investment question / CLI input]
  Q --> WI[Intent detector]
  WI --> AR[UpUpAgentSpec resolver]
  AR --> PI[PiAgentSessionFactory]
  PI --> PS[Pi AgentSession]
  PS --> PROMPT[before_agent_start]
  PROMPT --> CTX[context injection<br/>watchlist / plan / risk state]
  CTX --> LLM[Model call]
  LLM --> TC[Pi tool call]
  TC --> PL[UpUp tool policy]
  PL -->|safe| TA[Tool adapter]
  PL -->|warning| TA
  PL -->|dangerous| AP[Approval gate]
  AP -->|allow| TA
  PL -->|critical| AP2[Per-call approval + audit]
  AP2 -->|allow| TA
  TA --> DA[Finance adapter<br/>Tushare / AKShare / Eastmoney / SEC / Exa / Tavily]
  DA --> DS[Data source]
  DS --> NM[Normalize + freshness + tz]
  NM --> EV[Evidence record]
  EV --> RR[Tool result text + details]
  RR --> AU[Audit log + telemetry]
  RR --> SES[Pi JSONL session]
  SES --> ST[Stream events]
  ST --> UI[Ink UI / SDK / stdio]
  ST --> RD[Report composer]
  RD --> REP[Markdown report + evidence index]
  SES --> COMP[Compaction<br/>finance-aware summary]
```

## Evidence and freshness contract

Every tool result must carry, at minimum:

- `auditId`: stable across session lifecycle, links evidence to telemetry.
- `source`: data source identifier (`tushare`, `akshare`, `eastmoney`,
  `sec-edgar`, `exa`, `tavily`, `local-fixture`, ...).
- `retrievedAt`: ISO timestamp at which the upstream call returned.
- `asOf`: timestamp the data describes (distinct from `retrievedAt`).
- `freshness`: `realtime | delayed | historical | cached | offline`.
- `confidence`: optional `high | medium | low`.
- `dataHash`: optional upstream response hash for replay / diff.

Tool result text is sanitized to remove API keys, cookies, authorization
headers, and untrusted UI markup before entering the Pi session context.

## /invest five-phase flow

```mermaid
stateDiagram-v2
  [*] --> detect
  detect --> plan: intent detected
  plan --> execute: user confirms plan
  execute --> verify: tasks complete
  verify --> report: reviewers pass
  verify --> execute: retry with bounded attempt
  report --> [*]: report emitted + indexed
```

Each phase owns its Pi session and writes lifecycle checkpoints via Pi custom
entries; pause / resume / fork are pure session operations.

## Audit and reporting boundary

- Audit records and telemetry are emitted by the UpUp adapter; they are not
  Pi message contents.
- Reports are persisted under `.upup/runs/<runId>/` and referenced by
  `auditId`; large tool results are externalized and never re-serialized into
  the LLM context.
- Compaction summarization is finance-aware (preserves ticker / market /
  freshness / audit IDs / assumptions) and never collapses warnings.

## Failure isolation

- Tool timeouts / network errors are surfaced as structured
  `FinancialToolError` with `auditId`; the agent receives a typed retry
  decision, never a raw stack.
- A failing finance adapter must not silently drop the call; the tool layer
  records the failure and the report explicitly states which data is missing.
- Two concurrent portfolio writes are serialized by UpUp concurrency key
  per portfolio ID; Pi session independence is preserved for the LLM layer.
