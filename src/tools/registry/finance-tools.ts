/**
 * Finance tool registrations — US market + A-share tools.
 */

import type { RegisteredTool } from './types.js';
import { financialReadMetadata } from './types.js';
import { createGetFinancials, createGetMarketData, createReadFilings, createScreenStocks } from '../finance/index.js';
import { GET_FINANCIALS_DESCRIPTION } from '../finance/get-financials.js';
import { GET_MARKET_DATA_DESCRIPTION } from '../finance/get-market-data.js';
import { READ_FILINGS_DESCRIPTION } from '../finance/read-filings.js';
import { SCREEN_STOCKS_DESCRIPTION } from '../finance/screen-stocks.js';
import { getAStockPrice, GET_ASTOCK_PRICE_DESCRIPTION } from '../astock/get-astock-price.js';
import { getAStockFinancials, GET_ASTOCK_FINANCIALS_DESCRIPTION } from '../astock/get-astock-financials.js';
import { getAStockNews, GET_ASTOCK_NEWS_DESCRIPTION } from '../astock/get-astock-news.js';
import { screenAstocks, SCREEN_ASTOCKS_DESCRIPTION } from '../astock/screen-astocks.js';
import { getSectorData, GET_SECTOR_DATA_DESCRIPTION } from '../astock/get-sector-data.js';
import { getTechnicalData, GET_TECHNICAL_DATA_DESCRIPTION } from '../astock/get-technical-data.js';
import { getMarketStructure, GET_MARKET_STRUCTURE_DESCRIPTION } from '../astock/get-market-structure.js';

export function loadFinanceTools(model: string): RegisteredTool[] {
  return [
    {
      name: 'get_financials',
      tool: createGetFinancials(model),
      description: GET_FINANCIALS_DESCRIPTION,
      compactDescription: 'Financial statements, metrics, and analyst estimates. Handles multi-company/multi-metric queries in one call.',
      concurrencySafe: true,
      concurrencyMetadata: financialReadMetadata(),
    },
    {
      name: 'get_market_data',
      tool: createGetMarketData(model),
      description: GET_MARKET_DATA_DESCRIPTION,
      compactDescription: 'Stock/crypto prices, company news, and insider trades. Handles multi-asset queries in one call.',
      concurrencySafe: true,
    },
    {
      name: 'read_filings',
      tool: createReadFilings(model),
      description: READ_FILINGS_DESCRIPTION,
      compactDescription: 'SEC filings (10-K, 10-Q, 8-K). Extracts and summarizes specific filing sections.',
      concurrencySafe: true,
    },
    {
      name: 'stock_screener',
      tool: createScreenStocks(model),
      description: SCREEN_STOCKS_DESCRIPTION,
      compactDescription: 'Screen stocks by financial criteria (P/E, growth, margins, etc.).',
      concurrencySafe: true,
    },
    // A-share (Chinese) stock tools
    {
      name: 'get_astock_price',
      tool: getAStockPrice,
      description: GET_ASTOCK_PRICE_DESCRIPTION,
      compactDescription: 'Real-time price data for A-share (Chinese) stocks and HK stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_astock_financials',
      tool: getAStockFinancials,
      description: GET_ASTOCK_FINANCIALS_DESCRIPTION,
      compactDescription: 'Financial statements and key metrics for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_astock_news',
      tool: getAStockNews,
      description: GET_ASTOCK_NEWS_DESCRIPTION,
      compactDescription: 'Company announcements and market news for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'screen_astocks',
      tool: screenAstocks,
      description: SCREEN_ASTOCKS_DESCRIPTION,
      compactDescription: 'Screen A-share stocks by PE, ROE, sector, market cap criteria.',
      concurrencySafe: true,
    },
    {
      name: 'get_sector_data',
      tool: getSectorData,
      description: GET_SECTOR_DATA_DESCRIPTION,
      compactDescription: 'Industry sector and concept board data for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_technical_data',
      tool: getTechnicalData,
      description: GET_TECHNICAL_DATA_DESCRIPTION,
      compactDescription: 'Technical indicators (MA, MACD, RSI) and K-line data for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_market_structure',
      tool: getMarketStructure,
      description: GET_MARKET_STRUCTURE_DESCRIPTION,
      compactDescription: 'Dragon-tiger list, northbound flow, money flow for A-share market.',
      concurrencySafe: true,
    },
  ];
}
