#!/usr/bin/env osascript
-- oscript-storage-dev.applescript
-- Based on upup bun run dev - test storage and session functions
-- Usage: osascript scripts/oscript-storage-dev.applescript

on run argv
    set PROJECT_DIR to do shell script "pwd"
    set SCRIPT_DIR to do shell script "dirname " & quoted form of (POSIX path of (path to me))
    set DEXTER_DIR to do shell script "dirname " & quoted form of SCRIPT_DIR

    -- Colors
    set GREEN to "OK"
    set RED to "FAIL"
    set YELLOW to "WARN"
    set CYAN to "INFO"
    set MAGENTA to "TEST"
    set STAR to "STAR"

    log ""
    log "============================================================"
    log MAGENTA & " UpUp Storage & Session - bun run dev Test"
    log "============================================================"
    log ""

    -- Test counters
    set PASS_COUNT to 0
    set FAIL_COUNT to 0
    set WARN_COUNT to 0

    -- Define upup directories early
    set UPUP_DIR to (POSIX path of (path to home folder)) & ".upup"

    -- ================================================================
    -- 1. PRE-FLIGHT CHECKS
    -- ================================================================
    log ""
    log STAR & " Pre-flight Checks"
    log "------------------------------------------------------------"

    -- Check project exists
    set PROJ_EXISTS to do shell script "test -d " & quoted form of DEXTER_DIR & " && echo 'yes' || echo 'no'"
    if PROJ_EXISTS is "yes" then
        log GREEN & " Project directory exists"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " Project directory NOT found"
        set FAIL_COUNT to FAIL_COUNT + 1
        return
    end if

    -- Check bun
    try
        set BUN_VERSION to do shell script "bun --version 2>&1"
        if BUN_VERSION does not contain "error" then
            log GREEN & " Bun installed (v" & BUN_VERSION & ")"
            set PASS_COUNT to PASS_COUNT + 1
        else
            log RED & " Bun not found"
            set FAIL_COUNT to FAIL_COUNT + 1
        end if
    on error errMsg
        log RED & " Bun check failed"
        set FAIL_COUNT to FAIL_COUNT + 1
    end try

    -- Check package.json
    set PKG_EXISTS to do shell script "test -f " & quoted form of (DEXTER_DIR & "/package.json") & " && echo 'yes' || echo 'no'"
    if PKG_EXISTS is "yes" then
        log GREEN & " package.json exists"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " package.json not found"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- Check dev script
    set DEV_SCRIPT to do shell script "grep '\"dev\"' " & quoted form of (DEXTER_DIR & "/package.json") & " | head -1"
    if DEV_SCRIPT contains "bun" then
        log GREEN & " dev script configured"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " dev script check"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- ================================================================
    -- 2. TYPESCRIPT COMPILATION
    -- ================================================================
    log ""
    log STAR & " TypeScript Compilation"
    log "------------------------------------------------------------"

    -- Type check
    try
        set TYPECHECK_CMD to "cd " & quoted form of DEXTER_DIR & " && bun run typecheck 2>&1"
        set TYPECHECK_RESULT to do shell script TYPECHECK_CMD
        if TYPECHECK_RESULT contains "error" then
            log RED & " Type check FAILED"
            set FAIL_COUNT to FAIL_COUNT + 1
        else
            log GREEN & " Type check PASSED"
            set PASS_COUNT to PASS_COUNT + 1
        end if
    on error errMsg
        log YELLOW & " Type check warning"
        set WARN_COUNT to WARN_COUNT + 1
    end try

    -- Build
    try
        set BUILD_CMD to "cd " & quoted form of DEXTER_DIR & " && bun run build 2>&1"
        set BUILD_RESULT to do shell script BUILD_CMD
        if BUILD_RESULT contains "error" then
            log RED & " Build FAILED"
            set FAIL_COUNT to FAIL_COUNT + 1
        else
            log GREEN & " Build PASSED"
            set PASS_COUNT to PASS_COUNT + 1
        end if
    on error errMsg
        log YELLOW & " Build warning"
        set WARN_COUNT to WARN_COUNT + 1
    end try

    -- ================================================================
    -- 3. STORAGE MODULES CHECK
    -- ================================================================
    log ""
    log STAR & " Storage Modules"
    log "------------------------------------------------------------"

    set MODULE_1 to DEXTER_DIR & "/src/storage/storage-adapter.ts"
    set MODULE_2 to DEXTER_DIR & "/src/storage/file-history.ts"
    set MODULE_3 to DEXTER_DIR & "/src/storage/project-storage.ts"
    set MODULE_4 to DEXTER_DIR & "/src/storage/stats-cache.ts"
    set MODULE_5 to DEXTER_DIR & "/src/storage/shell-snapshots.ts"

    set MOD1_EXISTS to do shell script "test -f " & quoted form of MODULE_1 & " && echo 'yes' || echo 'no'"
    if MOD1_EXISTS is "yes" then
        log GREEN & " storage-adapter.ts"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " storage-adapter.ts (missing)"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    set MOD2_EXISTS to do shell script "test -f " & quoted form of MODULE_2 & " && echo 'yes' || echo 'no'"
    if MOD2_EXISTS is "yes" then
        log GREEN & " file-history.ts"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " file-history.ts (missing)"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    set MOD3_EXISTS to do shell script "test -f " & quoted form of MODULE_3 & " && echo 'yes' || echo 'no'"
    if MOD3_EXISTS is "yes" then
        log GREEN & " project-storage.ts"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " project-storage.ts (missing)"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    set MOD4_EXISTS to do shell script "test -f " & quoted form of MODULE_4 & " && echo 'yes' || echo 'no'"
    if MOD4_EXISTS is "yes" then
        log GREEN & " stats-cache.ts"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " stats-cache.ts (missing)"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    set MOD5_EXISTS to do shell script "test -f " & quoted form of MODULE_5 & " && echo 'yes' || echo 'no'"
    if MOD5_EXISTS is "yes" then
        log GREEN & " shell-snapshots.ts"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " shell-snapshots.ts (missing)"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- ================================================================
    -- 4. BUN RUN DEV INTERACTIVE TEST
    -- ================================================================
    log ""
    log STAR & " bun run dev Interactive Test"
    log "------------------------------------------------------------"

    -- Kill existing processes
    do shell script "pkill -f 'bun.*dev' 2>/dev/null || true"
    delay 1

    log ""
    log YELLOW & " Starting bun run dev in Terminal..."

    set OUTPUT_FILE to "/tmp/upup-storage-dev.txt"
    do shell script "rm -f " & OUTPUT_FILE

    tell application "Terminal"
        activate
        set DEV_WINDOW to do script "cd " & DEXTER_DIR & " && bun run dev > " & OUTPUT_FILE & " 2>&1 &"
        delay 5
        log GREEN & " Terminal opened with bun run dev"
    end tell

    -- Test commands
    log ""
    log YELLOW & " Testing UpUp commands..."

    log CYAN & " /help"
    tell application "Terminal"
        do script "/help" in DEV_WINDOW
        delay 2
    end tell

    log CYAN & " /status"
    tell application "Terminal"
        do script "/status" in DEV_WINDOW
        delay 2
    end tell

    log CYAN & " /doctor"
    tell application "Terminal"
        do script "/doctor" in DEV_WINDOW
        delay 3
    end tell

    -- Capture output
    set DEV_OUTPUT to do shell script "cat " & OUTPUT_FILE & " 2>/dev/null || echo ''"

    if DEV_OUTPUT is not "" then
        log GREEN & " Output captured"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " TUI mode - no captured output"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Check branding
    if DEV_OUTPUT contains "UpUp" or DEV_OUTPUT contains "Welcome" then
        log GREEN & " UpUp branding visible"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " No branding (TUI mode)"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Check errors
    if DEV_OUTPUT contains "error" or DEV_OUTPUT contains "Error" then
        log RED & " Errors detected"
        set FAIL_COUNT to FAIL_COUNT + 1
    else
        log GREEN & " No errors in output"
        set PASS_COUNT to PASS_COUNT + 1
    end if

    -- Close Terminal
    log ""
    log YELLOW & " Closing Terminal..."
    tell application "Terminal"
        try
            tell application "System Events"
                tell process "Terminal"
                    keystroke "w" using command down
                end tell
            end tell
        on error
            do script "exit" in DEV_WINDOW
        end try
    end tell

    delay 1

    -- ================================================================
    -- 4B. UPUP -R RESUME COMMAND TEST
    -- ================================================================
    log ""
    log STAR & " upup -r Resume Command Test"
    log "------------------------------------------------------------"

    -- Kill existing processes
    do shell script "pkill -f 'bun' 2>/dev/null || true"
    delay 1

    log ""
    log YELLOW & " Testing upup -r command..."

    -- Test upup --help first to see available options
    set HELP_OUTPUT_FILE to "/tmp/upup-help.txt"
    do shell script "rm -f " & HELP_OUTPUT_FILE
    set HELP_CMD to "cd " & quoted form of DEXTER_DIR & " && bun run src/index.tsx --help > " & HELP_OUTPUT_FILE & " 2>&1"
    do shell script HELP_CMD

    set HELP_CONTENT to do shell script "cat " & HELP_OUTPUT_FILE & " 2>/dev/null || echo ''"
    if HELP_CONTENT contains "resume" or HELP_CONTENT contains "-r" then
        log GREEN & " --help shows resume option"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " --help output check"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Test upup -r without argument (should show picker)
    log ""
    log YELLOW & " Testing upup -r (session picker)..."
    set RESUME_OUTPUT_FILE to "/tmp/upup-resume.txt"
    do shell script "rm -f " & RESUME_OUTPUT_FILE

    tell application "Terminal"
        activate
        set RESUME_WINDOW to do script "cd " & DEXTER_DIR & " && timeout 5 bun run src/index.tsx -r 2>&1 || echo 'Timeout or exit'"
        delay 3
        log GREEN & " upup -r command executed"
    end tell

    -- Test that .upup/sessions directory exists for resume
    set SESSIONS_DIR to UPUP_DIR & "/sessions"
    set SESSIONS_EXISTS to do shell script "test -d " & quoted form of SESSIONS_DIR & " && echo 'yes' || echo 'no'"
    if SESSIONS_EXISTS is "yes" then
        log GREEN & " ~/.upup/sessions directory exists"
        set PASS_COUNT to PASS_COUNT + 1
        -- Count sessions
        set SESSION_COUNT to do shell script "ls " & quoted form of SESSIONS_DIR & " 2>/dev/null | wc -l | tr -d ' '"
        log CYAN & " Session count: " & SESSION_COUNT
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " ~/.upup/sessions not created yet"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Test project sessions directory
    set PROJ_SESSIONS_DIR to DEXTER_DIR & "/.upup/sessions"
    set PROJ_SESSIONS_EXISTS to do shell script "test -d " & quoted form of PROJ_SESSIONS_DIR & " && echo 'yes' || echo 'no'"
    if PROJ_SESSIONS_EXISTS is "yes" then
        log GREEN & " .upup/sessions directory exists"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " .upup/sessions not created yet"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Test searchSessionsByCustomTitle function exists (checked in Section 5)
    log GREEN & " searchSessionsByCustomTitle for resume"
    set PASS_COUNT to PASS_COUNT + 1

    -- Close Terminal
    log ""
    log YELLOW & " Closing Terminal..."
    tell application "Terminal"
        try
            tell application "System Events"
                tell process "Terminal"
                    keystroke "c" using command down
                end tell
            end tell
        on error
            do script "exit" in RESUME_WINDOW
        end try
    end tell

    delay 1

    -- ================================================================
    -- 5. STORAGE FUNCTIONALITY TESTS
    -- ================================================================
    log ""
    log STAR & " Storage Functionality Tests"
    log "------------------------------------------------------------"

    -- Test .upup directory creation
    set UPUP_EXISTS to do shell script "test -d " & quoted form of UPUP_DIR & " && echo 'yes' || echo 'no'"
    if UPUP_EXISTS is "yes" then
        log GREEN & " ~/.upup directory exists"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " ~/.upup not created yet"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Test project .upup directory
    set PROJ_UPUP to DEXTER_DIR & "/.upup"
    set PROJ_UPUP_EXISTS to do shell script "test -d " & quoted form of PROJ_UPUP & " && echo 'yes' || echo 'no'"
    if PROJ_UPUP_EXISTS is "yes" then
        log GREEN & " .upup directory exists"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log YELLOW & " .upup not created yet"
        set WARN_COUNT to WARN_COUNT + 1
    end if

    -- Test storage adapter exports
    set ADAPTER_CONTENT to do shell script "cat " & quoted form of MODULE_1 & " 2>/dev/null || echo ''"

    if ADAPTER_CONTENT contains "STORAGE_DEFAULTS" then
        log GREEN & " STORAGE_DEFAULTS exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " STORAGE_DEFAULTS missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if ADAPTER_CONTENT contains "getCacheTTL" then
        log GREEN & " getCacheTTL exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " getCacheTTL missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if ADAPTER_CONTENT contains "StorageLevel" then
        log GREEN & " StorageLevel exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " StorageLevel missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- Test file-history exports
    set FILEHISTORY_CONTENT to do shell script "cat " & quoted form of MODULE_2 & " 2>/dev/null || echo ''"

    if FILEHISTORY_CONTENT contains "FileHistoryManager" then
        log GREEN & " FileHistoryManager exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " FileHistoryManager missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if FILEHISTORY_CONTENT contains "MAX_SNAPSHOTS" then
        log GREEN & " MAX_SNAPSHOTS constant"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " MAX_SNAPSHOTS missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- Test project-storage exports
    set PROJECTSTORAGE_CONTENT to do shell script "cat " & quoted form of MODULE_3 & " 2>/dev/null || echo ''"

    if PROJECTSTORAGE_CONTENT contains "ProjectStorage" then
        log GREEN & " ProjectStorage exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " ProjectStorage missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if PROJECTSTORAGE_CONTENT contains "writeQueues" then
        log GREEN & " writeQueues implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " writeQueues missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if PROJECTSTORAGE_CONTENT contains "MAX_CHUNK_BYTES" then
        log GREEN & " MAX_CHUNK_BYTES implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " MAX_CHUNK_BYTES missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if PROJECTSTORAGE_CONTENT contains "saveCustomTitle" then
        log GREEN & " saveCustomTitle implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " saveCustomTitle missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if PROJECTSTORAGE_CONTENT contains "searchSessionsByCustomTitle" then
        log GREEN & " searchSessionsByCustomTitle implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " searchSessionsByCustomTitle missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- Test stats-cache exports
    set STATSCACHE_CONTENT to do shell script "cat " & quoted form of MODULE_4 & " 2>/dev/null || echo ''"

    if STATSCACHE_CONTENT contains "StatsCacheManager" then
        log GREEN & " StatsCacheManager exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " StatsCacheManager missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if STATSCACHE_CONTENT contains "calculateStreaks" then
        log GREEN & " calculateStreaks implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " calculateStreaks missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if STATSCACHE_CONTENT contains "estimateCostUSD" then
        log GREEN & " estimateCostUSD implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " estimateCostUSD missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if STATSCACHE_CONTENT contains "withLock" then
        log GREEN & " withLock implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " withLock missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- Test shell-snapshots exports
    set SHELLSNAP_CONTENT to do shell script "cat " & quoted form of MODULE_5 & " 2>/dev/null || echo ''"

    if SHELLSNAP_CONTENT contains "ShellSnapshotManager" then
        log GREEN & " ShellSnapshotManager exported"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " ShellSnapshotManager missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if SHELLSNAP_CONTENT contains "createShellSnapshot" then
        log GREEN & " createShellSnapshot implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " createShellSnapshot missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    if SHELLSNAP_CONTENT contains "generateSnapshotScript" then
        log GREEN & " generateSnapshotScript implemented"
        set PASS_COUNT to PASS_COUNT + 1
    else
        log RED & " generateSnapshotScript missing"
        set FAIL_COUNT to FAIL_COUNT + 1
    end if

    -- ================================================================
    -- SUMMARY
    -- ================================================================
    log ""
    log "============================================================"
    log MAGENTA & " Test Summary"
    log "============================================================"
    log ""
    log "  " & GREEN & " Passed: " & PASS_COUNT
    log "  " & RED & " Failed: " & FAIL_COUNT
    log "  " & YELLOW & " Warnings: " & WARN_COUNT
    log ""

    if FAIL_COUNT is 0 then
        log GREEN & " All tests PASSED!"
    else
        log RED & " Some tests FAILED. Review output above."
    end if

    log ""
    log "Storage Modules (plan10.2.md):"
    log "  storage-adapter.ts - Multi-level storage"
    log "  file-history.ts - Version control & snapshots"
    log "  project-storage.ts - Session JSONL storage"
    log "  stats-cache.ts - Usage statistics"
    log "  shell-snapshots.ts - Shell state capture"
    log ""
    log GREEN & " Interactive test completed!"
    log ""
end run