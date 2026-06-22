## ADDED Requirements

### Requirement: WORKBENCH-001 — Workbench tab in AppShell
The system SHALL add a "投资工作台" tab to `app/src/renderer/src/AppShell.tsx` that activates the new `InvestmentLayout` route. The tab MUST be visible by default and MUST render in Chinese (`zh-CN`) when the active locale is `zh-CN`. The English label MUST be "Investment Workbench".

#### Scenario: Tab visible on first launch
- **WHEN** the user starts the app with `zh-CN` locale
- **THEN** the top Tab bar shows "投资工作台" as one of the entries
- **AND** clicking it loads `InvestmentLayout`

#### Scenario: Tab accessible from any locale
- **WHEN** the user switches the locale to `en`
- **THEN** the same tab is labelled "Investment Workbench"
- **AND** all child panels render their text from the i18n bundles

### Requirement: WORKBENCH-002 — Market ticker panel
`MarketTicker` SHALL poll UpUp's quote tool every 15s (configurable) and display: 上证综指, 深证成指, 创业板指, 恒生指数, 纳斯达克, and the user's watchlist. Index changes MUST be color-coded red/green per Chinese market convention (red=up, green=down). All numbers MUST be formatted with `Intl.NumberFormat('zh-CN')`.

#### Scenario: Indices update
- **WHEN** 15s polling tick fires
- **THEN** the panel shows the latest index values
- **AND** percentage change arrows reflect the new tick
- **AND** a connecting state is shown on first load

#### Scenario: Watchlist quote error
- **WHEN** a watchlist symbol's quote fetch fails
- **THEN** the symbol row shows "加载失败，点击重试"
- **AND** clicking the row retries the fetch

### Requirement: WORKBENCH-003 — Portfolio summary panel
`PortfolioSummary` SHALL call UpUp's `portfolio` tool and render: 总资产, 当日盈亏, 总盈亏, 持仓数, 现金占比. The top 5 holdings by weight MUST be listed with ticker, name, weight, day P&L, and a sparkline placeholder.

#### Scenario: Empty portfolio
- **WHEN** the user has no positions
- **THEN** the panel shows "暂无持仓 — 请使用 /dcf 试试估值，或先添加自选"
- **AND** does not throw

#### Scenario: Non-empty portfolio
- **WHEN** the user has at least one position
- **THEN** the panel shows the aggregate metrics
- **AND** the top 5 holdings are sorted by weight descending

### Requirement: WORKBENCH-004 — Watchlist CRUD
`WatchlistPanel` SHALL allow add/remove/rename of watchlist symbols and persist them via the UpUp watchlist tool. After every mutation, the panel MUST refresh quotes for the new symbol set. All labels MUST be in Chinese (新增自选, 删除, 重命名分组, 排序).

#### Scenario: Add a symbol
- **WHEN** the user enters "600519" and clicks "新增自选"
- **THEN** the symbol appears in the panel
- **AND** a quote request is fired
- **AND** the watchlist is persisted

#### Scenario: Remove a symbol
- **WHEN** the user clicks the trash icon next to a symbol
- **THEN** the symbol disappears immediately (optimistic)
- **AND** the deletion is persisted

### Requirement: WORKBENCH-005 — Risk dashboard panel
`RiskDashboard` SHALL call UpUp's `risk` tool and render: 行业暴露 (top 5 sectors with weight), 单只最大回撤 (top 3 holdings by 1Y max drawdown), 组合贝塔. Each metric MUST be color-coded with a Chinese caption (低/中/高 风险).

#### Scenario: High beta
- **WHEN** portfolio beta >= 1.5
- **THEN** the beta value is rendered with the "高风险" badge
- **AND** the label is in Chinese

#### Scenario: Missing data
- **WHEN** the risk tool returns a partial payload
- **THEN** the panel renders available sections
- **AND** missing sections show "暂无数据"

### Requirement: WORKBENCH-006 — Research panel
`ResearchPanel` SHALL call UpUp's filings/news tools and render a paginated list of recent research notes (研报速读) with: 标题, 券商, 发布日期, 摘要 (前 200 字), "展开全文" 按钮. Clicking a row opens a detail drawer that streams the full text.

#### Scenario: List loads
- **WHEN** the user opens the workbench
- **THEN** the latest 20 reports load within 3s
- **AND** the date column uses `zh-CN` locale

#### Scenario: Open detail
- **WHEN** the user clicks a row
- **THEN** the drawer shows the full content
- **AND** the URL updates with `?report=<id>` for sharing

### Requirement: WORKBENCH-007 — Locale bundles
The workbench MUST register new i18n namespaces: `investment.zh-CN.json` and `investment.en.json`. Missing keys MUST fail at startup (per the existing `i18n` test discipline).

#### Scenario: zh-CN renders
- **WHEN** locale is `zh-CN`
- **THEN** every label in the workbench reads from `investment.zh-CN.json`
- **AND** no key falls back to English

#### Scenario: en renders
- **WHEN** locale is `en`
- **THEN** every label reads from `investment.en.json`
- **AND** no key falls back to a Chinese string
