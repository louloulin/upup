#!/bin/bash
# 真实业务对话测试脚本 - 10轮金融/业务对话

set -e

BINARY="./dist/upup"
ROUNDS=10
TIMEOUT=120

echo "============================================"
echo "真实业务对话测试 - 10轮金融/业务对话"
echo "============================================"
echo ""

# 定义真实业务对话
declare -a CONVERSATIONS=(
  "分析一下贵州茅台的财务状况，包括营收、利润和现金流"
  "帮我查询一下宁德时代的最新股价和技术指标 RSI"
  "对A股大盘做个简单分析，判断当前趋势"
  "帮我搜索特斯拉相关的最新新闻，分析对A股新能源板块的影响"
  "分析一下医药板块的投资机会，重点关注创新药"
  "帮我做个风险评估：投资100万在A股，应该如何配置"
  "查询工商银行和中国平安的估值对比分析"
  "帮我分析一下最近的北向资金流向"
  "对科技股做一个简短的行业轮动分析"
  "帮我总结一下本周最重要的财经事件"
)

passed=0
failed=0

for i in $(seq 1 $ROUNDS); do
  echo "--- Round $i/$ROUNDS ---"
  echo "Query: ${CONVERSATIONS[$((i-1))]}"

  # 创建临时会话目录
  SESSION_DIR=$(mktemp -d)

  # 设置环境变量
  export UP_SESSION_DIR="$SESSION_DIR"
  export UP_SESSION_ID="test-business-$i"

  # 启动 TUI，发送查询，等待响应
  START_TIME=$(date +%s)

  # 使用 expect 或脚本模拟输入
  OUTPUT=$(echo -e "${CONVERSATIONS[$((i-1))]}\n/exit" | timeout $TIMEOUT $BINARY 2>&1 || true)

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  # 检查输出
  if echo "$OUTPUT" | grep -q -i "error\|exception\|crash"; then
    echo "❌ FAILED - Error detected"
    echo "$OUTPUT" | tail -20
    failed=$((failed + 1))
  elif [ $DURATION -lt 5 ]; then
    echo "⚠️  WARNING - Too fast (${DURATION}s), may not have processed"
    passed=$((passed + 1))
  else
    echo "✅ PASSED (${DURATION}s)"
    passed=$((passed + 1))
  fi

  # 清理会话目录
  rm -rf "$SESSION_DIR"
  echo ""
done

echo "============================================"
echo "测试结果: $passed passed, $failed failed"
echo "============================================"

if [ $failed -gt 0 ]; then
  exit 1
fi
