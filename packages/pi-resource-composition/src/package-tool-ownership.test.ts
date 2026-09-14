import { describe, expect, test } from 'bun:test';
import { getOwnedToolNames, packageOwnsTool, packageProvidesNativeTool, PI_FINANCE_PACKAGE_NAMES } from './package-tool-ownership.js';
import { INVESTMENT_PROFILES } from './agent-spec.js';

describe('Pi finance package tool ownership', () => {
  test('declares every built-in finance package with a non-empty ownership boundary', () => {
    expect(PI_FINANCE_PACKAGE_NAMES).toEqual([
      '@upup/pi-investment-workflow',
      '@upup/pi-finance-sdk',
      '@upup/pi-market-data',
      '@upup/pi-investment-analysis',
      '@upup/pi-risk',
      '@upup/pi-portfolio',
      '@upup/pi-backtest',
      '@upup/pi-platform',
      '@upup/pi-research',
      '@upup/pi-technical',
      '@upup/pi-browser',
      '@upup/pi-corporate-actions',
      '@upup/pi-quant',
      '@upup/pi-config',
      '@upup/pi-cache',
      '@upup/pi-notify',
    ]);
    for (const packageName of PI_FINANCE_PACKAGE_NAMES) expect(getOwnedToolNames(packageName).length).toBeGreaterThan(0);
  });

  test('does not let one built-in package claim another package tool', () => {
    expect(packageOwnsTool('@upup/pi-market-data', 'calculate_var')).toBe(false);
    expect(packageOwnsTool('@upup/pi-risk', 'run_backtest')).toBe(false);
    expect(packageOwnsTool('@upup/pi-backtest', 'portfolio_attribution')).toBe(false);
    expect(packageOwnsTool('@upup/pi-portfolio', 'dcf_model')).toBe(false);
    expect(packageOwnsTool('@upup/pi-investment-analysis', 'get_market_data')).toBe(false);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'check_trading_day')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'get_market_data')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'get_astock_price')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'stock_screener')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'screen_astocks')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'get_sector_data')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'get_market_structure')).toBe(true);
expect(packageProvidesNativeTool('@upup/pi-market-data', 'get_technical_data')).toBe(true);
expect(packageProvidesNativeTool('@upup/pi-market-data', 'realtime_subscribe')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'realtime_unsubscribe')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'realtime_list_subscriptions')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'kairos_recent_opportunities')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'kairos_recent_position_alerts')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'kairos_recent_scanner_events')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-market-data', 'kairos_summary')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_trade_quote')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'place_trade_order')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'cancel_trade_order')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_financials')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'read_filings')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'alt_data_fetch')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'alt_data_search')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_search')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_astock_financials')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_astock_news')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_company_profile')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_risks')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_sectors')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'get_investment_strategies')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'calculate_capital_gains_tax')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'calculate_trades_tax')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'calculate_pnl')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_screen')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_top')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_compare')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_follow')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_unfollow')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_list')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_alert_create')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_alert_list')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-finance-sdk', 'fund_alert_delete')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_var')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_max_drawdown')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_kelly')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'get_short_interest')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_short_interest_ratio')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'detect_short_squeeze')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_risk_parity')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_option_price')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_option_greeks')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_implied_volatility')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'decision_dashboard')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_technical_indicators')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_kdj')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_boll')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_wr')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_cci')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_atr')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_obv')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_mean_variance')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'score_data_source')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'compare_data_sources')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_correlation_matrix')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-risk', 'calculate_correlation')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'dcf_model')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'ddm_model')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'valuation_ratios')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'peer_comparison')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'calculate_target_price')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'list_research_tasks')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-analysis', 'quick_target_price')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-portfolio', 'portfolio_attribution')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-backtest', 'run_backtest')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-investment-workflow', 'invest_workflow_phase')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-backtest', 'evaluate_trade')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-backtest', 'get_backtest_summary')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-backtest', 'calculate_win_rate')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-platform', 'memory_search')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-platform', 'memory_get')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-platform', 'memory_update')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-platform', 'heartbeat')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-platform', 'cron')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-platform', 'cron')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-research', 'web_fetch')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-browser', 'browser')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-config', 'config_get')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-config', 'config_set')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-config', 'config_list')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-cache', 'get_cache_stats')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-cache', 'clear_cache')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-cache', 'invalidate_cache')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-cache', 'get_cache_info')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-notify', 'notify')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-notify', 'notify_list')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-notify', 'subscribe_pr')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-notify', 'unsubscribe_pr')).toBe(true);
    expect(packageProvidesNativeTool('@upup/pi-notify', 'list_pr_subscriptions')).toBe(true);
  });

  test('keeps the production tool ownership set explicit and deterministic', () => {
    expect(packageOwnsTool('@upup/pi-finance-sdk', 'get_financials')).toBe(true);
    expect(packageOwnsTool('@upup/pi-market-data', 'get_market_data')).toBe(true);
    expect(packageOwnsTool('@upup/pi-investment-analysis', 'dcf_model')).toBe(true);
    expect(packageOwnsTool('@upup/pi-risk', 'calculate_var')).toBe(true);
    expect(packageOwnsTool('@upup/pi-portfolio', 'portfolio_attribution')).toBe(true);
    expect(packageOwnsTool('@upup/pi-backtest', 'run_backtest')).toBe(true);
    expect(packageOwnsTool('@upup/pi-platform', 'memory_search')).toBe(true);
    expect(packageOwnsTool('@upup/pi-finance-sdk', 'get_trading_positions')).toBe(true);
    expect(packageOwnsTool('@upup/pi-finance-sdk', 'place_trade_order')).toBe(true);
    expect(packageOwnsTool('@upup/pi-finance-sdk', 'calculate_trades_tax')).toBe(true);
    expect(packageOwnsTool('@upup/pi-finance-sdk', 'calculate_capital_gains_tax')).toBe(true);
    expect(packageOwnsTool('@upup/pi-market-data', 'kairos_summary')).toBe(true);
    expect(packageOwnsTool('@upup/pi-research', 'web_fetch')).toBe(true);
    expect(packageOwnsTool('@upup/pi-research', 'earnings_preview')).toBe(true);
    expect(packageOwnsTool('@upup/pi-browser', 'browser')).toBe(true);
    expect(packageOwnsTool('@upup/pi-config', 'config_get')).toBe(true);
    expect(packageOwnsTool('@upup/pi-config', 'config_set')).toBe(true);
    expect(packageOwnsTool('@upup/pi-config', 'config_list')).toBe(true);
    expect(packageOwnsTool('@upup/pi-cache', 'get_cache_stats')).toBe(true);
    expect(packageOwnsTool('@upup/pi-notify', 'notify')).toBe(true);
    expect(packageOwnsTool('@upup/pi-investment-analysis', 'analyze_symbol')).toBe(true);
    expect(packageOwnsTool('@upup/pi-risk', 'track_risk')).toBe(true);
    expect(packageOwnsTool('@upup/pi-portfolio', 'duckdb-portfolio-analysis')).toBe(true);
    expect(packageOwnsTool('@upup/untrusted-package', 'get_financials')).toBe(false);
  });

  test('covers every declared investment profile tool exactly once', () => {
    for (const profile of Object.values(INVESTMENT_PROFILES)) {
      if (profile.tools === '*') continue;
      for (const toolName of profile.tools) {
        const owners = PI_FINANCE_PACKAGE_NAMES.filter((packageName) => packageOwnsTool(packageName, toolName));
        expect(owners, `${profile.id}:${toolName}`).toHaveLength(1);
      }
    }
  });

});
