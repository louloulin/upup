# Tasks

## 1. Authoritative audit (new)

- [ ] 1.1 Create `openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md` with 8 dimensions:
  - [ ] 1.1.1 Code volume (src files / lines / packages)
  - [ ] 1.1.2 Tool registry (count by category, with A-share vs US split)
  - [ ] 1.1.3 Skills (SKILL.md count, bundled count, hot-reload support)
  - [ ] 1.1.4 5-phase investment workflow (`/invest` + 8 sub-commands)
  - [ ] 1.1.5 4 plugin runtimes (bun / jiti / wasm / mcp)
  - [ ] 1.1.6 i18n (EN + zh-CN coverage, key count)
  - [ ] 1.1.7 Session 2.0 (plan mode, loop recovery, audit)
  - [ ] 1.1.8 Multi-agent + KAIROS + Bridge + Coordinator + 18 workspace packages
- [ ] 1.2 Each dimension: run a reproducible shell command against upup HEAD, capture output as a code block, date the output
- [ ] 1.3 Each dimension: run the same command against dexter HEAD at `/Users/louloulin/Documents/linchong/touzhi/dexter`, capture output as a code block
- [ ] 1.4 Add a "Why these dimensions" preamble and a "How to regenerate" appendix

## 2. China-edition white paper (new)

- [ ] 2.1 Create `docs/upup-china-edition-positioning.md` (~250 lines, intentionally Chinese)
  - [ ] 2.1.1 "Why a Chinese version" — three reasons (market, language, regulatory)
  - [ ] 2.1.2 "What the Chinese version means" — concrete commitments (A-share data, Chinese i18n, compliance posture, no auto-trading)
  - [ ] 2.1.3 "What the Chinese version does NOT do" — explicit non-goals (no proprietary LLM, no paid tier, no real-money trading)
  - [ ] 2.1.4 "Relationship with upstream" — MIT, attribution, sync plan
  - [ ] 2.1.5 "Compliance & disclaimer" — research only, no investment advice
- [ ] 2.2 Add a "last reviewed" date and a "feedback" link

## 3. Refresh root docs

- [ ] 3.1 `README.md`:
  - [ ] 3.1.1 Replace the "UpUp's Additions" section header with "China-Edition Increment" and trim to a 1-paragraph teaser
  - [ ] 3.1.2 Add a "8-dimension China-edition advantage" callout linking to the audit doc
  - [ ] 3.1.3 Add a "中国版定位" link to `docs/upup-china-edition-positioning.md`
  - [ ] 3.1.4 Verify EN/CN cross-link is present
- [ ] 3.2 `README_CN.md`:
  - [ ] 3.2.1 Mirror the README.md structure changes
  - [ ] 3.2.2 Add explicit "默认中文用户入口" note at top
  - [ ] 3.2.3 Verify EN/CN cross-link
- [ ] 3.3 `AGENTS.md`:
  - [ ] 3.3.1 Update the "Project Structure" section to reflect 18 workspace packages, 5-phase workflow, 4 plugin runtimes, 5 investment Subagents
  - [ ] 3.3.2 Replace `UpUp's Additions` header with `China-Edition Increment`
  - [ ] 3.3.3 Add explicit link to the audit doc and the white paper
  - [ ] 3.3.4 Update the upstream-attribution note to point at the white paper
- [ ] 3.4 `CHANGELOG.md`:
  - [ ] 3.4.1 Add a single `[Unreleased]` entry summarizing this doc refresh
  - [ ] 3.4.2 Reference the audit doc and the white paper by relative path

## 4. Refresh supporting docs

- [ ] 4.1 `docs/comparison.md`:
  - [ ] 4.1.1 Keep the TL;DR table and the 11-row comparison table
  - [ ] 4.1.2 Replace the "vs virattt/dexter" table's numbers with citations to the audit doc (no inline duplication)
  - [ ] 4.1.3 Add an "Audit source" footnote at the bottom
- [ ] 4.2 `docs/positioning.md`:
  - [ ] 4.2.1 Keep the 10-section structure
  - [ ] 4.2.2 Replace section 9 (vs competitors) with a 1-line link to `docs/COMPETITIVE.md`
  - [ ] 4.2.3 Add a top-of-doc link to the white paper
- [ ] 4.3 `docs/COMPETITIVE.md`:
  - [ ] 4.3.1 Keep the 13-competitor × 7-dimension matrix
  - [ ] 4.3.2 Drop the "vs dexter" duplicate section (its data now lives in the audit doc)
  - [ ] 4.3.3 Add a "data sources" footnote pointing to the audit
- [ ] 4.4 `docs/GAP-ANALYSIS.md`:
  - [ ] 4.4.1 Prepend a one-line "Superseded by docs/upup-vs-dexter-audit.md (2026-06-12)" notice
- [ ] 4.5 `docs/AI-AGENT-GAP-ANALYSIS.md`:
  - [ ] 4.5.1 Prepend the same "Superseded" notice

## 5. New spec

- [ ] 5.1 Create `openspec/specs/upup-vs-dexter-audit-spec/spec.md`:
  - [ ] 5.1.1 **Purpose**: codify the audit methodology
  - [ ] 5.1.2 **Requirements**:
    - The audit MUST compare exactly 8 dimensions: code volume, tools, skills, workflow, plugins, i18n, session, ecosystem
    - Each dimension MUST be reproducible via a single shell command
    - Each dimension MUST be dated and pinned to a specific commit/tag
    - The audit MUST NOT modify any source file
  - [ ] 5.1.3 **Scenarios**:
    - When a new Sprint closes, the audit MUST be regenerated
    - When the upstream dexter releases a new version, the audit MUST be regenerated within 7 days

## 6. Validation

- [ ] 6.1 `openspec validate upup-vs-dexter-comprehensive-audit-and-doc-refresh --strict` passes
- [ ] 6.2 `openspec status --change upup-vs-dexter-comprehensive-audit-and-doc-refresh` reports 4/4 artifacts complete
- [ ] 6.3 Manual cross-link check: every doc that mentions "vs dexter" links to the audit doc; no two docs assert the same numbers
- [ ] 6.4 Spot-check: the audit doc's reproducible commands match the actual HEAD counts at the time of writing
- [ ] 6.5 No `src/`, no `packages/`, no `package.json` changes (verified via `git diff --stat`)
