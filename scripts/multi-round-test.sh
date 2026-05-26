#!/bin/bash
# Multi-round conversation test script for UpUp
# 多轮对话测试脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARY="$PROJECT_DIR/dist/upup"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${CYAN}================================================${RESET}"
echo -e "${CYAN}  UpUp Multi-Round Conversation Test              ${RESET}"
echo -e "${CYAN}================================================${RESET}"

# Check prerequisites
if [[ ! -f "$BINARY" ]]; then
  echo -e "${RED}❌ Binary not found: $BINARY${RESET}"
  echo "Please run: bun run build"
  exit 1
fi

echo -e "${GREEN}✅ Binary found${RESET}"

# Test cases for multi-round conversation
declare -a TEST_CASES=(
  "你好，请分析贵州茅台600519的估值"
  "继续分析技术面"
  "对比腾讯00700"
  "谢谢分析"
)

echo -e "${CYAN}================================================${RESET}"
echo -e "${CYAN}  Running multi-round test cases                ${RESET}"
echo -e "${CYAN}================================================${RESET}"

ROUND=1
for query in "${TEST_CASES[@]}"; do
  echo ""
  echo -e "${YELLOW}━━━ Round $ROUND ━━━${RESET}"
  echo -e "Input: ${CYAN}$query${RESET}"
  echo ""
  
  # Run upup with the query
  echo "$query" | "$BINARY" &
  PID=$!
  
  # Wait for 5 seconds and kill if still running
  sleep 5
  if ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}⏱️  Timeout - killing process${RESET}"
    kill $PID 2>/dev/null || true
  fi
  
  ((ROUND++))
done

echo ""
echo -e "${GREEN}================================================${RESET}"
echo -e "${GREEN}  Multi-round test completed                  ${RESET}"
echo -e "${GREEN}================================================${RESET}"
