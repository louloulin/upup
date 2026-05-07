#!/bin/bash
# Cache Hook for Dexter
# Provides caching for API responses to reduce costs and improve performance
#
# Usage:
#   source ~/.claude/hooks/cache.sh
#   cache_get "tushare/daily/AAPL"          # Get cached response
#   cache_set "tushare/daily/AAPL" "$data"  # Cache a response
#   cache_clear "tushare"                   # Clear cache for a namespace
#   cache_stats                             # Show cache statistics

set -euo pipefail

# Configuration
CACHE_DIR="${HOME}/.dexter/cache"
CACHE_TTL="${CACHE_TTL:-3600}"  # Default TTL: 1 hour
CACHE_ENABLED="${CACHE_ENABLED:-true}"

# Ensure cache directory exists
mkdir -p "$CACHE_DIR"

# Hash a key for filesystem-safe filenames
cache_hash() {
    local key="$1"
    echo "$key" | sha256sum | cut -d' ' -f1
}

# Get cache file path
cache_path() {
    local namespace="$1"
    local key="$2"
    local hash
    hash=$(cache_hash "$key")
    echo "${CACHE_DIR}/${namespace}_${hash}.json"
}

# Check if cache is enabled and valid
cache_is_enabled() {
    [[ "$CACHE_ENABLED" == "true" ]]
}

# Get cached value
cache_get() {
    local namespace="$1"
    local key="$2"
    local cache_file
    cache_file=$(cache_path "$namespace" "$key")

    if ! cache_is_enabled; then
        return 1
    fi

    if [[ ! -f "$cache_file" ]]; then
        return 1
    fi

    # Check TTL
    local age
    age=$(($(date +%s) - $(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file" 2>/dev/null || echo "0")))

    if [[ $age -gt $CACHE_TTL ]]; then
        # Cache expired
        rm -f "$cache_file"
        return 1
    fi

    # Return cached value
    cat "$cache_file"
}

# Set cached value
cache_set() {
    local namespace="$1"
    local key="$2"
    local value="$3"
    local ttl="${4:-$CACHE_TTL}"
    local cache_file
    cache_file=$(cache_path "$namespace" "$key")

    if ! cache_is_enabled; then
        return 0
    fi

    # Store value with metadata
    local timestamp
    timestamp=$(date +%s)
    cat > "$cache_file" << EOF
{
    "timestamp": $timestamp,
    "ttl": $ttl,
    "namespace": "$namespace",
    "key": "$key",
    "data": $value
}
EOF
    echo "[Cache] Cached: ${namespace}/${key:0:20}..." >&2
}

# Delete cached value
cache_delete() {
    local namespace="$1"
    local key="$2"
    local cache_file
    cache_file=$(cache_path "$namespace" "$key")
    rm -f "$cache_file"
}

# Clear cache for a namespace
cache_clear() {
    local namespace="${1:-}"
    if [[ -z "$namespace" ]]; then
        # Clear all cache
        rm -rf "${CACHE_DIR}"/*
        echo "[Cache] Cleared all cache" >&2
    else
        # Clear specific namespace
        rm -f "${CACHE_DIR}/${namespace}"_*.json
        echo "[Cache] Cleared ${namespace} cache" >&2
    fi
}

# Show cache statistics
cache_stats() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    Cache Statistics"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Cache Directory: $CACHE_DIR"
    echo "TTL: ${CACHE_TTL}s ($(($CACHE_TTL / 60)) minutes)"
    echo "Enabled: $CACHE_ENABLED"
    echo ""

    if [[ ! -d "$CACHE_DIR" ]]; then
        echo "Cache is empty"
        return
    fi

    local total_files=0
    local total_size=0
    local expired_count=0
    local now
    now=$(date +%s)

    while IFS= read -r -d '' cache_file; do
        ((total_files++))
        total_size+=$(stat -f %z "$cache_file" 2>/dev/null || stat -c %s "$cache_file" 2>/dev/null || echo "0")

        # Check if expired
        local age
        age=$(($now - $(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file" 2>/dev/null || echo "0")))
        if [[ $age -gt $CACHE_TTL ]]; then
            ((expired_count++))
        fi
    done < <(find "$CACHE_DIR" -name "*.json" -print0 2>/dev/null)

    echo "Total Entries: $total_files"
    echo "Total Size: $(($total_size / 1024)) KB"
    echo "Expired: $expired_count"
    echo ""

    # Show by namespace
    echo "By Namespace:"
    echo "───────────────────────────────────────────────────────────────"
    find "$CACHE_DIR" -name "*.json" -exec basename {} \; 2>/dev/null | \
        sed 's/_.*//' | sort | uniq -c | sort -rn | head -10 | \
        while read -r count namespace; do
            printf '  %-20s %d entries\n' "$namespace" "$count"
        done

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

# Export functions
export -f cache_get 2>/dev/null || true
export -f cache_set 2>/dev/null || true
export -f cache_delete 2>/dev/null || true
export -f cache_clear 2>/dev/null || true
export -f cache_stats 2>/dev/null || true

# Handle direct invocation
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        get)
            cache_get "${2:-}" "${3:-}"
            ;;
        set)
            cache_set "${2:-}" "${3:-}" "${4:-}"
            ;;
        clear)
            cache_clear "${2:-}"
            ;;
        stats)
            cache_stats
            ;;
        *)
            echo "Usage: cache.sh {get|set|clear|stats} [args...]"
            ;;
    esac
fi
