/**
 * Short Interest Tool
 *
 * Provides short interest data analysis and short squeeze detection.
 * Short interest = number of shares sold short but not yet covered
 * Short interest ratio = short interest / average daily volume
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ShortInterestData {
  symbol: string;
  shortInterest: number;       // Number of shares sold short
  avgDailyVolume: number;      // Average daily trading volume
  shortInterestRatio: number;   // Days to cover (short interest / avg daily vol)
  previousMonthChange: number; // Change in short interest from previous month
  shortExemptVolume: number;   // Exempt short sales (certain exceptions)
  totalFloat: number;          // Total shares outstanding
  shortPercentFloat: number;    // Short interest as % of float
  payoutRatio: number;         // Cost to borrow / annual dividend (for squeeze potential)
  squeezeScore: number;        // 0-100 score for squeeze likelihood
  squeezeRisk: 'low' | 'medium' | 'high';
}

export interface ShortSqueezeSignal {
  symbol: string;
  squeezeScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  signals: {
    highShortInterest: boolean;
    highDaysToCover: boolean;
    increasingShorts: boolean;
    lowFloat: boolean;
    highCostToBorrow: boolean;
  };
  interpretation: string;
  recommendations: string[];
}

// ============================================================================
// Short Interest Ratio Thresholds
// ============================================================================

const THRESHOLDS = {
  // Short Interest Ratio (Days to Cover)
  LOW_COVER: 3,      // < 3 days = low squeeze risk
  MEDIUM_COVER: 7,   // 3-7 days = medium risk
  HIGH_COVER: 10,    // > 10 days = high squeeze risk
  
  // Short Percent of Float
  LOW_SHORT_FLOAT: 5,    // < 5% = low squeeze risk
  HIGH_SHORT_FLOAT: 10,   // > 10% = high squeeze risk
  
  // Cost to Borrow (annualized %)
  LOW_BORROW_COST: 5,     // < 5% = normal
  HIGH_BORROW_COST: 20,   // > 20% = high squeeze risk
  
  // Squeeze Score Weights
  SHORT_INTEREST_WEIGHT: 0.25,
  DAYS_TO_COVER_WEIGHT: 0.25,
  TREND_WEIGHT: 0.20,
  FLOAT_WEIGHT: 0.15,
  BORROW_COST_WEIGHT: 0.15,
};

// ============================================================================
// Mock Data Generator (In production, this would call an API)
// ============================================================================

function generateMockShortData(symbol: string): {
  shortInterest: number;
  avgDailyVolume: number;
  previousMonthShort: number;
  shortExemptVolume: number;
  totalFloat: number;
  borrowCost: number;
} {
  // Simulated data based on symbol
  const baseVolume = symbol.length * 1000000;
  const shortRatio = 0.05 + (symbol.charCodeAt(0) % 20) / 100; // 5-25% short interest
  
  return {
    shortInterest: Math.round(baseVolume * shortRatio),
    avgDailyVolume: Math.round(baseVolume * 0.1), // 10% of float daily
    previousMonthShort: Math.round(baseVolume * (shortRatio * 0.9)), // Slightly less last month
    shortExemptVolume: Math.round(baseVolume * 0.01), // 1% exempt
    totalFloat: baseVolume,
    borrowCost: 3 + (symbol.charCodeAt(0) % 50), // 3-53% borrow cost
  };
}

// ============================================================================
// Calculations
// ============================================================================

function calculateShortInterestRatio(shortInterest: number, avgDailyVolume: number): number {
  if (avgDailyVolume === 0) return 0;
  return shortInterest / avgDailyVolume;
}

function calculateShortPercentFloat(shortInterest: number, totalFloat: number): number {
  if (totalFloat === 0) return 0;
  return (shortInterest / totalFloat) * 100;
}

function calculateSqueezeScore(
  shortInterest: number,
  avgDailyVolume: number,
  previousMonthShort: number,
  totalFloat: number,
  borrowCost: number
): { score: number; riskLevel: 'low' | 'medium' | 'high' } {
  // Days to cover score (0-100)
  const ratio = calculateShortInterestRatio(shortInterest, avgDailyVolume);
  let daysToCoverScore = 0;
  if (ratio <= THRESHOLDS.LOW_COVER) {
    daysToCoverScore = (ratio / THRESHOLDS.LOW_COVER) * 25;
  } else if (ratio <= THRESHOLDS.HIGH_COVER) {
    daysToCoverScore = 25 + ((ratio - THRESHOLDS.LOW_COVER) / (THRESHOLDS.HIGH_COVER - THRESHOLDS.LOW_COVER)) * 50;
  } else {
    daysToCoverScore = 75 + Math.min((ratio - THRESHOLDS.HIGH_COVER) / 10 * 25, 25);
  }
  
  // Short interest as % of float score (0-100)
  const shortPercent = calculateShortPercentFloat(shortInterest, totalFloat);
  let floatScore = 0;
  if (shortPercent <= THRESHOLDS.LOW_SHORT_FLOAT) {
    floatScore = (shortPercent / THRESHOLDS.LOW_SHORT_FLOAT) * 25;
  } else if (shortPercent <= THRESHOLDS.HIGH_SHORT_FLOAT) {
    floatScore = 25 + ((shortPercent - THRESHOLDS.LOW_SHORT_FLOAT) / (THRESHOLDS.HIGH_SHORT_FLOAT - THRESHOLDS.LOW_SHORT_FLOAT)) * 50;
  } else {
    floatScore = 75 + Math.min((shortPercent - THRESHOLDS.HIGH_SHORT_FLOAT) / 10 * 25, 25);
  }
  
  // Trend score (increasing shorts = higher risk) (0-100)
  const trendChange = previousMonthShort > 0 
    ? ((shortInterest - previousMonthShort) / previousMonthShort) * 100 
    : 0;
  const trendScore = trendChange > 50 ? 100 : Math.max(0, trendChange * 2);
  
  // Borrow cost score (0-100)
  let borrowScore = 0;
  if (borrowCost <= THRESHOLDS.LOW_BORROW_COST) {
    borrowScore = (borrowCost / THRESHOLDS.LOW_BORROW_COST) * 25;
  } else if (borrowCost <= THRESHOLDS.HIGH_BORROW_COST) {
    borrowScore = 25 + ((borrowCost - THRESHOLDS.LOW_BORROW_COST) / (THRESHOLDS.HIGH_BORROW_COST - THRESHOLDS.LOW_BORROW_COST)) * 50;
  } else {
    borrowScore = 75 + Math.min((borrowCost - THRESHOLDS.HIGH_BORROW_COST) / 10 * 25, 25);
  }
  
  // Weighted total score
  const totalScore = 
    daysToCoverScore * THRESHOLDS.DAYS_TO_COVER_WEIGHT +
    floatScore * THRESHOLDS.SHORT_INTEREST_WEIGHT +
    trendScore * THRESHOLDS.TREND_WEIGHT +
    floatScore * THRESHOLDS.FLOAT_WEIGHT +
    borrowScore * THRESHOLDS.BORROW_COST_WEIGHT;
  
  const finalScore = Math.round(Math.min(totalScore, 100));
  
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (finalScore >= 70) riskLevel = 'high';
  else if (finalScore >= 40) riskLevel = 'medium';
  
  return { score: finalScore, riskLevel };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const getShortInterestSchema = z.object({
  symbol: z.string().describe('Stock symbol (e.g., AAPL, TSLA)'),
  includeSqueezeAnalysis: z.boolean().default(true).describe('Include short squeeze risk analysis'),
});

const getShortInterestRatioSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  quantity: z.number().positive().optional().describe('Position quantity'),
  avgCost: z.number().positive().optional().describe('Average cost per share'),
  daysToCover: z.number().positive().optional().describe('Current days to cover'),
});

const detectShortSqueezeSchema = z.object({
  symbols: z.array(z.string()).min(1).max(20).describe('List of symbols to analyze'),
  minShortInterestRatio: z.number().min(1).max(30).default(5).describe('Minimum days to cover'),
  minShortPercentFloat: z.number().min(1).max(50).default(5).describe('Minimum short percent of float'),
});

// ============================================================================
// Tools
// ============================================================================

export function createGetShortInterestTool() {
  return new PiTool({
    name: 'get_short_interest',
    description: 'Get short interest data for a stock including days to cover, short percent of float, and squeeze risk analysis.',
    schema: getShortInterestSchema,
    func: async ({ symbol, includeSqueezeAnalysis }) => {
      const upperSymbol = symbol.toUpperCase();
      
      // Generate mock data (in production, call API)
      const data = generateMockShortData(upperSymbol);
      
      const shortInterestRatio = calculateShortInterestRatio(data.shortInterest, data.avgDailyVolume);
      const shortPercentFloat = calculateShortPercentFloat(data.shortInterest, data.totalFloat);
      const monthlyChange = ((data.shortInterest - data.previousMonthShort) / data.previousMonthShort) * 100;
      
      const squeezeResult = calculateSqueezeScore(
        data.shortInterest,
        data.avgDailyVolume,
        data.previousMonthShort,
        data.totalFloat,
        data.borrowCost
      );
      
      const result: Record<string, unknown> = {
        type: 'Short Interest Data',
        symbol: upperSymbol,
        shortInterest: data.shortInterest.toLocaleString(),
        avgDailyVolume: data.avgDailyVolume.toLocaleString(),
        daysToCover: shortInterestRatio.toFixed(1),
        shortPercentFloat: `${shortPercentFloat.toFixed(2)}%`,
        monthlyChange: `${monthlyChange >= 0 ? '+' : ''}${monthlyChange.toFixed(1)}%`,
        borrowCost: `${data.borrowCost.toFixed(1)}%`,
        shortExemptVolume: data.shortExemptVolume.toLocaleString(),
        totalFloat: data.totalFloat.toLocaleString(),
      };
      
      if (includeSqueezeAnalysis) {
        result.squeezeAnalysis = {
          score: squeezeResult.score,
          riskLevel: squeezeResult.riskLevel.toUpperCase(),
          daysToCoverRisk: shortInterestRatio > THRESHOLDS.HIGH_COVER ? 'HIGH' : shortInterestRatio > THRESHOLDS.MEDIUM_COVER ? 'MEDIUM' : 'LOW',
          floatRisk: shortPercentFloat > THRESHOLDS.HIGH_SHORT_FLOAT ? 'HIGH' : shortPercentFloat > THRESHOLDS.LOW_SHORT_FLOAT ? 'MEDIUM' : 'LOW',
          trendRisk: monthlyChange > 20 ? 'HIGH' : monthlyChange > 0 ? 'MEDIUM' : 'LOW',
        };
      }
      
      return formatToolResult(result);
    },
  });
}

export function createCalculateShortInterestRatioTool() {
  return new PiTool({
    name: 'calculate_short_interest_ratio',
    description: 'Calculate short interest ratio (days to cover) and position squeeze risk for your holdings.',
    schema: getShortInterestRatioSchema,
    func: async ({ symbol, quantity, avgCost, daysToCover }) => {
      const upperSymbol = symbol.toUpperCase();
      
      // Get short interest data
      const data = generateMockShortData(upperSymbol);
      const ratio = calculateShortInterestRatio(data.shortInterest, data.avgDailyVolume);
      
      const result: Record<string, unknown> = {
        type: 'Short Interest Ratio Analysis',
        symbol: upperSymbol,
        marketShortInterest: {
          shortInterest: data.shortInterest.toLocaleString(),
          avgDailyVolume: data.avgDailyVolume.toLocaleString(),
          daysToCover: ratio.toFixed(1),
        },
      };
      
      if (quantity && avgCost) {
        // Calculate position-specific squeeze risk
        const positionValue = quantity * avgCost;
        const marketValue = data.shortInterest * avgCost;
        
        // If short sellers cover, they need to buy ~X% of daily volume
        const buyingPressurePercent = (data.shortInterest / data.avgDailyVolume) * 100;
        
        result.positionAnalysis = {
          sharesHeld: quantity,
          avgCost: avgCost.toFixed(2),
          positionValue: positionValue.toLocaleString(),
          squeezeImpact: {
            buyingPressure: `${buyingPressurePercent.toFixed(1)}% of daily volume`,
            estimatedCoveringDays: ratio.toFixed(1),
            riskLevel: ratio > THRESHOLDS.HIGH_COVER ? 'HIGH' : ratio > THRESHOLDS.MEDIUM_COVER ? 'MEDIUM' : 'LOW',
          },
        };
      }
      
      return formatToolResult(result);
    },
  });
}

export function createDetectShortSqueezeTool() {
  return new PiTool({
    name: 'detect_short_squeeze',
    description: 'Screen multiple stocks for short squeeze potential based on high short interest and days to cover.',
    schema: detectShortSqueezeSchema,
    func: async ({ symbols, minShortInterestRatio, minShortPercentFloat }) => {
      const results: {
        symbol: string;
        shortInterest: string;
        daysToCover: string;
        shortPercentFloat: string;
        borrowCost: string;
        squeezeScore: number;
        riskLevel: string;
      }[] = [];
      
      for (const symbol of symbols) {
        const upperSymbol = symbol.toUpperCase();
        const data = generateMockShortData(upperSymbol);
        
        const ratio = calculateShortInterestRatio(data.shortInterest, data.avgDailyVolume);
        const shortPercent = calculateShortPercentFloat(data.shortInterest, data.totalFloat);
        
        const squeezeResult = calculateSqueezeScore(
          data.shortInterest,
          data.avgDailyVolume,
          data.previousMonthShort,
          data.totalFloat,
          data.borrowCost
        );
        
        // Filter by criteria
        if (ratio >= minShortInterestRatio && shortPercent >= minShortPercentFloat) {
          results.push({
            symbol: upperSymbol,
            shortInterest: `${(data.shortInterest / 1000000).toFixed(2)}M`,
            daysToCover: ratio.toFixed(1),
            shortPercentFloat: `${shortPercent.toFixed(2)}%`,
            borrowCost: `${data.borrowCost.toFixed(1)}%`,
            squeezeScore: squeezeResult.score,
            riskLevel: squeezeResult.riskLevel.toUpperCase(),
          });
        }
      }
      
      // Sort by squeeze score
      results.sort((a, b) => b.squeezeScore - a.squeezeScore);
      
      return formatToolResult({
        type: 'Short Squeeze Detection',
        screeningCriteria: {
          minDaysToCover: minShortInterestRatio,
          minShortPercentFloat: `${minShortPercentFloat}%`,
          symbolsScreened: symbols.length,
          matchesFound: results.length,
        },
        highRiskStocks: results.filter(r => r.riskLevel === 'HIGH'),
        mediumRiskStocks: results.filter(r => r.riskLevel === 'MEDIUM'),
        allMatches: results,
        disclaimer: 'This is screening data only. Short squeeze potential does not guarantee a squeeze will occur.',
      });
    },
  });
}

export const shortInterestTools = [
  createGetShortInterestTool(),
  createCalculateShortInterestRatioTool(),
  createDetectShortSqueezeTool(),
];
