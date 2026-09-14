import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageRoot = join(root, 'packages', 'pi-finance-sdk');
const marketDataPackageRoot = join(root, 'packages', 'pi-market-data');
const investmentAnalysisPackageRoot = join(root, 'packages', 'pi-investment-analysis');
const riskPackageRoot = join(root, 'packages', 'pi-risk');
const portfolioPackageRoot = join(root, 'packages', 'pi-portfolio');
const backtestPackageRoot = join(root, 'packages', 'pi-backtest');
const platformPackageRoot = join(root, 'packages', 'pi-platform');
const researchPackageRoot = join(root, 'packages', 'pi-research');
const browserPackageRoot = join(root, 'packages', 'pi-browser');
const configPackageRoot = join(root, 'packages', 'pi-config');
const cachePackageRoot = join(root, 'packages', 'pi-cache');
const notifyPackageRoot = join(root, 'packages', 'pi-notify');
const investmentWorkflowPackageRoot = join(root, 'packages', 'pi-investment-workflow');
const managementPackageRoot = join(root, 'packages', 'pi-management');
const technicalPackageRoot = join(root, 'packages', 'pi-technical');
const corporateActionsPackageRoot = join(root, 'packages', 'pi-corporate-actions');

const failures: string[] = [];
const rootBuildScript = readFileSync(join(root, 'package.json'), 'utf8');
const resourceCopyScript = readFileSync(join(root, 'scripts', 'copy-pi-package-resources.ts'), 'utf8');
const ownershipSource = readFileSync(join(root, 'src/runtime/pi/package-tool-ownership.ts'), 'utf8');
const shipsPackage = (packageName: string): boolean => resourceCopyScript.includes(`'${packageName}'`)
  && (rootBuildScript.includes('copy-pi-package-resources.ts') || rootBuildScript.includes(`dist/${packageName}/package.json`));
const packageExtensionFiles = [
  join(root, 'packages/pi-finance-sdk/extensions/index.ts'),
  join(root, 'packages/pi-market-data/extensions/index.ts'),
  join(root, 'packages/pi-investment-analysis/extensions/index.ts'),
  join(root, 'packages/pi-risk/extensions/index.ts'),
  join(root, 'packages/pi-portfolio/extensions/index.ts'),
  join(root, 'packages/pi-backtest/extensions/index.ts'),
  join(root, 'packages/pi-platform/extensions/index.ts'),
  join(root, 'packages/pi-research/extensions/index.ts'),
  join(root, 'packages/pi-browser/extensions/index.ts'),
  join(root, 'packages/pi-config/extensions/index.ts'),
  join(root, 'packages/pi-cache/extensions/index.ts'),
  join(root, 'packages/pi-notify/extensions/index.ts'),
  join(root, 'packages/pi-investment-workflow/extensions/index.ts'),
  join(root, 'packages/pi-management/extensions/index.ts'),
  join(root, 'packages/pi-technical/extensions/index.ts'),
  join(root, 'packages/pi-corporate-actions/extensions/index.ts'),
];
const nativeRiskTools = ['calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'calculate_kelly', 'calculate_risk_parity', 'calculate_mean_variance', 'score_data_source', 'compare_data_sources', 'calculate_correlation_matrix', 'calculate_correlation', 'track_risk', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze'];
const nativeMarketTools = ['get_market_data', 'stock_screener', 'get_astock_price', 'screen_astocks', 'get_sector_data', 'get_market_structure', 'get_technical_data', 'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days'];
const nativeInvestmentAnalysisTools = ['calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv'];
const nativePortfolioTools = ['duckdb-query', 'duckdb-register-parquet', 'duckdb-list-tables', 'duckdb-timeseries', 'duckdb-portfolio-analysis', 'duckdb-import-csv'];
const nativeFinanceTools = ['read_filings', 'alt_data_fetch', 'alt_data_search', 'place_trade_order', 'cancel_trade_order', 'strategy_run_paper', 'strategy_list', 'strategy_backtest'];
const nativePlatformTools = ['create_worktree', 'remove_worktree', 'list_worktree', 'add_to_watchlist', 'remove_from_watchlist', 'get_watchlist', 'add_watchlist_alert', 'check_watchlist_alerts', 'clear_watchlist_alert', 'export_watchlist', 'lsp_complete', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_diagnostics', 'swarm_team_create', 'swarm_agent_spawn', 'swarm_agent_message', 'swarm_agent_results', 'swarm_team_list', 'memory_search', 'memory_get', 'memory_update', 'heartbeat', 'cron', 'enter_plan_mode', 'exit_plan_mode', 'add_plan_step', 'update_plan_step', 'list_plan_steps', 'create_todo', 'update_todo', 'list_todos', 'delete_todo', 'notebook_read', 'notebook_create', 'notebook_edit_cell', 'notebook_insert_cell', 'notebook_delete_cell', 'list_mcp_resources', 'read_mcp_resource', 'mcp_auth_set', 'mcp_auth_get', 'mcp_auth_clear', 'task_create', 'task_get', 'task_list', 'task_stop', 'task_update', 'task_result'];
const nativeResearchTools = ['web_fetch', 'web_search', 'x_search', 'earnings_preview'];
const investmentWorkflowManifest = JSON.parse(readFileSync(join(investmentWorkflowPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (investmentWorkflowManifest.name !== '@upup/pi-investment-workflow') failures.push('investment workflow package name is not stable');
if (investmentWorkflowManifest.version !== '0.1.0') failures.push('investment workflow package version must be 0.1.0');
if (!investmentWorkflowManifest.keywords?.includes('pi-package')) failures.push('investment workflow package must declare pi-package keyword');
if (investmentWorkflowManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('investment workflow Pi coding-agent peer must be pinned to 0.84.3');
if (investmentWorkflowManifest.pi?.source !== 'builtin:upup') failures.push('investment workflow package must declare builtin:upup source');
if (!investmentWorkflowManifest.scripts?.test?.includes('bun test') || !investmentWorkflowManifest.scripts.test.includes('./test.ts')) failures.push('investment workflow package test script must execute ./test.ts');
if (!investmentWorkflowManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('investment workflow package build must emit declarations');
if (!resourceCopyScript.includes("'pi-investment-workflow'")) failures.push('production build must ship investment workflow Pi resources');
const investmentWorkflowExtensionSource = readFileSync(join(investmentWorkflowPackageRoot, 'extensions', 'index.ts'), 'utf8');
if (!investmentWorkflowExtensionSource.includes("name: 'invest_workflow_phase'") || !ownershipSource.includes("'invest_workflow_phase'")) failures.push('investment workflow package must natively register and own invest_workflow_phase');
if (/from ['"](?:\.\.\/){2,}src\//.test(investmentWorkflowExtensionSource)) failures.push('investment workflow Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(investmentWorkflowManifest.pi?.extensions ?? []), ...(investmentWorkflowManifest.pi?.skills ?? []), ...(investmentWorkflowManifest.pi?.prompts ?? []),
  ...(investmentWorkflowManifest.pi?.workflows ?? []), ...(investmentWorkflowManifest.pi?.policies ?? []), ...(investmentWorkflowManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(investmentWorkflowPackageRoot, relative))) failures.push(`investment workflow declared Pi resource does not exist: ${relative}`);
}
for (const extensionPath of packageExtensionFiles) {
  const source = readFileSync(extensionPath, 'utf8');
  const isPureNativeRiskExtension = extensionPath.endsWith('packages/pi-risk/extensions/index.ts')
    && nativeRiskTools.every((toolName) => source.includes(`name: '${toolName}'`));
  const isNativeMarketExtension = extensionPath.endsWith('packages/pi-market-data/extensions/index.ts')
    && nativeMarketTools.every((toolName) => source.includes(`name: '${toolName}'`));
  const isNativeResearchExtension = extensionPath.endsWith('packages/pi-research/extensions/index.ts')
    && nativeResearchTools.every((toolName) => source.includes(`name: '${toolName}'`));
  const isNativeBrowserExtension = extensionPath.endsWith('packages/pi-browser/extensions/index.ts') && source.includes("name: 'browser'");
  const isNativeConfigExtension = extensionPath.endsWith('packages/pi-config/extensions/index.ts') && source.includes("name: 'config_get'") && source.includes("name: 'config_set'") && source.includes("name: 'config_list'");
  const isNativeCacheExtension = extensionPath.endsWith('packages/pi-cache/extensions/index.ts') && source.includes("name: 'get_cache_stats'") && source.includes("name: 'clear_cache'") && source.includes("name: 'invalidate_cache'") && source.includes("name: 'get_cache_info'");
  const isNativeNotifyExtension = extensionPath.endsWith('packages/pi-notify/extensions/index.ts') && source.includes("name: 'notify'") && source.includes("name: 'notify_list'") && source.includes("name: 'subscribe_pr'");
  const isNativePlatformExtension = extensionPath.endsWith('packages/pi-platform/extensions/index.ts') && nativePlatformTools.every((toolName) => source.includes(`name: '${toolName}'`));
  const usesExplicitCapabilityRegistry = source.includes('@upup/pi-capability-registry')
    && (source.includes('registerPiCapabilityHost') || source.includes('resolvePiCapabilityHost'));
  if (!isPureNativeRiskExtension && !isNativeMarketExtension && !isNativeResearchExtension && !isNativeBrowserExtension && !isNativeConfigExtension && !isNativeCacheExtension && !isNativeNotifyExtension && !isNativePlatformExtension && !usesExplicitCapabilityRegistry && !source.includes('__upupPiHosts')) failures.push(`Pi extension must use the package-scoped host registry: ${extensionPath}`);
  if (source.includes('__upupPiHost') && !source.includes('__upupPiHosts') && !usesExplicitCapabilityRegistry) failures.push(`Pi extension uses a legacy single-host global: ${extensionPath}`);
}
for (const toolName of ['get_trading_positions', 'get_trading_balance', 'get_trade_quote', 'place_trade_order', 'cancel_trade_order']) {
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`production trading tool has no Pi package ownership: ${toolName}`);
}
const financeExtensionSource = readFileSync(join(packageRoot, 'extensions', 'index.ts'), 'utf8');
if (!financeExtensionSource.includes("name: 'get_trade_quote'")) failures.push('finance Pi package must natively register get_trade_quote');
if (!readFileSync(join(packageRoot, 'extensions', 'index.ts'), 'utf8').includes("name: 'get_trading_positions'")) failures.push('finance Pi package must natively register get_trading_positions');
if (!financeExtensionSource.includes("name: 'get_trading_balance'")) failures.push('finance Pi package must natively register get_trading_balance');
for (const toolName of ['place_trade_order', 'cancel_trade_order']) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
}
if (!financeExtensionSource.includes("name: 'fund_search'")) failures.push('finance Pi package must natively register fund_search');
if (!financeExtensionSource.includes("name: 'fund_screen'")) failures.push('finance Pi package must natively register fund_screen');
if (!financeExtensionSource.includes("name: 'fund_top'")) failures.push('finance Pi package must natively register fund_top');
if (!financeExtensionSource.includes("name: 'get_astock_financials'")) failures.push('finance Pi package must natively register get_astock_financials');
if (!financeExtensionSource.includes("name: 'get_financials'")) failures.push('finance Pi package must natively register get_financials');
if (!financeExtensionSource.includes("name: 'read_filings'")) failures.push('finance Pi package must natively register read_filings');
if (!existsSync(join(packageRoot, 'src', 'filings.ts'))) failures.push('finance package native filings implementation is missing');
for (const toolName of nativeFinanceTools) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`finance tool has no Pi package ownership: ${toolName}`);
}
if (!existsSync(join(packageRoot, 'src', 'alt-data.ts'))) failures.push('finance package native alternative-data implementation is missing');
if (!financeExtensionSource.includes("name: 'get_astock_news'")) failures.push('finance Pi package must natively register get_astock_news');
if (!financeExtensionSource.includes("name: 'get_investment_strategies'")) failures.push('finance Pi package must natively register get_investment_strategies');
for (const toolName of ['track_company', 'track_sector', 'get_knowledge_summary']) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`finance native ownership is missing ${toolName}`);
}
for (const toolName of ['get_company_profile', 'get_risks', 'get_sectors']) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`finance native ownership is missing ${toolName}`);
}
for (const toolName of ['calculate_capital_gains_tax', 'calculate_trades_tax', 'calculate_pnl']) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`finance native ownership is missing ${toolName}`);
}
for (const toolName of ['fund_detail', 'fund_performance', 'fund_holdings', 'fund_manager']) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
}
for (const toolName of ['fund_compare', 'fund_follow', 'fund_unfollow', 'fund_list', 'fund_alert_create', 'fund_alert_list', 'fund_alert_delete']) {
  if (!financeExtensionSource.includes(`name: '${toolName}'`)) failures.push(`finance Pi package must natively register ${toolName}`);
}
if (!existsSync(join(packageRoot, 'src', 'fund-catalog.ts'))) failures.push('finance Pi package native fund catalog implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'sandbox-read.ts'))) failures.push('finance Pi package native sandbox read implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'fund-watchlist.ts'))) failures.push('finance Pi package native fund watchlist implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'fund-alerts.ts'))) failures.push('finance Pi package native fund alert implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'astock-financials.ts'))) failures.push('finance Pi package native A-share financials implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'astock-news.ts'))) failures.push('finance Pi package native A-share news implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'financial-snapshot.ts'))) failures.push('finance Pi package native financial snapshot implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'knowledge-snapshot.ts'))) failures.push('finance Pi package native investment knowledge implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'tax-calculator.ts'))) failures.push('finance Pi package native tax/P&L implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'strategy-catalog.ts'))) failures.push('finance Pi package native strategy catalog implementation is missing');
if (!existsSync(join(packageRoot, 'src', 'knowledge-journal.ts'))) failures.push('finance Pi package native knowledge journal implementation is missing');

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  name?: string;
  version?: string;
  keywords?: string[];
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pi?: { source?: string; commands?: string[]; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (manifest.name !== '@upup/pi-finance-sdk') failures.push('finance package name is not stable');
if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) failures.push('finance package version must be exact semver');
if (!manifest.keywords?.includes('pi-package')) failures.push('finance package must declare pi-package keyword');
if (manifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('Pi coding-agent peer must be pinned to 0.84.3');
if (manifest.pi?.source !== 'builtin:upup') failures.push('finance package must declare the allowlisted builtin:upup source');
const expectedCommands = ['invest', 'dossier', 'strategy', 'risk-dashboard', 'portfolio-review'];
if (JSON.stringify(manifest.pi?.commands ?? []) !== JSON.stringify(expectedCommands)) failures.push('finance package commands must declare the stable Pi investment command set');
const expectedProfileSkills = [
  'finance-evidence', 'financial-research', 'fundamental-analysis', 'market-data',
  'investment-workflow', 'research-planning', 'risk-management', 'portfolio-management',
  'a-share-risk', 'trade-execution', 'position-management', 'research-report-writing',
  'citation-quality', 'verification',
];
for (const skillName of expectedProfileSkills) {
  const skillPath = join(packageRoot, 'skills', skillName, 'SKILL.md');
  if (!existsSync(skillPath)) failures.push(`finance package skill required by an investment profile is missing: ${skillName}`);
  else if (!new RegExp(`^name:\\s*${skillName}\\s*$`, 'm').test(readFileSync(skillPath, 'utf8'))) failures.push(`finance package skill frontmatter name is invalid: ${skillName}`);
}
for (const [section, dependencies] of Object.entries({
  dependencies: manifest.dependencies,
  devDependencies: manifest.devDependencies,
  peerDependencies: manifest.peerDependencies,
  optionalDependencies: manifest.optionalDependencies,
})) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${section} ${name} must use an exact semver in the finance package`);
  }
}
if (!manifest.scripts?.test?.includes('bun test') || !manifest.scripts.test.includes('./test.ts')) failures.push('finance package test script must execute the core ./test.ts suite');
if (!manifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('finance package build must emit declarations');
if (!shipsPackage('pi-finance-sdk')) failures.push('production build must ship the built-in finance Pi package resources');
const extensionSource = readFileSync(join(packageRoot, 'extensions', 'index.ts'), 'utf8');
const hostContractSource = readFileSync(join(packageRoot, 'extensions', 'host-contract.ts'), 'utf8');
if (/from ['"](?:\.\.\/){2,}src\//.test(extensionSource)) failures.push('finance Pi extension must not depend on workspace source modules');
for (const requiredContractMarker of [
  'upup.pi.host.v1',
  '@upup/pi-finance-sdk',
  '0.1.0',
  'sessionId',
  'capabilities',
  'getToolDefinitions',
]) {
  if (!extensionSource.includes(requiredContractMarker) && !hostContractSource.includes(requiredContractMarker)) {
    failures.push(`finance Pi extension must use the versioned host contract marker: ${requiredContractMarker}`);
  }
}
const commandSource = readFileSync(join(packageRoot, 'extensions', 'commands.ts'), 'utf8');
for (const command of expectedCommands) {
  if (!commandSource.includes(`'${command}'`)) failures.push(`finance Pi command is not registered: ${command}`);
}
for (const relative of [
  ...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? []), ...(manifest.pi?.prompts ?? []),
  ...(manifest.pi?.workflows ?? []), ...(manifest.pi?.policies ?? []), ...(manifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(packageRoot, relative))) failures.push(`declared Pi resource does not exist: ${relative}`);
}

const marketManifest = JSON.parse(readFileSync(join(marketDataPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (marketManifest.name !== '@upup/pi-market-data') failures.push('market-data package name is not stable');
if (marketManifest.version !== '0.1.0') failures.push('market-data package version must be 0.1.0');
if (!marketManifest.keywords?.includes('pi-package')) failures.push('market-data package must declare pi-package keyword');
if (marketManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('market-data Pi coding-agent peer must be pinned to 0.84.3');
if (marketManifest.pi?.source !== 'builtin:upup') failures.push('market-data package must declare the allowlisted builtin:upup source');
for (const relative of [
  ...(marketManifest.pi?.extensions ?? []), ...(marketManifest.pi?.skills ?? []), ...(marketManifest.pi?.prompts ?? []),
  ...(marketManifest.pi?.workflows ?? []), ...(marketManifest.pi?.policies ?? []), ...(marketManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(marketDataPackageRoot, relative))) failures.push(`market-data declared Pi resource does not exist: ${relative}`);
}
if (!marketManifest.scripts?.test?.includes('bun test') || !marketManifest.scripts.test.includes('./test.ts')) failures.push('market-data package test script must execute ./test.ts');
const marketExtensionSource = readFileSync(join(marketDataPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['market_data_quote', 'market_data_history', 'market_data_provider_health', 'market_data_provider_sla', 'market_trading_day', 'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days', 'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions', 'kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary']) {
  const registered = marketExtensionSource.includes(`name: '${toolName}'`) || marketExtensionSource.includes(`'${toolName}'`);
  if (!registered) failures.push(`market-data Pi tool is not registered: ${toolName}`);
}
if (!existsSync(join(marketDataPackageRoot, 'src', 'calendar.ts'))) failures.push('market-data native calendar implementation is missing');
if (!existsSync(join(marketDataPackageRoot, 'src', 'realtime', 'index.ts'))) failures.push('market-data native realtime implementation is missing');
if (/from ['"](?:\.\.\/){2,}src\//.test(marketExtensionSource)) failures.push('market-data Pi extension must not depend on workspace source modules');

const analysisManifest = JSON.parse(readFileSync(join(investmentAnalysisPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (analysisManifest.name !== '@upup/pi-investment-analysis') failures.push('investment-analysis package name is not stable');
if (analysisManifest.version !== '0.1.0') failures.push('investment-analysis package version must be 0.1.0');
if (!analysisManifest.keywords?.includes('pi-package')) failures.push('investment-analysis package must declare pi-package keyword');
if (analysisManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('investment-analysis Pi coding-agent peer must be pinned to 0.84.3');
if (analysisManifest.peerDependencies?.['@upup/pi-market-data'] !== '0.1.0') failures.push('investment-analysis must depend on exact market-data Package version');
if (analysisManifest.pi?.source !== 'builtin:upup') failures.push('investment-analysis package must declare the allowlisted builtin:upup source');
for (const relative of [
  ...(analysisManifest.pi?.extensions ?? []), ...(analysisManifest.pi?.skills ?? []), ...(analysisManifest.pi?.prompts ?? []),
  ...(analysisManifest.pi?.workflows ?? []), ...(analysisManifest.pi?.policies ?? []), ...(analysisManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(investmentAnalysisPackageRoot, relative))) failures.push(`investment-analysis declared Pi resource does not exist: ${relative}`);
}
if (!analysisManifest.scripts?.test?.includes('bun test') || !analysisManifest.scripts.test.includes('./test.ts')) failures.push('investment-analysis package test script must execute ./test.ts');
const analysisExtensionSource = readFileSync(join(investmentAnalysisPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['dcf_model', 'ddm_model', 'valuation_ratios', 'peer_comparison', 'calculate_target_price', 'quick_target_price', 'decision_dashboard', 'investment_dcf', 'investment_technical_signal', 'stock_analysis']) {
  if (!analysisExtensionSource.includes(`name: '${toolName}'`)) failures.push(`investment-analysis Pi tool is not registered: ${toolName}`);
}
if (!analysisExtensionSource.includes("name: 'list_research_tasks'")) failures.push('investment-analysis Pi tool is not registered: list_research_tasks');
if (!ownershipSource.includes("'list_research_tasks'")) failures.push('investment-analysis research journal tool has no Pi package ownership');
if (!existsSync(join(investmentAnalysisPackageRoot, 'src', 'research-journal.ts'))) failures.push('investment-analysis native research journal implementation is missing');
for (const toolName of nativeInvestmentAnalysisTools) {
  if (!analysisExtensionSource.includes(`name: '${toolName}'`)) failures.push(`investment-analysis native option tool is not registered: ${toolName}`);
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`investment-analysis option tool has no Pi package ownership: ${toolName}`);
}
if (/from ['"](?:\.\.\/){2,}src\//.test(analysisExtensionSource)) failures.push('investment-analysis Pi extension must not depend on workspace source modules');

const riskManifest = JSON.parse(readFileSync(join(riskPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pi?: { source?: string; commands?: string[]; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (riskManifest.name !== '@upup/pi-risk') failures.push('risk package name is not stable');
if (!riskManifest.version || !/^\d+\.\d+\.\d+$/.test(riskManifest.version)) failures.push('risk package version must be exact semver');
if (!riskManifest.keywords?.includes('pi-package')) failures.push('risk package must declare pi-package keyword');
if (riskManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('risk Pi coding-agent peer must be pinned to 0.84.3');
if (riskManifest.pi?.source !== 'builtin:upup') failures.push('risk package must declare the allowlisted builtin:upup source');
for (const [section, dependencies] of Object.entries({
  dependencies: riskManifest.dependencies,
  devDependencies: riskManifest.devDependencies,
  peerDependencies: riskManifest.peerDependencies,
  optionalDependencies: riskManifest.optionalDependencies,
})) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${section} ${name} must use an exact semver in the risk package`);
  }
}
if (!riskManifest.scripts?.test?.includes('bun test') || !riskManifest.scripts.test.includes('./test.ts')) failures.push('risk package test script must execute the core ./test.ts suite');
if (!riskManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('risk package build must emit declarations');
if (!shipsPackage('pi-risk')) failures.push('production build must ship the built-in risk Pi package resources');
for (const relative of [
  ...(riskManifest.pi?.extensions ?? []), ...(riskManifest.pi?.skills ?? []), ...(riskManifest.pi?.prompts ?? []),
  ...(riskManifest.pi?.workflows ?? []), ...(riskManifest.pi?.policies ?? []), ...(riskManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(riskPackageRoot, relative))) failures.push(`risk declared Pi resource does not exist: ${relative}`);
}
const riskExtensionSource = readFileSync(join(riskPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown', 'track_risk', 'get_short_interest', 'calculate_short_interest_ratio', 'detect_short_squeeze']) {
  if (!riskExtensionSource.includes(`name: '${toolName}'`)) failures.push(`risk Pi tool is not registered: ${toolName}`);
}
if (!existsSync(join(riskPackageRoot, 'src', 'short-interest.ts'))) failures.push('risk package native short-interest implementation is missing');
if (!existsSync(join(riskPackageRoot, 'src', 'risk-tracker.ts'))) failures.push('risk package native risk tracker implementation is missing');
if (/from ['"](?:\.\.\/){2,}src\//.test(riskExtensionSource)) failures.push('risk Pi extension must not depend on workspace source modules');
if (!riskManifest.pi?.skills?.some((path) => path.includes('pi-risk') || path.includes('risk'))) failures.push('risk package must declare at least one skill directory');
if (!riskManifest.pi?.evals?.some((path) => path.endsWith('.json'))) failures.push('risk package must declare at least one eval json');
if (!riskManifest.pi?.policies?.some((path) => path.endsWith('.md'))) failures.push('risk package must declare at least one policy md');
if (!riskManifest.pi?.workflows?.some((path) => path.endsWith('.md'))) failures.push('risk package must declare at least one workflow md');
if (!riskManifest.pi?.prompts?.some((path) => path.endsWith('.md'))) failures.push('risk package must declare at least one prompt md');

const portfolioManifest = JSON.parse(readFileSync(join(portfolioPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (portfolioManifest.name !== '@upup/pi-portfolio') failures.push('portfolio package name is not stable');
if (portfolioManifest.version !== '0.1.0') failures.push('portfolio package version must be 0.1.0');
if (!portfolioManifest.keywords?.includes('pi-package')) failures.push('portfolio package must declare pi-package keyword');
if (portfolioManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('portfolio Pi coding-agent peer must be pinned to 0.84.3');
if (portfolioManifest.pi?.source !== 'builtin:upup') failures.push('portfolio package must declare the allowlisted builtin:upup source');
if (!portfolioManifest.scripts?.test?.includes('bun test') || !portfolioManifest.scripts.test.includes('./test.ts')) failures.push('portfolio package test script must execute ./test.ts');
if (!portfolioManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('portfolio package build must emit declarations');
if (!shipsPackage('pi-portfolio')) failures.push('production build must ship the built-in portfolio Pi package resources');
for (const relative of [
  ...(portfolioManifest.pi?.extensions ?? []), ...(portfolioManifest.pi?.skills ?? []), ...(portfolioManifest.pi?.prompts ?? []),
  ...(portfolioManifest.pi?.workflows ?? []), ...(portfolioManifest.pi?.policies ?? []), ...(portfolioManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(portfolioPackageRoot, relative))) failures.push(`portfolio declared Pi resource does not exist: ${relative}`);
}
const portfolioExtensionSource = readFileSync(join(portfolioPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['portfolio_attribution', 'portfolio_brinson_attribution', 'portfolio_style_attribution', 'portfolio_sector_attribution', 'add_position', 'update_position', 'remove_position', 'get_portfolio', 'export_portfolio', 'list_portfolios', 'create_portfolio', 'delete_portfolio', 'switch_portfolio', 'add_position_multi', 'remove_position_multi', 'get_portfolio_multi', 'list_benchmarks', 'compare_to_benchmark', 'calculate_alpha', 'convert_currency', 'list_currencies', 'get_exchange_rate']) {
  if (!portfolioExtensionSource.includes(`name: '${toolName}'`)) failures.push(`portfolio Pi tool is not registered: ${toolName}`);
}
for (const toolName of nativePortfolioTools) {
  if (!portfolioExtensionSource.includes(`name: '${toolName}'`)) failures.push(`portfolio DuckDB Pi tool is not registered: ${toolName}`);
  if (!ownershipSource.includes(`'${toolName}'`)) failures.push(`portfolio DuckDB tool has no Pi package ownership: ${toolName}`);
}
if (!existsSync(join(portfolioPackageRoot, 'src', 'duckdb.ts'))) failures.push('portfolio package native DuckDB implementation is missing');
if (/from ['"](?:\.\.\/){2,}src\//.test(portfolioExtensionSource)) failures.push('portfolio Pi extension must not depend on workspace source modules');

const backtestManifest = JSON.parse(readFileSync(join(backtestPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (backtestManifest.name !== '@upup/pi-backtest') failures.push('backtest package name is not stable');
if (backtestManifest.version !== '0.1.0') failures.push('backtest package version must be 0.1.0');
if (!backtestManifest.keywords?.includes('pi-package')) failures.push('backtest package must declare pi-package keyword');
if (backtestManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('backtest Pi coding-agent peer must be pinned to 0.84.3');
if (backtestManifest.pi?.source !== 'builtin:upup') failures.push('backtest package must declare the allowlisted builtin:upup source');
if (!backtestManifest.scripts?.test?.includes('bun test') || !backtestManifest.scripts.test.includes('./test.ts')) failures.push('backtest package test script must execute ./test.ts');
if (!backtestManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('backtest package build must emit declarations');
if (!shipsPackage('pi-backtest')) failures.push('production build must ship the built-in backtest Pi package resources');
for (const relative of [
  ...(backtestManifest.pi?.extensions ?? []), ...(backtestManifest.pi?.skills ?? []), ...(backtestManifest.pi?.prompts ?? []),
  ...(backtestManifest.pi?.workflows ?? []), ...(backtestManifest.pi?.policies ?? []), ...(backtestManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(backtestPackageRoot, relative))) failures.push(`backtest declared Pi resource does not exist: ${relative}`);
}
const backtestExtensionSource = readFileSync(join(backtestPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['evaluate_trade', 'run_backtest', 'get_backtest_summary', 'calculate_win_rate']) {
  if (!backtestExtensionSource.includes(`name: '${toolName}'`)) failures.push(`backtest Pi tool is not registered: ${toolName}`);
}
if (/from ['"](?:\.\.\/){2,}src\//.test(backtestExtensionSource)) failures.push('backtest Pi extension must not depend on workspace source modules');

const platformManifest = JSON.parse(readFileSync(join(platformPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (platformManifest.name !== '@upup/pi-platform') failures.push('platform package name is not stable');
if (platformManifest.version !== '0.1.0') failures.push('platform package version must be 0.1.0');
if (!platformManifest.keywords?.includes('pi-package')) failures.push('platform package must declare pi-package keyword');
if (platformManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('platform Pi coding-agent peer must be pinned to 0.84.3');
if (platformManifest.pi?.source !== 'builtin:upup') failures.push('platform package must declare the allowlisted builtin:upup source');
if (!platformManifest.scripts?.test?.includes('bun test') || !platformManifest.scripts.test.includes('./test.ts')) failures.push('platform package test script must execute ./test.ts');
if (!platformManifest.scripts?.build?.includes('tsc --emitDeclarationOnly') && !platformManifest.scripts?.build?.includes('tsc -p tsconfig.json')) failures.push('platform package build must emit declarations');
if (!shipsPackage('pi-platform')) failures.push('production build must ship the built-in platform Pi package resources');
if (!rootBuildScript.includes('copy-pi-package-resources.ts')) failures.push('production build must ship the built-in research Pi package resources');
for (const relative of [
  ...(platformManifest.pi?.extensions ?? []), ...(platformManifest.pi?.skills ?? []), ...(platformManifest.pi?.prompts ?? []),
  ...(platformManifest.pi?.workflows ?? []), ...(platformManifest.pi?.policies ?? []), ...(platformManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(platformPackageRoot, relative))) failures.push(`platform declared Pi resource does not exist: ${relative}`);
}
const platformExtensionSource = readFileSync(join(platformPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['read_file', 'memory_search', 'enter_plan_mode', 'task_create', 'list_mcp_resources']) {
  if (!platformExtensionSource.includes('getToolDefinitions') || !ownershipSource.includes(`'${toolName}'`)) failures.push(`platform Pi tool is not owned: ${toolName}`);
}
for (const toolName of nativePlatformTools) {
  if (!platformExtensionSource.includes(`name: '${toolName}'`) || !ownershipSource.includes(`'${toolName}'`)) failures.push(`platform Pi package must natively register and own ${toolName}`);
}

const researchManifest = JSON.parse(readFileSync(join(researchPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (researchManifest.name !== '@upup/pi-research') failures.push('research package name is not stable');
if (researchManifest.version !== '0.1.0') failures.push('research package version must be 0.1.0');
if (!researchManifest.keywords?.includes('pi-package')) failures.push('research package must declare pi-package keyword');
if (researchManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('research Pi coding-agent peer must be pinned to 0.84.3');
if (researchManifest.pi?.source !== 'builtin:upup') failures.push('research package must declare the allowlisted builtin:upup source');
if (!researchManifest.scripts?.test?.includes('bun test') || !researchManifest.scripts.test.includes('./test.ts')) failures.push('research package test script must execute ./test.ts');
if (!researchManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('research package build must emit declarations');
if (!ownershipSource.includes("'web_fetch'")) failures.push('research web_fetch tool has no Pi package ownership');
for (const relative of [
  ...(researchManifest.pi?.extensions ?? []), ...(researchManifest.pi?.skills ?? []), ...(researchManifest.pi?.prompts ?? []),
  ...(researchManifest.pi?.workflows ?? []), ...(researchManifest.pi?.policies ?? []), ...(researchManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(researchPackageRoot, relative))) failures.push(`research declared Pi resource does not exist: ${relative}`);
}
const researchExtensionSource = readFileSync(join(researchPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of nativeResearchTools) if (!researchExtensionSource.includes(`name: '${toolName}'`)) failures.push(`research Pi package must natively register ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(researchExtensionSource)) failures.push('research Pi extension must not depend on workspace source modules');

const browserManifest = JSON.parse(readFileSync(join(browserPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (browserManifest.name !== '@upup/pi-browser') failures.push('browser package name is not stable');
if (browserManifest.version !== '0.1.0') failures.push('browser package version must be 0.1.0');
if (!browserManifest.keywords?.includes('pi-package')) failures.push('browser package must declare pi-package keyword');
if (browserManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('browser Pi coding-agent peer must be pinned to 0.84.3');
if (browserManifest.pi?.source !== 'builtin:upup') failures.push('browser package must declare the allowlisted builtin:upup source');
if (!browserManifest.scripts?.test?.includes('bun test') || !browserManifest.scripts.test.includes('./test.ts')) failures.push('browser package test script must execute ./test.ts');
if (!browserManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('browser package build must emit declarations');
if (!rootBuildScript.includes('packages/pi-browser')) failures.push('production build must ship the built-in browser Pi package resources');
const browserExtensionSource = readFileSync(join(browserPackageRoot, 'extensions', 'index.ts'), 'utf8');
if (!browserExtensionSource.includes("name: 'browser'")) failures.push('browser Pi package must natively register browser');
if (/from ['"](?:\.\.\/){2,}src\//.test(browserExtensionSource)) failures.push('browser Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(browserManifest.pi?.extensions ?? []), ...(browserManifest.pi?.skills ?? []), ...(browserManifest.pi?.prompts ?? []),
  ...(browserManifest.pi?.workflows ?? []), ...(browserManifest.pi?.policies ?? []), ...(browserManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(browserPackageRoot, relative))) failures.push(`browser declared Pi resource does not exist: ${relative}`);
}

const configManifest = JSON.parse(readFileSync(join(configPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (configManifest.name !== '@upup/pi-config') failures.push('config package name is not stable');
if (configManifest.version !== '0.1.0') failures.push('config package version must be 0.1.0');
if (!configManifest.keywords?.includes('pi-package')) failures.push('config package must declare pi-package keyword');
if (configManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('config Pi coding-agent peer must be pinned to 0.84.3');
if (configManifest.pi?.source !== 'builtin:upup') failures.push('config package must declare the allowlisted builtin:upup source');
if (!configManifest.scripts?.test?.includes('bun test') || !configManifest.scripts.test.includes('./test.ts')) failures.push('config package test script must execute ./test.ts');
if (!configManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('config package build must emit declarations');
if (!rootBuildScript.includes('packages/pi-config')) failures.push('production build must ship the built-in config Pi package resources');
const configExtensionSource = readFileSync(join(configPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['config_get', 'config_set', 'config_list']) if (!configExtensionSource.includes(`name: '${toolName}'`) || !ownershipSource.includes(`'${toolName}'`)) failures.push(`config Pi package must natively register and own ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(configExtensionSource)) failures.push('config Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(configManifest.pi?.extensions ?? []), ...(configManifest.pi?.skills ?? []), ...(configManifest.pi?.prompts ?? []),
  ...(configManifest.pi?.workflows ?? []), ...(configManifest.pi?.policies ?? []), ...(configManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(configPackageRoot, relative))) failures.push(`config declared Pi resource does not exist: ${relative}`);
}

const cacheManifest = JSON.parse(readFileSync(join(cachePackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (cacheManifest.name !== '@upup/pi-cache') failures.push('cache package name is not stable');
if (cacheManifest.version !== '0.1.0') failures.push('cache package version must be 0.1.0');
if (!cacheManifest.keywords?.includes('pi-package')) failures.push('cache package must declare pi-package keyword');
if (cacheManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('cache Pi coding-agent peer must be pinned to 0.84.3');
if (cacheManifest.pi?.source !== 'builtin:upup') failures.push('cache package must declare the allowlisted builtin:upup source');
if (!cacheManifest.scripts?.test?.includes('bun test') || !cacheManifest.scripts.test.includes('./test.ts')) failures.push('cache package test script must execute ./test.ts');
if (!cacheManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('cache package build must emit declarations');
if (!rootBuildScript.includes('packages/pi-cache')) failures.push('production build must ship the built-in cache Pi package resources');
const cacheExtensionSource = readFileSync(join(cachePackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info']) if (!cacheExtensionSource.includes(`name: '${toolName}'`) || !ownershipSource.includes(`'${toolName}'`)) failures.push(`cache Pi package must natively register and own ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(cacheExtensionSource)) failures.push('cache Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(cacheManifest.pi?.extensions ?? []), ...(cacheManifest.pi?.skills ?? []), ...(cacheManifest.pi?.prompts ?? []),
  ...(cacheManifest.pi?.workflows ?? []), ...(cacheManifest.pi?.policies ?? []), ...(cacheManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(cachePackageRoot, relative))) failures.push(`cache declared Pi resource does not exist: ${relative}`);
}

const notifyManifest = JSON.parse(readFileSync(join(notifyPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (notifyManifest.name !== '@upup/pi-notify') failures.push('notify package name is not stable');
if (notifyManifest.version !== '0.1.0') failures.push('notify package version must be 0.1.0');
if (!notifyManifest.keywords?.includes('pi-package')) failures.push('notify package must declare pi-package keyword');
if (notifyManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('notify Pi coding-agent peer must be pinned to 0.84.3');
if (notifyManifest.pi?.source !== 'builtin:upup') failures.push('notify package must declare the allowlisted builtin:upup source');
if (!notifyManifest.scripts?.test?.includes('bun test') || !notifyManifest.scripts.test.includes('./test.ts')) failures.push('notify package test script must execute ./test.ts');
if (!notifyManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('notify package build must emit declarations');
if (!rootBuildScript.includes('packages/pi-notify')) failures.push('production build must ship the built-in notify Pi package resources');
const notifyExtensionSource = readFileSync(join(notifyPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions']) if (!notifyExtensionSource.includes(`name: '${toolName}'`) || !ownershipSource.includes(`'${toolName}'`)) failures.push(`notify Pi package must natively register and own ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(notifyExtensionSource)) failures.push('notify Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(notifyManifest.pi?.extensions ?? []), ...(notifyManifest.pi?.skills ?? []), ...(notifyManifest.pi?.prompts ?? []),
  ...(notifyManifest.pi?.workflows ?? []), ...(notifyManifest.pi?.policies ?? []), ...(notifyManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(notifyPackageRoot, relative))) failures.push(`notify declared Pi resource does not exist: ${relative}`);
}

const managementManifest = JSON.parse(readFileSync(join(managementPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (managementManifest.name !== '@upup/pi-management') failures.push('management package name is not stable');
if (managementManifest.version !== '0.1.0') failures.push('management package version must be 0.1.0');
if (!managementManifest.keywords?.includes('pi-package')) failures.push('management package must declare pi-package keyword');
if (managementManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('management Pi coding-agent peer must be pinned to 0.84.3');
if (managementManifest.pi?.source !== 'builtin:upup') failures.push('management package must declare the allowlisted builtin:upup source');
if (!managementManifest.scripts?.test?.includes('bun test') || !managementManifest.scripts.test.includes('./test.ts')) failures.push('management package test script must execute ./test.ts');
if (!managementManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('management package build must emit declarations');
if (!shipsPackage('pi-management')) failures.push('production build must ship the built-in management Pi package resources');
const managementExtensionSource = readFileSync(join(managementPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['management_system_snapshot', 'management_provider_status', 'management_package_status', 'management_runtime_status']) if (!managementExtensionSource.includes(`name: '${toolName}'`) || !ownershipSource.includes(`'${toolName}'`)) failures.push(`management Pi package must natively register and own ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(managementExtensionSource)) failures.push('management Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(managementManifest.pi?.extensions ?? []), ...(managementManifest.pi?.skills ?? []), ...(managementManifest.pi?.prompts ?? []),
  ...(managementManifest.pi?.workflows ?? []), ...(managementManifest.pi?.policies ?? []), ...(managementManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(managementPackageRoot, relative))) failures.push(`management declared Pi resource does not exist: ${relative}`);
}

const technicalManifest = JSON.parse(readFileSync(join(technicalPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (technicalManifest.name !== '@upup/pi-technical') failures.push('technical package name is not stable');
if (technicalManifest.version !== '0.1.0') failures.push('technical package version must be 0.1.0');
if (!technicalManifest.keywords?.includes('pi-package')) failures.push('technical package must declare pi-package keyword');
if (technicalManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('technical Pi coding-agent peer must be pinned to 0.84.3');
if (technicalManifest.pi?.source !== 'builtin:upup') failures.push('technical package must declare the allowlisted builtin:upup source');
if (!technicalManifest.scripts?.test?.includes('bun test') || !technicalManifest.scripts.test.includes('./test.ts')) failures.push('technical package test script must execute ./test.ts');
if (!technicalManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('technical package build must emit declarations');
if (!shipsPackage('pi-technical')) failures.push('production build must ship the built-in technical Pi package resources');
const technicalExtensionSource = readFileSync(join(technicalPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['compute_indicators', 'compute_macd', 'compute_kdj', 'compute_boll', 'compute_atr', 'compute_rsi', 'compute_obv', 'compute_cci']) if (!technicalExtensionSource.includes(`name: '${toolName}'`)) failures.push(`technical Pi package must natively register ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(technicalExtensionSource)) failures.push('technical Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(technicalManifest.pi?.extensions ?? []), ...(technicalManifest.pi?.skills ?? []), ...(technicalManifest.pi?.prompts ?? []),
  ...(technicalManifest.pi?.workflows ?? []), ...(technicalManifest.pi?.policies ?? []), ...(technicalManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(technicalPackageRoot, relative))) failures.push(`technical declared Pi resource does not exist: ${relative}`);

const corporateActionsManifest = JSON.parse(readFileSync(join(corporateActionsPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (corporateActionsManifest.name !== '@upup/pi-corporate-actions') failures.push('corporate-actions package name is not stable');
if (corporateActionsManifest.version !== '0.1.0') failures.push('corporate-actions package version must be 0.1.0');
if (!corporateActionsManifest.keywords?.includes('pi-package')) failures.push('corporate-actions package must declare pi-package keyword');
if (corporateActionsManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('corporate-actions Pi coding-agent peer must be pinned to 0.84.3');
if (corporateActionsManifest.pi?.source !== 'builtin:upup') failures.push('corporate-actions package must declare the allowlisted builtin:upup source');
if (!corporateActionsManifest.scripts?.test?.includes('bun test') || !corporateActionsManifest.scripts.test.includes('./test.ts')) failures.push('corporate-actions package test script must execute ./test.ts');
if (!corporateActionsManifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('corporate-actions package build must emit declarations');
if (!shipsPackage('pi-corporate-actions')) failures.push('production build must ship the built-in corporate-actions Pi package resources');
const corporateActionsExtensionSource = readFileSync(join(corporateActionsPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['corporate_actions_dividends', 'corporate_actions_splits', 'corporate_actions_rights', 'corporate_actions_list_all', 'corporate_actions_adjust_prices', 'corporate_actions_total_return', 'corporate_actions_dividend_yield', 'corporate_actions_ex_price']) if (!corporateActionsExtensionSource.includes(`name: '${toolName}'`)) failures.push(`corporate-actions Pi package must natively register ${toolName}`);
if (/from ['"](?:\.\.\/){2,}src\//.test(corporateActionsExtensionSource)) failures.push('corporate-actions Pi extension must not depend on workspace source modules');
for (const relative of [
  ...(corporateActionsManifest.pi?.extensions ?? []), ...(corporateActionsManifest.pi?.skills ?? []), ...(corporateActionsManifest.pi?.prompts ?? []),
  ...(corporateActionsManifest.pi?.workflows ?? []), ...(corporateActionsManifest.pi?.policies ?? []), ...(corporateActionsManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(corporateActionsPackageRoot, relative))) failures.push(`corporate-actions declared Pi resource does not exist: ${relative}`);
}
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Pi package checks passed: finance, market-data, investment-analysis, risk, portfolio, backtest, platform, research, browser, config, cache, notify, investment-workflow, management, technical, corporate-actions, and quant Pi packages are pinned and resources are present.');
