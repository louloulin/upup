## ADDED Requirements

### Requirement: Brinson Attribution
The system SHALL compute Brinson attribution (allocation, selection, interaction effects) for a portfolio against a user-specified benchmark over a date range.

#### Scenario: Brinson report
- **WHEN** user runs attribution on portfolio vs CSI300 for Q1 2026
- **THEN** system returns allocation effect, selection effect, interaction effect by sector, summing to total active return

### Requirement: Style Attribution
The system SHALL decompose portfolio returns into style factor exposures (large/small, value/growth, momentum, quality) using a factor model.

#### Scenario: Style decomposition
- **WHEN** user runs style attribution
- **THEN** system returns factor contributions (large-cap, value, momentum, etc.) and residual alpha

### Requirement: Industry Attribution
The system SHALL compute industry-level contribution using Shenwan Level-1 or GICS classification.

#### Scenario: Industry contribution report
- **WHEN** user runs industry attribution
- **THEN** system returns contribution to total return by industry sector
