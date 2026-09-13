/**
 * Read-only Pi management page entry point.
 *
 * The page consumes only the Gateway management JSON API. It does not import
 * Agent, finance, market-data, or any other business runtime module.
 */
export { renderManagementPage, WEB_MANAGEMENT_PAGE_VERSION } from './management-page.js';
