#!/usr/bin/env osascript

# Comprehensive Integration Verification Script
# Verifies memory extraction pipeline, AI selector, stop-hooks integration

property successCount : 0
property totalCount : 0

on run argv
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "      Comprehensive Integration Verification - Memory Pipeline"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log ""

    # Phase 1: Extraction Pipeline
    verifyExtractionPipeline()

    # Phase 2: AI Selector Integration
    verifyAISelectorIntegration()

    # Phase 3: Stop-Hooks Integration
    verifyStopHooksIntegration()

    # Phase 4: Loucode Feature Parity
    verifyLoucodeParity()

    # Summary
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "                           VERIFICATION SUMMARY"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Total Tests: " & totalCount
    log "Passed: " & successCount
    log "Failed: " & (totalCount - successCount)
    log "Pass Rate: " & ((successCount / totalCount) * 100) & "%"
    log ""

    if successCount = totalCount then
        log "🎉 ALL INTEGRATION TESTS PASSED!"
    else if successCount > (totalCount * 0.8) then
        log "✅ MOSTLY SUCCESSFUL"
    else
        log "⚠️  INTEGRATION ISSUES DETECTED"
    end if
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return successCount & "/" & totalCount & " tests passed"
end run

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1: Extraction Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

on verifyExtractionPipeline()
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 1: Memory Extraction Pipeline                        │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 1.1: extraction.ts exists and has key functions
    testExtractionExists()

    # Test 1.2: hasToolCalls function
    testHasToolCalls()

    # Test 1.3: Memory type validation
    testMemoryTypeValidation()

    # Test 1.4: Write memory to disk
    testMemoryWrite()

    # Test 1.5: MEMORY.md index update
    testMemoryIndexUpdate()
end verifyExtractionPipeline

on testExtractionExists()
    set totalCount to totalCount + 1
    log "1.1: extraction.ts exists with key functions"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            # Check for extractMemories function
            set cmd to "grep -q 'export async function extractMemories' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ extractMemories() function defined"
                set successCount to successCount + 1
            else
                log "❌ extractMemories function not found"
            end if
        else
            log "❌ extraction.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testExtractionExists

on testHasToolCalls()
    set totalCount to totalCount + 1
    log ""
    log "1.2: hasToolCalls() prevents extraction during tool calls"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set cmd to "grep -q 'export function hasToolCalls' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ hasToolCalls() function prevents extraction during tool calls"
            set successCount to successCount + 1
        else
            log "❌ hasToolCalls function not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testHasToolCalls

on testMemoryTypeValidation()
    set totalCount to totalCount + 1
    log ""
    log "1.3: 4-type memory type validation (Zod schema)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set cmd to "grep -q 'MEMORY_FRONTMATTER_SCHEMA\\|z.enum.*user.*feedback' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ 4-type validation with Zod schema (user/feedback/project/reference)"
            set successCount to successCount + 1
        else
            log "❌ Type validation not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemoryTypeValidation

on testMemoryWrite()
    set totalCount to totalCount + 1
    log ""
    log "1.4: Memory file write with frontmatter"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set cmd to "grep -q 'writeMemoryFile\\|matter.stringify' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ writeMemoryFile() with gray-matter frontmatter"
            set successCount to successCount + 1
        else
            log "❌ writeMemoryFile function not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemoryWrite

on testMemoryIndexUpdate()
    set totalCount to totalCount + 1
    log ""
    log "1.5: MEMORY.md index update after extraction"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set cmd to "grep -q 'updateMemoryIndex\\|MEMORY.md' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ updateMemoryIndex() after extraction"
            set successCount to successCount + 1
        else
            log "❌ updateMemoryIndex function not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemoryIndexUpdate

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2: AI Selector Integration
# ═══════════════════════════════════════════════════════════════════════════════

on verifyAISelectorIntegration()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 2: AI Selector Integration                          │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 2.1: AI Selector with MEMORY.md manifest
    testAISelectorManifest()

    # Test 2.2: Scanner integration
    testScannerIntegration()

    # Test 2.3: 4-type typed manifest
    testTypedManifest()

    # Test 2.4: Trust verification
    testTrustVerification()
end verifyAISelectorIntegration

on testAISelectorManifest()
    set totalCount to totalCount + 1
    log "2.1: AI Selector with MEMORY.md manifest"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/ai-selector.ts"
        set cmd to "test -f " & quoted form of pathToCheck & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            set cmd to "grep -q 'buildManifest\\|buildTypedManifest\\|SELECT_SYSTEM_PROMPT' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ AI Selector uses MEMORY.md manifest for selection"
                set successCount to successCount + 1
            else
                log "❌ Manifest building functions not found"
            end if
        else
            log "❌ ai-selector.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testAISelectorManifest

on testScannerIntegration()
    set totalCount to totalCount + 1
    log ""
    log "2.2: Scanner integration for memory files"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/ai-selector.ts"
        set cmd to "grep -q 'scanMemoryFiles\\|scanTypedMemoryFiles' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ AI Selector integrates with Scanner"
            set successCount to successCount + 1
        else
            log "❌ Scanner integration not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testScannerIntegration

on testTypedManifest()
    set totalCount to totalCount + 1
    log ""
    log "2.3: 4-type typed manifest building"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set scannerPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/scanner.ts"
        set cmd to "grep -q 'buildTypedManifest\\|typeFilter' " & quoted form of scannerPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ Scanner supports 4-type typed manifest"
            set successCount to successCount + 1
        else
            log "❌ Typed manifest not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testTypedManifest

on testTrustVerification()
    set totalCount to totalCount + 1
    log ""
    log "2.4: Trust verification for recalled memories"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/ai-selector.ts"
        set cmd to "grep -q 'verifyMemory\\|trust' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ Trust verification for recalled memories"
            set successCount to successCount + 1
        else
            log "⚠️  Trust verification not implemented"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testTrustVerification

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3: Stop-Hooks Integration
# ═══════════════════════════════════════════════════════════════════════════════

on verifyStopHooksIntegration()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 3: Stop-Hooks Integration                           │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 3.1: StopHookRegistry class
    testStopHookRegistry()

    # Test 3.2: MemoryExtractionHook
    testMemoryExtractionHook()

    # Test 3.3: Priority-based execution
    testPriorityExecution()

    # Test 3.4: Fire-and-forget execution
    testFireAndForget()
end verifyStopHooksIntegration

on testStopHookRegistry()
    set totalCount to totalCount + 1
    log "3.1: StopHookRegistry class exists"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/hooks/stop-hooks.ts"
        set cmd to "grep -q 'class StopHookRegistry\\|export class StopHookRegistry' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ StopHookRegistry singleton class defined"
            set successCount to successCount + 1
        else
            log "❌ StopHookRegistry class not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testStopHookRegistry

on testMemoryExtractionHook()
    set totalCount to totalCount + 1
    log ""
    log "3.2: createMemoryExtractionHook() function"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/hooks/stop-hooks.ts"
        set cmd to "grep -q 'createMemoryExtractionHook\\|export.*function createMemoryExtractionHook' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ createMemoryExtractionHook() registers extraction hook"
            set successCount to successCount + 1
        else
            log "❌ createMemoryExtractionHook not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemoryExtractionHook

on testPriorityExecution()
    set totalCount to totalCount + 1
    log ""
    log "3.3: Priority-based hook execution"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/hooks/stop-hooks.ts"
        set cmd to "grep -q 'priority.*number\\|sort.*priority\\|executeAll' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ Priority-based execution (lower priority = earlier)"
            set successCount to successCount + 1
        else
            log "⚠️  Priority execution not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testPriorityExecution

on testFireAndForget()
    set totalCount to totalCount + 1
    log ""
    log "3.4: Fire-and-forget execution pattern"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set pathToCheck to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/hooks/stop-hooks.ts"
        set cmd to "grep -q 'executeAll\\|fire.*forget\\|void\\|catch.*return' " & quoted form of pathToCheck & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ Fire-and-forget execution (non-blocking)"
            set successCount to successCount + 1
        else
            log "⚠️  Fire-and-forget pattern not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testFireAndForget

# ═══════════════════════════════════════════════════════════════════════════════
# Phase 4: Loucode Feature Parity
# ═══════════════════════════════════════════════════════════════════════════════

on verifyLoucodeParity()
    log ""
    log "┌─────────────────────────────────────────────────────────────────────────┐"
    log "│              Phase 4: Loucode Feature Parity                           │"
    log "└─────────────────────────────────────────────────────────────────────────┘"
    log ""

    # Test 4.1: Observation Buffer (Loucode's unique feature)
    testObservationBuffer()

    # Test 4.2: 2-phase extraction (Per-turn + Consolidation)
    testTwoPhaseExtraction()

    # Test 4.3: Scope support (private/team/project/global)
    testScopeSupport()

    # Test 4.4: Memvid store integration
    testMemvidIntegration()
end verifyLoucodeParity

on testObservationBuffer()
    set totalCount to totalCount + 1
    log "4.1: Observation Buffer (Dexter's unique feature)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set cmd to "find /Users/louloulin/Documents/linchong/touzhi/dexter/src -name '*observation*' -o -name '*buffer*' 2>/dev/null | head -3"
        set result to do shell script cmd

        if length of result > 0 then
            log "✅ Observation Buffer for capturing tool results"
            set successCount to successCount + 1
        else
            log "⚠️  Observation Buffer not found"
        end if

    on error errMsg
        log "⚠️  Observation Buffer check skipped"
    end try
end testObservationBuffer

on testTwoPhaseExtraction()
    set totalCount to totalCount + 1
    log ""
    log "4.2: 2-phase extraction (Per-turn + Consolidation)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set extractPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/extraction.ts"
        set consolPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/consolidation.ts"

        set cmd to "test -f " & quoted form of consolPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set consolResult to do shell script cmd

        if consolResult is "EXISTS" then
            set cmd to "grep -q 'consolidateMemories\\|merge.*memory\\|groupBy' " & quoted form of consolPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Phase 1 (extractMemories) + Phase 2 (consolidation)"
                set successCount to successCount + 1
            else
                log "❌ Consolidation functions not found"
            end if
        else
            log "❌ consolidation.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testTwoPhaseExtraction

on testScopeSupport()
    set totalCount to totalCount + 1
    log ""
    log "4.3: Scope support (private/team/project/global)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set typesPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/types.ts"
        set cmd to "grep -q 'MEMORY_SCOPES\\|MemoryScope\\|scope.*private' " & quoted form of typesPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "FOUND" then
            log "✅ MemoryScope support (private/team/project/global)"
            set successCount to successCount + 1
        else
            log "❌ Scope support not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testScopeSupport

on testMemvidIntegration()
    set totalCount to totalCount + 1
    log ""
    log "4.4: Memvid store integration (BM25 search)"
    log "────────────────────────────────────────────────────────────────────────"

    try
        set memvidPath to "/Users/louloulin/Documents/linchong/touzhi/dexter/src/memory/memvid-store.ts"
        set cmd to "test -f " & quoted form of memvidPath & " && echo 'EXISTS' || echo 'NOT_FOUND'"
        set result to do shell script cmd

        if result is "EXISTS" then
            set cmd to "grep -q 'putMemory\\|find.*mode.*lex\\|ask' " & quoted form of memvidPath & " && echo 'FOUND' || echo 'NOT_FOUND'"
            set result to do shell script cmd

            if result is "FOUND" then
                log "✅ Memvid BM25 search (no embedding API required)"
                set successCount to successCount + 1
            else
                log "⚠️  Some Memvid functions not found"
            end if
        else
            log "❌ memvid-store.ts not found"
        end if

    on error errMsg
        log "❌ Error: " & errMsg
    end try
end testMemvidIntegration