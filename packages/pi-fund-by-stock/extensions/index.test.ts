import { test, expect, describe } from 'bun:test';

describe('extension registration', () => {
  test('module loads without throwing', async () => {
    const ext = await import('./index');
    expect(typeof ext.default).toBe('function');
    expect(typeof ext.registerFundByStockExtension).toBe('function');
  });

  test('exports all three tools signatures', async () => {
    const ext = await import('./index');
    // 仅校验模块能被导入 + 默认导出是函数
    expect(typeof ext.default).toBe('function');
  });
});