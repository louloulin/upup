# Spec: china-edition-positioning

## Purpose

Define the formal, citable statement of the "China edition of dexter" positioning.
This spec codifies what the China edition means, what it commits to, what it
deliberately does NOT do, and how it relates to upstream dexter.

## ADDED Requirements

### Requirement: positioning-must-state-three-commitments

The positioning document MUST state at least three concrete commitments of the
China edition: (1) A-share data stack, (2) Chinese-first i18n, (3) explicit
no-real-money-trading posture.

#### Scenario: a reader asks "what does China edition mean?"

- **WHEN** a reader opens the positioning document
- **THEN** within the first three sections, all three commitments are present and unambiguous

### Requirement: positioning-must-state-three-non-goals

The positioning document MUST state at least three non-goals: (1) no proprietary
LLM, (2) no paid tier / SaaS lock-in, (3) no real-money trade execution.

#### Scenario: a journalist asks "is this a SaaS product?"

- **WHEN** a reader scans the non-goals section
- **THEN** the "no paid tier" and "no SaaS lock-in" statements are present

### Requirement: positioning-must-cite-upstream-license

The positioning document MUST explicitly cite the upstream MIT license, attribute
virattt/dexter as the source fork, and link to the upstream sync plan.

#### Scenario: a lawyer asks about license compatibility

- **WHEN** a reader searches the positioning for "license" or "MIT"
- **THEN** the upstream MIT citation and the sync-plan link are both present

### Requirement: positioning-must-include-disclaimer

The positioning document MUST include a research-only / no-investment-advice
disclaimer that matches the disclaimer in README.md and SOUL.md.

#### Scenario: a regulator asks about compliance posture

- **WHEN** a reader scans for "disclaimer" or "advice"
- **THEN** the research-only disclaimer is present and points at README.md / SOUL.md for the canonical text

### Requirement: positioning-must-be-chinese-first

The canonical positioning document MUST be in Chinese, with an English summary
in the README linking to it. A standalone English translation is out of scope
for this change and tracked as a follow-up.

#### Scenario: a Chinese user opens the positioning

- **WHEN** a Chinese user opens `docs/upup-china-edition-positioning.md`
- **THEN** the document body is in Chinese

#### Scenario: an English user follows the link from README.md

- **WHEN** an English user clicks the positioning link in README.md
- **THEN** they land on the Chinese document with a one-line English summary at the top

## MODIFIED Requirements

_None._

## REMOVED Requirements

_None._

## RENAMED Requirements

_None._
