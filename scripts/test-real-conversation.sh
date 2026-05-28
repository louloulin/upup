#!/bin/bash
# 真实业务对话测试脚本 v2 - 使用 expect 模拟真实交互

set -e

BINARY="./dist/upup"
ROUNDS=10
TIMEOUT=60

echo "============================================"
echo "真实业务对话测试 v2 - 10轮金融/业务对话"
echo "============================================"
echo ""

# 检查 expect 是否安装
if ! command -v expect &> /dev/null; then
  echo "Installing expect..."
  brew install expect 2>/dev/null || brew install expect
fi

# 定义真实业务对话
declare -a CONVERSATIONS=(
  "分析贵州茅台"
  "查询宁德时代"
  "A股大盘分析"
  "特斯拉新闻"
  "医药板块"
  "风险评估"
  "估值对比"
  "北向资金"
  "科技股分析"
  "财经总结"
)

passed=0
failed=0

for i in $(seq 1 $ROUNDS); do
  echo "--- Round $i/$ROUNDS ---"

  # 创建 expect 脚本
  cat > /tmp/tui_test_$i.exp << 'EOF'
#!/usr/bin/expect -f
set timeout 120
set query [lindex $argv 0]

spawn ./dist/upup

# 等待 TUI 初始化
sleep 2

# 发送查询
send "$query\r"

# 等待响应 (最多 60 秒)
expect {
  -re "(\\$|#|>).*" {
    # 收到提示符，继续
  }
  timeout {
    puts "TIMEOUT"
  }
}

# 发送退出命令
send "/exit\r"

# 等待程序退出
expect eof
EOF

  chmod +x /tmp/tui_test_$i.exp

  echo "Query: ${CONVERSATIONS[$((i-1))]}"
  START_TIME=$(date +%s)

  OUTPUT=$(expect /tmp/tui_test_$i.exp "${CONVERSATIONS[$((i-1))]}" 2>&1 || true)

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  # 检查输出
  if echo "$OUTPUT" | grep -q -i "panic\|fatal\|segmentation"; then
    echo "❌ FAILED - Critical error detected"
    echo "$OUTPUT" | tail -30
    failed=$((failed + 1))
  elif [ $DURATION -lt 10 ]; then
    echo "⚠️  Too fast (${DURATION}s)"
  else
    echo "✅ PASSED (${DURATION}s)"
    passed=$((passed + 1))
  fi

  rm -f /tmp/tui_test_$i.exp
  echo ""
done

echo "============================================"
echo "测试结果: $passed passed, $failed failed"
echo "============================================"

if [ $failed -gt 0 ]; then
  exit 1
fi
