// Test script for A-share tools
import { getTushareClient } from './src/tools/astock/tushare-client';
import { fetchStockNews, fetchMarketNews } from './src/tools/astock/news-client';
import { screenStocks } from './src/tools/astock/screener-client';

console.log('🧪 Testing A-share data sources...\n');

async function main() {
  // Test 1: Market news from scraping
  console.log('1. Testing market news (Eastmoney scraping)...');
  try {
    const news = await fetchMarketNews(5);
    console.log(`   ✅ Got ${news.length} market news items`);
    if (news.length > 0) {
      console.log(`   Sample: ${news[0].title?.substring(0, 50)}...`);
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e}`);
  }

  // Test 2: Stock-specific news
  console.log('\n2. Testing BYD news scraping (002594)...');
  try {
    const news = await fetchStockNews('002594.SZ');
    console.log(`   ✅ Got ${news.length} news items`);
    if (news.length > 0) {
      console.log(`   Sample: ${news[0].title?.substring(0, 50)}...`);
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e}`);
  }

  // Test 3: Stock screening by sector
  console.log('\n3. Testing stock screening (新能源 sector)...');
  try {
    const { stocks, source } = await screenStocks('新能源', undefined, 10);
    console.log(`   ✅ Got ${stocks.length} stocks from ${source}`);
    if (stocks.length > 0) {
      console.log(`   Sample: ${(stocks[0] as any).name || stocks[0]}`);
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e}`);
  }

  // Test 4: Tushare (if token available)
  if (process.env.TUSHARE_TOKEN) {
    console.log('\n4. Testing Tushare API...');
    try {
      const client = getTushareClient();
      const marketNews = await client.news('sina');
      console.log(`   ✅ Got ${marketNews.length} news from Tushare`);
    } catch (e) {
      console.log(`   ❌ Tushare failed: ${e}`);
    }
  } else {
    console.log('\n4. Skipping Tushare (no token)');
  }

  console.log('\n✅ All tests completed!');
}

main().catch(console.error);
