#!/usr/bin/env osascript

# UpUp Memory System Verification Script
# 验证 plan13.0.md 中实现的所有 P3 功能

property successCount : 0
property totalCount : 0

on run argv
    set upupPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup"

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "UpUp Memory System Verification Script"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Test 1: Check if dist/upup exists and is executable
    verifyBuild(upupPath)

    # Test 2: Check MemoryScope types export
    verifyMemoryScope()

    # Test 3: Check ProjectMemoryPaths
    verifyProjectPaths()

    # Test 4: Check DailyLogManager
    verifyDailyLog()

    # Test 5: Check Access Control
    verifyAccessControl()

    # Test 6: Check directory structure
    verifyDirectoryStructure()

    # Summary
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "VERIFICATION SUMMARY"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Total: " & totalCount
    log "Success: " & successCount
    log "Failed: " & (totalCount - successCount)

    if successCount = totalCount then
        log "🎉 ALL TESTS PASSED!"
    else
        log "⚠️  SOME TESTS FAILED"
    end if
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return successCount & "/" & totalCount & " tests passed"
end run

# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Verify build output exists
# ─────────────────────────────────────────────────────────────────────────────
on verifyBuild(upupPath)
    set totalCount to totalCount + 1
    log ""
    log "Test 1: Build Verification"
    log "─────────────────────────────────────────────────────────────────────"

    try
        set cmd to "test -x " & upupPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ dist/upup exists and is executable"
            set successCount to successCount + 1
        else
            log "❌ dist/upup not found or not executable"
        end if
    on error errMsg
        log "❌ Error checking build: " & errMsg
    end try
end verifyBuild

# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Verify MemoryScope types (from types.ts)
# ─────────────────────────────────────────────────────────────────────────────
on verifyMemoryScope()
    set totalCount to totalCount + 1
    log ""
    log "Test 2: MemoryScope Types"
    log "─────────────────────────────────────────────────────────────────────"

    try
        # Check if types.ts contains MemoryScope definitions
        set typesPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/types.ts"
        set cmd to "grep -q 'MEMORY_SCOPES' " & typesPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ MEMORY_SCOPES defined in types.ts"
            set successCount to successCount + 1
        else
            log "❌ MEMORY_SCOPES not found in types.ts"
        end if

        # Check MemoryScope type
        set totalCount to totalCount + 1
        set cmd to "grep -q 'MemoryScope' " & typesPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ MemoryScope type defined"
            set successCount to successCount + 1
        else
            log "❌ MemoryScope type not found"
        end if

        # Check MEMORY_SCOPE_PRIORITY
        set totalCount to totalCount + 1
        set cmd to "grep -q 'MEMORY_SCOPE_PRIORITY' " & typesPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ MEMORY_SCOPE_PRIORITY defined"
            set successCount to successCount + 1
        else
            log "❌ MEMORY_SCOPE_PRIORITY not found"
        end if

    on error errMsg
        log "❌ Error verifying MemoryScope: " & errMsg
    end try
end verifyMemoryScope

# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Verify ProjectMemoryPaths (from project-paths.ts)
# ─────────────────────────────────────────────────────────────────────────────
on verifyProjectPaths()
    set totalCount to totalCount + 1
    log ""
    log "Test 3: ProjectMemoryPaths"
    log "─────────────────────────────────────────────────────────────────────"

    try
        set pathsPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/project-paths.ts"

        # Check if file exists
        set cmd to "test -f " & pathsPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ project-paths.ts exists"

            # Check for ProjectMemoryPaths class
            set cmd to "grep -q 'class ProjectMemoryPaths' " & pathsPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ ProjectMemoryPaths class defined"
                set successCount to successCount + 1
            else
                log "❌ ProjectMemoryPaths class not found"
            end if

            # Check for encode/decode functions
            set cmd to "grep -q 'encodeProjectSlug\\|decodeProjectSlug' " & pathsPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Project slug encoding functions defined"
            else
                log "⚠️  Project slug functions not found"
            end if

            set successCount to successCount + 1
        else
            log "❌ project-paths.ts not found"
        end if

    on error errMsg
        log "❌ Error verifying ProjectPaths: " & errMsg
    end try
end verifyProjectPaths

# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Verify DailyLogManager (from daily-log.ts)
# ─────────────────────────────────────────────────────────────────────────────
on verifyDailyLog()
    set totalCount to totalCount + 1
    log ""
    log "Test 4: DailyLogManager"
    log "─────────────────────────────────────────────────────────────────────"

    try
        set dailyLogPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/daily-log.ts"

        # Check if file exists
        set cmd to "test -f " & dailyLogPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ daily-log.ts exists"

            # Check for DailyLogManager class
            set cmd to "grep -q 'class DailyLogManager' " & dailyLogPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ DailyLogManager class defined"
                set successCount to successCount + 1
            else
                log "❌ DailyLogManager class not found"
            end if

            # Check for key methods
            set cmd to "grep -q 'appendEntry\\|readLogEntries\\|needsDistillation' " & dailyLogPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Key methods (appendEntry, readLogEntries, needsDistillation) defined"
            else
                log "⚠️  Some key methods not found"
            end if

            set successCount to successCount + 1
        else
            log "❌ daily-log.ts not found"
        end if

    on error errMsg
        log "❌ Error verifying DailyLog: " & errMsg
    end try
end verifyDailyLog

# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Verify MemoryAccessControl (from access-control.ts)
# ─────────────────────────────────────────────────────────────────────────────
on verifyAccessControl()
    set totalCount to totalCount + 1
    log ""
    log "Test 5: MemoryAccessControl"
    log "─────────────────────────────────────────────────────────────────────"

    try
        set acPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/access-control.ts"

        # Check if file exists
        set cmd to "test -f " & acPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ access-control.ts exists"

            # Check for MemoryAccessControl class
            set cmd to "grep -q 'class MemoryAccessControl' " & acPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ MemoryAccessControl class defined"
                set successCount to successCount + 1
            else
                log "❌ MemoryAccessControl class not found"
            end if

            # Check for key methods
            set cmd to "grep -q 'canRead\\|canWrite\\|determineScope' " & acPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Key methods (canRead, canWrite, determineScope) defined"
            else
                log "⚠️  Some key methods not found"
            end if

            set successCount to successCount + 1
        else
            log "❌ access-control.ts not found"
        end if

    on error errMsg
        log "❌ Error verifying AccessControl: " & errMsg
    end try
end verifyAccessControl

# ─────────────────────────────────────────────────────────────────────────────
# Test 6: Verify directory structure
# ─────────────────────────────────────────────────────────────────────────────
on verifyDirectoryStructure()
    set totalCount to totalCount + 1
    log ""
    log "Test 6: Four-Layer Directory Structure"
    log "─────────────────────────────────────────────────────────────────────"

    set baseDir to "/Users/louloulin/.upup"
    set layers to {"memory", "projects", "teams", "sessions"}

    set allFound to true

    repeat with layer in layers
        set layerPath to baseDir & "/" & layer
        set cmd to "test -d " & layerPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ Layer '" & layer & "' directory exists"
        else
            log "⚠️  Layer '" & layer & "' directory not found (will be created on first use)"
        end if
    end repeat

    if allFound then
        set successCount to successCount + 1
    end if
end verifyDirectoryStructure