# Pi5 Plugin Ecosystem

This document records how the financial / investment capability is packaged as
Pi Packages, Extensions, Skills, and Prompt Templates, and how the trust
boundary is enforced before any code touches a Session.

## Plugin layers

```mermaid
flowchart TB
  subgraph "Pi Package manifest"
    M[pi.finance-sdk manifest]
  end

  M --> EX[Pi Extensions]
  M --> SK[Pi Skills]
  M --> PT[Prompt Templates]
  M --> TH[Themes]

  EX --> EXR[UpUp Tool Adapter]
  EXR --> AD[Finance adapters]
  AD --> S[A-share / HK / US / fund / filing / news]

  SK --> AN[Investment methodology]
  PT --> RP[Report templates]

  EX --> TM[Tool Registry]
  TM --> SP[UpUpAgentSpec tool allowlist]
  SP --> SF[Safety policy: safe / warning / dangerous / critical]
```

## Trust and package flow

```mermaid
sequenceDiagram
  participant L as UpUp loader
  participant V as Pin / hash verification
  participant P as Pi runtime
  participant A as AgentSpec
  participant T as Tool execution
  L->>V: read package manifest + tarball
  V-->>L: pin match / hash match
  alt trusted
    L->>P: Pi Extension + Skill registration
    P->>A: bind UpUpAgentSpec
    A->>T: setActiveTools(allowlist)
    T-->>A: Pi tool result + details
  else rejected
    L-->>L: audited denial, no runtime load
  end
```

## Skill / Tool / Workflow split

| Concern | Skill (markdown) | Tool (Pi Extension) | Workflow (Pi state machine) |
|---|---|---|---|
| Investment method, writing rules | ✓ | | |
| Real data retrieval (price, fundamentals, filings) | | ✓ | |
| State change (write plan, modify watchlist, draft trade) | | ✓ (dangerous) | ✓ |
| Deterministic computation (DCF, ratios, attribution) | | ✓ | ✓ (via tool) |
| Approval gate | | (advised) | ✓ (owns the gate) |
| Multi-step coordination | | | ✓ |
| Audit log | | ✓ | ✓ |

## Pinning and source rules

- All Pi packages pinned by exact semver (see `check-pi-migration` gate).
- All finance adapters pinned by Git commit or npm tag in
  `.pi/settings.json` (validated by `check-pi-packages`).
- No remote HEAD; production never auto-fetches unknown commits.
- Allowlist is enforced before any extension code is `require`d.
- Skill forks fail loud (`SubagentRunner` compat preserved during migration).

## Failure modes

- `resources_discover` failing -> `runtime-health` reports the offending path.
- Tool execution without `safetyLevel` defaults to `warning` and is logged.
- Approval gate unconfigured -> dangerous / critical tools return
  `permission_denied` with audit ID; no silent fallback.
