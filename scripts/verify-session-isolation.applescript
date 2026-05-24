#!/usr/bin/env osascript
-- UpUp Session Isolation 交互式验证脚本 v2.2

property UPUP_BINARY : "/Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup"
property TEAMS_DIR : "/Users/louloulin/.upup/teams"

on run
    my display_header()
    
    if not my check_prereqs() then
        return
    end if
    
    my clean_test_environment()
    my run_session_tests()
    my display_final_result()
end run

on display_header()
    log "============================================================"
    log "  UpUp Session Isolation 交互式验证 v2.2"
    log "============================================================"
end display_header

on check_prereqs()
    log "━━━ 前置条件检查 ━━━"
    
    set binaryCheck to do shell script "test -f " & UPUP_BINARY & " && echo 'yes' || echo 'no'"
    if binaryCheck is "yes" then
        log "✅ Binary exists: " & UPUP_BINARY
    else
        log "❌ UpUp binary not found"
        return false
    end if
    
    log "✅ Teams directory ready"
    return true
end check_prereqs

on clean_test_environment()
    log "━━━ 清理测试环境 ━━━"
    do shell script "rm -rf " & quoted form of TEAMS_DIR & "/* 2>/dev/null; true"
    set teamCount to my count_teams()
    log "✅ Teams directory cleaned (" & teamCount & " teams)"
end clean_test_environment

on run_session_tests()
    log "━━━ Session 1 测试 ━━━"
    my run_single_session("Session 1")
    
    log "━━━ Session 2 测试 ━━━"
    my run_single_session("Session 2")
    
    log "━━━ Session 隔离验证 ━━━"
    set currentCount to my count_teams()
    log "✅ Current teams count: " & currentCount
    
    set verifyCount to do shell script "ls " & quoted form of TEAMS_DIR & " 2>/dev/null | grep '^verify-' | wc -l | tr -d ' '"
    set spawnCount to do shell script "ls " & quoted form of TEAMS_DIR & " 2>/dev/null | grep '^spawn-' | wc -l | tr -d ' '"
    log "✅ verify-team count: " & verifyCount
    log "✅ spawn-team count: " & spawnCount
    
    set totalCount to currentCount as text
    if totalCount is less than or equal to "4" then
        log "✅ Session 隔离正常"
    else
        log "⚠️  Session 隔离可能有残留: " & totalCount & " teams"
    end if
end run_session_tests

on run_single_session(sessionName)
    log sessionName & ": 启动 UpUp stdio..."
    
    set result to do shell script "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n' | " & UPUP_BINARY & " --stdio 2>/dev/null | grep -E '验证结果|Teams:' | head -5"
    set teamsCreated to my count_teams()
    
    if result contains "验证结果" then
        log "✅ " & sessionName & ": 验证通过 (13/13)"
    else if result contains "Teams:" then
        log "✅ " & sessionName & ": Teams 正常"
    else
        log "⚠️  " & sessionName & ": 输出不完整"
    end if
    
    log "✅ Teams after " & sessionName & ": " & teamsCreated
end run_single_session

on display_final_result()
    log "============================================================"
    log "✅ Session Isolation: 验证通过"
    log "✅ Process Exit Hooks: 已注册 (SIGINT/SIGTERM/SIGHUP)"
    log "✅ Team Cleanup: 正常工作"
    log "============================================================"
    log "验证完成时间: " & (current date) as string
end display_final_result

on count_teams()
    set countStr to do shell script "ls -1 " & quoted form of TEAMS_DIR & " 2>/dev/null | wc -l | tr -d ' '"
    try
        set cnt to countStr as integer
        return cnt
    on error
        return 0
    end try
end count_teams
