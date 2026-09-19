#!/bin/bash
# UpUp Interactive Multi-Agent Real Analysis v1.1
# 真实交互式运行dist/upup的多智能体分析

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

# Stock analysis presets (using case for bash 3.2 compatibility)
get_stock_prompt() {
  local symbol="$1"
  case "$symbol" in
    000001)
      echo "使用多智能体系统分析000001平安银行:
1. 研究员Agent: 调研公司基本面、主营业务、行业地位
2. 分析师Agent: 分析财务指标、估值水平、盈利能力
3. 汇总Agent: 综合分析结果，生成投资建议
请创建团队stock-research-000001，协调各Agent完成分析并汇报结果。"
      ;;
    600519)
      echo "使用多智能体系统分析600519贵州茅台:
1. 研究员Agent: 调研公司基本面、品牌优势、市场份额
2. 分析师Agent: 分析财务指标、盈利能力、估值
3. 汇总Agent: 综合分析结果，生成投资建议
请创建团队stock-research-600519，协调各Agent完成分析并汇报结果。"
      ;;
    601318)
      echo "使用多智能体系统分析601318中国平安:
1. 研究员Agent: 调研公司基本面、保险金融业务
2. 分析师Agent: 分析财务指标、险资运用、投资收益
3. 汇总Agent: 综合分析结果，生成投资建议
请创建团队stock-research-601318，协调各Agent完成分析并汇报结果。"
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
    *) echo "未知" ;;
  esac
}

show_header() {
  echo -e "${MAGENTA}"
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║  UpUp Interactive Multi-Agent Real Analysis v1.1              ║"
  echo "║  真实交互式运行dist/upup多智能体股票分析                        ║"
  echo "╚════════════════════════════════════════════════════════════════════╝"
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
  
  # Check version
  VERSION=$("$BINARY" --version 2>&1 | head -1)
  echo -e "${GREEN}✅ UpUp版本: $VERSION${RESET}"
  
  # Check AppleScript
  if osascript -e 'return' 2>/dev/null; then
    echo -e "${GREEN}✅ AppleScript 可用${RESET}"
    HAS_APPLESCRIPT=true
  else
    echo -e "${YELLOW}⚠️ AppleScript不可用${RESET}"
    HAS_APPLESCRIPT=false
  fi
  
  # Check iTerm2
  if osascript -e 'tell application "System Events" to return (exists process "iTerm2")' 2>/dev/null | grep -q "true"; then
    echo -e "${GREEN}✅ iTerm2 已运行${RESET}"
    HAS_ITERM2=true
  elif [ -d "/Applications/iTerm.app" ]; then
    echo -e "${YELLOW}⚠️ iTerm2已安装但未运行${RESET}"
    HAS_ITERM2=false
  else
    echo -e "${YELLOW}⚠️ iTerm2未安装${RESET}"
    HAS_ITERM2=false
  fi
}

run_stdout_analysis() {
  local symbol="$1"
  local name="$2"
  local prompt="$3"
  
  echo -e "${CYAN}━━━ 标准输出模式 ━━━${RESET}"
  echo -e "${YELLOW}股票: ${symbol} (${name})${RESET}"
  echo -e "${YELLOW}发送分析请求到UpUp...${RESET}"
  echo ""
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  # Run via pipe
  cat "$PROMPT_FILE" | "$BINARY" 2>&1 | head -50
  
  rm -f "$PROMPT_FILE"
  echo ""
  echo -e "${GREEN}✅ 分析完成${RESET}"
}

run_applescript_terminal() {
  local symbol="$1"
  local name="$2"
  local prompt="$3"
  
  echo -e "${CYAN}━━━ AppleScript Terminal模式 ━━━${RESET}"
  echo -e "${YELLOW}启动Terminal运行UpUp分析${symbol}...${RESET}"
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  if [[ "$HAS_APPLESCRIPT" == "true" ]]; then
    osascript << APPLESCRIPT
tell application "Terminal"
    activate
    delay 0.3
    do script "cd '$PROJECT_DIR' && cat '$PROMPT_FILE' | ./dist/upup 2>&1 | head -80"
end tell
APPLESCRIPT
    echo -e "${GREEN}✅ Terminal已启动UpUp分析${RESET}"
  else
    echo -e "${YELLOW}⚠️ AppleScript不可用，使用标准输出...${RESET}"
    cat "$PROMPT_FILE" | "$BINARY" 2>&1 | head -30
  fi
  
  rm -f "$PROMPT_FILE"
}

run_iterm2_analysis() {
  local symbol="$1"
  local name="$2"
  local prompt="$3"
  
  echo -e "${CYAN}━━━ iTerm2模式 ━━━${RESET}"
  
  # Write prompt to temp file
  local PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  if [[ "$HAS_ITERM2" == "true" ]]; then
    osascript << APPLESCRIPT
tell application "iTerm2"
    activate
    delay 0.3
    tell current window
        create tab with default profile
    end tell
    tell current session
        write text "cd '$PROJECT_DIR'"
        write text "cat '$PROMPT_FILE' | ./dist/upup 2>&1 | head -80"
    end tell
end tell
APPLESCRIPT
    echo -e "${GREEN}✅ iTerm2已启动UpUp分析${RESET}"
  else
    echo -e "${YELLOW}⚠️ iTerm2未运行，使用Terminal...${RESET}"
    run_applescript_terminal "$symbol" "$name" "$prompt"
  fi
  
  rm -f "$PROMPT_FILE"
}

run_direct_interactive() {
  echo -e "${CYAN}━━━ 直接交互模式 ━━━${RESET}"
  echo -e "${YELLOW}启动交互式UpUp CLI...${RESET}"
  echo ""
  "$BINARY"
}

run_stdio_jsonrpc() {
  echo -e "${CYAN}━━━ STDIO JSON-RPC模式 ━━━${RESET}"
  
  echo "发送initialize请求..."
  local INIT_RESP=$(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientName":"interactive","clientVersion":"1.0"}}\n' | "$BINARY" --stdio 2>&1 | grep -E '^\{.*"jsonrpc"' | head -1)
  
  if echo "$INIT_RESP" | grep -q '"result"'; then
    echo -e "${GREEN}✅ JSON-RPC响应正常${RESET}"
    echo "响应: $(echo "$INIT_RESP" | head -c 120)..."
  else
    echo -e "${RED}❌ JSON-RPC响应异常${RESET}"
  fi
}

show_stock_menu() {
  echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════╗"
  echo "║                      股票选择                                ║"
  echo "╠════════════════════════════════════════════════════════════════════╣"
  echo -e "║  1. 000001 平安银行                                         ║"
  echo -e "║  2. 600519 贵州茅台                                         ║"
  echo -e "║  3. 601318 中国平安                                         ║"
  echo -e "║  4. 自定义股票代码                                          ║"
  echo -e "║  0. 退出                                                    ║"
  echo -e "╚════════════════════════════════════════════════════════════════════╝${RESET}"
}

show_mode_menu() {
  echo -e "${CYAN}━━━ 运行模式 ━━━${RESET}"
  echo -e "  ${GREEN}1${RESET}. 标准输出 (管道模式)"
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
  
  # Check for command line arguments
  if [[ -n "$1" ]]; then
    # Quick mode: symbol [mode]
    local symbol="$1"
    local mode="${2:-1}"
    local name=$(get_stock_name "$symbol")
    local prompt=$(get_stock_prompt "$symbol")
    
    if [[ -z "$prompt" ]]; then
      echo -e "${RED}❌ 未找到股票 ${symbol} 的分析预设${RESET}"
      exit 1
    fi
    
    echo -e "${MAGENTA}━━━ 快速分析模式 ━━━${RESET}"
    echo -e "${YELLOW}股票: ${symbol} (${name})${RESET}"
    echo ""
    
    case "$mode" in
      1) run_stdout_analysis "$symbol" "$name" "$prompt" ;;
      2) run_applescript_terminal "$symbol" "$name" "$prompt" ;;
      3) run_iterm2_analysis "$symbol" "$name" "$prompt" ;;
      4) run_direct_interactive ;;
      5) run_stdio_jsonrpc ;;
      *) echo "未知模式: $mode" ;;
    esac
  else
    # Interactive mode
    while true; do
      show_stock_menu
      echo ""
      echo -n "选择股票 [0-4]: "
      read choice
      
      if [[ "$choice" == "0" ]]; then
        echo "退出"
        exit 0
      fi
      
      local symbol=""
      local name=""
      local prompt=""
      
      if [[ "$choice" == "4" ]]; then
        echo -n "输入股票代码: "
        read symbol
        name=$(get_stock_name "$symbol")
        prompt=$(get_stock_prompt "$symbol")
        if [[ -z "$prompt" ]]; then
          echo "输入自定义分析提示: "
          read prompt
        fi
      elif [[ "$choice" -ge 1 && "$choice" -le 3 ]]; then
        case "$choice" in
          1) symbol="000001" ;;
          2) symbol="600519" ;;
          3) symbol="601318" ;;
        esac
        name=$(get_stock_name "$symbol")
        prompt=$(get_stock_prompt "$symbol")
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
        1) run_stdout_analysis "$symbol" "$name" "$prompt" ;;
        2) run_applescript_terminal "$symbol" "$name" "$prompt" ;;
        3) run_iterm2_analysis "$symbol" "$name" "$prompt" ;;
        4) run_direct_interactive ;;
        5) run_stdio_jsonrpc ;;
        *) echo "无效模式: $mode" ;;
      esac
      
      echo ""
      echo -n "按Enter继续..."
      read _
    done
  fi
  
  echo ""
  echo -e "${GREEN}✅ 分析完成${RESET}"
}

main "$@"
