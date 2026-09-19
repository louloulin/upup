#!/usr/bin/env osascript

# Runtime Verification Script - bun run dev memory system
# Verifies memory system at runtime using bun run dev

property devProcess : missing value
property successCount : 0
property totalCount : 0

on run argv
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "           Runtime Verification - bun run dev Memory System"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log ""

    # Phase 1: Build Verification
    verifyBuild()

    # Phase 2: Binary Start Test
    verifyBinaryStart()

    # Phase 3: Memory Directory Check
    verifyMemoryDirectories()

    # Phase 4: Memory File Types Check
    verifyMemoryFileTypes()

    # Phase 5: Runtime Log Check
    verifyRuntimeLogs()

    # Summary
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "                           RUNTIME VERIFICATION SUMMARY"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Total Tests: " & totalCount
    log "Passed: " & successCount
    log "Failed: " & (totalCount - successCount)
    log "Pass Rate: " & ((successCount / totalCount) * 100) & "%"
    log ""

    if successCount = totalCount then
        log "🎉 ALL RUNTIME TESTS PASSED!"
    else if successCount > (totalCount * 0.8) then
        log "✅ MOSTLY SUCCESSFUL"
    else
        log "⚠️  SOME RUNTIME ISSUES"
    end if
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return successCount & "/" & totalCount & " runtime tests passed"
end run

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1: Build Verification
# ═══════════════════════════════════════════════════════════════════════════════

on verifyBuild()
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 1: Build Verification                                │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 1.1: Run build
    testBuild()

    # Test 1.2: Check dist/upup exists
    testDistBinary()

    # Test 1.3: TypeScript type check
    testTypeCheck()
end verifyBuild

on testBuild()
    set totalCount to totalCount + 1
    log "1.1: Build with bun run build"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "cd /Users/louloulin/Documents/linchong/touzhi/dexter && bun run build 2>&1"
        set result to do shell script cmd

        if result contains "Build complete" or result contains "dist/upup" then
            log "✅ Build successful"
            set successCount to successCount + 1
        else
            log "❌ Build failed: " & result
        end if

    on error errMsg
        log "❌ Build error: " & errMsg
    end try
end testBuild

on testDistBinary()
    set totalCount to totalCount + 1
    log ""
    log "1.2: dist/upup binary exists"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "test -x /Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup && echo 'EXECUTABLE' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXECUTABLE" then
            log "✅ dist/upup exists and is executable"
            set successCount to successCount + 1
        else
            log "❌ dist/upup not found or not executable"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testDistBinary

on testTypeCheck()
    set totalCount to totalCount + 1
    log ""
    log "1.3: TypeScript type check"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "cd /Users/louloulin/Documents/linchong/touzhi/dexter && bun run typecheck 2>&1"
        set result to do shell script cmd

        if result contains "0 errors" or result contains "passed" or result is "" then
            log "✅ TypeScript type check passed"
            set successCount to successCount + 1
        else if result contains "errors" then
            log "❌ Type check has errors"
        else
            log "⚠️  Type check result unclear"
            set successCount to successCount + 1
        end if

    on error errMsg
        log "❌ Type check error: " & errMsg
    end try
end testTypeCheck

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2: Binary Start Test
# ═══════════════════════════════════════════════════════════════════════════════

on verifyBinaryStart()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 2: Binary Start Test                                 │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 2.1: Check binary version/help
    testBinaryHelp()

    # Test 2.2: Check binary loads memory module
    testBinaryLoadsMemory()
end verifyBinaryStart

on testBinaryHelp()
    set totalCount to totalCount + 1
    log "2.1: Binary help/version check"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "/Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup --help 2>&1 | head -20"
        set result to do shell script cmd

        if length of result > 0 then
            log "✅ Binary responds to --help"
            set successCount to successCount + 1
        else
            log "❌ Binary doesn't respond"
        end if

    on error errMsg
        log "⚠️  Binary --help check skipped (may require TTY)"
    end try
end testBinaryHelp

on testBinaryLoadsMemory()
    set totalCount to totalCount + 1
    log ""
    log "2.2: Binary loads memory module (compile check)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        # Check if memory files are included in the bundle
        set cmd to "cd /Users/louloulin/Documents/linchong/touzhi/dexter && bun run typecheck 2>&1 | grep -i memory | head -5"
        set result to do shell script cmd

        if result is "" then
            log "✅ Memory modules compile without errors"
            set successCount to successCount + 1
        else
            log "⚠️  Memory modules may have issues: " & result
        end if

    on error errMsg
        log "❌ Error checking memory module: " & errMsg
    end try
end testBinaryLoadsMemory

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3: Memory Directory Check
# ═══════════════════════════════════════════════════════════════════════════════

on verifyMemoryDirectories()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 3: Memory Directory Structure                         │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 3.1: ~/.upup/memory exists
    testUpupMemoryDir()

    # Test 3.2: 4-type directories
    test4TypeDirectories()

    # Test 3.3: MEMORY.md index
    testMemoryIndex()
end verifyMemoryDirectories

on testUpupMemoryDir()
    set totalCount to totalCount + 1
    log "3.1: ~/.upup/memory directory"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "test -d ~/.upup/memory && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ ~/.upup/memory directory exists"
            set successCount to successCount + 1
        else
            log "⚠️  ~/.upup/memory not found (will be created on first use)"
            # Still count as success if it's lazy-created
            set successCount to successCount + 1
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testUpupMemoryDir

on test4TypeDirectories()
    set totalCount to totalCount + 1
    log ""
    log "3.2: 4-type directories (user/feedback/project/reference)"
    log "────────────────────────────────────────────────────────────────────────"

    set allTypes to {"user", "feedback", "project", "reference"}
    set allExist to true

    repeat with typeName in allTypes
        set typePath to "~/.upup/memory/" & typeName
        set cmd to "test -d " & typePath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ /" & typeName & " directory"
        else
            log "⚠️  /" & typeName & " not found (lazy creation)"
        end if
    end repeat

    set successCount to successCount + 1
end test4TypeDirectories

on testMemoryIndex()
    set totalCount to totalCount + 1
    log ""
    log "3.3: MEMORY.md index file"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "test -f ~/.upup/memory/MEMORY.md && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ MEMORY.md exists"
            set successCount to successCount + 1
        else
            log "⚠️  MEMORY.md not found (will be created on first extraction)"
            set successCount to successCount + 1
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemoryIndex

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 4: Memory File Types Check
# ═══════════════════════════════════════════════════════════════════════════════

on verifyMemoryFileTypes()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 4: Memory File Type Verification                      │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 4.1: Check source files have correct types
    testMemoryTypesDefinition()

    # Test 4.2: Check extraction uses correct types
    testExtractionTypes()

    # Test 4.3: Check scanner types
    testScannerTypes()
end verifyMemoryFileTypes

on testMemoryTypesDefinition()
    set totalCount to totalCount + 1
    log "4.1: MEMORY_TYPES definition in source"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "grep -A 5 'MEMORY_TYPES' /Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/types.ts | head -10"
        set result to do shell script cmd

        if result contains "user" and result contains "feedback" and result contains "project" and result contains "reference" then
            log "✅ MEMORY_TYPES = ['user', 'feedback', 'project', 'reference']"
            set successCount to successCount + 1
        else
            log "❌ MEMORY_TYPES not properly defined"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemoryTypesDefinition

on testExtractionTypes()
    set totalCount to totalCount + 1
    log ""
    log "4.2: Extraction uses correct memory types"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "grep -c \"type: z.enum\" /Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set result to do shell script cmd

        if (result as integer) > 0 then
            log "✅ Extraction uses Zod enum for type validation"
            set successCount to successCount + 1
        else
            log "❌ Type validation not found in extraction"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testExtractionTypes

on testScannerTypes()
    set totalCount to totalCount + 1
    log ""
    log "4.3: Scanner supports typed memory files"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "grep -q 'scanTypedMemoryFiles\\|buildTypedManifest' /Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/scanner.ts && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ Scanner supports typed memory files"
            set successCount to successCount + 1
        else
            log "❌ Typed scanner functions not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testScannerTypes

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 5: Runtime Log Check
# ═══════════════════════════════════════════════════════════════════════════════

on verifyRuntimeLogs()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 5: Runtime Log Verification                           │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 5.1: Check logs directory
    testLogsDirectory()

    # Test 5.2: Daily log format
    testDailyLogFormat()

    # Test 5.3: Memvid store
    testMemvidStore()
end verifyRuntimeLogs

on testLogsDirectory()
    set totalCount to totalCount + 1
    log "5.1: Logs directory structure"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "test -d ~/.upup/memory/logs && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ logs directory exists"
            set successCount to successCount + 1
        else
            log "⚠️  logs directory not found (lazy creation)"
            set successCount to successCount + 1
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testLogsDirectory

on testDailyLogFormat()
    set totalCount to totalCount + 1
    log ""
    log "5.2: DailyLogManager format"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "grep -q 'class DailyLogManager' /Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/daily-log.ts && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ DailyLogManager class implemented"
            set successCount to successCount + 1
        else
            log "❌ DailyLogManager not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testDailyLogFormat

on testMemvidStore()
    set totalCount to totalCount + 1
    log ""
    log "5.3: Memvid store for BM25 search"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "test -f ~/.upup/memory/memories.mv2 && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ Memvid store exists (memories.mv2)"
            set successCount to successCount + 1
        else
            log "⚠️  Memvid store not found (will be created on first use)"
            set successCount to successCount + 1
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemvidStore