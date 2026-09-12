/**
 * Dividend Discount Model (Gordon growth) valuation.
 *
 * This is intentionally a deterministic calculation tool. Market data and
 * dividend assumptions are supplied by the caller and remain auditable at the
 * Pi adapter boundary.
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';
import { formatToolResult } from '../types.js';

export const DdmModelSchema = z.object({
  symbol: z.string().min(1).describe('Ticker or security identifier'),
  current_dividend: z.number().positive().describe('Most recent annual dividend per share'),
  growth_rate: z.number().min(-0.5).max(1).describe('Expected near-term annual dividend growth rate'),
  required_return: z.number().gt(0).max(1).describe('Required return / cost of equity'),
  terminal_growth_rate: z.number().min(-0.5).max(0.5).describe('Perpetual dividend growth rate'),
  projection_years: z.number().int().min(1).max(50).default(5).describe('Explicit forecast period'),
  current_price: z.number().positive().optional().describe('Current price for upside/downside'),
});

export type DdmModelInput = z.infer<typeof DdmModelSchema>;

export interface DdmResult {
  symbol: string;
  target_price: number;
  current_price?: number;
  upside?: number;
  upside_percent?: number;
  projected_dividends: number[];
  present_value_of_dividends: number;
  terminal_value: number;
  present_value_of_terminal: number;
  assumptions: {
    current_dividend: number;
    growth_rate: number;
    required_return: number;
    terminal_growth_rate: number;
    projection_years: number;
  };
}

export function calculateDDM(input: DdmModelInput): DdmResult {
  const {
    symbol,
    current_dividend,
    growth_rate,
    required_return,
    terminal_growth_rate,
    projection_years = 5,
    current_price,
  } = input;

  if (required_return <= terminal_growth_rate) {
    throw new Error('required_return must be greater than terminal_growth_rate');
  }

  const projected_dividends: number[] = [];
  let dividend = current_dividend;
  let present_value_of_dividends = 0;
  for (let year = 1; year <= projection_years; year += 1) {
    dividend *= 1 + growth_rate;
    projected_dividends.push(dividend);
    present_value_of_dividends += dividend / Math.pow(1 + required_return, year);
  }

  const terminalDividend = dividend * (1 + terminal_growth_rate);
  const terminal_value = terminalDividend / (required_return - terminal_growth_rate);
  const present_value_of_terminal = terminal_value / Math.pow(1 + required_return, projection_years);
  const target_price = present_value_of_dividends + present_value_of_terminal;
  const upside = current_price === undefined ? undefined : target_price - current_price;
  const upside_percent = current_price === undefined ? undefined : (target_price / current_price - 1) * 100;

  return {
    symbol,
    target_price: round(target_price),
    ...(current_price === undefined ? {} : { current_price, upside: round(upside!), upside_percent: round(upside_percent!) }),
    projected_dividends: projected_dividends.map(round),
    present_value_of_dividends: round(present_value_of_dividends),
    terminal_value: round(terminal_value),
    present_value_of_terminal: round(present_value_of_terminal),
    assumptions: { current_dividend, growth_rate, required_return, terminal_growth_rate, projection_years },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export const DDM_MODEL_DESCRIPTION = `
Dividend Discount Model valuation using an explicit forecast period and Gordon-growth terminal value.
Use only when dividends are meaningful and required return is greater than perpetual growth.
Returns target price, projected dividends, present values, assumptions, and optional upside/downside.
`.trim();

export function createDDMTool(): PiTool {
  return new PiTool({
    name: 'ddm_model',
    description: DDM_MODEL_DESCRIPTION,
    schema: DdmModelSchema,
    async func(input): Promise<string> {
      try {
        return formatToolResult({ type: 'DDM Valuation', ...calculateDDM(input) });
      } catch (error) {
        return formatToolResult({
          type: 'DDM Valuation',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}
