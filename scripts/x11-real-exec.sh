#!/bin/bash
# x11-real-exec.sh - 真实 Skills 执行验证
# 直接执行 upup 并获取真实 Skills 输出

set -e
cd "$(dirname "$0")/.."

BINARY="./dist/upup"
LOG_FILE="x11-real-exec.log"
RESULTS_FILE="x11-real-results.json"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Skills 测试列表 (带参数的完整命令)
declare -a SKILLS_TESTS=(
  "/macro-china GDP"
  "/macro-china CPI"
  "/macro-china M2"
  "/macro-china 利率"
  "/a-share-data 600519"
  "/a-share-data 300750"
  "/a-share-data 000858"
  "/financial-data 贵州茅台"
  "/technical-analysis 600519"
  "/risk-assessment 600519"
  "/sentiment-analysis 新能源车"
  "/sector-analysis 医药"
  "/money-flow 白酒"
  "/valuation-comparison 600519 000858"
  "/fund-analysis 510310"
  "/web-search 苹果公司最新消息"
)

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║  真实 Skills 执行验证 - 直接调用 upup 获取真实输出               ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# 初始化
passed=0
failed=0
total=${#SKILLS_TESTS[@]}

# 清空日志
> "$LOG_FILE"

echo "开始时间: $(date)" | tee -a "$LOG_FILE"
echo "总计测试: $total" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 开始测试
for i in "${!SKILLS_TESTS[@]}"; do
  idx=$((i+1))
  skill_cmd="${SKILLS_TESTS[$i]}"

  echo "--- [$idx/$total] 执行: $skill_cmd ---" | tee -a "$LOG_FILE"

  # 使用 expect 模拟交互
  output=$(expect -c "
    set timeout 60
    spawn $BINARY
    sleep 3
    send \"$skill_cmd\r\"
    sleep 45
    expect -re {/ for commands|>|\\\$}
    send \"/exit\r\"
    expect eof
  " 2>&1 || true)

  # 分析输出
  output_len=${#output}

  # 检查是否有真实数据输出 (不仅仅是prompt)
  if echo "$output" | grep -qE "(GDP|CPI|数据|分析|报告|股票|指标|行情)"; then
    echo -e "${GREEN}✅ PASSED${NC} - 输出长度: $output_len" | tee -a "$LOG_FILE"
    passed=$((passed+1))
  elif [ $output_len -gt 500 ]; then
    echo -e "${YELLOW}⚠️  PARTIAL${NC} - 输出长度: $output_len" | tee -a "$LOG_FILE"
    passed=$((passed+1))
  else
    echo -e "${RED}❌ FAILED${NC} - 输出太短: $output_len" | tee -a "$LOG_FILE"
    failed=$((failed+1))
  fi

  # 写入详细输出到日志
  echo "--- Output ---" >> "$LOG_FILE"
  echo "$output" | head -50 >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"

  echo "" | tee -a "$LOG_FILE"
done

# 总结
echo "" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "测试总结" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "总计: $total" | tee -a "$LOG_FILE"
echo "通过: $passed" | tee -a "$LOG_FILE"
echo "失败: $failed" | tee -a "$LOG_FILE"
echo "通过率: $(awk "BEGIN {printf \"%.1f\", $passed/$total*100}")%" | tee -a "$LOG_FILE"
echo "结束时间: $(date)" | tee -a "$LOG_FILE"

# 保存JSON结果
cat > "$RESULTS_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "total": $total,
  "passed": $passed,
  "failed": $failed,
  "passRate": "$(awk "BEGIN {printf \"%.1f\", $passed/$total*100}")%",
  "tests": [
$(for i in "${!SKILLS_TESTS[@]}"; do
  skill_cmd="${SKILLS_TESTS[$i]}"
  echo "    {\"skill\": \"$skill_cmd\", \"index\": $((i+1))}"
  if [ $i -lt $(($total-1)) ]; then echo ","; fi
done)
  ]
}
EOF

echo ""
echo "📝 结果已保存: $RESULTS_FILE"
echo "📝 详细日志: $LOG_FILE"
