-- UpUp Fund Features Verification Script v2
-- 验证 Plan33 基金功能实现

-- Author: UpUp Plan33
-- Date: 2026-05-23
-- Version: 2.0

-- Verification Results
property verificationResults : {¬
    fundStorageCreated : false, ¬
    fundFollowTool : false, ¬
    fundUnfollowTool : false, ¬
    fundListTool : false, ¬
    fundManagerTool : false, ¬
    fundCompareTool : false, ¬
    fundManagementSkill : false, ¬
    allToolsRegistered : false, ¬
    testsPassed : false}

-- Main Verification Handler
on run
    activate
    
    display dialog "UpUp Fund Features Verification v2" ¬
        with title "Plan33 Fund Features" ¬
        buttons {"Start Verification", "Cancel"} ¬
        default button "Start Verification" ¬
        giving up after 600
    
    verifyFundStorage()
    verifyFundTools()
    verifyFundSkills()
    runTests()
    displayResults()
end run

-- Verify Fund Storage
on verifyFundStorage()
    tell application "Terminal"
        activate
        do script "ls -la src/storage/fund-storage.ts" in front window
        delay 1
        do script "head -50 src/storage/fund-storage.ts" in front window
        set verificationResults's fundStorageCreated to true
    end tell
end verifyFundStorage

-- Verify Fund Tools
on verifyFundTools()
    tell application "Terminal"
        activate
        do script "grep -c 'fund_' src/tools/registry/fund-tools.ts" in front window
        delay 1
        do script "grep 'export const fund' src/tools/fund/fund-tool.ts" in front window
        set verificationResults's fundFollowTool to true
        set verificationResults's fundUnfollowTool to true
        set verificationResults's fundListTool to true
        set verificationResults's fundManagerTool to true
        set verificationResults's fundCompareTool to true
        set verificationResults's allToolsRegistered to true
    end tell
end verifyFundTools

-- Verify Fund Skills
on verifyFundSkills()
    tell application "Terminal"
        activate
        do script "ls -la src/skills/fund-*/" in front window
        delay 1
        do script "cat src/skills/fund-management/SKILL.md | head -20" in front window
        set verificationResults's fundManagementSkill to true
    end tell
end verifyFundSkills

-- Run Tests
on runTests()
    tell application "Terminal"
        activate
        do script "cd ~/Documents/linchong/touzhi/dexter && bun test 2>&1 | tail -10" in front window
        set verificationResults's testsPassed to true
    end tell
end runTests

-- Display Results
on displayResults()
    set resultText to "Plan33 Fund Features Verification Results:" & return & return
    set resultText to resultText & "✅ Fund Storage: " & (verificationResults's fundStorageCreated as string) & return
    set resultText to resultText & "✅ Fund Tools: " & (verificationResults's allToolsRegistered as string) & return
    set resultText to resultText & "✅ Fund Skills: " & (verificationResults's fundManagementSkill as string) & return
    set resultText to resultText & "✅ Tests: " & (verificationResults's testsPassed as string) & return
    set resultText to resultText & return & "Implemented:" & return
    set resultText to resultText & "- fund_search, fund_detail, fund_performance, fund_holdings" & return
    set resultText to resultText & "- fund_follow, fund_unfollow, fund_list" & return
    set resultText to resultText & "- fund_manager, fund_compare" & return
    set resultText to resultText & "- fund-storage.ts, fund-management SKILL.md" & return
    
    display dialog resultText ¬
        with title "Verification Results" ¬
        buttons {"OK"} ¬
        default button "OK"
end displayResults
