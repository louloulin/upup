#!/bin/bash
# STDIO JSON-RPC Multi-Agent Test Script v1.0
# 真实测试dist/upup的JSON-RPC接口

BINARY="./dist/upup"

echo "=== STDIO JSON-RPC Multi-Agent Test ==="
echo ""

# Test 1: Initialize
echo "1. Initialize..."
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientName":"test","clientVersion":"1.0"}}\n' | "$BINARY" --stdio 2>&1 | grep -E '^\{.*"jsonrpc"' | head -1
echo ""

# Test 2: Run a simple prompt
echo "2. Run simple prompt..."
printf '{"jsonrpc":"2.0","id":2,"method":"run","params":{"prompt":"使用多智能体系统分析000001平安银行，创建研究员、分析师和汇总Agent团队","maxIterations":3}}\n' | "$BINARY" --stdio 2>&1 | grep -E '^\{.*"jsonrpc"' | head -5
echo ""

# Test 3: Check server capabilities
echo "3. Run version check..."
printf '{"jsonrpc":"2.0","id":3,"method":"run","params":{"prompt":"upup version","maxIterations":1}}\n' | "$BINARY" --stdio 2>&1 | grep -E '^\{.*"jsonrpc"' | head -3

echo ""
echo "=== STDIO Test Complete ==="
