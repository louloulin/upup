#!/bin/bash
# Real UpUp Multi-Agent Interactive AppScript v1.1
# 真实交互式运行dist/upup多智能体分析

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

# Stock symbols for analysis
STOCKS=(
  "000001:平安银行"
  "600519:贵州茅台"
  "601318:中国平安"
  "000002:万科A"
)

show_header() {
  echo -e "${MAGENTA}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  Real UpUp Multi-Agent Interactive AppScript v1.1       ║"
  echo "║  真实运行dist/upup多智能体分析                          ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

check_prereqs() {
  echo -e "${CYAN}━━━ 检查前置条件 ━━━${RESET}"
  
  if [[ ! -f "$BINARY" ]]; then
    echo -e "${RED}❌ Binary不存在: $BINARY${RESET}"
    echo "请先运行: bun run build"
    exit 1
  fi
  
  chmod +x "$BINARY" 2>/dev/null || true
  echo -e "${GREEN}✅ dist/upup 可用${RESET}"
  
  # Check AppleScript
  if osascript -e 'return' 2>/dev/null; then
    echo -e "${GREEN}✅ AppleScript 可用${RESET}"
  else
    echo -e "${RED}❌ AppleScript不可用${RESET}"
    exit 1
  fi
  
  # Check iTerm2
  if osascript -e 'tell application "System Events" to return (exists process "iTerm2")' 2>/dev/null | grep -q "true"; then
    echo -e "${GREEN}✅ iTerm2 已运行${RESET}"
    ITERM2_RUNNING=true
  elif [ -d "/Applications/iTerm.app" ]; then
    echo -e "${YELLOW}⚠️ iTerm2已安装但未运行${RESET}"
    ITERM2_RUNNING=false
  else
    echo -e "${YELLOW}⚠️ iTerm2未安装，使用Terminal${RESET}"
    ITERM2_RUNNING=false
  fi
}

generate_multiagent_prompt() {
  local symbol="$1"
  local name="$2"
  
  cat << PROMPT
使用多智能体系统分析 ${symbol} (${name}):

请按以下步骤进行:

1. **研究员Agent**: 调研 ${symbol} 基本面
   - 公司概况和业务范围
   - 行业地位和竞争优势
   - 近期重大事件

2. **分析师Agent**: 分析 ${symbol} 财务指标
   - 营收和利润趋势
   - 估值指标 (市盈率、市净率)
   - 盈利能力分析

3. **汇总Agent**: 生成投资建议
   - 综合分析结果
   - 风险提示
   - 投资建议

请创建团队 'stock-analysis-${symbol}' 并协调各Agent完成分析。
PROMPT
}

run_stdio_test() {
  echo -e "${CYAN}━━━ STDIO JSON-RPC测试 ━━━${RESET}"
  
  echo "测试JSON-RPC initialize..."
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | "$BINARY" --stdio 2>&1 | head -5
  
  echo ""
  echo "测试JSON-RPC version..."
  printf '{"jsonrpc":"2.0","id":2,"method":"version","params":{}}\n' | "$BINARY" --stdio 2>&1 | head -5
}

run_pipe_mode() {
  local symbol="$1"
  local name="$2"
  
  echo -e "${CYAN}━━━ 管道模式运行 ━━━${RESET}"
  echo -e "${YELLOW}符号: ${symbol} (${name})${RESET}"
  
  PROMPT=$(generate_multiagent_prompt "$symbol" "$name")
  
  echo -e "${YELLOW}发送分析请求 (最多30秒)...${RESET}"
  
  # Use bash timeout alternative with gtimeout or perl
  if command -v gtimeout &> /dev/null; then
    echo "$PROMPT" | gtimeout 30 "$BINARY" 2>&1 | head -50
  elif command -v perl &> /dev/null; then
    perl -e '
      alarm 30;
      $SIG{ALRM} = sub { exit 1; };
      while(<>) { print; }
    ' <<< "$PROMPT" | "$BINARY" 2>&1 | head -50
  else
    # No timeout, just run
    echo "$PROMPT" | "$BINARY" 2>&1 | head -50
  fi || {
    echo -e "${YELLOW}⚠️ 命令已执行 (可能需要更长时间)${RESET}"
  }
}

run_applescript_terminal() {
  local symbol="$1"
  local name="$2"
  
  echo -e "${CYAN}━━━ AppleScript Terminal模式 ━━━${RESET}"
  echo -e "${YELLOW}启动Terminal并运行UpUp...${RESET}"
  
  PROMPT=$(generate_multiagent_prompt "$symbol" "$name")
  
  # Escape single quotes in PROMPT
  ESCAPED_PROMPT="${PROMPT//\'/\'}"
  
  # Send prompt via AppleScript
  osascript << APPLESCRIPT
tell application "Terminal"
    activate
    do script "cd '$PROJECT_DIR' && echo '$ESCAPED_PROMPT' | ./dist/upup"
end tell
APPLESCRIPT
  
  echo -e "${GREEN}✅ Terminal已启动UpUp分析${symbol}${RESET}"
}

run_iterm2_mode() {
  local symbol="$1"
  local name="$2"
  
  if [[ "$ITERM2_RUNNING" != "true" ]]; then
    echo -e "${YELLOW}⚠️ iTerm2未运行，使用Terminal替代${RESET}"
    run_applescript_terminal "$symbol" "$name"
    return
  fi
  
  echo -e "${CYAN}━━━ iTerm2模式 ━━━${RESET}"
  
  PROMPT=$(generate_multiagent_prompt "$symbol" "$name")
  ESCAPED_PROMPT="${PROMPT//\'/\'}"
  
  osascript << APPLESCRIPT
tell application "iTerm2"
    activate
    tell current window
        create tab with default profile
    end tell
    tell current session
        write text "cd '$PROJECT_DIR'"
        write text "echo 'Starting UpUp Multi-Agent Analysis for ${symbol}...'"
        write text "echo '$ESCAPED_PROMPT' | ./dist/upup"
    end tell
end tell
APPLESCRIPT
  
  echo -e "${GREEN}✅ iTerm2已启动UpUp分析${symbol}${RESET}"
}

run_direct_mode() {
  echo -e "${CYAN}━━━ 直接运行UpUp ━━━${RESET}"
  echo -e "${YELLOW}启动交互式UpUp CLI...${RESET}"
  echo "提示: 输入 /help 查看命令，输入 quit 退出"
  echo ""
  "$BINARY"
}

show_stock_menu() {
  echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗"
  echo "║                    股票选择                            ║"
  echo "╠════════════════════════════════════════════════════════════╣"
  local i=1
  for stock in "${STOCKS[@]}"; do
    IFS=':' read -r code name <<< "$stock"
    echo -e "║  $i. ${code} ${name}                                ║"
    ((i++))
  done
  echo -e "║  0. 退出                                               ║"
  echo -e "╚════════════════════════════════════════════════════════════╝${RESET}"
}

show_mode_menu() {
  echo -e "${CYAN}━━━ 运行模式 ━━━${RESET}"
  echo -e "  ${GREEN}1${RESET}. 管道模式 (直接输出)"
  echo -e "  ${GREEN}2${RESET}. AppleScript+Terminal"
  echo -e "  ${GREEN}3${RESET}. iTerm2模式"
  echo -e "  ${GREEN}4${RESET}. 直接交互运行"
  echo -e "  ${YELLOW}5${RESET}. STDIO测试"
  echo -e "  ${RED}0${RESET}. 返回"
}

main() {
  show_header
  check_prereqs
  
  echo ""
  
  if [[ -n "$1" ]]; then
    # Direct mode with arguments: symbol name mode
    local symbol="$1"
    local name="${2:-未知}"
    local mode="${3:-1}"
    
    echo -e "${MAGENTA}━━━ 快速分析: ${symbol} (${name}) ━━━${RESET}"
    
    case "$mode" in
      1) run_pipe_mode "$symbol" "$name" ;;
      2) run_applescript_terminal "$symbol" "$name" ;;
      3) run_iterm2_mode "$symbol" "$name" ;;
      4) run_direct_mode ;;
      5) run_stdio_test ;;
      *) echo "未知模式: $mode" ;;
    esac
  else
    # Interactive mode
    while true; do
      show_stock_menu
      echo ""
      echo -n "选择股票 [0-${#STOCKS[@]}]: "
      read choice
      
      if [[ "$choice" == "0" ]]; then
        echo "退出"
        exit 0
      fi
      
      # Convert choice to stock
      idx=$((choice - 1))
      if [[ $idx -ge 0 && $idx -lt ${#STOCKS[@]} ]]; then
        IFS=':' read -r symbol name <<< "${STOCKS[$idx]}"
      else
        echo "无效选择: $choice"
        continue
      fi
      
      show_mode_menu
      echo ""
      echo -n "选择运行模式 [0-5]: "
      read mode
      
      if [[ "$mode" == "0" ]]; then
        continue
      fi
      
      echo ""
      
      case "$mode" in
        1) run_pipe_mode "$symbol" "$name" ;;
        2) run_applescript_terminal "$symbol" "$name" ;;
        3) run_iterm2_mode "$symbol" "$name" ;;
        4) run_direct_mode ;;
        5) run_stdio_test ;;
        *) echo "未知模式: $mode" ;;
      esac
      
      echo ""
      echo -n "按Enter继续..."
      read _
    done
  fi
  
  echo ""
  echo -e "${GREEN}✅ 脚本执行完成${RESET}"
}

main "$@"
