import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getInvestmentAgentSpec, INVESTMENT_PROFILES } from '@upup/pi-investment-workflow';

const PACKAGE_NAMES = [
  'pi-investment-workflow', 'pi-finance-sdk', 'pi-market-data', 'pi-investment-analysis',
  'pi-risk', 'pi-portfolio', 'pi-backtest', 'pi-platform', 'pi-research', 'pi-technical',
  'pi-browser', 'pi-corporate-actions', 'pi-quant', 'pi-config', 'pi-cache', 'pi-notify',
  'pi-management',
] as const;

type Manifest = { pi?: { tools?: string[]; nativeTools?: string[] } };

function manifest(packageName: string): Manifest {
  return JSON.parse(readFileSync(join(process.cwd(), 'packages', packageName, 'package.json'), 'utf8')) as Manifest;
}

function packageTools(field: 'tools' | 'nativeTools'): Map<string, string[]> {
  return new Map(PACKAGE_NAMES.map((name) => [name, manifest(name).pi?.[field] ?? []]));
}

describe('Pi finance package manifest ownership', () => {
  test('declares every built-in package with a non-empty ownership boundary', () => {
    for (const [name, tools] of packageTools('tools')) expect(tools.length, name).toBeGreaterThan(0);
  });

  test('does not let one built-in package claim another package tool', () => {
    const owners = new Map<string, string>();
    for (const [name, tools] of packageTools('tools')) {
      for (const tool of tools) {
        expect(owners.has(tool), `${tool} claimed by ${owners.get(tool)} and ${name}`).toBe(false);
        owners.set(tool, name);
      }
    }
    expect(owners.get('get_financials')).toBe('pi-finance-sdk');
    expect(owners.get('get_market_data')).toBe('pi-market-data');
    expect(owners.get('dcf_model')).toBe('pi-investment-analysis');
    expect(owners.get('calculate_var')).toBe('pi-risk');
    expect(owners.get('invest_workflow_phase')).toBe('pi-investment-workflow');
    expect(owners.get('invest_workflow')).toBe('pi-investment-workflow');
  });

  test('keeps native tools explicit and within each package ownership boundary', () => {
    const tools = packageTools('tools');
    for (const [name, nativeTools] of packageTools('nativeTools')) {
      expect(nativeTools.every((tool) => tools.get(name)?.includes(tool)), name).toBe(true);
    }
    expect(packageTools('nativeTools').get('pi-market-data')).toContain('check_trading_day');
    expect(packageTools('nativeTools').get('pi-platform')).toContain('memory_search');
  });

  test('covers every declared investment profile tool exactly once', () => {
    const tools = packageTools('tools');
    for (const profile of Object.values(INVESTMENT_PROFILES)) {
      if (profile.tools === '*') continue;
      for (const toolName of profile.tools) {
        const owners = [...tools].filter(([, names]) => names.includes(toolName));
        expect(owners, `${profile.id}:${toolName}`).toHaveLength(1);
      }
    }
  });

  test('keeps the production profiles backed by the same Package manifest surface', () => {
    expect(Object.values(INVESTMENT_PROFILES).map((profile) => getInvestmentAgentSpec(profile.id).id)).toHaveLength(Object.keys(INVESTMENT_PROFILES).length);
  });
});
