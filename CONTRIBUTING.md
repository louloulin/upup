# Contributing to UpUp (涨涨)

> **We welcome all kinds of contributions** — code, docs, skills, plugins, evals, bug reports, feature requests, and translations.
> UpUp is a community-driven project. Every PR matters, whether it's a one-line typo fix or a 1000-line new skill.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Quick Start](#quick-start)
- [Where to Start](#where-to-start)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Adding a Skill](#adding-a-skill)
- [Adding a Plugin](#adding-a-plugin)
- [Translation / i18n](#translation--i18n)
- [Community](#community)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

---

## Quick Start

```bash
# 1. Fork & clone
git clone https://github.com/<your-username>/upup.git
cd upup

# 2. Install dependencies (Bun 1.0+ required)
bun install

# 3. Set up environment
cp env.example .env
# Edit .env with at least one LLM API key

# 4. Run in watch mode
bun run dev

# 5. Run tests
bun test

# 6. Type-check (must pass before PR)
bun run typecheck
```

See [docs/quickstart.md](./docs/quickstart.md) for a deeper walkthrough.

---

## Where to Start

| Type of contribution | Where to look |
|---|---|
| 🐛 **Fix a bug** | [Issues labeled `bug`](https://github.com/louloulin/upup/issues?q=is%3Aissue+is%3Aopen+label%3Abug) |
| ✨ **Add a feature** | [Issues labeled `enhancement`](https://github.com/louloulin/upup/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement) |
| 📚 **Improve docs** | [Issues labeled `docs`](https://github.com/louloulin/upup/issues?q=is%3Aissue+is%3Aopen+label%3Adocs) |
| 🇨🇳 **Improve Chinese i18n** | `src/i18n/strings.ts` |
| 🛠 **Add a new skill** | `src/skills/<your-skill>/SKILL.md` — see [docs/skills.md](./docs/skills.md) |
| 🔌 **Add a plugin** | Use `@upup/plugin-sdk` — see [docs/plugins.md](./docs/plugins.md) |
| 📊 **Add an eval case** | `src/evals/dataset/*.csv` |

**First-time contributors**: Look for issues labeled [`good first issue`](https://github.com/louloulin/upup/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

---

## Development Workflow

1. **Branch off `main`**: `git checkout -b feat/<short-name>` or `fix/<short-name>`
2. **Write code + tests together** — see [docs/skills.md](./docs/skills.md) for TDD on skills
3. **Verify locally**:
   ```bash
   bun run typecheck    # must be 0 errors
   bun test             # all green
   bun run lint:scc     # source-code-size budget
   ```
4. **Update docs** if you changed user-facing behavior
5. **Commit with conventional commits**:
   ```
   feat(skills): add `earnings-3w` skill for 3-week earnings preview
   fix(memory): resolve memory leak in observation buffer
   docs(readme): clarify `TUSHARE_TOKEN` requirement
   test(skills): cover empty input for dcf skill
   ```
6. **Push & open a PR** — fill out the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)

---

## Coding Standards

We follow the conventions documented in [AGENTS.md](./AGENTS.md). Key points:

- **TypeScript strict mode** — no `any`, no `@ts-ignore` without justification
- **ESM only** — `import/export`, never `require()`
- **Reuse existing patterns** — if `src/skills/<X>/` exists, follow its layout
- **No logging unless asked** — structured events go through `telemetry/`
- **One concern per file** — extract helpers aggressively (see [docs/architecture.md](./docs/architecture.md) § 模块边界)
- **Bun runtime preferred** — Node 18+ for compatibility only
- **Conventional commits** — see commit history for examples

### File header convention

```ts
/**
 * Brief one-liner describing this module's single responsibility.
 *
 * Layer: 2 (src/types) | 3 (src/storage) | etc. — see docs/architecture.md
 * Stability: stable | evolving | experimental
 * Dependencies: list any cross-layer imports
 */
```

### Comments

- Code should be self-documenting for the trivial
- A short orienting comment before a non-obvious block is welcome
- Never empty narration (`// Loop`, `// i++`, etc.)
- No `console.log` — use `telemetry/` or `src/utils/logger.ts` if you must

---

## Testing

- **Framework**: Bun's built-in test runner (`bun test`)
- **Layout**: colocated `*.test.ts` next to the file under test
- **Coverage**:
  - New skill → at least 1 happy-path + 1 failure-case test
  - New tool → mock external API + verify schema
  - Bug fix → write a regression test that fails before the fix
- **Run before pushing**:
  ```bash
  bun test                   # full suite
  bun test <path>            # specific file
  bun test --watch           # watch mode
  ```

For evaluation (LangSmith), see [docs/benchmarks.md](./docs/benchmarks.md).

---

## Documentation

- **User-facing changes** → update relevant `docs/*.md`
- **New skill** → add an entry to [docs/skills.md](./docs/skills.md) (the "Available Skills" table)
- **New command** → add an entry to [docs/commands.md](./docs/commands.md)
- **Behavior change** → update [CHANGELOG.md](./CHANGELOG.md)
- **i18n key change** → add to both `en` and `zh-CN` in `src/i18n/strings.ts` (test will fail if missing)

Docs are first-class. PRs that improve docs are just as welcome as PRs that improve code.

---

## Submitting Changes

- **Small fix (1-2 lines)**: Direct PR is fine, no issue needed
- **New feature**: Open an issue first, get a 👍 from a maintainer, then PR
- **Breaking change**: Open an issue + mark with `breaking` label + coordinate with maintainers
- **Draft PRs welcome** for early feedback — convert to ready when green

PRs are squash-merged. The PR title becomes the squash commit subject, so make it conventional-commit-friendly.

---

## Reporting Bugs

Use the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md). Include:

- UpUp version (`bun start` then `/version` or `cat package.json | grep version`)
- OS, Bun version
- Minimal reproduction
- Expected vs actual behavior
- Relevant logs (debug mode: `DEBUG=* bun start`)

---

## Suggesting Features

Use the [feature request template](./.github/ISSUE_TEMPLATE/feature_request.md). Frame the problem before the solution.

---

## Adding a Skill

See [docs/skills.md](./docs/skills.md) for the full guide. TL;DR:

```bash
mkdir src/skills/<your-skill>
# Create SKILL.md with YAML frontmatter:
cat > src/skills/<your-skill>/SKILL.md << 'SKILL'
---
name: your-skill
description: One-line description for the LLM agent. Trigger keywords: A, B, C.
---

# Skill Title

## When to use
## How to use (with code)
## Example
## Limitations
SKILL
```

The skill is hot-reloaded — no restart needed.

---

## Adding a Plugin

See [docs/plugins.md](./docs/plugins.md). Use `@upup/plugin-sdk`:

```bash
bunx create-upup-plugin my-plugin
cd my-plugin
bun run build
```

Plugins can be `bun` / `jiti` / `wasm` / `mcp` runtime — see [docs/plugins.md#runtime-adapters](./docs/plugins.md#runtime-adapters).

---

## Translation / i18n

We maintain **EN + zh-CN** symmetrically.

- String table: `src/i18n/strings.ts`
- Add a key in **both** `en` and `zh-CN` blocks
- Adding a key in only one locale will fail the unit test
- Locale auto-detected from `LANG` / `LC_ALL`, override with `UPSTREAM_LOCALE`

We welcome additional locales (e.g., `ja`, `ko`). Open an issue first to coordinate.

---

## Community

- **GitHub Issues** — bug reports, feature requests
- **GitHub Discussions** — questions, ideas, showcase
- **Code of Conduct** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

Maintainers are listed in [CODEOWNERS](./.github/CODEOWNERS) (if exists). For urgent issues, tag `@louloulin`.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

UpUp is forked from [virattt/dexter](https://github.com/virattt/dexter) (also MIT). When modifying code originally from dexter, please preserve the upstream attribution header.

---

<p align="center">
  <strong>Thanks for making UpUp better. 涨，涨，一直涨。 🚀</strong>
</p>
