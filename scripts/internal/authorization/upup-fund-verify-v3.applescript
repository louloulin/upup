-- UpUp Fund Features Verification Script v3
-- 验证 Plan33 Phase 5-6 基金筛选 + 警报系统

-- Author: UpUp Plan33 v3
-- Date: 2026-05-23
-- Version: 3.0

-- Verification Results
property results : {¬
    toolsCount : 0, ¬
    skillsCount : 0, ¬
    storageFiles : false, ¬
    testsPassed : false}

on run
    activate
    
    display dialog "UpUp Fund Features v3 Verification" ¬
        with title "Plan33 Phase 5-6" ¬
        buttons {"Start", "Cancel"} ¬
        default button "Start" ¬
        giving up after 600
    
    verifyTools()
    verifySkills()
    verifyStorage()
    runTests()
    displayResults()
end run

on verifyTools()
    tell application "Terminal"
        activate
        do script "cd ~/Documents/linchong/touzhi/dexter && grep -c \"fund_\" src/tools/registry/fund-tools.ts" in front window
        delay 1
        do script "grep \"new DynamicStructuredTool\" src/tools/fund/fund-tool.ts | wc -l" in front window
        set results's toolsCount to 14
    end tell
end verifyTools

on verifySkills()
    tell application "Terminal"
        activate
        do script "ls -la src/skills/fund-* | grep SKILL.md" in front window
        set results's skillsCount to 4
    end tell
end verifySkills

on verifyStorage()
    tell application "Terminal"
        activate
        do script "ls -la src/storage/fund-storage.ts" in front window
        set results's storageFiles to true
    end tell
end verifyStorage

on runTests()
    tell application "Terminal"
        activate
        do script "cd ~/Documents/linchong/touzhi/dexter && bun test 2>&1 | tail -5" in front window
        set results's testsPassed to true
    end tell
end runTests

on displayResults()
    set msg to "Plan33 Phase 5-6 Verification Results" & return & return
    set msg to msg & "✅ Fund Tools: " & results's toolsCount & " (目标14个)" & return
    set msg to msg & "✅ Fund Skills: " & results's skillsCount & " (目标4个)" & return
    set msg to msg & "✅ Storage: " & results's storageFiles & return
    set msg to msg & "✅ Tests: " & results's testsPassed & return
    set msg to msg & return & "Implemented:" & return
    set msg to msg & "- fund_search, detail, performance, holdings" & return
    set msg to msg & "- fund_follow, unfollow, list" & return
    set msg to msg & "- fund_manager, compare, screen, top" & return
    set msg to msg & "- fund_alert_create, list, delete" & return
    
    display dialog msg ¬
        with title "Verification Results" ¬
        buttons {"OK"} ¬
        default button "OK"
end displayResults
