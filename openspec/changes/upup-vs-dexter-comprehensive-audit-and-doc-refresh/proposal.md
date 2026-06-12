## Why

UpUp (涨涨) is a Chinese-language deep financial research AI agent forked from [virattt/dexter](https://github.com/virattt/dexter). After 8 rounds of Sprint refinement, **UpUp's code volume is 10.9× upstream dexter** (src: 1,055 files / 237,914 lines vs 184 files / 21,899 lines). It adds 50 SKILL.md investment-analysis skills, 14 bundled dynamic skills, 4 plugin runtimes, a 5-phase `/invest` workflow, 5 investment Subagents, the A-share Tushare+AKShare data stack, EN+zh-CN i18n, Session 2.0, a Memory system, 18 workspace packages, KAIROS proactive monitoring, Coordinator multi-agent orchestration, Bridge remote control, and 7 other dimensions of independent contribution.

However, the "Chinese version of dexter" positioning has three real problems today:

1. **No authoritative audit document.** There is no single "upup vs dexter — full audit + 8-dimension feature advantage" document. Users and contributors can only piece the story together from scattered tables in README.md.
2. **Existing docs overlap and use stale numbers.** `docs/comparison.md`, `docs/positioning.md`, `docs/COMPETITIVE.md`, `docs/GAP-ANALYSIS.md`, `docs/AI-AGENT-GAP-ANALYSIS.md` all touch "vs upstream / vs competitors" but from different angles, different depths, and last touched on different dates (2026-04 to 2026-06). There is no single source of truth.
3. **README / README_CN / AGENTS tell the "Chinese version" story inconsistently.** README.md (414 lines) is comprehensive, README_CN.md (423 lines) exists, and AGENTS.md is in place — but their phrasing, granularity, and structure of the "Chinese version" claim are not aligned, which confuses new contributors during onboarding.

This change promotes the "Chinese version of dexter" positioning from "scattered across many files" to "unified, verifiable, citable" through one authoritative audit + 7 document refreshes.

## What Changes

- **New** `openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md`: **8-dimension full audit** — compares upup vs upstream dexter with real numbers (file counts, line counts, tool counts, skill counts, package counts); itemizes UpUp's incremental contribution per dimension.
- **New** `docs/upup-china-edition-positioning.md`: **China-edition positioning white paper** — formal, citable document that captures "why a Chinese version", "what the Chinese version means", and "what the Chinese version deliberately does not do".
- **Refresh** `README.md` — keep the 8-dimension delta table, add a "8-dimension China-edition advantage" link block, drop segments now duplicated in the new white paper, retitle `UpUp's Additions` → `China-Edition Increment`.
- **Refresh** `README_CN.md` — sync with README.md; cross-link EN/CN; make Chinese the default entry point for new users.
- **Refresh** `AGENTS.md` — update the project-structure section to reflect 18 workspace packages, 5-phase workflow, 4 runtime plugins, and 5 investment Subagents; retitle `UpUp's Additions` → `China-Edition Increment`.
- **Refresh** `CHANGELOG.md` — add an `[Unreleased]` entry recording this doc refresh.
- **Refresh** `docs/comparison.md` — treat the new audit doc as the single source of truth for "vs dexter"; replace stale numbers with the audit's exact figures.
- **Refresh** `docs/positioning.md` — treat the new white paper as the single source of truth; remove duplicated "4 unique differentiators" prose and link out.
- **Refresh** `docs/COMPETITIVE.md` — keep the 13-competitor × 7-dimension matrix, drop duplicated "vs dexter" section.
- **Refresh** `docs/GAP-ANALYSIS.md` / `docs/AI-AGENT-GAP-ANALYSIS.md` — mark as superseded by the new audit doc, or merge.
- **New** `openspec/specs/upup-vs-dexter-audit-spec/spec.md` — **audit spec**: define the comparison dimensions, counting methodology, and data sources so the audit is reproducible and CI-checkable.

### Breaking

None. This change touches documentation and adds one new spec. **No `src/` code, no public API, no dependency changes.**

## Capabilities

### New Capabilities

- `upup-vs-dexter-audit-spec`: defines the comparison dimensions, counting methodology, and data sources for the "upup vs upstream dexter" audit so the China-edition positioning is reproducible and CI-checkable.
- `china-edition-positioning`: defines the formal statement, scope boundary, upstream relationship, and compliance requirements of the "Chinese version of dexter" positioning.

### Modified Capabilities

None. `openspec/specs/` has no spec related to documentation positioning, and this change does not modify any spec-level behavior.

## Impact

- **New documents**:
  - `openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md` (~400 lines)
  - `docs/upup-china-edition-positioning.md` (~250 lines)
  - `openspec/specs/upup-vs-dexter-audit-spec/spec.md` (~120 lines)
- **Refreshed documents**:
  - `README.md` (414 → ~420 lines, section reorder)
  - `README_CN.md` (423 → ~430 lines, sync with EN)
  - `AGENTS.md` (project-structure section rewrite)
  - `CHANGELOG.md` (Unreleased section)
  - `docs/comparison.md` (replace stale numbers)
  - `docs/positioning.md` (link to white paper)
  - `docs/COMPETITIVE.md` (remove duplicated section)
  - `docs/GAP-ANALYSIS.md` / `docs/AI-AGENT-GAP-ANALYSIS.md` (mark superseded)
- **No code changes**: `src/`, `packages/` untouched.
- **No dependency changes**: `package.json`, `bun.lock` untouched.
- **No API changes**: `@upup/plugin-sdk`, `packages/llm`, and all other public APIs untouched.
