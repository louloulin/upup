/**
 * Tests for ValuationTools
 */

import { describe, it, expect } from 'vitest';
import {
  ValuationRatiosSchema,
  DcfModelSchema,
  PeerComparisonSchema,
  VALUATION_RATIOS_DESCRIPTION,
  DCF_MODEL_DESCRIPTION,
  PEER_COMPARISON_DESCRIPTION,
  calculateValuationRatios,
  calculateDCF,
  comparePeers,
} from './valuation-tools.js';

// ============================================================================
// Schema Tests
// ============================================================================

describe('ValuationRatiosSchema', () => {
  it('should parse valid input with price and eps', () => {
    const result = ValuationRatiosSchema.safeParse({ price: 150, eps: 10 });
    expect(result.success).toBe(true);
  });

  it('should parse valid input with all fields', () => {
    const result = ValuationRatiosSchema.safeParse({
      price: 150,
      eps: 10,
      book_value_per_share: 50,
      cash_flow_per_share: 8,
      shares_outstanding: 1e9,
      total_equity: 50e9,
      operating_cash_flow: 8e9,
    });
    expect(result.success).toBe(true);
  });

  it('should require price', () => {
    const result = ValuationRatiosSchema.safeParse({ eps: 10 });
    expect(result.success).toBe(false);
  });

  it('should require eps', () => {
    const result = ValuationRatiosSchema.safeParse({ price: 150 });
    expect(result.success).toBe(false);
  });

  it('should reject negative price', () => {
    const result = ValuationRatiosSchema.safeParse({ price: -10, eps: 5 });
    expect(result.success).toBe(false);
  });
});

describe('DcfModelSchema', () => {
  it('should parse valid input', () => {
    const result = DcfModelSchema.safeParse({
      current_fcf: 5e9,
      growth_rate: 0.08,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
    });
    expect(result.success).toBe(true);
  });

  it('should parse with optional fields', () => {
    const result = DcfModelSchema.safeParse({
      current_fcf: 5e9,
      growth_rate: 0.08,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
      shares_outstanding: 1e9,
      net_debt: 2e9,
      projection_years: 15,
    });
    expect(result.success).toBe(true);
  });

  it('should require current_fcf', () => {
    const result = DcfModelSchema.safeParse({
      growth_rate: 0.08,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
    });
    expect(result.success).toBe(false);
  });

  it('should reject discount_rate below 1%', () => {
    const result = DcfModelSchema.safeParse({
      current_fcf: 5e9,
      growth_rate: 0.08,
      discount_rate: 0.005,
      terminal_growth_rate: 0.03,
    });
    expect(result.success).toBe(false);
  });
});

describe('PeerComparisonSchema', () => {
  it('should parse valid input', () => {
    const result = PeerComparisonSchema.safeParse({
      target: { name: 'Apple', pe_ratio: 25 },
      peers: [{ name: 'Microsoft', pe_ratio: 30 }],
    });
    expect(result.success).toBe(true);
  });

  it('should require at least one peer', () => {
    const result = PeerComparisonSchema.safeParse({
      target: { name: 'Apple' },
      peers: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 20 peers', () => {
    const result = PeerComparisonSchema.safeParse({
      target: { name: 'Apple' },
      peers: Array(21).fill(null).map((_, i) => ({ name: `Peer ${i}` })),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Calculation Tests
// ============================================================================

describe('calculateValuationRatios', () => {
  it('should calculate PE ratio', () => {
    const result = calculateValuationRatios({ price: 150, eps: 10 });
    expect(result.pe_ratio).toBe(15);
  });

  it('should handle negative EPS', () => {
    const result = calculateValuationRatios({ price: 150, eps: -5 });
    expect(result.pe_ratio).toBe(-30);
  });

  it('should handle zero EPS', () => {
    const result = calculateValuationRatios({ price: 150, eps: 0 });
    expect(result.pe_ratio).toBeNull();
  });

  it('should calculate PB ratio from book_value_per_share', () => {
    const result = calculateValuationRatios({
      price: 100,
      eps: 5,
      book_value_per_share: 50,
    });
    expect(result.pb_ratio).toBe(2);
  });

  it('should calculate PB ratio from total_equity and shares', () => {
    const result = calculateValuationRatios({
      price: 100,
      eps: 5,
      shares_outstanding: 1e9,
      total_equity: 50e9,
    });
    expect(result.pb_ratio).toBe(2); // 100 / (50e9 / 1e9) = 100 / 50 = 2
  });

  it('should calculate PCF ratio', () => {
    const result = calculateValuationRatios({
      price: 100,
      eps: 5,
      cash_flow_per_share: 10,
    });
    expect(result.pcf_ratio).toBe(10); // 100 / 10 = 10
  });

  it('should calculate market cap', () => {
    const result = calculateValuationRatios({
      price: 150,
      eps: 10,
      shares_outstanding: 1e9,
    });
    expect(result.market_cap).toBe(150e9);
  });

  it('should return null for missing optional fields', () => {
    const result = calculateValuationRatios({ price: 150, eps: 10 });
    expect(result.pb_ratio).toBeNull();
    expect(result.pcf_ratio).toBeNull();
    expect(result.market_cap).toBeNull();
  });
});

describe('calculateDCF', () => {
  it('should calculate basic DCF', () => {
    const result = calculateDCF({
      current_fcf: 1e9,
      growth_rate: 0.05,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
    });

    expect(result.enterprise_value).toBeGreaterThan(0);
    expect(result.terminal_value).toBeGreaterThan(0);
    expect(result.projected_fcf.length).toBe(10); // default 10 years
  });

  it('should calculate per-share value', () => {
    const result = calculateDCF({
      current_fcf: 5e9,
      growth_rate: 0.08,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
      shares_outstanding: 1e9,
      net_debt: 2e9,
    });

    expect(result.intrinsic_value_per_share).not.toBeNull();
    expect(result.intrinsic_value_per_share!).toBeGreaterThan(0);
    expect(result.equity_value).toBeLessThan(result.enterprise_value);
  });

  it('should respect custom projection_years', () => {
    const result = calculateDCF({
      current_fcf: 1e9,
      growth_rate: 0.05,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
      projection_years: 5,
    });

    expect(result.projected_fcf.length).toBe(5);
    expect(result.assumptions.projection_years).toBe(5);
  });

  it('should handle zero growth rate', () => {
    const result = calculateDCF({
      current_fcf: 1e9,
      growth_rate: 0,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
    });

    // All projected FCFs should be the same as current
    for (const fcf of result.projected_fcf) {
      expect(fcf).toBe(1e9);
    }
  });
});

describe('comparePeers', () => {
  it('should compare target against peers', () => {
    const result = comparePeers({
      target: { name: 'Apple', pe_ratio: 25, roe: 0.3 },
      peers: [
        { name: 'Microsoft', pe_ratio: 30, roe: 0.2 },
        { name: 'Google', pe_ratio: 22, roe: 0.25 },
      ],
    });

    expect(result.metrics.pe_ratio).toBeDefined();
    expect(result.metrics.pe_ratio.target).toBe(25);
    expect(result.metrics.pe_ratio.peer_avg).toBe(26);
    expect(result.metrics.pe_ratio.percentile).toBe(50); // 1 of 2 below
  });

  it('should handle null values', () => {
    const result = comparePeers({
      target: { name: 'Company', pe_ratio: 15 },
      peers: [{ name: 'Peer', pe_ratio: null }],
    });

    expect(result.metrics.pe_ratio.target).toBe(15);
    expect(result.metrics.pe_ratio.peer_avg).toBe(0);
  });

  it('should generate summary', () => {
    const result = comparePeers({
      target: { name: 'Apple', pe_ratio: 25 },
      peers: [{ name: 'Microsoft', pe_ratio: 30 }],
    });

    expect(result.summary).toContain('PE RATIO');
  });
});

// ============================================================================
// Description Tests
// ============================================================================

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(VALUATION_RATIOS_DESCRIPTION.length).toBeGreaterThan(10);
    expect(DCF_MODEL_DESCRIPTION.length).toBeGreaterThan(10);
    expect(PEER_COMPARISON_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention relevant terms', () => {
    expect(VALUATION_RATIOS_DESCRIPTION).toMatch(/PE|PB|PCF/i);
    expect(DCF_MODEL_DESCRIPTION).toMatch(/cash flow|intrinsic|DCF/i);
    expect(PEER_COMPARISON_DESCRIPTION).toMatch(/peer|comparison/i);
  });
});
