/**
 * Shared test fixtures for alt-data adapters.
 *
 * Kept in a separate file so both adapters can be tested in isolation and the
 * fixtures can be reused by e2e tests.
 */

export const mockDragonTigerResponse = {
  items: [
    {
      symbol: '600519.SH',
      branch: '中信证券上海分公司',
      action: 'buy',
      amount: 1.2e8,
      url: 'https://data.eastmoney.com/stock/lhb/600519.html',
      publishedAt: 1717480800000,
    },
    {
      symbol: '000001.SZ',
      branch: '华泰证券深圳益田路',
      action: 'sell',
      amount: 8.5e7,
      url: 'https://data.eastmoney.com/stock/lhb/000001.html',
      publishedAt: 1717484400000,
    },
  ],
};

export const mockNorthBoundResponse = {
  date: 1717480800000,
  shConnect: { netInflow: 5.2e9, topBuys: ['600519.SH', '000858.SZ', '601318.SH'] },
  szConnect: { netInflow: 3.1e9, topBuys: ['000001.SZ', '000333.SZ'] },
  marginBalance: { total: 1.8e12, change: -2.3e9 },
};
