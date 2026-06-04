## ADDED Requirements

### Requirement: ASCII Candlestick Chart
The system SHALL render ASCII candlestick charts for OHLC data, fitting terminal width, with options: period (1d/5d/1m/etc.), indicators (MA, BOLL), and colors (green/red for up/down).

#### Scenario: Render 30-day K-line
- **WHEN** user asks for 30-day K-line of 600519
- **THEN** system renders ASCII candlestick chart with MA(5), MA(10), MA(20) overlays

### Requirement: ASCII Line and Heatmap Charts
The system SHALL render ASCII line charts (for time series) and heatmaps (for correlation matrix, sector performance).

#### Scenario: Sector performance heatmap
- **WHEN** user asks for today's sector performance heatmap
- **THEN** system renders 2D grid with color-coded cells (green=up, red=down)

### Requirement: Research Report Template
The system SHALL provide a Markdown research report template with structured sections: summary, fundamentals, technicals, valuation, risks, recommendation. Auto-fill from analysis data.

#### Scenario: Generate report
- **WHEN** user requests research report for 600519
- **THEN** system generates Markdown report with all sections filled, exportable to file
