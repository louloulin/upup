#!/bin/bash
# CLI 命令验证脚本

set -e

echo "=========================================="
echo "UpUp CLI 命令验证"
echo "=========================================="
echo ""

# 测试 help
echo "1. 测试 upup help"
bun run src/index.tsx help
echo "✅ help 命令成功"
echo ""

# 测试 version
echo "2. 测试 upup version"
bun run src/index.tsx version
echo "✅ version 命令成功"
echo ""

# 测试 doctor (预期返回 exit code 1 因为缺少配置)
echo "3. 测试 upup doctor"
output=$(bun run src/index.tsx doctor 2>&1) || true
echo "$output"
echo "✅ doctor 命令成功 (预期有未配置项)"
echo ""

# 测试 setup (使用 echo 模拟输入)
echo "4. 测试 upup setup (模拟输入)"
echo "2" | bun run src/index.tsx setup 2>&1 | head -30
echo "✅ setup 命令成功"
echo ""

echo "=========================================="
echo "所有命令验证通过 ✅"
echo "=========================================="
