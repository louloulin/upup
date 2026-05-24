#!/bin/bash
# Real UpUp Multi-Agent Analysis Script v1.0
# 真实调用dist/upup进行多智能体股票分析

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

# Predefined stock analysis prompts
STOCK_PROMPTS=(
  "000001:平安银行:使用多智能体系统分析000001平安银行:\n1. 研究员Agent: 调研公司基本面、主营业务、竞争优势\n2. 分析师Agent: 分析财务指标、估值水平\n3. 汇总Agent: 生成投资建议和风险提示\n请创建团队stock-analysis-000001并协调各Agent完成分析。"
  
  "600519:贵州茅台:使用多智能体系统分析600519贵州茅台:\n1. 研究员Agent: 调研公司基本面、品牌优势、市场地位\n2. 分析师Agent: 分析财务指标、盈利能力、估值\n3. 汇总Agent: 生成投资建议和风险提示\n请创建团队stock-analysis-600519并协调各Agent完成分析。"
  
  "601318:中国平安:使用多智能体系统分析601318中国平安:\n1. 研究员Agent: 调研公司基本面、保险+金融业务\n2. 分析师Agent: 分析财务指标、险资运用\n3. 汇总Agent: 生成投资建议和风险提示\n请创建团队stock-analysis-601318并协调各Agent完成分析。"
  
  "000002:万科A:使用多智能体系统分析000002万科A:\n1. 研究员Agent: 调研公司基本面、房地产业务\n2. 分析师Agent: 分析财务指标、现金流、负债率\n3. 汇总Agent: 生成投资建议和风险提示\n请创建团队stock-analysis-000002并协调各Agent完成分析。"
)

show_header() {
  echo -e "${MAGENTA}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  Real UpUp Multi-Agent Analysis Script v1.0             ║"
  echo "║  真实调用dist/upup进行多智能体分析                       ║"
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
  echo -e "${GREEN}✅ dist/upup 可用${RESET}"
  
  # Check AppleScript
  if osascript -e 'return' 2>/dev/null >/dev/null 2>&1; then
    echo -e "${GREEN}✅ AppleScript 可用${RESET}"
  else
    echo -e "${YELLOW}⚠️ AppleScript不可用${RESET}"
  fi
}

run_jsonrpc_session() {
  local symbol="$1"
  local name="$2"
  local prompt="$3"
  
  echo -e "${CYAN}━━━ JSON-RPC Session模式 ━━━${RESET}"
  echo -e "${YELLOW}分析股票: ${symbol} (${name})${RESET}"
  
  # Create session
  echo -e "${YELLOW}创建会话...${RESET}"
  SESSION_RESP=$(printf '{"jsonrpc":"2.0","id":1,"method":"session.create","params":{}}\n' | "$BINARY" --stdio 2>&1 | grep -o '{"jsonrpc":"2.0".*}' | tail -1)
  echo "Session Response: $(echo "$SESSION_RESP" | head -c 100)..."
  
  # Send analysis prompt
  echo -e "${YELLOW}发送分析请求...${RESET}"
  PROMPT_ESCAPED=$(printf '%s' "$prompt" | sed "s/'/'\\\\''/g")
  
  printf '{"jsonrpc":"2.0","id":2,"method":"session.message","params":{"sessionId":"test","content":"%s"}}\n' "$PROMPT_ESCAPED" | "$BINARY" --stdio 2>&1 | head -20
  
  echo -e "${GREEN}✅ JSON-RPC分析完成${RESET}"
}

run_pipe_analysis() {
  local symbol="$1"
  local name="$2"
  local prompt="$3"
  
  echo -e "${CYAN}━━━ 管道分析模式 ━━━${RESET}"
  echo -e "${YELLOW}分析股票: ${symbol} (${name})${RESET}"
  echo -e "${YELLOW}提示: 使用管道发送分析请求到UpUp...${RESET}"
  
  # Write prompt to temp file (avoids escaping issues)
  PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  # Run via pipe
  cat "$PROMPT_FILE" | "$BINARY" 2>&1 | head -50
  
  rm -f "$PROMPT_FILE"
  echo -e "${GREEN}✅ 管道分析完成${RESET}"
}

run_applescript_terminal() {
  local symbol="$1"
  local name="$2"
  
  echo -e "${CYAN}━━━ AppleScript Terminal模式 ━━━${RESET}"
  
  # Find prompt for this symbol
  local prompt=""
  for stock_prompt in "${STOCK_PROMPTS[@]}"; do
    IFS=':' read -r code nm content <<< "$stock_prompt"
    if [[ "$code" == "$symbol" ]]; then
      prompt="$content"
      break
    fi
  done
  
  if [[ -z "$prompt" ]]; then
    echo -e "${RED}❌ 未找到股票 ${symbol} 的提示${RESET}"
    return 1
  fi
  
  # Write prompt to temp file
  PROMPT_FILE=$(mktemp)
  echo -e "$prompt" > "$PROMPT_FILE"
  
  echo -e "${YELLOW}启动Terminal运行UpUp分析${symbol}...${RESET}"
  
  # AppleScript to open Terminal and run analysis
  osascript << APPLESCRIPT
tell application "Terminal"
    activate
    do script "cd '$PROJECT_DIR' && cat '$PROMPT_FILE' | ./dist/upup 2>&1 | head -100"
end tell
APPLESCRIPT
  
  rm -f "$PROMPT_FILE"
  echo -e "${GREEN}✅ Terminal已启动分析${RESET}"
}

show_menu() {
  echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗"
  echo "║                股票分析选择                          ║"
  echo "╠════════════════════════════════════════════════════════════╣"
  echo -e "║  1. 000001 平安银行                                   ║"
  echo -e "║  2. 600519 贵州茅台                                   ║"
  echo -e "║  3. 601318 中国平安                                   ║"
  echo -e "║  4. 000002 万科A                                      ║"
  echo -e "║  5. 自定义股票代码                                    ║"
  echo -e "║  0. 退出                                               ║"
  echo -e "╚════════════════════════════════════════════════════════════╝${RESET}"
  
  echo ""
  echo -e "${CYAN}━━━ 运行模式 ━━━${RESET}"
  echo -e "  ${GREEN}1${RESET}. JSON-RPC Session"
  echo -e "  ${GREEN}2${RESET}. 管道分析 (head -50)"
  echo -e "  ${GREEN}3${RESET}. AppleScript+Terminal"
  echo -e "  ${RED}0${RESET}. 返回"
}

main() {
  show_header
  check_prereqs
  
  local symbol=""
  local name=""
  local prompt=""
  
  if [[ -n "$1" ]]; then
    # Command line mode: symbol [mode]
    symbol="$1"
    name="${2:-未知}"
    
    # Find prompt for symbol
    for stock_prompt in "${STOCK_PROMPTS[@]}"; do
      IFS=':' read -r code nm content <<< "$stock_prompt"
      if [[ "$code" == "$symbol" ]]; then
        prompt="$content"
        break
      fi
    done
    
    if [[ -z "$prompt" ]]; then
      echo -e "${RED}❌ 未找到股票 ${symbol} 的提示${RESET}"
      exit 1
    fi
    
    local mode="${3:-2}"
    case "$mode" in
      1) run_jsonrpc_session "$symbol" "$name" "$prompt" ;;
      2) run_pipe_analysis "$symbol" "$name" "$prompt" ;;
      3) run_applescript_terminal "$symbol" "$name" ;;
      *) echo "未知模式: $mode" ;;
    esac
  else
    # Interactive mode
    while true; do
      show_menu
      echo ""
      echo -n "选择股票 [0-5]: "
      read choice
      
      if [[ "$choice" == "0" ]]; then
        echo "退出"
        exit 0
      fi
      
      if [[ "$choice" == "5" ]]; then
        echo -n "输入股票代码: "
        read symbol
        echo -n "输入股票名称: "
        read name
        prompt="使用多智能体系统分析${symbol} ${name}:\n1. 研究员Agent\n2. 分析师Agent\n3. 汇总Agent\n请创建团队并协调分析。"
      elif [[ "$choice" -ge 1 && "$choice" -le 4 ]]; then
        IFS=':' read -r symbol name prompt <<< "${STOCK_PROMPTS[$((choice-1))]}"
      else
        echo "无效选择: $choice"
        continue
      fi
      
      echo ""
      echo -n "选择运行模式 [1-3]: "
      read mode
      
      case "$mode" in
        1) run_jsonrpc_session "$symbol" "$name" "$prompt" ;;
        2) run_pipe_analysis "$symbol" "$name" "$prompt" ;;
        3) run_applescript_terminal "$symbol" "$name" ;;
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
