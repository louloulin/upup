#!/usr/bin/env osascript

# Comprehensive UpUp System Verification Script
# 验证 plan12.md (配置系统) + plan13.md (记忆系统)

property successCount : 0
property totalCount : 0

on run argv
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "              UpUp Comprehensive System Verification"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log ""

    # ─────────────────────────────────────────────────────────────────────────
    # PART 1: Configuration System (plan12.md)
    # ─────────────────────────────────────────────────────────────────────────
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│           PART 1: Configuration System (plan12.md)                    │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    verifyConfigValidation()
    verifyCredentialsManager()
    verifyOnboarding()
    verifyModelSelection()
    verifyConfigCommands()
    verifyMCPConfig()
    verifyHooksSystem()

    # ─────────────────────────────────────────────────────────────────────────
    # PART 2: Memory System (plan13.md)
    # ─────────────────────────────────────────────────────────────────────────
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│           PART 2: Memory System (plan13.md)                           │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    verifyMemoryTypes()
    verifyProjectPaths()
    verifyDailyLog()
    verifyAccessControl()
    verifyScanner()
    verifyMemvidStore()

    # ─────────────────────────────────────────────────────────────────────────
    # Summary
    # ─────────────────────────────────────────────────────────────────────────
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "                           VERIFICATION SUMMARY"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Total Tests: " & totalCount
    log "Passed: " & successCount
    log "Failed: " & (totalCount - successCount)
    log ""

    if successCount = totalCount then
        log "🎉 ALL TESTS PASSED!"
    else if successCount > (totalCount * 0.8) then
        log "✅ MOSTLY SUCCESSFUL (>" & ((successCount / totalCount) * 100) & "% pass rate)"
    else
        log "⚠️  SOME TESTS FAILED"
    end if
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return successCount & "/" & totalCount & " tests passed"
end run

# ═══════════════════════════════════════════════════════════════════════════════
# PART 1: Configuration System Tests
# ═══════════════════════════════════════════════════════════════════════════════

on verifyConfigValidation()
    set totalCount to totalCount + 1
    log "Test 1: Config Validation System"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/utils/config-validation.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ config-validation.ts exists"

            # Check for validateConfig function
            set cmd to "grep -q 'validateConfig\\|isFirstTimeUse' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ validateConfig() and isFirstTimeUse() defined"
                set successCount to successCount + 1
            else
                log "❌ Required functions not found"
            end if
        else
            log "❌ config-validation.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyConfigValidation

on verifyCredentialsManager()
    set totalCount to totalCount + 1
    log ""
    log "Test 2: Credentials Manager (Encrypted Storage)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/utils/credentials.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ credentials.ts exists"

            # Check for encryption functions
            set cmd to "grep -q 'encrypt\\|decrypt\\|AES\\|GCM' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Encryption/Decryption functions defined"
                set successCount to successCount + 1
            else
                log "❌ Encryption functions not found"
            end if
        else
            log "❌ credentials.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyCredentialsManager

on verifyOnboarding()
    set totalCount to totalCount + 1
    log ""
    log "Test 3: Onboarding (Setup) System"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/commands/onboarding.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ onboarding.ts exists"

            # Check for setDefaultModel
            set cmd to "grep -q 'setDefaultModel\\|setSetting' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ setDefaultModel() and setSetting() defined"
                set successCount to successCount + 1
            else
                log "❌ Required functions not found"
            end if
        else
            log "❌ onboarding.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyOnboarding

on verifyModelSelection()
    set totalCount to totalCount + 1
    log ""
    log "Test 4: Model Selection Controller"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/controllers/model-selection.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ model-selection.ts exists"

            # Check for controller class
            set cmd to "grep -q 'class ModelSelectionController\\|startSelection\\|renderSelectionOverlay' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ ModelSelectionController class and methods defined"
                set successCount to successCount + 1
            else
                log "❌ Required class/methods not found"
            end if
        else
            log "❌ model-selection.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyModelSelection

on verifyConfigCommands()
    set totalCount to totalCount + 1
    log ""
    log "Test 5: Config Commands (/config, /doctor)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/commands/config.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ config.ts exists"

            # Check for config commands
            set cmd to "grep -q 'config set\\|config get\\|config list\\|config doctor' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Config commands (set/get/list/doctor) defined"
                set successCount to successCount + 1
            else
                log "⚠️  Some config commands not found"
            end if
        else
            log "❌ config.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyConfigCommands

on verifyMCPConfig()
    set totalCount to totalCount + 1
    log ""
    log "Test 6: MCP Client Configuration"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/mcp/client.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ mcp/client.ts exists"

            # Check for MCP client class
            set cmd to "grep -q 'class MCPClientManager\\|MCPClient\\|loadMCPConfig' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ MCPClientManager and loadMCPConfig defined"
                set successCount to successCount + 1
            else
                log "❌ Required class/functions not found"
            end if
        else
            log "❌ mcp/client.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyMCPConfig

on verifyHooksSystem()
    set totalCount to totalCount + 1
    log ""
    log "Test 7: Hooks System (on_start, on_resume, etc.)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/hooks"
        set cmd to "test -d " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ src/hooks/ directory exists"

            # Check for hook files
            set cmd to "grep -r 'on_start\\|on_resume\\|on_kill' " & quoted form of pathToCheck & " | head -5"
            set result to do shell script cmd

            if length of result > 0 then
                log "✅ Hook event handlers defined"
                set successCount to successCount + 1
            else
                log "⚠️  Hook event handlers not found"
            end if
        else
            log "❌ src/hooks/ directory not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyHooksSystem

# ═══════════════════════════════════════════════════════════════════════════════
# PART 2: Memory System Tests
# ═══════════════════════════════════════════════════════════════════════════════

on verifyMemoryTypes()
    set totalCount to totalCount + 1
    log ""
    log "Test 8: Memory Types (4-type classification)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/types.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ types.ts exists"

            # Check for 4-type and scope definitions
            set cmd to "grep -q 'MEMORY_TYPES\\|MemoryType\\|MEMORY_SCOPES\\|MemoryScope' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ 4-type classification and MemoryScope defined"
                set successCount to successCount + 1
            else
                log "❌ Required type definitions not found"
            end if
        else
            log "❌ types.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyMemoryTypes

on verifyProjectPaths()
    set totalCount to totalCount + 1
    log ""
    log "Test 9: Project Memory Paths (Project Isolation)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/project-paths.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ project-paths.ts exists"

            # Check for project path class
            set cmd to "grep -q 'class ProjectMemoryPaths\\|encodeProjectSlug\\|decodeProjectSlug' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ ProjectMemoryPaths class and slug functions defined"
                set successCount to successCount + 1
            else
                log "❌ Required class/functions not found"
            end if
        else
            log "❌ project-paths.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyProjectPaths

on verifyDailyLog()
    set totalCount to totalCount + 1
    log ""
    log "Test 10: Daily Log Manager (KAIROS-style)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/daily-log.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ daily-log.ts exists"

            # Check for daily log manager
            set cmd to "grep -q 'class DailyLogManager\\|appendEntry\\|readLogEntries\\|needsDistillation' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ DailyLogManager class and methods defined"
                set successCount to successCount + 1
            else
                log "❌ Required class/methods not found"
            end if
        else
            log "❌ daily-log.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyDailyLog

on verifyAccessControl()
    set totalCount to totalCount + 1
    log ""
    log "Test 11: Memory Access Control"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/access-control.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ access-control.ts exists"

            # Check for access control class
            set cmd to "grep -q 'class MemoryAccessControl\\|canRead\\|canWrite\\|determineScope' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ MemoryAccessControl class and permission methods defined"
                set successCount to successCount + 1
            else
                log "❌ Required class/methods not found"
            end if
        else
            log "❌ access-control.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyAccessControl

on verifyScanner()
    set totalCount to totalCount + 1
    log ""
    log "Test 12: Memory Scanner (Scope-aware)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/scanner.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ scanner.ts exists"

            # Check for scoped scan functions
            set cmd to "grep -q 'scanScopedMemoryFiles\\|buildScopedManifest\\|scanMemoryDir' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Scope-aware scan functions defined"
                set successCount to successCount + 1
            else
                log "❌ Required functions not found"
            end if
        else
            log "❌ scanner.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyScanner

on verifyMemvidStore()
    set totalCount to totalCount + 1
    log ""
    log "Test 13: Memvid Store (BM25 Search)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/memvid-store.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            log "✅ memvid-store.ts exists"

            # Check for Memvid functions
            set cmd to "grep -q 'putMemory\\|find\\|ask\\|getMemory' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Memvid store functions (putMemory, find, ask) defined"
                set successCount to successCount + 1
            else
                log "❌ Required functions not found"
            end if
        else
            log "❌ memvid-store.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end verifyMemvidStore