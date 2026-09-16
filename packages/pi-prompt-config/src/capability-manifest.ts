/**
 * Investment Capability Manifest — surfaces the specialized investment-agent
 * capabilities (realtime / coordinator / kairos / trading / multimodal) to
 * the LLM so it knows which tool to reach for at runtime. Visibility is
 * derived from the active Pi Package tool names, never from the legacy root
 * registry.
 *
 * v4 扩展(Sprint v4-7):
 *   - `competitorRefs?: string[]`  关联 13 竞品矩阵中的竞品 id,
 *     下游消费方用 `?? []` 兜底(向后兼容)。
 *   - `markets?: string[]`  realtime 组新增 4 市场标签
 *     (a-share / us / hk / crypto),用于 4 唯一 D3 evidence。
 */

export interface CapabilityGroup {
  id: string;
  title: string;
  prefixes: string[];
  blurb: string;
  whenToUse: string[];
  /** v4 扩展:关联 13 竞品矩阵中的竞品 id,用作对比文档生成 */
  competitorRefs?: string[];
  /** v4 扩展:仅 realtime 使用,4 市场标签 */
  markets?: string[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: "realtime",
    title: "Realtime market data",
    prefixes: ["realtime_"],
    blurb:
      "Live quote + OHLC bar streaming from Eastmoney's public intraday SSE feed. Network failures fail closed; no synthetic quotes.",
    whenToUse: [
      "Track a symbol live: realtime_subscribe",
      "Build a 5s/1m OHLC feed: realtime_subscribe with aggregateMs",
      "Stop tracking: realtime_unsubscribe",
      "Inspect what's live: realtime_list_subscriptions",
    ],
    competitorRefs: ["alpha-sense", "finchat", "miaoxiang-ai", "bloomberg", "wind"],
    markets: ["a-share", "us", "hk", "crypto"],
  },
  {
    id: "coordinator",
    title: "Multi-worker investment analysis",
    prefixes: ["analyze_", "list_research_"],
    blurb:
      "Runs up to 4 parallel Pi-backed research workers (technical / fundamental / capital-flow / sentiment) and persists task state in the active Pi Session journal.",
    whenToUse: [
      "Comprehensively analyze a symbol: analyze_symbol",
      "Inspect the latest coordinator trail: list_research_tasks",
      "Limit to a single worker (e.g. only technical): pass workers=['technical-analysis']",
    ],
    competitorRefs: ["alpha-sense", "hebbia", "finchat", "miaoxiang-ai"],
  },
  {
    id: "kairos",
    title: "Proactive scanner / position monitor / event scanner (read-only)",
    prefixes: ["kairos_"],
    blurb:
      "Read-only visibility into KAIROS subsystem output that the cron / daemon runtime has already produced. Does NOT trigger scans.",
    whenToUse: [
      "Recent opportunities: kairos_recent_opportunities",
      "Recent position alerts (stop-loss / take-profit / risk-budget): kairos_recent_position_alerts",
      "Recent scanner events (price / volume / news / large-order / gap): kairos_recent_scanner_events",
      "One-shot summary across all kinds: kairos_summary",
    ],
    competitorRefs: ["bloomberg", "wind", "joinquant", "uqer"],
  },
  {
    id: "citation",
    title: "Source-attributed answer infrastructure (Gap G1)",
    prefixes: ["citation_"],
    blurb:
      "In-process CitationRegistry for numbering and rendering `[src:N]` markdown links in the final answer. Density is bounded to 1 citation per 60 tokens.",
    whenToUse: [
      "Register a citation: CitationRegistry.add({ url, kind, snippet })",
      "Render an inline link: registry.getMarkdownLink(N)",
      "Inspect coverage: extractCitationRefs(text)",
      "Assert density budget: estimateCitationDensity(text, count)",
      "Snapshot for MCP resource / audit: registry.toJSON()",
    ],
    competitorRefs: ["alpha-sense", "finchat", "hebbia", "bloomberg"],
  },
  {
    id: "trading",
    title: "Paper / live trading (sandbox default)",
    prefixes: ["place_trade_", "cancel_trade_", "get_trading_", "get_trade_"],
    blurb:
      "Pluggable BrokerAdapter. Default is the sandbox paper broker; switch with UPUP_BROKER=ibkr|xueqiu for live. All writes require explicit user approval.",
    whenToUse: [
      "Place an order: place_trade_order (market / limit / stop / stop_limit)",
      "Cancel a pending order: cancel_trade_order",
      "Check positions / balance / quote: get_trading_positions / get_trading_balance / get_trade_quote",
    ],
    competitorRefs: ["bloomberg", "joinquant", "uqer"],
  },
  {
    id: "screening",
    title: "Natural-language stock screening (Gap G4)",
    prefixes: ["nl_"],
    blurb:
      "Two-stage natural-language stock screener. Stage 1: NL → typed FilterSpec (Zod-validated). Stage 2: deterministic execution → ranked rows with a 1-line thesis per result. Universe is pluggable; static fixture ships by default for hermetic tests.",
    whenToUse: [
      "Use the native stock_screener or screen_astocks tools for structured screening; use the /screen command for free-form queries.",
      "Use the native market-data screener for structured filters; the /screen command owns free-form query parsing.",
      "Use realtime RSI/price-change fields: pass realtime=true",
    ],
    competitorRefs: ["alpha-sense", "finchat", "hebbia", "joinquant"],
  },
  {
    id: "multimodal",
    title: "Charts and research-report output",
    prefixes: ["render_chart", "render_research_report", "ascii_", "report_"],
    blurb:
      "ASCII candlestick / line / heatmap charts and a Markdown research-report template for surfacing results in a chat-friendly form.",
    whenToUse: [
      "Render an ASCII chart for a price series",
      "Generate a structured Markdown research report from findings",
    ],
    competitorRefs: ["alpha-sense", "finchat", "hebbia"],
  },
];

/**
 * Build the markdown section describing available investment capabilities,
 * filtered to only include groups that have at least one registered tool.
 * Returns "" if the registry is unavailable or no groups are visible.
 */
export function buildInvestmentCapabilitiesSection(availableToolNames: readonly string[] = []): string {
  const registeredNames = new Set(availableToolNames);

  const visible: Array<{ group: CapabilityGroup; tools: string[] }> = [];
  for (const g of CAPABILITY_GROUPS) {
    const tools: string[] = [];
    for (const name of registeredNames) {
      if (g.prefixes.some((p) => name.startsWith(p))) tools.push(name);
    }
    if (tools.length > 0) visible.push({ group: g, tools });
  }
  if (visible.length === 0) return "";

  const blocks: string[] = ["## Investment Capabilities"];
  for (const { group, tools } of visible) {
    blocks.push(`### ${group.title}`);
    blocks.push(group.blurb);
    blocks.push("");
    blocks.push("**Tools**: " + tools.map((t) => `\`${t}\``).join(", "));
    blocks.push("");
    blocks.push("**When to use**:");
    for (const b of group.whenToUse) blocks.push(`- ${b}`);
    blocks.push("");
    // v4 扩展:realtime 组标注 4 市场
    if (group.markets && group.markets.length > 0) {
      blocks.push(`**Markets covered**: ${group.markets.join(", ")}`);
      blocks.push("");
    }
    // v4 扩展:competitorRefs 兜底 `?? []`(向后兼容)
    const refs = group.competitorRefs ?? [];
    if (refs.length > 0) {
      blocks.push(`**Competitor refs**: ${refs.map((r) => `\`${r}\``).join(", ")}`);
      blocks.push("");
    }
  }
  return blocks.join("\n");
}
