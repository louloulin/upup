#!/bin/bash
# API Key Validation Hook for Dexter
# Checks if required API keys are configured and valid
#
# Usage:
#   source ~/.claude/hooks/validate-api-keys.sh
#   validate_api_keys                    # Validate all keys
#   validate_api_keys --check            # Check mode (silent, just exit code)
#   validate_api_keys --json            # Output as JSON
#
# Exit codes:
#   0: All required keys present
#   1: Some required keys missing
#   2: Configuration error

set -euo pipefail

# Color codes (if terminal supports it)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# API Key definitions
declare -A REQUIRED_KEYS=(
    ["DEEPSEEK_API_KEY"]="DeepSeek (primary model)"
    ["OPENAI_API_KEY"]="OpenAI (alternative)"
)

declare -A OPTIONAL_KEYS=(
    ["TUSHARE_TOKEN"]="Tushare Pro (A-share data)"
    ["AKSHARE_API_KEY"]="AKShare (alternative A-share)"
    ["EXASEARCH_API_KEY"]="Exa Search (web search)"
    ["PERPLEXITY_API_KEY"]="Perplexity (web search)"
    ["TAVILY_API_KEY"]="Tavily (web search)"
    ["X_BEARER_TOKEN"]="X/Twitter API"
    ["FINNHUB_API_KEY"]="Finnhub (stock data)"
)

# Check if a key is set and non-empty
is_key_set() {
    local key_name="$1"
    local value="${!key_name:-}"
    [[ -n "$value" && "$value" != "undefined" && "$value" != "null" ]]
}

# Validate a single API key
validate_key() {
    local key_name="$1"
    local description="$2"
    local required="${3:-false}"

    local result
    result=$(is_key_set "$key_name" && echo "present" || echo "missing")

    if [[ "$result" == "present" ]]; then
        printf '%s✔%s %-25s %s\n' "$GREEN" "$NC" "$key_name" "$description"
        return 0
    else
        if [[ "$required" == "true" ]]; then
            printf '%s✘%s %-25s %s %s[REQUIRED]%s\n' "$RED" "$NC" "$key_name" "$description" "$RED" "$NC"
            return 1
        else
            printf '%s○%s %-25s %s %s[optional]%s\n' "$YELLOW" "$NC" "$key_name" "$description" "$YELLOW" "$NC"
            return 0
        fi
    fi
}

# Validate all API keys
validate_all_keys() {
    local check_mode="${1:-false}"
    local json_output="${2:-false}"
    local errors=0
    local warnings=0
    local results=()

    # Collect required keys
    for key in "${!REQUIRED_KEYS[@]}"; do
        local desc="${REQUIRED_KEYS[$key]}"
        if is_key_set "$key"; then
            results+=("{\"key\":\"$key\",\"status\":\"present\",\"required\":true,\"description\":\"$desc\"}")
        else
            results+=("{\"key\":\"$key\",\"status\":\"missing\",\"required\":true,\"description\":\"$desc\"}")
            ((errors++))
        fi
    done

    # Collect optional keys
    for key in "${!OPTIONAL_KEYS[@]}"; do
        local desc="${OPTIONAL_KEYS[$key]}"
        if is_key_set "$key"; then
            results+=("{\"key\":\"$key\",\"status\":\"present\",\"required\":false,\"description\":\"$desc\"}")
        else
            results+=("{\"key\":\"$key\",\"status\":\"missing\",\"required\":false,\"description\":\"$desc\"}")
            ((warnings++))
        fi
    done

    # Output format
    if [[ "$json_output" == "true" ]]; then
        printf '{"required":{"present":%d,"missing":%d},"optional":{"present":%d,"missing":%d},"keys":[%s]}\n' \
            $((${#REQUIRED_KEYS[@]} - errors)) "$errors" \
            $((${#OPTIONAL_KEYS[@]} - warnings)) "$warnings" \
            "$(IFS=','; echo "${results[*]}")"
    else
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "              Dexter API Key Validation Report"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "Required Keys:"
        echo "───────────────────────────────────────────────────────────────"
        for key in "${!REQUIRED_KEYS[@]}"; do
            validate_key "$key" "${REQUIRED_KEYS[$key]}" "true" || true
        done
        echo ""
        echo "Optional Keys:"
        echo "───────────────────────────────────────────────────────────────"
        for key in "${!OPTIONAL_KEYS[@]}"; do
            validate_key "$key" "${OPTIONAL_KEYS[$key]}" "false" || true
        done
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "Summary:"

        if [[ $errors -eq 0 ]]; then
            printf '%s✔ All required keys present%s\n' "$GREEN" "$NC"
        else
            printf '%s✘ %d required key(s) missing%s\n' "$RED" "$errors" "$NC"
        fi

        if [[ $warnings -gt 0 ]]; then
            printf '%s○ %d optional key(s) not configured%s\n' "$YELLOW" "$warnings" "$NC"
        fi

        echo "═══════════════════════════════════════════════════════════════"
        echo ""
    fi

    # Exit code
    if [[ "$check_mode" == "true" ]]; then
        return $errors
    fi
    return 0
}

# Check environment setup
check_environment() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    Environment Check"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # OS
    echo "Operating System: $(uname -s) $(uname -m)"

    # Node/Bun
    if command -v bun &> /dev/null; then
        echo "Bun Version: $(bun --version 2>/dev/null || echo 'unknown')"
    elif command -v node &> /dev/null; then
        echo "Node Version: $(node --version 2>/dev/null || echo 'unknown')"
    else
        echo "Node.js: not found"
    fi

    # Python (for AKShare)
    if command -v python3 &> /dev/null; then
        echo "Python Version: $(python3 --version 2>/dev/null || echo 'unknown')"
        if python3 -c "import akshare" 2>/dev/null; then
            echo "AKShare: installed"
        else
            echo "AKShare: not installed"
        fi
    else
        echo "Python3: not found"
    fi

    # Claude CLI
    if command -v claude &> /dev/null; then
        echo "Claude CLI: $(claude --version 2>/dev/null | head -1 || echo 'installed')"
    else
        echo "Claude CLI: not found"
    fi

    # Project location
    echo ""
    echo "Dexter Installation:"
    if [[ -f "${HOME}/.claude/settings.json" ]]; then
        echo "  Settings: ${HOME}/.claude/settings.json"
    fi
    if [[ -d "${HOME}/.dexter" ]]; then
        echo "  Data Dir: ${HOME}/.dexter"
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

# Show help
show_help() {
    cat << EOF
Dexter API Key Validation Tool

Usage: validate-api-keys.sh [OPTIONS]

OPTIONS:
    --check         Check mode: silent, just exit code (0=ok, 1=error)
    --json          Output results as JSON
    --env           Show environment check
    --help          Show this help message

Examples:
    validate-api-keys.sh                 # Full validation with output
    validate-api-keys.sh --check          # Check and exit silently
    validate-api-keys.sh --json          # Get results as JSON
    validate-api-keys.sh --env            # Show environment info

Environment Variables:
    Required Keys (one of):
        DEEPSEEK_API_KEY        DeepSeek API key
        OPENAI_API_KEY          OpenAI API key

    Optional Keys:
        TUSHARE_TOKEN           Tushare Pro token
        EXASEARCH_API_KEY       Exa Search key
        PERPLEXITY_API_KEY     Perplexity API key
        TAVILY_API_KEY          Tavily API key
        X_BEARER_TOKEN          X/Twitter API token

EOF
}

# Main entry point
main() {
    local check_mode="false"
    local json_output="false"
    local show_env="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)
                check_mode="true"
                shift
                ;;
            --json)
                json_output="true"
                shift
                ;;
            --env)
                show_env="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                show_help
                exit 2
                ;;
        esac
    done

    # Show environment if requested
    if [[ "$show_env" == "true" ]]; then
        check_environment
    fi

    # Run validation
    validate_all_keys "$check_mode" "$json_output"
}

# Run main if script is called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
