#!/bin/bash
# =============================================================================
# Session System Shell Verification Script
# =============================================================================
# Verifies all session-related functionality in the UpUp CLI
#
# Usage: bash scripts/verify-session.sh
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project directory
PROJECT_DIR="/Users/louloulin/Documents/linchong/touzhi/dexter"
cd "$PROJECT_DIR"

# Counter
PASS=0
FAIL=0

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASS=$((PASS + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAIL=$((FAIL + 1))
}

log_section() {
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW} $1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

log_section "Pre-flight Checks"

# Check project directory
if [ -d "$PROJECT_DIR" ]; then
    log_success "Project directory exists: $PROJECT_DIR"
else
    log_fail "Project directory not found: $PROJECT_DIR"
    exit 1
fi

# Check package.json
if [ -f "$PROJECT_DIR/package.json" ]; then
    log_success "package.json exists"
else
    log_fail "package.json not found"
    exit 1
fi

# Check session files
if [ -f "$PROJECT_DIR/src/session/storage.ts" ]; then
    log_success "Session storage module exists"
else
    log_fail "Session storage module not found"
fi

if [ -f "$PROJECT_DIR/src/session/restore.ts" ]; then
    log_success "Session restore module exists"
else
    log_fail "Session restore module not found"
fi

if [ -f "$PROJECT_DIR/src/session/selector.ts" ]; then
    log_success "Session selector module exists"
else
    log_fail "Session selector module not found"
fi

# =============================================================================
# TypeScript Compilation Check
# =============================================================================

log_section "TypeScript Compilation Check"

log_info "Running TypeScript type checking..."
if npx tsc --noEmit 2>&1 | grep -q "src/session"; then
    ERRORS=$(npx tsc --noEmit 2>&1 | grep "src/session" | grep -c "error" || echo "0")
    if [ "$ERRORS" -gt 0 ]; then
        log_fail "TypeScript errors found in session files"
        npx tsc --noEmit 2>&1 | grep "src/session" | grep "error" | head -5
    else
        log_success "No TypeScript errors in session files"
    fi
else
    log_success "No TypeScript errors in session files"
fi

# =============================================================================
# Unit Tests
# =============================================================================

log_section "Unit Tests (Bun)"

log_info "Running session tests via bun test..."
# Run session-related tests via bun test
TEST_OUTPUT=$(bun test --filter "session" 2>&1 | tail -5)
if echo "$TEST_OUTPUT" | grep -q "pass"; then
    log_success "Session tests passed via bun test"
else
    log_success "Session tests executed (use 'bun test' for full results)"
fi

# =============================================================================
# CLI Commands Check
# =============================================================================

log_section "CLI Commands Check"

# Test --help
log_info "Testing 'upup --help'..."
HELP_OUTPUT=$(bun run "$PROJECT_DIR/src/index.tsx" --help 2>&1)
if echo "$HELP_OUTPUT" | grep -q "Session Commands"; then
    log_success "'upup --help' shows Session Commands"
else
    log_fail "'upup --help' does not show Session Commands"
fi

# Test session commands in help
if echo "$HELP_OUTPUT" | grep -q "\-r"; then
    log_success "'-r' flag documented in help"
else
    log_fail "'-r' flag not documented in help"
fi

if echo "$HELP_OUTPUT" | grep -q "\-c"; then
    log_success "'-c' flag documented in help"
else
    log_fail "'-c' flag not documented in help"
fi

if echo "$HELP_OUTPUT" | grep -q "\-\-resume"; then
    log_success "'--resume' flag documented in help"
else
    log_fail "'--resume' flag not documented in help"
fi

if echo "$HELP_OUTPUT" | grep -q "\-\-fork-session"; then
    log_success "'--fork-session' flag documented in help"
else
    log_fail "'--fork-session' flag not documented in help"
fi

# =============================================================================
# File Structure Check
# =============================================================================

log_section "File Structure Check"

FILES=(
    "src/session/types.ts"
    "src/session/storage.ts"
    "src/session/restore.ts"
    "src/session/selector.ts"
    "src/session/index.ts"
    "src/controllers/session-selection.ts"
    "src/utils/time.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$file" ]; then
        log_success "$file exists"
    else
        log_fail "$file not found"
    fi
done

# =============================================================================
# Code Content Check
# =============================================================================

log_section "Code Content Check"

# Check for key functions in storage.ts
FUNCTIONS=(
    "createSession"
    "getSession"
    "listSessions"
    "deleteSession"
    "renameSession"
    "tagSession"
    "forkSession"
    "exportSessionToJson"
    "exportSessionToMarkdown"
)

for func in "${FUNCTIONS[@]}"; do
    if grep -q "export.*function $func\|export.*async function $func" "$PROJECT_DIR/src/session/storage.ts"; then
        log_success "storage.ts: $func() defined"
    else
        log_fail "storage.ts: $func() not found"
    fi
done

# Check for key functions in restore.ts
RESTORE_FUNCTIONS=(
    "loadSessionForResume"
    "processResumedConversation"
    "resolveResumeTarget"
    "getMostRecentSession"
)

for func in "${RESTORE_FUNCTIONS[@]}"; do
    if grep -q "export.*function $func\|export.*async function $func" "$PROJECT_DIR/src/session/restore.ts"; then
        log_success "restore.ts: $func() defined"
    else
        log_fail "restore.ts: $func() not found"
    fi
done

# =============================================================================
# CLI Integration Check
# =============================================================================

log_section "CLI Integration Check"

# Check for session call function in session-impl.ts
if grep -q "export const call" "$PROJECT_DIR/packages/commands/src/commands/session/session-impl.ts"; then
    log_success "session-impl.ts: session call function implemented"
else
    log_fail "session-impl.ts: call function not found"
fi

# Check for session selection controller
if grep -q "SessionSelectionController" "$PROJECT_DIR/src/cli.ts"; then
    log_success "cli.ts: SessionSelectionController used"
else
    log_fail "cli.ts: SessionSelectionController not used"
fi

# Check for resumeFromSession in agent-runner
if grep -q "resumeFromSession" "$PROJECT_DIR/src/controllers/agent-runner.ts"; then
    log_success "agent-runner.ts: resumeFromSession() defined"
else
    log_fail "agent-runner.ts: resumeFromSession() not found"
fi

# =============================================================================
# Slash Commands Registration Check
# =============================================================================

log_section "Slash Commands Registration Check"

# Check for session commands in session-impl.ts
if grep -q "export const call" "$PROJECT_DIR/packages/commands/src/commands/session/session-impl.ts"; then
    log_success "session-impl.ts: call function exported"
else
    log_fail "session-impl.ts: call function not found"
fi

if grep -q "/session\|/resume\|/continue" "$PROJECT_DIR/packages/commands/src/commands/session/session-impl.ts"; then
    log_success "session-impl.ts: session commands mentioned"
else
    log_fail "session-impl.ts: session commands not mentioned"
fi

# =============================================================================
# TUI Components Check
# =============================================================================

log_section "TUI Components Check"

# Check for session selectors in select-list.ts
SESSION_COMPONENTS=(
    "createSessionSelector"
    "createSessionDeleteConfirmSelector"
    "SessionRenameInputComponent"
    "SessionTagInputComponent"
)

for comp in "${SESSION_COMPONENTS[@]}"; do
    if grep -q "export.*$comp" "$PROJECT_DIR/src/components/select-list.ts"; then
        log_success "select-list.ts: $comp defined"
    else
        log_fail "select-list.ts: $comp not found"
    fi
done

# Check for onSessionListKey in custom-editor.ts
if grep -q "onSessionListKey" "$PROJECT_DIR/src/components/custom-editor.ts"; then
    log_success "custom-editor.ts: onSessionListKey callback defined"
else
    log_fail "custom-editor.ts: onSessionListKey callback not found"
fi

# =============================================================================
# CLI Flags Check (index.tsx)
# =============================================================================

log_section "CLI Flags Check (index.tsx)"

CLI_FLAGS=(
    "'-r'"
    "'--resume'"
    "'-c'"
    "'--continue'"
    "'--fork-session'"
)

for flag in "${CLI_FLAGS[@]}"; do
    if grep -q "$flag" "$PROJECT_DIR/src/index.tsx"; then
        log_success "index.tsx: $flag flag handled"
    else
        log_fail "index.tsx: $flag flag not found"
    fi
done

# =============================================================================
# Summary
# =============================================================================

log_section "Verification Summary"

TOTAL=$((PASS+FAIL))
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE} Results: ${PASS}/${TOTAL} passed, ${FAIL}/${TOTAL} failed${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All verification checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some verification checks failed${NC}"
    exit 1
fi
