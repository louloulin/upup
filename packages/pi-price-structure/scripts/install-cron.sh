#!/usr/bin/env bash
# 安装价格结构 SOP 的 cron 任务
#
# 用法:
#   UPUP_WEBHOOK_URL="https://..." ./scripts/install-cron.sh
#
# 默认时间：每个交易日 15:30（中国期货收盘后）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"

DAILY_SOP="$PKG_DIR/scripts/daily-sop.mjs"
CRON_CMD="30 15 * * 1-5 cd $PKG_DIR && bun $DAILY_SOP >> /tmp/pi-price-structure-sop.log 2>&1"

echo "========== 安装 cron 任务 =========="
echo "命令: $CRON_CMD"
echo ""

# 检查现有任务
if crontab -l 2>/dev/null | grep -q "daily-sop.mjs"; then
  echo "[skip] 已存在 daily-sop.mjs 任务"
  exit 0
fi

# 添加任务
(
  crontab -l 2>/dev/null
  echo "$CRON_CMD"
) | crontab -

echo "[ok] 已安装"
echo ""
echo "当前 crontab:"
crontab -l | grep "daily-sop.mjs" || echo "(无)"
