---
name: Bug Report
about: Something doesn't work as expected
title: '[BUG] '
labels: bug
assignees: ''
---

## Description

A clear and concise description of what the bug is.

## Environment

| Field | Value |
|---|---|
| UpUp version | (e.g. `2026.05.15`, or output of `/version`) |
| Bun version | (run `bun --version`) |
| Node version | (run `node --version`, if relevant) |
| OS | (e.g., macOS 14.5, Ubuntu 24.04, Windows 11 WSL2) |
| Install method | (npm / bun install / binary / from source) |

## LLM Provider

Which provider + model were you using?

```
provider: deepseek
model: deepseek-v4-flash
```

## Steps to Reproduce

1. Run command: `...`
2. With input: `...`
3. Observe: `...`

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include error output, stack trace, or screenshot.

```
<paste error here>
```

## Context

- Does this happen every time, or intermittently?
- Does it happen on `main` branch, or only on a feature branch?
- Did this work in a previous version? Which one?
- Any related issues or PRs?

## Possible Solution

If you have ideas on how to fix it, share them here.

## Additional Context

Anything else that might be relevant (logs, configuration, related discussions).

---

### For maintainers

- [ ] Reproduced locally
- [ ] Severity assessed (P0/P1/P2/P3)
- [ ] Linked to milestone
- [ ] Test plan drafted
