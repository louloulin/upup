# Pi5 Multi-Agent Dataflow

This document records how UpUp decomposes a research task into Pi worker
sessions, how the Coordinator communicates with them, and how results are
aggregated. The Coordinator owns orchestration only; the LLM, tools, sessions,
compaction, and event semantics all belong to Pi.

## Decomposition model

```mermaid
flowchart TB
  T[User task / invest phase]
  T --> CD[Coordinator]
  CD --> P[Plan]
  P -->|worker spec| SP[PiSubagentFactory]
  SP --> W1[Pi worker session: explore]
  SP --> W2[Pi worker session: plan]
  SP --> W3[Pi worker session: risk]
  SP --> W4[Pi worker session: trade]
  SP --> W5[Pi worker session: review]
  W1 --> E1[(worker session JSONL)]
  W2 --> E2[(worker session JSONL)]
  W3 --> E3[(worker session JSONL)]
  W4 --> E4[(worker session JSONL)]
  W5 --> E5[(worker session JSONL)]
  W1 & W2 & W3 & W4 & W5 --> AGG[Aggregator]
  AGG --> RR[Reviewer Pi session]
  RR --> REP[Final report + evidence index]
```

## Worker lifecycle

```mermaid
sequenceDiagram
  participant Co as Coordinator
  participant F as PiSubagentFactory
  participant W as Worker Pi session
  participant J as Worker JSONL
  participant C as Aggregator
  Co->>F: spawn(spec, task)
  F->>W: createSession(UpUpAgentSpec)
  W->>J: append message / checkpoint
  W-->>Co: streaming events (tool_start, message_end, ...)
  Co->>W: steer / followUp / abort
  W-->>Co: final result or audited error
  F->>W: dispose()
  Co->>C: forward worker output
  C->>C: dedupe, sort, attach evidence
  C-->>Co: aggregated payload
```

## Tool allowlist and isolation

- Each worker spec carries its own `tools` allowlist. Pi enforces it at the
  AgentSession level; UpUp never injects a forbidden tool later.
- `invest-explore` is read-only; `invest-trade` exposes only the sandbox
  tools and requires per-call approval for any critical action.
- Each worker session has its own evidence namespace (no shared globals),
  which prevents cross-worker evidence contamination.

## Concurrency

- Coordinator can spawn N workers in parallel; each runs in its own Pi
  session, with its own abort signal and tool allowlist.
- Writes to the same portfolio are serialized by UpUp's per-portfolio
  concurrency key. Pi session independence is preserved at the LLM layer.
- Worker crashes are reported as typed `SubagentExecutionError` with audit
  ID; the Coordinator retries with a bounded attempt counter.

## Aggregation and review

- Aggregator collects worker outputs into a single payload keyed by role.
- The reviewer (Pi session) cross-validates evidence, freshness, and
  consistency of the aggregated payload before report composition.
- Reviewer output is the report's authoritative structure; raw worker
  outputs are kept under `.upup/runs/<runId>/workers/` for audit.

## Failure containment

- A worker session crash does not invalidate the parent run; the
  Coordinator records the failure and re-runs only the affected role.
- An aborted worker leaves its JSONL readable for post-mortem; Pi's
  `dispose()` is called only after the Aggregator persists the failure
  record.
