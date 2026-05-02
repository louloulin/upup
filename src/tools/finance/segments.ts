import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { api, stripFieldsDeep } from './api.js';
import { formatToolResult } from '../types.js';
import { TTL_24H } from './utils.js';

const REDUNDANT_FINANCIAL_FIELDS = ['accession_number', 'currency', 'period'] as const;

const FinancialSegmentsInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch financial segments for. For example, 'AAPL' for Apple."
    ),
  period: z
    .enum(['annual', 'quarterly'])
    .describe(
      "The reporting period for the financial segments. 'annual' for yearly, 'quarterly' for quarterly."
    ),
  limit: z.number().default(4).describe('The number of past periods to retrieve (default: 4). Increase when broader historical segment trends are required.'),
});

export const getFinancialSegments = new DynamicStructuredTool({
  name: 'get_financial_segments',
  description: `Provides a detailed breakdown of a company's financials by operating segments, such as products, services, or geographic regions. Useful for analyzing the composition of a company's revenue and other segment-level metrics.`,
  schema: FinancialSegmentsInputSchema,
  func: async (input) => {
    const params = {
      ticker: input.ticker,
      period: input.period,
      limit: input.limit,
    };
    const { data, url } = await api.get('/financials/segments/', params, { cacheable: true, ttlMs: TTL_24H });
    return formatToolResult(
      stripFieldsDeep(data.segmented_financials || [], REDUNDANT_FINANCIAL_FIELDS),
      [url]
    );
  },
});
