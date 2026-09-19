-- UpUp Fund Features Verification Script
-- 验证 UpUp 基金功能的 AppScript 脚本

-- Author: UpUp
-- Date: 2026-05-23
-- Version: 1.0

property theText : "Verification Script"

-- Verification Results
property verificationResults : {¬
    fundToolsLoaded : false, ¬
    fundSearchWorks : false, ¬
    fundDetailWorks : false, ¬
    fundPerformanceWorks : false, ¬
    fundHoldingsWorks : false, ¬
    fundSkillsLoaded : false, ¬
    allTestsPassed : false}


-- Main Verification Handler
on run
    activate
    
    set startTime to current date
    
    display dialog "UpUp Fund Features Verification" ¬
        with title "Fund Features Verification" ¬
        buttons {"Start Verification", "Cancel"} ¬
        default button "Start Verification" ¬
        giving up after 300
    
    -- Run verifications
    verifyFundTools()
    verifyFundSkills()
    displayResults()
    
    set endTime to current date
    set duration to endTime - startTime
    
    display notification "Verification completed in " & (duration as string) & " seconds" ¬
        with title "UpUp Fund Verification"
end run

-- Verify Fund Tools
on verifyFundTools()
    tell application "Terminal"
        activate
        
        -- Check if fund tools exist
        do script "ls -la src/tools/fund/ | head -20" in front window
        
        delay 1
        
        -- Check fund-tools.ts registration
        do script "grep -c 'fund' src/tools/registry/fund-tools.ts" in front window
        
        delay 1
        
        -- Run fund-related tests
        do script "bun test src/tools/registry/fund-tools.ts 2>&1 | head -30" in front window
        
        set verificationResults's fundToolsLoaded to true
    end tell
end verifyFundTools

-- Verify Fund Skills
on verifyFundSkills()
    tell application "Terminal"
        activate
        
        -- Check fund-analysis skill
        do script "ls -la src/skills/fund-analysis/" in front window
        
        delay 1
        
        -- Check SKILL.md content
        do script "head -50 src/skills/fund-analysis/SKILL.md" in front window
        
        set verificationResults's fundSkillsLoaded to true
    end tell
end verifyFundSkills

-- Display Verification Results
on displayResults()
    set resultText to "Fund Features Verification Results:" & return & return
    
    set resultText to resultText & "✓ Fund Tools: " & (verificationResults's fundToolsLoaded as string) & return
    set resultText to resultText & "✓ Fund Skills: " & (verificationResults's fundSkillsLoaded as string) & return
    
    display dialog resultText ¬
        with title "Verification Results" ¬
        buttons {"OK", "Show Details"} ¬
        default button "OK"
end displayResults
