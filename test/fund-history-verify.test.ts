import { describe, test, expect } from 'bun:test';
import { getFundHistoricalNav, getFundFullHistory } from '@upup/pi-finance-sdk';

describe('基金历史净值API验证', () => {
  test('获取单页历史净值 - 110022', async () => {
    const result = await getFundHistoricalNav('110022', 1, 20);
    console.log('历史净值数量:', result.totalCount, result.items.length);
    console.log('最新净值:', result.items[0]);
    
    if (result.items.length > 0) {
      expect(result.items[0].nav).toBeGreaterThan(0);
      expect(result.items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  }, 30000);

  test('获取完整历史净值 - 110022', async () => {
    const result = await getFundFullHistory('110022', 3);
    console.log('完整历史净值数量:', result.length);
    console.log('日期范围:', result[0]?.date, '~', result[result.length - 1]?.date);
    
    expect(result.length).toBeGreaterThan(0);
  }, 60000);
});
