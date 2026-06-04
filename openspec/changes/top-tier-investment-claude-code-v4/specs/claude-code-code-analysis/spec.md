# Spec: Claude Code 代码分析 AI Agent 能力 (claude-code-code-analysis)

## Purpose

TBD

## ADDED Requirements

### Requirement: REQ-1 — 自动代码考古 (code-archaeology)

The system SHALL provide `src/code-archaeology/` with scanner, layer-detector, manifest-checker, orphan-finder, hot-spot-finder, markdown-renderer modules.

#### Scenario: scanner parses exports/imports

- GIVEN `src/**/*.ts` files
- WHEN `scanner.scan()` runs
- THEN output is a `SourceFile[]` with `path / LOC / exports / imports` per file

#### Scenario: layer-detector infers 5 layers

- GIVEN a source file path
- WHEN `layer-detector.detect(path)` runs
- THEN it returns one of `'L1' / 'L2' / 'L3' / 'L4' / 'L5'` based on path prefix + import pattern

#### Scenario: orphan-finder finds dead files

- GIVEN the scan result
- WHEN `orphan-finder.find(scan)` runs
- THEN it returns files with no inbound imports and no external use

#### Scenario: hot-spot-finder ranks by import count

- GIVEN the scan result
- WHEN `hot-spot-finder.top(scan, 20)` runs
- THEN it returns top 20 most-imported files

#### Scenario: markdown-renderer outputs valid CODE-MAP.md

- GIVEN scan + layer + orphans + hotspots
- WHEN `markdown-renderer.render(...)` runs
- THEN output MUST be valid Markdown with sections: 模块清单 / 5 layer 分布 / Top 10 Hot Spots / 10 Orphans
- AND word count MUST be in `[3000, 15000]`

#### Scenario: incremental mode reads cache

- GIVEN `.upup/archaeology-cache.json` exists
- WHEN scanner runs in incremental mode
- THEN only files modified after cache mtime are re-scanned

#### Scenario: CLI is invokable

- GIVEN `bun run code-archaeology`
- WHEN executed
- THEN it generates `docs/CODE-MAP.md` and exits 0

### Requirement: REQ-2 — 同行评审 (code-review)

The system SHALL provide 5 detectors (dead-code / duplication / security / performance / style).

#### Scenario: dead-code detector finds unreferenced exports

- GIVEN a source file with `export const foo = 1;` and no `import { foo }` anywhere
- WHEN dead-code detector runs
- THEN it returns a `Finding` with severity `warning`, file path, line, message "unreferenced export: foo"

#### Scenario: duplication detector finds similar blocks

- GIVEN 2 code blocks with Jaccard similarity ≥ 0.8
- WHEN duplication detector runs
- THEN it returns a `Finding` with severity `info` referencing both block locations

#### Scenario: security detector catches hardcoded keys

- GIVEN a line matching `/(api[_-]?key|token|secret)\s*[:=]\s*['"][^'"]{16,}/i`
- WHEN security detector runs
- THEN it returns a `Finding` with severity `critical`

#### Scenario: security detector catches SQL injection

- GIVEN a line matching `/SELECT|INSERT|DELETE|UPDATE/i` with template literal interpolation
- WHEN security detector runs
- THEN it returns a `Finding` with severity `critical`

#### Scenario: performance detector catches O(n²) loops

- GIVEN nested `for` loops ≥ 2 levels
- WHEN performance detector runs
- THEN it returns a `Finding` with severity `warning`

#### Scenario: style detector catches long functions

- GIVEN a function > 100 lines
- WHEN style detector runs
- THEN it returns a `Finding` with severity `info`

#### Scenario: CLI supports --diff mode

- GIVEN `bun run code-review --diff`
- WHEN executed
- THEN only changed files in git diff are scanned
- AND report is written to `.upup/code-review-report.md`

### Requirement: REQ-3 — 重构建议 (refactor-suggest)

The system SHALL provide 3 rule sets (layer-boundary / manifest-completeness / investment-rules).

#### Scenario: layer-boundary catches L1→L3 import

- GIVEN a file under `src/agent/` importing from `src/coordinator/`
- WHEN layer-boundary checker runs
- THEN it returns a violation: "L1 → L3 import is forbidden"

#### Scenario: manifest-completeness checks all fields

- GIVEN the `CAPABILITY_GROUPS` array
- WHEN manifest-completeness checker runs
- THEN each group MUST have `layer` field set
- AND missing `featureGate / coachEnabled / markets / competitorRefs` are reported as warnings

#### Scenario: investment-rules catches naked BUY keyword

- GIVEN a .ts file with `BUY` (not preceded by risk context)
- WHEN investment-rules checker runs
- THEN it returns a violation: "naked BUY keyword must have risk context"

#### Scenario: disabledRules config respected

- GIVEN `disabledRules: ['layer-boundary:L1->L3']`
- WHEN checker runs
- THEN that specific rule is skipped

### Requirement: REQ-4 — 测试生成 (test-coverage)

The system SHALL provide coverage-analyzer, stub-generator, ci-integration.

#### Scenario: coverage-analyzer finds untested files

- GIVEN source files in `src/`
- WHEN analyzer runs
- THEN it returns files without a `*.test.ts` sibling in the gap list

#### Scenario: stub-generator produces missing.test.ts

- GIVEN a source file with `export function foo()`
- WHEN stub-generator runs
- THEN it writes `foo.missing.test.ts` with `test('foo', () => { expect(true).toBe(true); })`

#### Scenario: CI integration fails on <80% coverage

- GIVEN coverage = 70% and `UPUP_TEST_COVERAGE_THRESHOLD=80`
- WHEN ci-integration runs
- THEN it exits 1 (fail build)

#### Scenario: threshold is configurable

- GIVEN `UPUP_TEST_COVERAGE_THRESHOLD=50`
- WHEN ci-integration runs with coverage 60%
- THEN it exits 0 (pass)

### Requirement: REQ-5 — KAIROS 集成 (kairos-code-dream)

The system SHALL provide `src/kairos/code-dream.ts` that runs archaeology + review + refactor in dream phase.

#### Scenario: lock prevents concurrent runs

- GIVEN `.upup/kairos/.code-dream-lock` exists with valid PID
- WHEN dream tries to run
- THEN it exits early (no run)

#### Scenario: log file is written

- GIVEN dream runs successfully
- WHEN completed
- THEN `.upup/kairos/logs/YYYY/MM/YYYY-MM-DD-code-dream.md` exists with diff from yesterday

#### Scenario: push is opt-in

- GIVEN `UPUP_CODE_DREAM_PUSH=true` and `UPUP_KAIROS_CHANNELS=true`
- WHEN dream completes
- THEN the report is broadcast to all enabled push channels

#### Scenario: runs at most once per 24h

- GIVEN dream ran 2 hours ago
- WHEN dream tries to run again
- THEN it exits early (within 24h window)

### Requirement: REQ-6 — 5 增强的统一入口

The system SHALL provide `src/code-analysis/index.ts` as a unified entry point.

#### Scenario: orchestrator aggregates 5 modules

- GIVEN all 5 modules are registered
- WHEN orchestrator runs
- THEN it returns a `CodeAnalysisReport` with `archaeology / review / refactor / coverage / generatedAt` fields

#### Scenario: modules run in dependency order

- GIVEN all 5 modules
- WHEN orchestrator runs
- THEN order is: code-archaeology → code-review → refactor-suggest → test-coverage → kairos-code-dream

### Requirement: REQ-7 — 编译开关

The system SHALL register 5 feature gates in `src/agent/feature-gates.ts`.

#### Scenario: all 5 gates registered

- GIVEN the registry at startup
- WHEN looking up `CODE_ARCHAEOLOGY / CODE_REVIEW / REFACTOR_SUGGEST / TEST_COVERAGE / KAIROS_CODE_DREAM`
- THEN each MUST return a `FeatureFlag` with `defaultEnabled: false`, `category: 'agent' or 'tools'`, `owner: 'tools' or 'kairos'`

#### Scenario: DCE-friendly pattern used

- GIVEN each gate function
- WHEN inspecting the implementation
- THEN it MUST use the Positive ternary pattern (e.g. `true ? getFeature() : false`)

### Requirement: REQ-8 — 测试覆盖

The system SHALL provide ≥ 36 tests across the 5 modules.

#### Scenario: 36+ tests all pass

- GIVEN `bun test src/code-archaeology/ src/code-review/ src/code-refactor/ src/code-test-gen/ src/kairos/code-dream.test.ts`
- WHEN executed
- THEN MUST have ≥ 36 passing tests:
  - 8 for code-archaeology
  - 15 for code-review (3 per detector × 5)
  - 6 for refactor-suggest
  - 4 for test-coverage
  - 3 for kairos-code-dream

### Requirement: REQ-9 — 投研特化 (KAIROS 评分)

For each `src/skills/*/SKILL.md` and `src/tools/finance/*/index.ts`, the system SHALL provide a quality score (0-10) on 5 dimensions.

#### Scenario: score is generated for all skills/tools

- GIVEN the source tree
- WHEN `bun run code-analysis --investment` runs
- THEN `docs/INVESTMENT-SCORE.md` is generated with one row per SKILL.md and tools/finance file

#### Scenario: score includes 5 dimensions

- GIVEN a single SKILL.md
- WHEN scored
- THEN output MUST include: 文档完整性 / 测试覆盖 / 错误处理 / 5 layer 合规 / 投研特化

## MODIFIED Requirements

(none — this is a new capability)
