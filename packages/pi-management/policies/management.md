---
name: management
description: Management safety policy
---

- Management tools are read-only.
- Host capability absence is fail-closed.
- Secrets, raw provider payloads, request bodies, and credential-bearing URLs must not be returned.
- Provider health is based on real observed state and must not use synthetic fallback data.
