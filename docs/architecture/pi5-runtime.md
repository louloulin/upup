# Pi5 Runtime Architecture

This document is the durable architecture record for the Pi migration. Pi owns
the generic agent runtime; UpUp owns investment data, evidence, permissions,
skills, and workflows.

## Runtime and session flow

```mermaid
flowchart LR
  CLI[CLI / Gateway / Daemon / SDK / stdio] --> R[PiAgentSessionFactory]
  R --> S[UpUpAgentSpec]
  R --> P[Pi AgentSession]
  P --> M[pi-ai Model + Provider]
  P --> E[Pi JSONL Session]
  P --> EV[UpUp event adapter]
  EV --> UI[Ink / API consumers]
  P --> C[Compaction / fork / resume / export]
```

All production execution enters through `src/runtime/pi/`. The former
`src/agent/` tree is intentionally absent; callers cannot create a second model
loop or bypass the session factory.

## Financial evidence flow

```mermaid
flowchart TB
  Q[User investment question] --> W[Pi session / investment profile]
  W --> T[Pi registered finance tool]
  T --> D[Data source: A-share / HK / US / fund / filing / news]
  D --> N[Normalize + freshness checks]
  N --> EV[Evidence record]
  EV --> R[Tool result text + details]
  R --> S[Pi session audit trail]
  R --> O[Research report / review / backtest]
```

Every finance result is expected to carry evidence ID, source, retrieval time,
as-of time, freshness policy, warnings, and audit ID. Secrets stay in provider
configuration and never enter tool text, session entries, or telemetry.

## Pi ecosystem layers

```mermaid
flowchart TB
  subgraph Pi[Pi ecosystem]
    SK[Pi Skills]
    EX[Pi Extensions / registerTool]
    PK[Pi Packages]
    MD[Pi Model / Session / TUI]
  end
  subgraph UpUp[UpUp investment product]
    FS[Finance adapters]
    WS[Investment workflow]
    PM[Permission profiles]
    AU[Evidence + audit]
  end
  SK --> MD
  EX --> MD
  PK --> EX
  FS --> EX
  WS --> MD
  PM --> EX
  AU --> FS
  AU --> WS
```

New investment capability should normally be a finance adapter, skill, or
package. The Pi runtime is changed only when a generic runtime capability is
missing.

## Trust and permission boundary

```mermaid
flowchart LR
  X[Discovered plugin] --> L[UpUp loader]
  L --> H[Path / hash / package pin verification]
  H -->|trusted| B[Pi plugin bridge]
  H -->|rejected| Z[No load + audit error]
  B --> A[AgentSpec tool allowlist]
  A --> G[Safety policy: safe / warning / dangerous / critical]
  G -->|deny| Z2[Audited denial]
  G -->|approval| C[Per-call approval]
  G -->|allow| T[Pi registerTool execution]
  C --> T
  T --> S[Plugin sandbox / runtime boundary]
```

Plugin tools default to `warning` when they omit safety metadata. Trust proves
the source is allowed; the AgentSpec still controls whether a trusted tool may
be exposed and executed.

## Multi-agent worker lifecycle

```mermaid
sequenceDiagram
  participant Co as Coordinator
  participant F as Pi worker factory
  participant W as Worker Pi session
  participant J as Session JSONL
  Co->>F: spawn(spec, task)
  F->>W: createSession(UpUpAgentSpec)
  W->>J: append messages/checkpoints
  W-->>Co: Pi events, text, tool results, usage
  Co->>W: abort / steer / follow-up
  W-->>Co: final result or audited error
  F->>W: dispose()
```

The coordinator manages decomposition, lifecycle, aggregation, and recovery.
LLM selection, tools, sessions, compaction, and event semantics belong to Pi.
