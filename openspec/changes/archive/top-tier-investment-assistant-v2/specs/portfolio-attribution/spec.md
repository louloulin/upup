## ADDED Requirements

### Requirement: Brinson 3-Factor Attribution
The system SHALL provide Brinson 3-factor attribution in `src/tools/portfolio/brinson.ts` decomposing active return into: (1) **Allocation effect** (sector weight difference × benchmark sector return), (2) **Selection effect** (benchmark weight × (sector return - benchmark sector return)), and (3) **Interaction effect** (sector weight difference × (sector return - benchmark sector return)). The sum of three effects MUST equal the active return (portfolio return - benchmark return) within ±0.01%.

#### Scenario: Brinson additive identity
- **WHEN** user calls `portfolio_attribution({ method: 'brinson', portfolio, benchmark, period })`
- **THEN** system returns `{ allocation: number, selection: number, interaction: number, active_return: number }` where `allocation + selection + interaction === active_return` within 0.01% tolerance.

### Requirement: Style Attribution
The system SHALL provide style attribution in `src/tools/portfolio/style-attribution.ts` decomposing active return by 4 Barra-style factors: Size (大盘/小盘), Value (价值/成长), Momentum (动量/反转), and Volatility (高波/低波). Each factor's contribution is computed as `(portfolio_exposure - benchmark_exposure) × factor_return`.

#### Scenario: Style attribution
- **WHEN** user runs style attribution on a portfolio with overweight Value + underweight Momentum vs CSI 300
- **THEN** system returns factor contributions showing positive Value contribution and negative Momentum contribution matching the exposure differences.

### Requirement: Sector Attribution
The system SHALL provide sector attribution in `src/tools/portfolio/sector-attribution.ts` decomposing active return by sector classification. The classification MUST support 申万一级 (Shenwan Level 1, 31 sectors) and GICS Level 2 as configurable options. For each sector, the system reports: weight_diff (portfolio - benchmark), sector_return, contribution_to_active.

#### Scenario: Shenwan sector attribution
- **WHEN** user calls `portfolio_attribution({ method: 'sector', classification: 'shenwan-l1', ... })`
- **THEN** system returns 31 sectors each with weight, return, and contribution; total contributions sum to active_return.

### Requirement: Unified Attribution Entry Point
The system SHALL provide a unified `portfolio_attribution` tool in `src/tools/portfolio/attribution.ts` that dispatches to Brinson / Style / Sector sub-modules based on `method` parameter, and supports a `combined` mode that returns all three decompositions in a single response.

#### Scenario: Combined attribution
- **WHEN** user calls `portfolio_attribution({ method: 'combined', portfolio, benchmark, period })`
- **THEN** system returns `{ brinson: {...}, style: {...}, sector: {...} }` in a single response.

### Requirement: Attribution Tools Registration
The system SHALL register a single `portfolio_attribution` tool in the unified tool registry. The tool MUST accept `method` ('brinson' | 'style' | 'sector' | 'combined'), `portfolioId` (resolved via `multi-portfolio.ts`), `benchmark` (default CSI 300), and `period` (default YTD).

#### Scenario: Default benchmark
- **WHEN** user calls `portfolio_attribution({ portfolioId: 'main', period: 'ytd' })` without specifying benchmark
- **THEN** system uses CSI 300 as benchmark and returns the requested decomposition.

### Requirement: Attribution E2E Test
The system SHALL provide an end-to-end test in `src/tools/portfolio/attribution.e2e.test.ts` that: (1) creates a mock portfolio with 20 holdings spanning 5 sectors, (2) creates a mock benchmark (CSI 300) with weights, (3) runs all 4 attribution methods, (4) verifies Brinson additive identity, (5) verifies style and sector decompositions sum to active return.

#### Scenario: Full attribution E2E
- **WHEN** test runs the full attribution pipeline
- **THEN** all 4 methods complete without error; additive identities hold within tolerance; contribution sums equal active return for both style and sector methods.
