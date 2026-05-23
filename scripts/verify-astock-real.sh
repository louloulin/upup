#!/bin/bash
# 真实A股数据验证脚本

echo "=========================================="
echo "真实A股数据验证"
echo "=========================================="

cd /Users/louloulin/Documents/linchong/touzhi/dexter

# 检查 TUSHARE_TOKEN
echo ""
echo "1. 检查 TUSHARE_TOKEN..."
if [ -f ".env" ]; then
    if grep -q "TUSHARE_TOKEN" .env && grep -q "export TUSHARE_TOKEN" .env; then
        echo "✅ TUSHARE_TOKEN 已配置"
        source .env 2>/dev/null
        if [ -n "$TUSHARE_TOKEN" ]; then
            echo "   Token 长度: ${#TUSHARE_TOKEN} 字符"
        else
            echo "⚠️ Token 为空"
        fi
    else
        echo "⚠️ TUSHARE_TOKEN 未在 .env 中配置"
    fi
else
    echo "⚠️ .env 文件不存在"
fi

echo ""
echo "2. A股数据工具清单..."
echo "   - get_astock_price: 获取股票价格"
echo "   - get_astock_financials: 获取财务数据"
echo "   - get_astock_news: 获取新闻公告"
echo "   - get_market_structure: 获取市场结构(北向资金等)"
echo "   - get_sector_data: 获取板块数据"
echo "   - get_technical_data: 获取技术指标"

echo ""
echo "3. 支持的股票代码格式..."
cat << 'FORMATS'
   A股格式:
   - 沪市: 600519.SH (贵州茅台)
   - 深市: 002594.SZ (比亚迪)
   - 创业板: 300750.SZ (宁德时代)
   
   港股格式:
   - 00700.HK (腾讯控股)
   - 09988.HK (阿里巴巴)
FORMATS

echo ""
echo "4. Skills 触发词验证..."
echo "   支持的触发词:"
echo "   - A股分析、分析比亚迪、港股分析"
echo "   - 研究报告、生成报告"
echo "   - 对比、比较股票"
echo "   - 舆情、情绪分析"
echo "   - 组合、持仓分析"
echo "   - 风险评估"
echo "   - 板块分析"

echo ""
echo "5. 测试用例示例..."
cat << 'EXAMPLES'
   用户输入: "分析贵州茅台近期走势和投资价值"
   触发 Skill: a-share-analysis
   调用工具: 
   - get_astock_price({code: "600519.SH"})
   - get_astock_financials({code: "600519.SH"})
   - get_astock_news({code: "600519.SH"})
   输出: 完整投研报告

   用户输入: "对比茅台和五粮液"
   触发 Skill: stock-comparison
   调用工具:
   - get_astock_price({code: "600519.SH"})
   - get_astock_price({code: "000858.SZ"})
   输出: 对比分析报告

   用户输入: "茅台的舆情怎么样"
   触发 Skill: sentiment-analysis
   调用工具:
   - get_astock_news({code: "600519.SH"})
   输出: 舆情分析报告
EXAMPLES

echo ""
echo "=========================================="
echo "验证完成!"
echo "=========================================="
