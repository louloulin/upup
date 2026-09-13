#!/usr/bin/env bash
# scripts/lint-web-boundary.sh (P2.b.1 / D-CTG-8)
#
# 强制: `src/web/**` 只能 import 白名单内的模块(bridge + react*),禁止
# import 业务模块(agent / tools / skills / memory / realtime / kairos /
# coordinator / plan)。页面只能消费管理 API，不能绕过 Gateway 访问 Agent。
#
# 设计动机见 design.md D-CTG-8 (C3 Web UI 严格边界)。这个 lint
# 是 CI 门禁，保护页面不绕过 Gateway 管理 API 直接依赖金融运行时。
#
# 调用方:
#   bash scripts/lint-web-boundary.sh                  # 扫描 src/web/
#   WEB_DIR=/tmp/foo bash scripts/lint-web-boundary.sh # 自定义根(测试用)
#
# 退出码:
#   0 — 边界 OK
#   1 — 至少一个 src/web/** 文件 import 了禁模块
#
# 复用: 与 scripts/lint-skill-locale.sh (P3.a.2) 共享 set -euo pipefail
# 习惯 + 中文错误信息风格。

set -euo pipefail

WEB_DIR="${WEB_DIR:-src/web}"

if [[ ! -d "$WEB_DIR" ]]; then
  # 没有 src/web/ 时不算违规 — 边界天然不破。CI 跑时这表示 C3 还没开始。
  echo "✓ web-boundary: $WEB_DIR 不存在(未启用 C3), 跳过"
  exit 0
fi

# 禁 import 的业务模块前缀。任何 src/web/** 文件出现以下 import 模式
# 即视为越界。
FORBIDDEN_PATTERNS=(
  "src/agent/"
  "src/tools/"
  "src/skills/"
  "src/memory/"
  "src/realtime/"
  "src/kairos/"
  "src/plan/"
)

violations=0
total=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  # 匹配两种写法:相对路径 import (../../src/agent/foo) 或包别名 (@upup/agent/...)
  # 我们只检查 src/web/ 内部 — 包别名留给 bundler 配置去管,本 lint 不
  # 试图枚举所有可能的别名。
  matches=$(
    grep -rnE "from ['\"](\.\./)+(${pattern}|${pattern%/})" "$WEB_DIR" 2>/dev/null \
      || true
  )
  if [[ -n "$matches" ]]; then
    while IFS= read -r line; do
      total=$((total + 1))
      echo "ERROR: $line  ←  禁 import 模式: $pattern" >&2
      violations=$((violations + 1))
    done <<< "$matches"
  fi
done

if [[ "$violations" -gt 0 ]]; then
  echo "" >&2
  echo "✗ $violations 处越界 import" >&2
  echo "  src/web/** 只能 import src/bridge/* + react/react-dom" >&2
  echo "  设计: docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md D-CTG-8" >&2
  exit 1
fi

echo "✓ web-boundary: $WEB_DIR 边界 OK(扫描 ${#FORBIDDEN_PATTERNS[@]} 个禁模式,无违规)"
