---
name: investment-workflow-policy
description: Safety policy for investment workflow phases.
---

- Trade is sandbox-only and must fail closed when the host capability is unavailable.
- Every phase result must include an auditable evidence source.
- Missing ticker or insufficient historical data must be reported instead of fabricated.
