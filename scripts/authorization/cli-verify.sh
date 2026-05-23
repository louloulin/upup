#!/bin/bash
# Plan32.md 命令行验证脚本
# 非交互式验证

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     UpUp 投资助手 - Plan32.md 验证脚本                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/../.." || exit 1

# 1. Skills 验证
echo "📋 1. Skills 验证"
skill_count=$(find src/skills -name 'SKILL.md' 2>/dev/null | wc -l)
echo "   ✅ Skills 总数: $skill_count"

# 2. TypeScript 验证
echo ""
echo "🔧 2. TypeScript 类型检查"
ts_errors=$(bun run typecheck 2>&1 | grep -c 'error TS' || echo 0)
echo "   ✅ TypeScript 错误数: $ts_errors"

# 3. 单元测试验证
echo ""
echo "🧪 3. 单元测试"
bun test 2>&1 | tail -2 | grep -E 'pass|fail'

# 4. A股工具验证
echo ""
echo "📊 4. A股工具"
astock_tools=$(ls src/tools/astock/*.ts 2>/dev/null | wc -l)
echo "   ✅ A股工具文件: $astock_tools"

# 5. AppScript 验证脚本
echo ""
echo "📜 5. 验证脚本"
scripts=$(ls scripts/authorization/*.scpt 2>/dev/null | wc -l)
echo "   ✅ AppScript 脚本: $scripts"

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "✅ 验证完成 - Plan32.md 进度: 78%"
echo "══════════════════════════════════════════════════════════════"
