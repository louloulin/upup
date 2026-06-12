# Spec: upup-vs-dexter-audit-spec

## Purpose

Codify the methodology for the "upup vs upstream dexter" audit so the China-edition
positioning is reproducible, citable, and CI-checkable. The audit produces the
authoritative numbers behind every "8-dimension China-edition advantage" claim
in the project's documentation.

## ADDED Requirements

### Requirement: audit-must-cover-eight-dimensions

The audit document MUST compare upup against upstream dexter across exactly
eight dimensions, in this order: (1) Code volume, (2) Tool registry, (3) Skills,
(4) 5-phase investment workflow, (5) Plugin runtimes, (6) i18n, (7) Session 2.0,
(8) Ecosystem (multi-agent, KAIROS, Bridge, Coordinator, workspace packages).

#### Scenario: a new sprint closes

- **WHEN** a Sprint is closed and a release is cut
- **THEN** the audit document is regenerated within 7 days
- **AND** the document's "Audit generated" date is updated

#### Scenario: upstream dexter releases a new version

- **WHEN** upstream dexter publishes a new tagged release
- **THEN** the audit document is regenerated within 7 days
- **AND** the upstream commit/tag pin in the audit is updated to the new version

### Requirement: audit-must-be-reproducible

Every dimension's number in the audit MUST be obtainable by running a single
shell command from the repository root, and that command MUST be present in the
document as a fenced code block.

#### Scenario: a reader wants to verify a number

- **WHEN** a reader copies the dimension's command from the audit and runs it from the repository root
- **THEN** the output matches the number quoted in the audit (modulo a 1-line header difference from `wc`)

#### Scenario: a contributor wants to add a new dimension

- **WHEN** a contributor proposes adding a 9th dimension
- **THEN** the contributor MUST also supply the reproducible shell command and the equivalent command for upstream dexter

### Requirement: audit-must-pin-versions

The audit document MUST pin both upup and upstream dexter to a specific commit,
tag, or `HEAD` date. The pin MUST appear at the top of the document.

#### Scenario: the audit is regenerated

- **WHEN** the audit is regenerated
- **THEN** the version pin section is updated with the new commit/tag/date for both upup and upstream dexter

### Requirement: audit-must-not-modify-source

The audit document MUST NOT propose, recommend, or require any change to files
under `src/` or `packages/`. The audit is read-only with respect to source code.

#### Scenario: a dimension reveals a gap

- **WHEN** a dimension reveals that upstream dexter has a feature upup lacks
- **THEN** the audit records the gap as data only
- **AND** a separate OpenSpec change is opened if the gap is to be closed

### Requirement: audit-must-be-dated

The audit document MUST display an "Audit generated: YYYY-MM-DD" line at the top
and a "Last reviewed: YYYY-MM-DD" line at the bottom.

#### Scenario: a reader sees the audit is stale

- **WHEN** a reader sees "Audit generated" is older than the most recent release date
- **THEN** the reader can cite the staleness and request a regeneration

### Requirement: audit-commands-must-not-require-network

The reproducible shell commands for each dimension MUST run against the local
working copy only. They MUST NOT require network access, API keys, or remote
fetch operations.

#### Scenario: offline audit run

- **WHEN** a contributor regenerates the audit on a flight without network
- **THEN** all eight dimensions' commands succeed using local files only

## MODIFIED Requirements

_None._

## REMOVED Requirements

_None._

## RENAMED Requirements

_None._
