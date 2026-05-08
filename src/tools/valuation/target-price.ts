/**
 * Target Price Calculator
 *
 * Implements valuation-based target price calculation using:
 * - DCF (Discounted Cash Flow)
 * - PE Multiple
 * - Sum-of-Parts (SOTP)
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface TargetPriceResult {
  symbol: string;
  method: 'dcf' | 'pe' | 'sotp';
  currentPrice: number;
  targetPrice: number;
  upside: number;
  upsidePercent: number;
  confidence: 'low' | 'medium' | 'high';
  details: Record<string, number>;
}

// ============================================================================
// DCF Valuation
// ============================================================================

function calculateDCFTargetPrice(
  symbol: string,
  currentPrice: number,
  currentEps: number,
  growthRate: number,
  discountRate: number,
  terminalGrowthRate: number,
  years: number
): TargetPriceResult {
  // Gordon Growth Model for terminal value
  // Terminal FCF = FCF_yrN * (1 + terminalGrowth) / (WACC - terminalGrowth)
  // Discount terminal value back to present
  
  const wacc = discountRate;
  let pvOfCashFlows = 0;
  
  // Project FCF growth (simplified: assume FCF grows proportionally to EPS)
  let projectedFcf = currentEps * 10; // Assume FCF multiple of 10x EPS as proxy
  
  for (let year = 1; year <= years; year++) {
    projectedFcf *= (1 + growthRate);
    const discountFactor = Math.pow(1 + wacc, year);
    pvOfCashFlows += projectedFcf / discountFactor;
  }
  
  // Terminal value
  const terminalFcf = projectedFcf * (1 + terminalGrowthRate);
  const terminalValue = terminalFcf / (wacc - terminalGrowthRate);
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, years);
  
  const totalPv = pvOfCashFlows + pvTerminalValue;
  const sharesOutstanding = 1; // Per-share calculation
  const targetPrice = totalPv / sharesOutstanding;
  
  const upside = targetPrice - currentPrice;
  const upsidePercent = (upside / currentPrice) * 100;
  
  // Confidence based on data quality
  const confidence: 'low' | 'medium' | 'high' = 
    growthRate > 0.05 && growthRate < 0.40 ? 'high' :
    growthRate > 0 && growthRate < 0.50 ? 'medium' : 'low';
  
  return {
    symbol,
    method: 'dcf',
    currentPrice,
    targetPrice: Math.round(targetPrice * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    upsidePercent: Math.round(upsidePercent * 10) / 10,
    confidence,
    details: {
      'Current EPS': currentEps,
      'Growth Rate': growthRate * 100,
      'Discount Rate': discountRate * 100,
      'Terminal Growth': terminalGrowthRate * 100,
      'Projection Years': years,
      'PV of Cash Flows': Math.round(pvOfCashFlows * 100) / 100,
      'PV of Terminal Value': Math.round(pvTerminalValue * 100) / 100,
    },
  };
}

// ============================================================================
// PE Multiple Valuation
// ============================================================================

function calculatePETargetPrice(
  symbol: string,
  currentPrice: number,
  currentEps: number,
  forwardEps: number,
  targetPe: number,
  years: number
): TargetPriceResult {
  // Calculate target price based on forward P/E multiple
  // If 3 years out: current price * (forward PE / current PE) growth
  
  const currentPe = currentPrice / currentEps;
  const impliedPeGrowth = Math.pow(targetPe / currentPe, 1 / years);
  
  // Target price = forward EPS * target PE
  const targetPrice = forwardEps * targetPe;
  
  const upside = targetPrice - currentPrice;
  const upsidePercent = (upside / currentPrice) * 100;
  
  // Confidence based on PE reasonableness
  const confidence: 'low' | 'medium' | 'high' = 
    targetPe >= 10 && targetPe <= 40 ? 'high' :
    targetPe >= 5 && targetPe <= 60 ? 'medium' : 'low';
  
  return {
    symbol,
    method: 'pe',
    currentPrice,
    targetPrice: Math.round(targetPrice * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    upsidePercent: Math.round(upsidePercent * 10) / 10,
    confidence,
    details: {
      'Current PE': Math.round(currentPe * 10) / 10,
      'Target PE': targetPe,
      'Current EPS': currentEps,
      'Forward EPS': forwardEps,
      'EPS CAGR': Math.round((Math.pow(forwardEps / currentEps, 1 / years) - 1) * 100) / 10,
      'Years to Target': years,
    },
  };
}

// ============================================================================
// Sum-of-Parts Valuation
// ============================================================================

interface SOTPComponent {
  name: string;
  value: number;
  weight: number;
}

function calculateSOTPTargetPrice(
  symbol: string,
  currentPrice: number,
  components: SOTPComponent[]
): TargetPriceResult {
  // Calculate weighted average of component valuations
  const totalValue = components.reduce((sum, c) => sum + c.value * c.weight, 0);
  const targetPrice = totalValue;
  
  const upside = targetPrice - currentPrice;
  const upsidePercent = (upside / currentPrice) * 100;
  
  // Confidence based on number of components
  const confidence: 'low' | 'medium' | 'high' = 
    components.length >= 3 ? 'high' :
    components.length >= 2 ? 'medium' : 'low';
  
  return {
    symbol,
    method: 'sotp',
    currentPrice,
    targetPrice: Math.round(targetPrice * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    upsidePercent: Math.round(upsidePercent * 10) / 10,
    confidence,
    details: {
      'Component Count': components.length,
      ...Object.fromEntries(components.map(c => [c.name, c.value])),
    },
  };
}

// ============================================================================
// Combined Valuation
// ============================================================================

function calculateCombinedTargetPrice(
  symbol: string,
  currentPrice: number,
  dcfTarget: number,
  peTarget: number,
  sotpTarget: number
): TargetPriceResult {
  // Average of all methods (equal weight)
  const targetPrice = (dcfTarget + peTarget + sotpTarget) / 3;
  
  const upside = targetPrice - currentPrice;
  const upsidePercent = (upside / currentPrice) * 100;
  
  return {
    symbol,
    method: 'dcf', // Combined method indicator
    currentPrice,
    targetPrice: Math.round(targetPrice * 100) / 100,
    upside: Math.round(upside * 100) / 100,
    upsidePercent: Math.round(upsidePercent * 10) / 10,
    confidence: 'high',
    details: {
      'DCF Target': dcfTarget,
      'PE Target': peTarget,
      'SOTP Target': sotpTarget,
      'Method Avg': Math.round(targetPrice * 100) / 100,
    },
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const targetPriceSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  currentPrice: z.number().positive().describe('Current stock price'),
  method: z.enum(['dcf', 'pe', 'sotp', 'combined']).default('combined').describe('Valuation method'),
  // DCF parameters
  currentEps: z.number().optional().describe('Current EPS for DCF/PE'),
  growthRate: z.number().optional().describe('Expected growth rate (e.g., 0.15 for 15%)'),
  discountRate: z.number().optional().describe('Discount rate/WACC (e.g., 0.10 for 10%)'),
  terminalGrowthRate: z.number().optional().describe('Terminal growth rate'),
  projectionYears: z.number().optional().describe('Years for DCF projection'),
  // PE parameters
  forwardEps: z.number().optional().describe('Forward EPS (1 year ahead)'),
  targetPe: z.number().optional().describe('Target P/E multiple'),
  peYears: z.number().optional().describe('Years for PE target'),
  // SOTP parameters
  components: z.array(z.object({
    name: z.string().describe('Component name'),
    value: z.number().describe('Component valuation'),
    weight: z.number().min(0).max(1).default(1).describe('Weight (0-1)'),
  })).optional().describe('SOTP components'),
});

const quickTargetSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  currentPrice: z.number().positive().describe('Current stock price'),
  currentEps: z.number().positive().describe('Current EPS'),
  forwardEps: z.number().positive().describe('Forward EPS (next year)'),
  growthRate: z.number().describe('Expected annual growth rate (e.g., 0.15)'),
});

// ============================================================================
// Tools
// ============================================================================

export function createCalculateTargetPriceTool() {
  return new DynamicStructuredTool({
    name: 'calculate_target_price',
    description: 'Calculate fair value target price using DCF, PE multiples, or Sum-of-Parts. Returns upside/downside from current price.',
    schema: targetPriceSchema,
    func: async (params) => {
      const {
        symbol,
        currentPrice,
        method,
        currentEps = 2,
        growthRate = 0.15,
        discountRate = 0.10,
        terminalGrowthRate = 0.03,
        projectionYears = 5,
        forwardEps,
        targetPe = 20,
        peYears = 3,
        components = [],
      } = params;
      
      const eps = currentEps;
      const fwdEps = forwardEps || eps * (1 + growthRate);
      
      // Calculate using selected method
      let result: TargetPriceResult;
      
      switch (method) {
        case 'dcf':
          result = calculateDCFTargetPrice(
            symbol, currentPrice, eps, growthRate,
            discountRate, terminalGrowthRate, projectionYears
          );
          break;
          
        case 'pe':
          result = calculatePETargetPrice(
            symbol, currentPrice, eps, fwdEps, targetPe, peYears
          );
          break;
          
        case 'sotp':
          if (components.length === 0) {
            return formatToolResult({
              type: 'Target Price Error',
              message: 'SOTP method requires components array',
              symbol,
            });
          }
          result = calculateSOTPTargetPrice(symbol, currentPrice, components);
          break;
          
        default: // combined
          const dcfTarget = calculateDCFTargetPrice(
            symbol, currentPrice, eps, growthRate,
            discountRate, terminalGrowthRate, projectionYears
          ).targetPrice;
          
          const peTarget = calculatePETargetPrice(
            symbol, currentPrice, eps, fwdEps, targetPe, peYears
          ).targetPrice;
          
          const sotpTarget = components.length > 0
            ? calculateSOTPTargetPrice(symbol, currentPrice, components).targetPrice
            : (dcfTarget + peTarget) / 2;
          
          result = calculateCombinedTargetPrice(symbol, currentPrice, dcfTarget, peTarget, sotpTarget);
      }
      
      return formatToolResult({
        type: 'Target Price',
        symbol: result.symbol,
        method: result.method.toUpperCase(),
        currentPrice: result.currentPrice.toFixed(2),
        targetPrice: result.targetPrice.toFixed(2),
        upside: `${result.upside >= 0 ? '+' : ''}${result.upside.toFixed(2)}`,
        upsidePercent: `${result.upsidePercent >= 0 ? '+' : ''}${result.upsidePercent.toFixed(1)}%`,
        confidence: result.confidence.toUpperCase(),
        details: Object.fromEntries(
          Object.entries(result.details).map(([k, v]) => [
            k,
            typeof v === 'number' ? (v > 100 ? v.toFixed(0) : `${v.toFixed(2)}%`) : v
          ])
        ),
        recommendation: result.upsidePercent > 20 ? 'BUY' : result.upsidePercent > 5 ? 'HOLD' : 'SELL',
      });
    },
  });
}

export function createQuickTargetPriceTool() {
  return new DynamicStructuredTool({
    name: 'quick_target_price',
    description: 'Quick target price with minimal params (EPS + growth rate). Estimates using PE method.',
    schema: quickTargetSchema,
    func: async ({ symbol, currentPrice, currentEps, forwardEps, growthRate }) => {
      // Default target PE based on growth
      const peg = 1.0; // Target PEG ratio
      const impliedPe = (1 + growthRate) * peg * 100;
      const targetPe = Math.min(Math.max(impliedPe, 10), 50); // Clamp 10-50
      
      const result = calculatePETargetPrice(
        symbol, currentPrice, currentEps, forwardEps, targetPe, 3
      );
      
      return formatToolResult({
        type: 'Quick Target Price',
        symbol: result.symbol,
        currentPrice: result.currentPrice.toFixed(2),
        targetPrice: result.targetPrice.toFixed(2),
        upside: `${result.upside >= 0 ? '+' : ''}${result.upside.toFixed(2)}`,
        upsidePercent: `${result.upsidePercent >= 0 ? '+' : ''}${result.upsidePercent.toFixed(1)}%`,
        confidence: result.confidence.toUpperCase(),
        method: 'PE Multiple',
        assumption: `Target P/E: ${targetPe.toFixed(0)}x (based on ${(growthRate * 100).toFixed(0)}% growth)`,
        recommendation: result.upsidePercent > 20 ? 'BUY' : result.upsidePercent > 5 ? 'HOLD' : 'SELL',
        disclaimer: 'This is a simplified estimate. Use calculate_target_price for detailed analysis.',
      });
    },
  });
}

export const valuationTools = [
  createCalculateTargetPriceTool(),
  createQuickTargetPriceTool(),
];
