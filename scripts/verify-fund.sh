#!/bin/bash
# 基金功能验证脚本

set -e

echo "=========================================="
echo "   UpUp 基金功能验证"
echo "=========================================="
echo ""

cd /Users/louloulin/Documents/linchong/touzhi/dexter

echo "📦 1. 运行单元测试..."
bun test 2>&1 | tail -5

echo ""
echo "🔍 2. 测试基金搜索功能..."
bun run -e "
import { searchFunds } from './src/tools/fund/fund-api';
const result = await searchFunds('易方达');
console.log('搜索结果:', JSON.stringify(result, null, 2));
"

echo ""
echo "📊 3. 测试基金详情获取..."
bun run -e "
import { getFundDetail } from './src/tools/fund/fund-api';
const result = await getFundDetail('005827');
console.log('基金详情:', JSON.stringify(result, null, 2));
"

echo ""
echo "📈 4. 测试实时净值获取..."
bun run -e "
import { getFundEstimatedNav } from './src/tools/fund/fund-api';
const result = await getFundEstimatedNav('005827');
console.log('实时净值:', JSON.stringify(result, null, 2));
"

echo ""
echo "📋 5. 测试基金业绩数据..."
bun run -e "
import { getFundPerformance } from './src/tools/fund/fund-api';
const result = await getFundPerformance('005827');
console.log('业绩数据:', JSON.stringify(result, null, 2));
"

echo ""
echo "🏦 6. 测试基金经理查询..."
bun run -e "
import { getFundManager } from './src/tools/fund/fund-api';
const result = await getFundManager('005827');
console.log('基金经理:', JSON.stringify(result, null, 2));
"

echo ""
echo "🎯 7. 测试基金持仓查询..."
bun run -e "
import { getFundHoldings } from './src/tools/fund/fund-api';
const result = await getFundHoldings('005827');
console.log('基金持仓:', JSON.stringify(result, null, 2));
"

echo ""
echo "❤️ 8. 测试基金关注功能..."
bun run -e "
import { followFund, getFollowedFunds, unfollowFund } from './src/tools/fund/fund-api';
await followFund('005827');
const followed = await getFollowedFunds();
console.log('关注列表:', JSON.stringify(followed, null, 2));
await unfollowFund('005827');
console.log('取消关注成功');
"

echo ""
echo "🔎 9. 测试基金筛选功能..."
bun run -e "
import { filterFunds } from './src/tools/fund/fund-api';
const result = await filterFunds({ type: '混合型' });
console.log('筛选结果数量:', result.length);
"

echo ""
echo "🏆 10. 测试热门基金..."
bun run -e "
import { getHotFunds } from './src/tools/fund/fund-api';
const result = await getHotFunds(5);
console.log('热门基金:', JSON.stringify(result, null, 2));
"

echo ""
echo "=========================================="
echo "   验证完成"
echo "=========================================="
