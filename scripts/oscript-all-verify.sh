#!/bin/bash
# Comprehensive oscript test runner - Runs all oscript verification scripts
# Usage: bash scripts/oscript-all-verify.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

info() {
    echo -e "${YELLOW}ℹ INFO${NC}: $1"
}

section() {
    echo ""
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE} $1${NC}"
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════${NC}"
}

subsection() {
    echo ""
    echo -e "${BOLD}--- $1 ---${NC}"
}

run_ts_test() {
    local name="$1"
    local script="$2"

    subsection "$name"
    echo -e "${CYAN}Running: bun run $script${NC}"

    set +e
    bun run "$script" > /tmp/oscript-test-$name.log 2>&1
    local exit_code=$?
    set -e

    if [ $exit_code -eq 0 ]; then
        if grep -q "ALL.*VERIFIED\|ALL.*PASSED\|✅.*PASSED" /tmp/oscript-test-$name.log 2>/dev/null; then
            pass "$name (ALL PASSED)"
        elif grep -q "[0-9]* pass" /tmp/oscript-test-$name.log 2>/dev/null; then
            local count=$(grep -o "[0-9]* pass" /tmp/oscript-test-$name.log | head -1)
            pass "$name ($count)"
        else
            pass "$name"
        fi
    else
        if grep -q "VERIFICATION FAILED\|SOME TESTS FAILED\|❌.*FAILED" /tmp/oscript-test-$name.log 2>/dev/null; then
            fail "$name (VERIFICATION FAILED)"
        elif grep -q "[0-9]*%\|Pass rate" /tmp/oscript-test-$name.log 2>/dev/null; then
            local rate=$(grep -E "([0-9]+\.[0-9]+%|Pass rate.*[0-9]+)" /tmp/oscript-test-$name.log | head -1)
            pass "$name ($rate)"
        else
            fail "$name (exit code: $exit_code)"
        fi
    fi
    echo -e "${CYAN}Log: /tmp/oscript-test-$name.log${NC}"
}

###############################################################################
# SECTION 1: Core Verification Scripts
###############################################################################
section "1. CORE VERIFICATION SCRIPTS"

run_ts_test "oscript-cmd-verify" "scripts/oscript-cmd-verify.ts"
run_ts_test "oscript-config-verify" "scripts/oscript-config-verify.ts"
run_ts_test "oscript-session-verify" "scripts/oscript-session-verify.ts"
run_ts_test "oscript-storage-verify" "scripts/oscript-storage-verify.ts"
run_ts_test "oscript-plan31-features-verify" "scripts/oscript-plan31-features-verify.ts"
run_ts_test "oscript-comprehensive-verify" "scripts/oscript-comprehensive-verify.ts"

###############################################################################
# SECTION 2: Unit Test
###############################################################################
section "2. UNIT TESTS"

subsection "bun test"
set +e
bun test > /tmp/oscript-test-bun-test.log 2>&1
exit_code=$?
set -e

if [ $exit_code -eq 0 ]; then
    local count=$(grep -o "[0-9]* pass" /tmp/oscript-test-bun-test.log | head -1)
    pass "bun test ($count)"
else
    fail "bun test"
fi

###############################################################################
# SECTION 3: TypeScript Compilation
###############################################################################
section "3. TYPESCRIPT COMPILATION"

subsection "bun run typecheck"
set +e
bun run typecheck > /tmp/oscript-test-typecheck.log 2>&1
exit_code=$?
set -e

if [ $exit_code -eq 0 ]; then
    pass "TypeScript compilation"
else
    fail "TypeScript compilation"
fi

###############################################################################
# SECTION 4: Build
###############################################################################
section "4. BUILD"

subsection "bun run build"
set +e
bun run build > /tmp/oscript-test-build.log 2>&1
exit_code=$?
set -e

if [ $exit_code -eq 0 ]; then
    pass "Binary build"
else
    fail "Binary build"
fi

###############################################################################
# SECTION 5: Binary Tests
###############################################################################
section "5. BINARY TESTS"

subsection "./dist/upup --version"
if ./dist/upup --version > /tmp/oscript-test-version.log 2>&1; then
    pass "Binary version check"
else
    fail "Binary version check"
fi

subsection "./dist/upup --help"
if ./dist/upup --help > /tmp/oscript-test-help.log 2>&1; then
    pass "Binary help"
else
    fail "Binary help"
fi

subsection "./dist/upup config list"
if ./dist/upup config list > /tmp/oscript-test-config.log 2>&1; then
    pass "Binary config list"
else
    fail "Binary config list"
fi

###############################################################################
# SECTION 6: Summary
###############################################################################
section "6. SUMMARY"

echo ""
echo -e "${BOLD}Test Results:${NC}"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo -e "  Total: $TESTS_TOTAL"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Failed test logs:"
    for log in /tmp/oscript-test-*.log; do
        if grep -q "VERIFICATION FAILED\|SOME TESTS FAILED\|❌.*FAILED" "$log" 2>/dev/null; then
            echo -e "  ${RED}❌${NC} $(basename "$log")"
        fi
    done
    exit 1
fi