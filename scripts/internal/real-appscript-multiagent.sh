#!/bin/bash
# Real AppScript Multi-Agent Integration v2.1
# 真实基于dist/upup的多智能体交互式运行脚本

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
BLUE='\033[0;34m'
RESET='\033[0m'

# Predefined analysis prompts for stocks (using case statement for compatibility)
get_stock_prompt() {
  local symbol="$1"
  case "$symbol" in
    000001)
      echo "使用多智能体系统分析000001平安银行:
1. 研究员Agent: 调研公司基本面、主营业务、竞争优势
2. 分析师Agent: 分析财务指标、估值水平、市盈率市净率
3. 汇总Agent: 生成投资建议和风险提示
请创建团队stock-analysis-000001并协调各Agent完成分析。"
      ;;
    600519)
      echo "使用多智能体系统分析600519贵州茅台:
1. 研究员Agent: 调研公司基本面、品牌优势、市场地位
2. 分析师Agent: 分析财务指标、盈利能力、估值
3. 汇总Agent: 生成投资建议和风险提示
请创建团队stock-analysis-600519并协调各Agent完成分析。"
      ;;
    601318)
      echo "使用多智能体系统分析601318中国平安:
1. 研究员Agent: 调研公司基本面、保险+金融业务布局
2. 分析师Agent: 分析财务指标、险资运用、投资收益
3. 汇总Agent: 生成投资建议和风险提示
请创建团队stock-analysis-601318并协调各Agent完成分析。"
      ;;
    000002)
      echo "使用多智能体系统分析000002万科A:
1. 研究员Agent: 调研公司基本面、房地产业务、土地储备
2. 分析师Agent: 分析财务指标、现金流、负债率
3. 汇总Agent: 生成投资建议和风险提示
请创建团队stock-analysis-000002并协调各Agent完成分析。"
      ;;
    *)
      echo ""
      ;;
  esac
}

get_stock_name() {
  local symbol="$1"
  case "$symbol" in
    000001) echo "平安银行" ;;
    600519) echo "贵州茅台" ;;
    601318) echo "中国平安" ;;
    000002) echo "万科A" ;;
    *) echo "未知" ;;
  esac
}

show_header() {
  echo -e "${MAGENTA}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  Real AppScript Multi-Agent Integration v2.1           ║"
  echo "║  真实基于dist/upup的多智能体交互式运行                   ║"
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
  echo -e "${GREEN}✅ dist/upup 存在${RESET}"
  
  # Check version
  VERSION=$("$BINARY" --version 2>&1 | head -1)
  echo -e "${GREEN}✅ UpUp版本: $VERSION${RESET}"
  
  # Check AppleScript
  if osascript -e 'return' 2>/dev/null; then
    echo -e "${GREEN}✅ AppleScript 可用${RESET}"
    APPLESCRIPT_AVAILABLE=true
  else
    echo -e "${YELLOW}⚠️ AppleScript不可用${RESET}"
    APPLESCRIPT_AVAILABLE=false
  fi
  
  # Check iTerm2
  if osascript -e 'tell application "System Events" to return (exists process "iTerm2")' 2>/dev/null | grep -q "true"; then
    echo -e "${GREEN}✅ iTerm2 已运行${RESET}"
    ITERM2_RUNNING=true
  elif [ -d "/Applications/iTerm.app" ]; then
    echo -e "${YELLOW}⚠️ iTerm2已安装但未运行${RESET}"
    ITERM2_RUNNING=false
  else
    echo -e "${YELLOW}⚠️ iTerm2未安装${RESET}"
    ITERM2_RUNNING=false
  fi
  
  # Check tmux
  if command -v tmux &> /dev/null && tmux ls 2>/dev/null | grep -q "."; then
    echo -e "${GREEN}✅ tmux 可用${RESET}"
    TMUX_AVAILABLE=true
  else
    echo -e "${YELLOW}⚠️ tmux不可用${RESET}"
    TMUX_AVAILABLE=false
  fi
}

test_stdio_jsonrpc() {
  echo -e "${CYAN}━━━ STDIO JSON-RPC测试 ━━━${RESET}"
  
  echo "发送initialize请求..."
  RESPONSE=$(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientName":"test","clientVersion":"1.0"}}\n' | "$BINARY" --stdio 2>&1 | grep -E '^\{.*"jsonrpc"' | head -1)
  
  if echo "$RESPONSE" | grep -q '"result"'; then
    echo -e "${GREEN}✅ JSON-RPC响应正常${RESET}"
    echo "响应: $(echo "$RESPONSE" | head -c 150)..."
    return 0
  else
    echo -e "${RED}❌ JSON-RPC响应异常${RESET}"
    echo "响应: $RESPONSE"
    return 1
  fi
}

run_pipe_analysis() {
  local symbol="$1"
  local name="$2"
  
  echo -e "${CYAN}━━━ 管道模式分析 ━━━${RESET}"
  echo -e "${YELLOW}股票: ${symbol} (${name})${RESET}"
  
  local prompt=$(get_stock_prompt "$symbol")
  if [[ -z "$prompt" ]]; then
    echo -e "${RED}❌ 未找到股票 ${symbol} 的提示${RESET}"
    return 1
  fi
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  echo -e "${YELLOW}发送分析请求到UpUp (最多60秒)...${RESET}"
  echo ""
  
  # Run via pipe, capture first 30 lines
  cat "$PROMPT_FILE" | "$BINARY" 2>&1 | head -30
  
  rm -f "$PROMPT_FILE"
  echo ""
  echo -e "${GREEN}✅ 管道分析完成${RESET}"
}

run_applescript_terminal() {
  local symbol="$1"
  local name="$2"
  
  echo -e "${CYAN}━━━ AppleScript Terminal模式 ━━━${RESET}"
  echo -e "${YELLOW}启动Terminal运行UpUp分析${symbol}...${RESET}"
  
  local prompt=$(get_stock_prompt "$symbol")
  if [[ -z "$prompt" ]]; then
    echo -e "${RED}❌ 未找到股票 ${symbol} 的提示${RESET}"
    return 1
  fi
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  if [[ "$APPLESCRIPT_AVAILABLE" == "true" ]]; then
    osascript << APPLESCRIPT
tell application "Terminal"
    activate
    do script "cd '$PROJECT_DIR' && cat '$PROMPT_FILE' | ./dist/upup 2>&1 | head -50"
end tell
APPLESCRIPT
    echo -e "${GREEN}✅ Terminal已启动UpUp分析${symbol}${RESET}"
  else
    echo -e "${YELLOW}⚠️ AppleScript不可用，直接运行...${RESET}"
    cat "$PROMPT_FILE" | "$BINARY" 2>&1 | head -30
  fi
  
  rm -f "$PROMPT_FILE"
}

run_iterm2_mode() {
  local symbol="$1"
  local name="$2"
  
  echo -e "${CYAN}━━━ iTerm2模式 ━━━${RESET}"
  
  local prompt=$(get_stock_prompt "$symbol")
  if [[ -z "$prompt" ]]; then
    echo -e "${RED}❌ 未找到股票 ${symbol} 的提示${RESET}"
    return 1
  fi
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  if [[ "$ITERM2_RUNNING" == "true" ]]; then
    osascript << APPLESCRIPT
tell application "iTerm2"
    activate
    tell current window
        create tab with default profile
    end tell
    tell current session
        write text "cd '$PROJECT_DIR'"
        write text "cat '$PROMPT_FILE' | ./dist/upup 2>&1 | head -50"
    end tell
end tell
APPLESCRIPT
    echo -e "${GREEN}✅ iTerm2已启动UpUp分析${symbol}${RESET}"
  else
    echo -e "${YELLOW}⚠️ iTerm2未运行，使用Terminal...${RESET}"
    run_applescript_terminal "$symbol" "$name"
  fi
  
  rm -f "$PROMPT_FILE"
}

run_direct_mode() {
  echo -e "${CYAN}━━━ 直接运行UpUp ━━━${RESET}"
  echo -e "${YELLOW}启动交互式UpUp CLI...${RESET}"
  echo "提示: 输入 /help 查看命令，输入 quit 退出"
  echo ""
  "$BINARY"
}

show_stock_menu() {
  echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════╗"
  echo "║                    股票选择                            ║"
  echo "╠════════════════════════════════════════════════════════════╣"
  echo -e "║  1. 000001 平安银行                                    ║"
  echo -e "║  2. 600519 贵州茅台                                    ║"
  echo -e "║  3. 601318 中国平安                                    ║"
  echo -e "║  4. 000002 万科A                                       ║"
  echo -e "║  5. 自定义股票代码                                     ║"
  echo -e "║  0. 退出                                               ║"
  echo -e "╚════════════════════════════════════════════════════════════╝${RESET}"
}

show_mode_menu() {
  echo -e "${CYAN}━━━ 运行模式 ━━━${RESET}"
  echo -e "  ${GREEN}1${RESET}. 管道模式 (直接输出)"
  echo -e "  ${GREEN}2${RESET}. AppleScript+Terminal"
  echo -e "  ${GREEN}3${RESET}. iTerm2模式"
  echo -e "  ${GREEN}4${RESET}. 直接交互运行"
  echo -e "  ${YELLOW}5${RESET}. STDIO JSON-RPC测试"
  echo -e "  ${RED}0${RESET}. 返回"
}

main() {
  show_header
  check_prereqs
  
  echo ""
  
  if [[ -n "$1" ]]; then
    # Command line mode: symbol name mode
    local symbol="$1"
    local name="${2:-$(get_stock_name "$symbol")}"
    local mode="${3:-1}"
    
    echo -e "${MAGENTA}━━━ 快速分析模式 ━━━${RESET}"
    echo -e "${YELLOW}股票: ${symbol} (${name})${RESET}"
    echo ""
    
    case "$mode" in
      1) run_pipe_analysis "$symbol" "$name" ;;
      2) run_applescript_terminal "$symbol" "$name" ;;
      3) run_iterm2_mode "$symbol" "$name" ;;
      4) run_direct_mode ;;
      5) test_stdio_jsonrpc ;;
      *) echo "未知模式: $mode" ;;
    esac
  else
    # Interactive mode
    while true; do
      show_stock_menu
      echo ""
      echo -n "选择股票 [0-5]: "
      read choice
      
      if [[ "$choice" == "0" ]]; then
        echo "退出"
        exit 0
      fi
      
      local symbol=""
      local name=""
      
      if [[ "$choice" == "5" ]]; then
        echo -n "输入股票代码: "
        read symbol
        echo -n "输入股票名称: "
        read name
      elif [[ "$choice" -ge 1 && "$choice" -le 4 ]]; then
        case "$choice" in
          1) symbol="000001"; name="平安银行" ;;
          2) symbol="600519"; name="贵州茅台" ;;
          3) symbol="601318"; name="中国平安" ;;
          4) symbol="000002"; name="万科A" ;;
        esac
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
        1) run_pipe_analysis "$symbol" "$name" ;;
        2) run_applescript_terminal "$symbol" "$name" ;;
        3) run_iterm2_mode "$symbol" "$name" ;;
        4) run_direct_mode ;;
        5) test_stdio_jsonrpc ;;
        *) echo "无效模式: $mode" ;;
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
