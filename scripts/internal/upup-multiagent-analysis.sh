#!/bin/bash
# UpUp Multi-Agent Real Analysis v6.1
# 真实的多智能体股票分析交互脚本

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

check_prereqs() {
    echo -e "${CYAN}━━━ 前置条件检查 ━━━${RESET}"
    if [[ ! -f "$BINARY" ]]; then
        echo -e "${RED}❌ Binary不存在${RESET}"
        exit 1
    fi
    chmod +x "$BINARY" 2>/dev/null || true
    echo -e "${GREEN}✅ dist/upup 可用${RESET}"
}

generate_analysis_prompt() {
    local symbol="$1"
    local name="$2"
    
    cat << PROMPT
使用多智能体系统分析 ${symbol} (${name}):

1. 研究员Agent: 调研 ${symbol} 基本面
   - 公司概况和业务范围
   - 行业地位和竞争优势
   - 近期重大事件

2. 分析师Agent: 分析 ${symbol} 财务指标
   - 营收和利润趋势
   - 估值指标 (市盈率、市净率)
   - 盈利能力分析

3. 汇总Agent: 生成投资建议
   - 综合分析结果
   - 风险提示
   - 投资建议

请创建团队 'stock-analysis-${symbol}' 并协调各Agent完成分析。
PROMPT
}

run_analysis() {
    local symbol="$1"
    local name="$2"
    local mode="${3:-1}"
    
    echo -e "${MAGENTA}━━━ 多智能体分析: ${symbol} (${name}) ━━━${RESET}"
    
    PROMPT=$(generate_analysis_prompt "$symbol" "$name")
    
    case "$mode" in
        1) # Pipe mode
            echo -e "${YELLOW}管道模式发送请求...${RESET}"
            printf '%s\n' "$PROMPT" | "$BINARY" 2>&1
            ;;
        2) # AppleScript Terminal
            echo -e "${YELLOW}AppleScript Terminal模式...${RESET}"
            osascript << APPLESCRIPT
tell application "Terminal"
    activate
    do script "'${BINARY}'"
end tell
APPLESCRIPT
            ;;
        3) # iTerm2 fallback to Terminal
            echo -e "${YELLOW}iTerm2未安装，使用Terminal...${RESET}"
            osascript << APPLESCRIPT
tell application "Terminal"
    activate
    do script "'${BINARY}'"
end tell
APPLESCRIPT
            ;;
        4) # Direct interactive
            echo -e "${YELLOW}直接交互模式...${RESET}"
            "$BINARY"
            ;;
        *)
            echo -e "${YELLOW}默认管道模式...${RESET}"
            printf '%s\n' "$PROMPT" | "$BINARY" 2>&1
            ;;
    esac
}

show_usage() {
    echo -e "${MAGENTA}UpUp 多智能体股票分析 v6.1${RESET}"
    echo ""
    echo "用法:"
    echo "  $0 [股票代码] [股票名称] [模式]"
    echo "  $0 000001 平安银行 1"
    echo "  $0 600519 贵州茅台"
    echo ""
    echo "模式:"
    echo "  1 - 管道模式 (默认)"
    echo "  2 - AppleScript Terminal"
    echo "  3 - iTerm2 (Terminal备用)"
    echo "  4 - 直接交互模式"
    echo ""
    echo "示例:"
    echo "  $0 000001 平安银行    # 分析平安银行"
    echo "  $0 600519 贵州茅台    # 分析贵州茅台"
}

main() {
    check_prereqs
    
    local symbol="${1:-}"
    local name="${2:-}"
    local mode="${3:-1}"
    
    if [[ -z "$symbol" ]]; then
        show_usage
        exit 0
    fi
    
    if [[ -z "$name" ]]; then
        # Auto-detect name from symbol
        case "$symbol" in
            000001) name="平安银行" ;;
            600519) name="贵州茅台" ;;
            601318) name="中国平安" ;;
            *) name="$symbol" ;;
        esac
    fi
    
    run_analysis "$symbol" "$name" "$mode"
}

main "$@"
