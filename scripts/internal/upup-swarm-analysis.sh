#!/bin/bash
# UpUp Swarm Analysis Trigger Script v1.0
# 触发多智能体股票分析工作流

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARY="$PROJECT_DIR/dist/upup"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
RESET='\033[0m'

show_header() {
  echo -e "${MAGENTA}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  UpUp Swarm Analysis Trigger v1.0                       ║"
  echo "║  多智能体股票分析工作流触发器                          ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

check_prereqs() {
  echo -e "${CYAN}━━━ 前置条件检查 ━━━${RESET}"
  
  if [[ ! -f "$BINARY" ]]; then
    echo -e "${RED}❌ Binary不存在: $BINARY${RESET}"
    echo "请先运行: bun run build"
    exit 1
  fi
  
  chmod +x "$BINARY" 2>/dev/null || true
  
  VERSION=$("$BINARY" --version 2>&1 | head -1)
  echo -e "${GREEN}✅ UpUp版本: $VERSION${RESET}"
}

# Predefined stock analysis prompts
get_stock_prompt() {
  local symbol="$1"
  local name="$2"
  local depth="${3:-basic}"
  
  case "$symbol" in
    000001|000001.SZ)
      echo "使用多智能体系统分析000001平安银行 (${depth}模式):
1. 研究员Agent: 调研公司基本面、银行业务、市场地位
2. 分析师Agent: 分析财务指标、估值水平、盈利能力
3. 汇总Agent: 综合分析，生成投资建议和风险提示
请创建团队stock-analysis-000001并协调各Agent完成分析。"
      ;;
    600519|600519.SH)
      echo "使用多智能体系统分析600519贵州茅台 (${depth}模式):
1. 研究员Agent: 调研公司基本面、白酒业务、品牌优势
2. 分析师Agent: 分析财务指标、盈利能力、估值水平
3. 汇总Agent: 综合分析，生成投资建议和风险提示
请创建团队stock-analysis-600519并协调各Agent完成分析。"
      ;;
    601318|601318.SH)
      echo "使用多智能体系统分析601318中国平安 (${depth}模式):
1. 研究员Agent: 调研公司基本面、保险金融业务
2. 分析师Agent: 分析财务指标、险资运用、投资收益
3. 汇总Agent: 综合分析，生成投资建议和风险提示
请创建团队stock-analysis-601318并协调各Agent完成分析。"
      ;;
    *)
      echo "使用多智能体系统分析${symbol} ${name} (${depth}模式):
1. 研究员Agent: 调研公司基本面
2. 分析师Agent: 分析财务指标
3. 汇总Agent: 生成投资建议
请创建团队stock-analysis-${symbol}并协调各Agent完成分析。"
      ;;
  esac
}

run_analysis() {
  local symbol="$1"
  local name="$2"
  local depth="${3:-basic}"
  
  echo -e "${CYAN}━━━ 多智能体股票分析 ━━━${RESET}"
  echo -e "${YELLOW}股票: ${symbol} (${name}) [${depth}]${RESET}"
  echo ""
  
  local PROMPT=$(get_stock_prompt "$symbol" "$name")
  
  echo -e "${YELLOW}发送分析请求到UpUp...${RESET}"
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo "$PROMPT" > "$PROMPT_FILE"
  
  # Run via pipe
  cat "$PROMPT_FILE" | "$BINARY" 2>&1 | head -80
  
  rm -f "$PROMPT_FILE"
  
  echo ""
  echo -e "${GREEN}✅ 分析完成${RESET}"
}

show_help() {
  echo -e "${MAGENTA}UpUp Swarm Analysis Trigger v1.0${RESET}"
  echo ""
  echo "用法: $0 <symbol> <name> [depth]"
  echo ""
  echo "参数:"
  echo "  symbol   股票代码 (如 000001, 600519)"
  echo "  name     股票名称 (如 平安银行, 贵州茅台)"
  echo "  depth    分析深度 (basic, detailed, comprehensive) - 默认为 basic"
  echo ""
  echo "示例:"
  echo "  $0 000001 平安银行"
  echo "  $0 600519 贵州茅台 detailed"
  echo "  $0 601318 中国平安 comprehensive"
  echo ""
  echo "预定义股票:"
  echo "  000001 平安银行"
  echo "  600519 贵州茅台"
  echo "  601318 中国平安"
}

main() {
  show_header
  check_prereqs
  
  if [[ -z "$1" ]]; then
    show_help
    exit 0
  fi
  
  local symbol="$1"
  local name="${2:-未知}"
  local depth="${3:-basic}"
  
  run_analysis "$symbol" "$name" "$depth"
}

main "$@"
