const FINANCE_PACKAGE = '@upup/pi-finance-sdk';
const MARKET_DATA_PACKAGE = '@upup/pi-market-data';
const INVESTMENT_ANALYSIS_PACKAGE = '@upup/pi-investment-analysis';
const RISK_PACKAGE = '@upup/pi-risk';
const PORTFOLIO_PACKAGE = '@upup/pi-portfolio';
const BACKTEST_PACKAGE = '@upup/pi-backtest';
const PLATFORM_PACKAGE = '@upup/pi-platform';
const RESEARCH_PACKAGE = '@upup/pi-research';
const BROWSER_PACKAGE = '@upup/pi-browser';
const CONFIG_PACKAGE = '@upup/pi-config';
const CACHE_PACKAGE = '@upup/pi-cache';
const NOTIFY_PACKAGE = '@upup/pi-notify';
const INVESTMENT_WORKFLOW_PACKAGE = '@upup/pi-investment-workflow';
const MANAGEMENT_PACKAGE = '@upup/pi-management';

const nativeTools: Readonly<Record<string, readonly string[]>> = {
  [INVESTMENT_WORKFLOW_PACKAGE]: ['invest_workflow_phase'],
  [MANAGEMENT_PACKAGE]: ['management_system_snapshot', 'management_provider_status', 'management_package_status', 'management_runtime_status'],
  [MARKET_DATA_PACKAGE]: ['get_market_data', 'stock_screener', 'get_astock_price', 'screen_astocks', 'get_sector_data', 'get_market_structure', 'get_technical_data', 'market_data_quote', 'market_data_history', 'market_trading_day', 'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days', 'market_data_provider_health', 'market_data_provider_trend', 'market_data_provider_sla', 'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions', 'kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary'],
  [FINANCE_PACKAGE]: ['get_financials', 'read_filings', 'get_stock_price', 'get_key_ratios', 'get_analyst_estimates', 'get_earnings', 'get_filings', 'alt_data_fetch', 'alt_data_search', 'get_trade_quote', 'get_trading_positions', 'get_trading_balance', 'place_trade_order', 'cancel_trade_order', 'strategy_run_paper', 'strategy_list', 'strategy_backtest', 'get_astock_financials', 'get_astock_news', 'get_company_profile', 'get_risks', 'get_sectors', 'get_investment_strategies', 'track_company', 'track_sector', 'get_knowledge_summary', 'calculate_capital_gains_tax', 'calculate_trades_tax', 'calculate_pnl', 'fund_search', 'fund_screen', 'fund_top', 'fund_detail', 'fund_performance', 'fund_holdings', 'fund_manager', 'fund_compare', 'fund_follow', 'fund_unfollow', 'fund_list', 'fund_alert_create', 'fund_alert_list', 'fund_alert_delete'],
  [RISK_PACKAGE]: ['calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'calculate_kelly', 'calculate_risk_parity', 'calculate_mean_variance', 'score_data_source', 'compare_data_sources', 'calculate_correlation_matrix', 'calculate_correlation', 'track_risk', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze'],
  [INVESTMENT_ANALYSIS_PACKAGE]: ['dcf_model', 'ddm_model', 'valuation_ratios', 'peer_comparison', 'calculate_target_price', 'quick_target_price', 'decision_dashboard', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'analyze_symbol', 'list_research_tasks', 'matrix_analysis', 'stock_analysis'],
  [PORTFOLIO_PACKAGE]: ['portfolio_attribution', 'add_position', 'update_position', 'remove_position', 'get_portfolio', 'export_portfolio', 'list_portfolios', 'create_portfolio', 'delete_portfolio', 'switch_portfolio', 'add_position_multi', 'remove_position_multi', 'get_portfolio_multi', 'compare_to_benchmark', 'calculate_alpha', 'convert_currency', 'list_currencies', 'get_exchange_rate', 'list_benchmarks', 'duckdb-query', 'duckdb-register-parquet', 'duckdb-list-tables', 'duckdb-timeseries', 'duckdb-portfolio-analysis', 'duckdb-import-csv'],
  [BACKTEST_PACKAGE]: ['evaluate_trade', 'run_backtest', 'get_backtest_summary', 'calculate_win_rate', 'backtest_dca', 'backtest_lumpsum', 'backtest_threshold'],
  [PLATFORM_PACKAGE]: ['bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'send_user_file', 'heartbeat', 'cron', 'memory_search', 'memory_get', 'memory_update', 'enter_plan_mode', 'exit_plan_mode', 'add_plan_step', 'update_plan_step', 'list_plan_steps', 'create_todo', 'update_todo', 'list_todos', 'delete_todo', 'notebook_read', 'notebook_create', 'notebook_edit_cell', 'notebook_insert_cell', 'notebook_delete_cell', 'list_mcp_resources', 'read_mcp_resource', 'mcp_auth_set', 'mcp_auth_get', 'mcp_auth_clear', 'task_create', 'task_get', 'task_list', 'task_stop', 'task_update', 'task_result', 'create_worktree', 'remove_worktree', 'list_worktree', 'add_to_watchlist', 'remove_from_watchlist', 'get_watchlist', 'add_watchlist_alert', 'check_watchlist_alerts', 'clear_watchlist_alert', 'export_watchlist', 'export_data', 'list_skills', 'search_skills', 'get_skill', 'skill_info', 'skill', 'execute_skill', 'lsp_complete', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_diagnostics', 'run_workflow', 'swarm_team_create', 'swarm_agent_spawn', 'swarm_agent_message', 'swarm_agent_results', 'swarm_team_list', 'tool_search', 'tool_get', 'tool_list', 'sleep', 'monitor', 'send_message', 'snip_tool', 'ask_confirm', 'ask_select', 'ask_multi_select', 'ask_input', 'ask_response', 'agent', 'fork_subagent', 'resume_agent', 'agent_memory', 'list_agents', 'run_builtin_agent'],
  [RESEARCH_PACKAGE]: ['web_fetch', 'web_search', 'x_search', 'analyze_sentiment', 'detect_events', 'extract_entities', 'research_deep_search', 'earnings_preview'],
  [BROWSER_PACKAGE]: ['browser'],
  [CONFIG_PACKAGE]: ['config_get', 'config_set', 'config_list'],
  [CACHE_PACKAGE]: ['get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info'],
  [NOTIFY_PACKAGE]: ['notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions'],
};

const ownership: Readonly<Record<string, readonly string[]>> = {
  [INVESTMENT_WORKFLOW_PACKAGE]: ['invest_workflow_phase'],
  [FINANCE_PACKAGE]: [
    'get_financials', 'read_filings', 'get_stock_price', 'get_key_ratios', 'get_analyst_estimates', 'get_earnings', 'get_filings', 'get_astock_financials', 'get_astock_news',
    'fund_search', 'fund_detail', 'fund_performance', 'fund_holdings', 'fund_manager', 'fund_compare',
    'fund_screen', 'fund_top', 'fund_follow', 'fund_unfollow', 'fund_list', 'fund_alert_create',
    'fund_alert_list', 'fund_alert_delete', 'alt_data_fetch', 'alt_data_search', 'get_company_profile', 'get_investment_strategies', 'track_company', 'track_sector', 'get_knowledge_summary',
    'get_risks', 'get_sectors',
    'calculate_trades_tax', 'calculate_capital_gains_tax',
    'calculate_pnl',
    'get_trading_positions', 'get_trading_balance', 'get_trade_quote', 'place_trade_order', 'cancel_trade_order',
    'strategy_run_paper', 'strategy_list', 'strategy_backtest',
  ],
  [MARKET_DATA_PACKAGE]: [
    'get_market_data', 'stock_screener', 'get_astock_price', 'screen_astocks', 'get_sector_data', 'get_market_structure', 'get_technical_data',
    'market_data_quote', 'market_data_history', 'market_trading_day',
    'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days',
    'market_data_provider_health', 'market_data_provider_trend', 'market_data_provider_sla',
    'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions',
    'kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary',
  ],
  [INVESTMENT_ANALYSIS_PACKAGE]: [
    'dcf_model', 'ddm_model', 'peer_comparison', 'valuation_ratios', 'calculate_target_price',
    'quick_target_price', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'decision_dashboard', 'calculate_technical_indicators', 'calculate_kdj',
    'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv',
    'analyze_symbol', 'list_research_tasks', 'matrix_analysis', 'stock_analysis',
  ],
  [RISK_PACKAGE]: [
    'calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'calculate_kelly',
    'calculate_risk_parity', 'calculate_mean_variance', 'calculate_correlation_matrix', 'calculate_correlation',
    'score_data_source', 'compare_data_sources', 'track_risk', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze',
  ],
  [PORTFOLIO_PACKAGE]: [
    'portfolio_attribution', 'add_position', 'update_position', 'remove_position', 'get_portfolio',
    'export_portfolio', 'list_portfolios', 'create_portfolio', 'delete_portfolio', 'switch_portfolio',
    'add_position_multi', 'remove_position_multi', 'get_portfolio_multi', 'compare_to_benchmark',
    'calculate_alpha', 'convert_currency', 'list_currencies', 'get_exchange_rate', 'list_benchmarks', 'duckdb-portfolio-analysis',
    'duckdb-query', 'duckdb-register-parquet', 'duckdb-list-tables', 'duckdb-timeseries', 'duckdb-import-csv',
  ],
  [BACKTEST_PACKAGE]: [
    'evaluate_trade', 'run_backtest', 'get_backtest_summary', 'calculate_win_rate', 'backtest_dca', 'backtest_lumpsum', 'backtest_threshold',
  ],
  [PLATFORM_PACKAGE]: [
    'skill', 'bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'send_user_file', 'agent', 'fork_subagent', 'resume_agent', 'agent_memory', 'list_agents', 'run_builtin_agent',
    'heartbeat', 'cron', 'memory_search', 'memory_get', 'memory_update',
    'list_mcp_resources', 'read_mcp_resource', 'mcp_auth_set', 'mcp_auth_get', 'mcp_auth_clear',
    'agent', 'enter_plan_mode', 'exit_plan_mode', 'add_plan_step', 'update_plan_step', 'list_plan_steps',
    'create_todo', 'update_todo', 'list_todos', 'delete_todo', 'notebook_read', 'notebook_create', 'notebook_edit_cell', 'notebook_insert_cell', 'notebook_delete_cell', 'task_create', 'task_get', 'task_list',
    'task_stop', 'task_update', 'task_result', 'ask_confirm', 'ask_select', 'ask_multi_select',
    'ask_input', 'ask_response', 'create_worktree', 'remove_worktree', 'list_worktree', 'search_skills',
    'get_skill', 'send_message', 'snip_tool', 'sleep', 'monitor', 'tool_search', 'tool_get', 'tool_list',
    'notebook_read', 'notebook_create', 'notebook_edit_cell', 'notebook_insert_cell',
    'notebook_delete_cell',
    'fork_subagent', 'resume_agent', 'agent_memory', 'list_agents', 'run_builtin_agent', 'lsp_complete',
    'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_diagnostics', 'export_watchlist', 'export_data', 'run_workflow', 'add_to_watchlist', 'remove_from_watchlist',
    'get_watchlist', 'add_watchlist_alert', 'check_watchlist_alerts', 'clear_watchlist_alert', 'swarm_team_create', 'swarm_agent_spawn',
    'swarm_agent_message', 'swarm_agent_results', 'swarm_team_list', 'execute_skill', 'list_skills', 'sleep', 'monitor', 'send_message', 'snip_tool', 'ask_confirm', 'ask_select', 'ask_multi_select', 'ask_input', 'ask_response',
    'skill_info',
  ],
  [RESEARCH_PACKAGE]: ['web_fetch', 'web_search', 'x_search', 'analyze_sentiment', 'detect_events', 'extract_entities', 'research_deep_search', 'earnings_preview'],
  [BROWSER_PACKAGE]: ['browser'],
  [CONFIG_PACKAGE]: ['config_get', 'config_set', 'config_list'],
  [CACHE_PACKAGE]: ['get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info'],
  [NOTIFY_PACKAGE]: ['notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions'],
};

const packageToolSets = new Map(Object.entries(ownership).map(([packageName, names]) => [packageName, new Set(names)]));

export const PI_FINANCE_PACKAGE_NAMES = Object.freeze(Object.keys(ownership));

export function packageOwnsTool(packageName: string, toolName: string): boolean {
  return packageToolSets.get(packageName)?.has(toolName) ?? false;
}

export function getOwnedToolNames(packageName: string): readonly string[] {
  return ownership[packageName] ?? [];
}

export function packageProvidesNativeTool(packageName: string, toolName: string): boolean {
  return nativeTools[packageName]?.includes(toolName) ?? false;
}
