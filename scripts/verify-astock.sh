#!/bin/bash
# A股数据验证脚本

echo "=========================================="
echo "UpUp A股数据验证"
echo "=========================================="

cd "$(dirname "$0")/.." || exit 1

echo ""
echo "1. 检查 Pi Market Data Extension..."
if [ -f "packages/pi-market-data/extensions/index.ts" ]; then
    echo "✅ Pi Market Data Extension 存在"
else
    echo "❌ Tushare 客户端不存在"
fi

echo ""
echo "2. 检查 A股工具注册..."
grep -En "name: '(get_astock_|screen_astocks|get_sector_data|get_technical_data|get_market_structure)" packages/pi-market-data/extensions/index.ts

echo ""
echo "3. 常用A股股票代码..."
cat << 'CODES'
| 股票 | 代码 | 交易所 |
|------|------|--------|
| 贵州茅台 | 600519 | SH |
| 宁德时代 | 300750 | SZ |
| 比亚迪 | 002594 | SZ |
| 中国平安 | 601318 | SH |
| 招商银行 | 600036 | SH |
| 五粮液 | 000858 | SZ |
| 海康威视 | 002415 | SZ |
CODES

echo ""
echo "4. Skills 中的 A股分析..."
cat src/skills/a-share-analysis/SKILL.md | head -30

echo ""
echo "5. Skills 总数统计..."
find src/skills -name "SKILL.md" | wc -l

echo ""
echo "=========================================="
echo "验证完成!"
echo "=========================================="
