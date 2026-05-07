#!/bin/bash
# Rate Limit Hook for Dexter
# Ensures minimum interval between API calls to prevent rate limiting
#
# Usage: Call before making API requests
#   source ~/.claude/hooks/rate-limit.sh
#   rate_limit_check "tushare"
#
# Environment variables:
#   RATE_LIMIT_INTERVAL: Minimum interval in seconds (default: 0.5)
#   RATE_LIMIT_FILE: File to store last call timestamps (default: ~/.dexter/rate-limit.state)

set -euo pipefail

# Configuration
RATE_LIMIT_INTERVAL="${RATE_LIMIT_INTERVAL:-0.5}"
RATE_LIMIT_DIR="${HOME}/.dexter"
RATE_LIMIT_FILE="${RATE_LIMIT_DIR}/rate-limit.state"

# Ensure directory exists
mkdir -p "$RATE_LIMIT_DIR"

# Get current provider from settings or default
get_provider() {
    local settings_file="${HOME}/.claude/settings.json"
    if [[ -f "$settings_file" ]]; then
        # Extract provider from JSON (simple grep-based parsing)
        grep -o '"provider"[[:space:]]*:[[:space:]]*"[^"]*"' "$settings_file" 2>/dev/null | \
            sed 's/.*"\([^"]*\)"$/\1/' | head -1 || echo "unknown"
    else
        echo "unknown"
    fi
}

# Check if we need to wait before making a request
rate_limit_check() {
    local provider="${1:-$(get_provider)}"
    local now
    now=$(date +%s.%N)
    local last_call=0
    local key="${provider}"

    # Read last call time for this provider
    if [[ -f "$RATE_LIMIT_FILE" ]]; then
        last_call=$(grep "^${key}=" "$RATE_LIMIT_FILE" 2>/dev/null | cut -d'=' -f2 || echo "0")
    fi

    # Calculate time since last call
    local elapsed
    elapsed=$(echo "$now - $last_call" | bc 2>/dev/null || echo "999")

    # Check if we need to wait
    if (( $(echo "$elapsed < $RATE_LIMIT_INTERVAL" | bc -l 2>/dev/null || echo "0") )); then
        local wait_time
        wait_time=$(echo "$RATE_LIMIT_INTERVAL - $elapsed" | bc 2>/dev/null || echo "$RATE_LIMIT_INTERVAL")
        echo "[RateLimit] Waiting ${wait_time}s before ${provider} API call..." >&2
        sleep "$wait_time"
    fi

    # Update last call time
    if [[ -f "$RATE_LIMIT_FILE" ]]; then
        # Remove old entry and add new one
        grep -v "^${key}=" "$RATE_LIMIT_FILE" 2>/dev/null > "${RATE_LIMIT_FILE}.tmp" || true
        mv "${RATE_LIMIT_FILE}.tmp" "$RATE_LIMIT_FILE"
    fi
    echo "${key}=$(date +%s.%N)" >> "$RATE_LIMIT_FILE"

    return 0
}

# Reset rate limit for a provider
rate_limit_reset() {
    local provider="${1:-}"
    if [[ -z "$provider" ]]; then
        # Reset all
        rm -f "$RATE_LIMIT_FILE"
    else
        # Reset specific provider
        if [[ -f "$RATE_LIMIT_FILE" ]]; then
            grep -v "^${provider}=" "$RATE_LIMIT_FILE" > "${RATE_LIMIT_FILE}.tmp" || true
            mv "${RATE_LIMIT_FILE}.tmp" "$RATE_LIMIT_FILE"
        fi
    fi
    echo "[RateLimit] Reset rate limit for: ${provider:-all providers}" >&2
}

# Show current rate limit status
rate_limit_status() {
    echo "Rate Limit Configuration:"
    echo "  Interval: ${RATE_LIMIT_INTERVAL}s"
    echo "  State file: $RATE_LIMIT_FILE"
    echo ""
    echo "Last API calls:"
    if [[ -f "$RATE_LIMIT_FILE" ]]; then
        while IFS='=' read -r key value; do
            if [[ -n "$key" && -n "$value" ]]; then
                echo "  ${key}: $(date -r "${value%.*}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$value")"
            fi
        done < "$RATE_LIMIT_FILE"
    else
        echo "  (no recent calls)"
    fi
}

# Export functions for use in scripts
export -f rate_limit_check 2>/dev/null || true
export -f rate_limit_reset 2>/dev/null || true
export -f rate_limit_status 2>/dev/null || true

# If script is called directly (not sourced), run command
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        check)
            rate_limit_check "${2:-}"
            ;;
        reset)
            rate_limit_reset "${2:-}"
            ;;
        status)
            rate_limit_status
            ;;
        *)
            echo "Usage: rate-limit.sh {check|reset|status} [provider]"
            ;;
    esac
fi
