#!/bin/bash
# UpUp Multi-Agent Interactive AppScript v5.2
# 真实的基于dist/upup的多智能体交互式运行脚本

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
    echo -e "${CYAN}━━━ 检查前置条件 ━━━${RESET}"
    
    if [[ ! -f "$BINARY" ]]; then
        echo -e "${RED}❌ Binary不存在: $BINARY${RESET}"
        exit 1
    fi
    
    chmod +x "$BINARY" 2>/dev/null || true
    echo -e "${GREEN}✅ dist/upup 可用${RESET}"
    
    if osascript -e 'return' 2>/dev/null; then
        echo -e "${GREEN}✅ AppleScript 可用${RESET}"
    fi
    
    # Check iTerm2
    if osascript -e 'tell application "System Events" to return (exists process "iTerm2")' 2>/dev/null | grep -q "true"; then
        echo -e "${GREEN}✅ iTerm2 已运行${RESET}"
        ITERM2_AVAILABLE=true
    elif [ -d "/Applications/iTerm.app" ]; then
        echo -e "${YELLOW}⚠️ iTerm2已安装但未运行${RESET}"
        ITERM2_AVAILABLE=false
    else
        echo -e "${YELLOW}⚠️ iTerm2未安装${RESET}"
        ITERM2_AVAILABLE=false
    fi
}

# STDIO JSON-RPC
run_stdio_jsonrpc() {
    echo -e "${CYAN}━━━ STDIO JSON-RPC模式 ━━━${RESET}"
    
    PROMPT="使用多智能体系统分析000001平安银行:
1. 研究员Agent: 调研基本面
2. 分析师Agent: 分析财务指标
3. 汇总Agent: 生成投资建议"
    
    echo -e "${YELLOW}执行多智能体分析...${RESET}"
    echo "Prompt: $PROMPT"
    echo ""
    
    # Send via pipe
    printf '%s\n' "$PROMPT" | "$BINARY" 2>&1 | head -50 || {
        echo -e "${YELLOW}⚠️ 命令已执行${RESET}"
    }
}

# AppleScript Terminal
run_applescript_terminal() {
    echo -e "${CYAN}━━━ AppleScript Terminal触发 ━━━${RESET}"
    
    osascript -e "tell application \"Terminal\" to activate" 2>/dev/null || true
    open -a Terminal
    sleep 1
    
    osascript << 'APPLESCRIPT'
tell application "Terminal"
    activate
    do script "'/Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup'"
end tell
APPLESCRIPT
    
    echo -e "${GREEN}✅ Terminal已启动UpUp${RESET}"
}

# iTerm2 - gracefully handle missing iTerm2
run_iterm2() {
    echo -e "${CYAN}━━━ iTerm2集成 ━━━${RESET}"
    
    if [ "$ITERM2_AVAILABLE" != "true" ]; then
        echo -e "${YELLOW}⚠️ iTerm2未运行，使用Terminal替代${RESET}"
        run_applescript_terminal
        return
    fi
    
    osascript << 'APPLESCRIPT'
tell application "iTerm2"
    activate
    tell current window
        create tab with default profile
    end tell
    tell current session
        write text "cd '/Users/louloulin/Documents/linchong/touzhi/dexter'"
        write text "'/Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup'"
    end tell
end tell
APPLESCRIPT
    
    echo -e "${GREEN}✅ iTerm2已启动UpUp${RESET}"
}

run_direct() {
    echo -e "${CYAN}━━━ 直接运行UpUp ━━━${RESET}"
    "$BINARY"
}

run_stdio_test() {
    echo -e "${CYAN}━━━ STDIO测试 ━━━${RESET}"
    
    echo "1. Testing JSON-RPC initialize..."
    printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | "$BINARY" --stdio 2>&1 | grep -E '(jsonrpc|UpUp|验证)' | head -10
}

show_menu() {
    echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗"
    echo -e "║  UpUp Multi-Agent Interactive AppScript v5.2           ║"
    echo -e "╠════════════════════════════════════════════════════════════╣"
    echo -e "║  1. 多智能体股票分析                                     ║"
    echo -e "║  2. AppleScript+Terminal触发                           ║"
    echo -e "║  3. iTerm2集成运行 (Terminal备用)                       ║"
    echo -e "║  4. 直接运行UpUp (交互式)                               ║"
    echo -e "║  5. STDIO测试                                           ║"
    echo -e "║  0. 退出                                               ║"
    echo -e "╚════════════════════════════════════════════════════════════╝${RESET}"
}

main() {
    check_prereqs
    
    if [[ -n "$1" ]]; then
        case "$1" in
            1) run_stdio_jsonrpc ;;
            2) run_applescript_terminal ;;
            3) run_iterm2 ;;
            4) run_direct ;;
            5) run_stdio_test ;;
            *) echo "未知选项: $1" ;;
        esac
    else
        while true; do
            show_menu
            echo ""
            echo -n "选择操作 [0-5]: "
            read choice
            
            case "$choice" in
                0) echo "退出"; exit 0 ;;
                1) run_stdio_jsonrpc ;;
                2) run_applescript_terminal ;;
                3) run_iterm2 ;;
                4) run_direct ;;
                5) run_stdio_test ;;
                *) echo "未知选项: $choice" ;;
            esac
            
            echo ""
            echo -n "按Enter继续..."
            read _
        done
    fi
}

main "$@"
