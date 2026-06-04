# Spec: 投研域竞品定位矩阵 + 4 唯一差异化 (competitive-positioning)

## Purpose

TBD

## ADDED Requirements

### Requirement: REQ-1 — 13 竞品 7 维度评分表

The system SHALL maintain a structured 13-competitor matrix scored on 7 dimensions:
CLI 形态 / 投研覆盖 / 自动交易 / 推送渠道 / 团队协作 / 开源 / 价格, each scored 0/1/2 (or -2/-1/0 for price).
The matrix data MUST be stored at `src/competitive-positioning/matrix.ts` as a typed `CompetitorMatrix` array.
The matrix MUST be auto-validated at startup that all 13 entries are present and dimension values are within `{0, 1, 2}` or `{-2, -1, 0}`.

#### Scenario: matrix has 13 competitors

- GIVEN the system starts up
- WHEN `matrix.validate()` runs
- THEN it returns `true` and the matrix has 13 entries

#### Scenario: dimension values are valid

- GIVEN a `CompetitorMatrix` entry
- WHEN validating `cli / coverage / trading / push / collab` fields
- THEN each MUST be in `{0, 1, 2}`
- AND `openSource` MUST be in `{0, 2}`
- AND `price` MUST be in `{-2, -1, 0}`

### Requirement: REQ-2 — 4 唯一差异化的量化证据

The system SHALL provide **quantifiable, falsifiable evidence** for each of the 4 unique differentiators.

#### Scenario: D1 CLI-first evidence

- GIVEN the repo at HEAD
- WHEN running `find src/commands -name '*.tsx' | wc -l`
- THEN output MUST be ≥ 20
- AND `grep -c "name:" src/agent/feature-gates.ts` MUST be ≥ 50
- AND `src/index.tsx` MUST exist as the CLI entry

#### Scenario: D2 开源 + 自托管 evidence

- GIVEN the repo at HEAD
- WHEN checking files
- THEN `LICENSE` MUST exist at repo root (MIT or Apache-2.0)
- AND `Dockerfile` MUST exist at repo root
- AND `docker-compose.yml` MUST exist at repo root
- AND `.upup/settings.json` roundtrip MUST preserve all keys

#### Scenario: D3 全市场覆盖 evidence

- GIVEN the repo at HEAD
- WHEN counting `src/tools/finance/`
- THEN file count MUST be ≥ 18, organized into 4 sub-groups (a-share, us, hk, crypto)
- AND `capability-manifest.ts` `realtime` group `markets` field MUST include all 4

#### Scenario: D4 三件套 evidence

- GIVEN the repo at HEAD
- WHEN checking directories
- THEN `src/coordinator/` MUST have ≥ 6 worker types (fundamental / technical / capital-flow / sentiment / policy / industry)
- AND `src/kairos/` MUST have ≥ 16 files
- AND `src/bridge/` MUST have ≥ 34 files
- AND `src/coach/channels/` MUST have ≥ 5 channel implementations

### Requirement: REQ-3 — 4 类投资者决策路径

The system SHALL document 4 distinct decision paths, one per investor persona (散户 / 活跃 / 私募 / 企业).

#### Scenario: 散户 path

- GIVEN investor persona = 散户
- WHEN recommending entries
- THEN includes `/morning-brief` + `/watchlist-edit` + `/risk-dashboard` + `/portfolio-review`
- AND push channel = 微信 Server 酱

#### Scenario: 活跃 path

- GIVEN investor persona = 活跃
- WHEN recommending entries
- THEN includes `/screen` + `/compare` + `/backtest-run` + `/rebalance-now`
- AND push channel = 飞书 Lark Bot

#### Scenario: 私募 path

- GIVEN investor persona = 私募
- WHEN recommending entries
- THEN includes `/portfolio-review` (Brinson 归因) + `/risk-dashboard` + `/session-share`
- AND push channel = 钉钉 DingTalk

#### Scenario: 企业 path

- GIVEN investor persona = 企业
- WHEN recommending entries
- THEN includes Docker 部署 + Bridge web 控制台 + 邮件日报
- AND emphasizes 本地私有化 + 审计合规

### Requirement: REQ-4 — capability-manifest `competitorRefs` 字段

The system SHALL extend `CapabilityGroup` in `src/agent/capability-manifest.ts` with a new optional field:
```ts
competitorRefs?: string[];
```

#### Scenario: field is optional with empty default

- GIVEN an old `CapabilityGroup` without `competitorRefs`
- WHEN read by downstream consumer
- THEN it returns `[]` (via `?? []` fallback)

#### Scenario: each group has at least 1 competitor ref

- GIVEN the canonical `CAPABILITY_GROUPS` array
- WHEN validating
- THEN each entry MUST have `competitorRefs` with `length >= 1`

### Requirement: REQ-5 — 投资者故事文档

The system SHALL provide a `docs/COMPETITIVE.md` containing:
- 13 竞品矩阵完整表
- 4 唯一差异化的量化证据 (REQ-2 数字)
- 4 类投资者决策路径
- 1 段 30 字产品 sologan
- 1 张 ASCII 决策路径图
- ≥ 3 个常见质疑的反驳(为什么不用 Bloomberg / 不用 ChatGPT / 不用 Python)

#### Scenario: doc exists with required sections

- GIVEN `docs/COMPETITIVE.md` at HEAD
- WHEN validating
- THEN file MUST exist
- AND word count MUST be in `[5000, 15000]`
- AND file MUST contain all 6 required section markers

### Requirement: REQ-6 — 编译开关

The system SHALL register feature gate `COMPETITIVE_POSITIONING` in `src/agent/feature-gates.ts`.

#### Scenario: gate is registered

- GIVEN the registry at startup
- WHEN looking up `COMPETITIVE_POSITIONING`
- THEN it returns a `FeatureFlag` with `defaultEnabled: true`, `category: 'analytics'`, `owner: 'analytics'`

#### Scenario: gate is checked at module entry

- GIVEN `UPUP_FEATURE_COMPETITIVE_POSITIONING=0`
- WHEN a `src/competitive-positioning/*` function is called
- THEN it returns the default empty result (no-op)

### Requirement: REQ-7 — 测试覆盖

The system SHALL provide `src/competitive-positioning/competitive-positioning.test.ts`.

#### Scenario: 16+ tests all pass

- GIVEN `bun test src/competitive-positioning/`
- WHEN executed
- THEN MUST have ≥ 16 passing tests:
  - 5 for matrix integrity
  - 4 for 4-uniques evidence
  - 4 for decision-path completeness
  - 2 for manifest integration
  - 1 for docs/COMPETITIVE.md

## MODIFIED Requirements

(none — this is a new capability)
