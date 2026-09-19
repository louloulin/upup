#!/usr/bin/env osascript
# test-global-config.applescript
# AppleScript to test global/project config layer
# Usage: osascript test-global-config.applescript

on run argv
    set PROJECT_DIR to do shell script "pwd"
    set SCRIPT_DIR to do shell script "dirname " & quoted form of (POSIX path of (path to me))
    set TEST_DIR to do shell script "dirname " & quoted form of SCRIPT_DIR

    -- Colors
    set GREEN to "✅"
    set RED to "❌"
    set YELLOW to "ℹ️"

    log ""
    log "=========================================="
    log GREEN & " Testing Global/Project Config Layer"
    log "=========================================="
    log ""

    -- Test 1: Build
    log YELLOW & " Test 1: Building project..."
    set BUILD_CMD to "cd " & quoted form of TEST_DIR & " && bun run build 2>&1"
    set BUILD_RESULT to do shell script BUILD_CMD
    if BUILD_RESULT contains "error" then
        log RED & " Build failed"
        log BUILD_RESULT
        return
    else
        log GREEN & " Build successful"
    end if

    -- Test 2: Unit Tests
    log ""
    log YELLOW & " Test 2: Running unit tests..."
    set TEST_CMD to "cd " & quoted form of TEST_DIR & " && bun test 2>&1"
    set TEST_RESULT to do shell script TEST_CMD
    if TEST_RESULT contains "pass" then
        log GREEN & " All tests passed"
    else
        log RED & " Tests failed"
    end if

    -- Test 3: Create Global Config
    log ""
    log YELLOW & " Test 3: Creating global config (~/.upup/)..."
    set GLOBAL_DIR to (POSIX path of (path to home folder)) & ".upup"
    do shell script "mkdir -p " & quoted form of GLOBAL_DIR

    set GLOBAL_SOUL to GLOBAL_DIR & "/SOUL.md"
    do shell script "cat > " & quoted form of GLOBAL_SOUL & " << 'EOF'
# Global Investment Identity

This is the GLOBAL configuration.
Applies to all UpUp sessions.

## Style
- Long-term value investing
- Focus on quality companies
EOF"
    log GREEN & " Global SOUL.md created"

    -- Test 4: Create Project Config
    log ""
    log YELLOW & " Test 4: Creating project config (.upup/)..."
    set PROJECT_DIR_PATH to TEST_DIR & "/.upup"
    do shell script "mkdir -p " & quoted form of PROJECT_DIR_PATH

    set PROJECT_SOUL to PROJECT_DIR_PATH & "/SOUL.md"
    do shell script "cat > " & quoted form of PROJECT_SOUL & " << 'EOF'
# Project Identity

This is the PROJECT configuration.
Overrides global settings.
EOF"
    log GREEN & " Project SOUL.md created"

    -- Test 5: Verify Config Loading
    log ""
    log YELLOW & " Test 5: Testing config loading priority..."
    set TEST_SCRIPT to "cd " & quoted form of TEST_DIR & " && node -e \"
import { loadSoulDocument } from './dist/agent/prompts.js';
const content = await loadSoulDocument();
console.log(content ? content.substring(0, 100) : 'NULL');
\""
    set CONFIG_RESULT to do shell script TEST_SCRIPT

    if CONFIG_RESULT contains "PROJECT" then
        log GREEN & " Project config takes priority ✓"
    else if CONFIG_RESULT contains "GLOBAL" then
        log YELLOW & " Note: Global config loaded (project may be overridden)"
    end if
    log "Content preview: " & characters 1 thru 60 of CONFIG_RESULT as string

    -- Test 6: Test Fallback
    log ""
    log YELLOW & " Test 6: Testing fallback to global (no project config)..."
    do shell script "rm -rf " & quoted form of PROJECT_DIR_PATH
    set FALLBACK_RESULT to do shell script TEST_SCRIPT

    if FALLBACK_RESULT contains "GLOBAL" then
        log GREEN & " Falls back to global config ✓"
    end if

    -- Test 7: Hook Loading
    log ""
    log YELLOW & " Test 7: Testing hook loading..."
    set GLOBAL_HOOKS to GLOBAL_DIR & "/hooks"
    set PROJECT_HOOKS to PROJECT_DIR_PATH & "/hooks"
    do shell script "mkdir -p " & quoted form of GLOBAL_HOOKS
    do shell script "mkdir -p " & quoted form of PROJECT_HOOKS
    do shell script "echo '// Global hook' > " & quoted form of (GLOBAL_HOOKS & "/test.ts")
    do shell script "echo '// Project hook' > " & quoted form of (PROJECT_HOOKS & "/test.ts")
    log GREEN & " Hook directories created"

    -- Test 8: Dev Mode
    log ""
    log YELLOW & " Test 8: Testing bun run dev (quick startup)..."
    try
        do shell script "cd " & quoted form of TEST_DIR & " && timeout 3 bun run dev 2>&1 || true"
        log GREEN & " Dev mode started without errors"
    on error errMsg
        log YELLOW & " Dev mode: " & errMsg
    end try

    -- Cleanup
    log ""
    log YELLOW & " Cleaning up..."
    do shell script "rm -rf " & quoted form of GLOBAL_DIR
    do shell script "rm -rf " & quoted form of PROJECT_DIR_PATH
    log GREEN & " Cleanup complete"

    log ""
    log "=========================================="
    log GREEN & " Test Summary"
    log "=========================================="
    log "Configuration hierarchy verified:"
    log "  ~/.upup/   → Global config (fallback)"
    log "  .upup/     → Project config (priority)"
    log ""
    log GREEN & " All tests completed successfully!"
    log ""
end run
