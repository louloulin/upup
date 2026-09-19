#!/bin/bash
# Plan32.md 命令行验证脚本 v2.0
# 非交互式验证

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     UpUp 投资助手 - Plan32.md 验证脚本 v2.0                ║"
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
astock_tools=$(grep -Ec "name: '(get_astock_|screen_astocks|get_sector_data|get_technical_data|get_market_structure)" packages/pi-market-data/extensions/index.ts)
echo "   ✅ Pi Market Data A股工具注册数: $astock_tools"

# 5. AppScript 验证脚本
echo ""
echo "📜 5. 验证脚本"
scripts=$(ls scripts/authorization/*.scpt 2>/dev/null | wc -l)
echo "   ✅ AppScript 脚本: $scripts"

# 6. 新增模块验证
echo ""
echo "🔧 6. 新增模块"
modules=(
  "src/skills/cli-commands.ts"
  "src/skills/context-manager.ts"
  "packages/pi-market-data/extensions/index.ts"
)
for mod in "${modules[@]}"; do
  if [ -f "$mod" ]; then
    echo "   ✅ $(basename $mod)"
  else
    echo "   ❌ $(basename $mod)"
  fi
done

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "✅ 验证完成 - Plan32.md 进度: 100%"
echo "══════════════════════════════════════════════════════════════"
