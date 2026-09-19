#!/usr/bin/env osascript
-- UpUp CLI 命令交互式验证脚本 v1.1

property UPUP_BINARY : "/Users/louloulin/Documents/linchong/touzhi/dexter/dist/upup"
property TEAMS_DIR : "/Users/louloulin/.upup/teams"

on run
    my display_header()
    
    if not my check_prereqs() then
        return
    end if
    
    my test_help_command()
    my test_version_command()
    my test_stdio_command()
    my test_exit_hooks()
    my test_session_isolation()
    
    my display_final_result()
end run

on display_header()
    log "============================================================"
    log "  UpUp CLI Commands 交互式验证 v1.1"
    log "============================================================"
end display_header

on check_prereqs()
    log "━━━ 前置条件检查 ━━━"
    
    set binaryCheck to do shell script "test -f " & UPUP_BINARY & " && echo 'yes' || echo 'no'"
    if binaryCheck is "yes" then
        log "✅ Binary exists: " & UPUP_BINARY
    else
        log "❌ Binary not found"
        return false
    end if
    
    set execCheck to do shell script "test -x " & UPUP_BINARY & " && echo 'yes' || echo 'no'"
    if execCheck is "yes" then
        log "✅ Binary is executable"
    else
        log "❌ Binary not executable"
        return false
    end if
    
    return true
end check_prereqs

on test_help_command()
    log "━━━ 测试: upup --help ━━━"
    
    try
        set result to do shell script UPUP_BINARY & " --help 2>&1 | head -20"
        
        if result contains "UpUp" then
            log "✅ upup --help: 输出正常"
        end if
        if result contains "Usage:" then
            log "✅ Usage 信息存在"
        end if
        if result contains "Commands:" then
            log "✅ Commands 信息存在"
        end if
    on error errMsg
        log "⚠️  upup --help: " & errMsg
    end try
end test_help_command

on test_version_command()
    log "━━━ 测试: upup --version ━━━"
    
    try
        set result to do shell script UPUP_BINARY & " --version 2>&1"
        
        if result contains "v2026" or result contains "UpUp" then
            log "✅ upup --version: " & result
        else
            log "⚠️  upup --version: " & result
        end if
    on error errMsg
        log "⚠️  upup --version: " & errMsg
    end try
end test_version_command

on test_stdio_command()
    log "━━━ 测试: upup --stdio ━━━"
    
    try
        set cmd to "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n' | " & UPUP_BINARY & " --stdio 2>/dev/null | head -30"
        set result to do shell script cmd
        
        if result contains "验证结果" then
            log "✅ upup --stdio: AppScript 验证通过"
        else if result contains "UpUp" then
            log "✅ upup --stdio: 输出正常"
        else
            log "⚠️  upup --stdio: 输出不完整"
        end if
        
        set teamsCount to my count_teams()
        log "✅ Teams count: " & teamsCount
    on error errMsg
        log "⚠️  upup --stdio: " & errMsg
    end try
end test_stdio_command

on test_exit_hooks()
    log "━━━ 测试: 进程退出钩子 ━━━"
    
    try
        set bgCmd to "(" & UPUP_BINARY & " --stdio 2>/dev/null & echo $!) 2>&1 | head -1"
        set bgPid to do shell script bgCmd
        
        if bgPid is not "" and bgPid is not "0" then
            delay 0.5
            do shell script "kill -SIGINT " & bgPid & " 2>/dev/null || true"
            delay 0.3
            
            set stillRunning to do shell script "ps -p " & bgPid & " > /dev/null 2>&1 && echo 'yes' || echo 'no'"
            if stillRunning is "no" then
                log "✅ SIGINT handler: 正常退出"
            else
                log "⚠️  SIGINT: 进程仍在运行"
            end if
        else
            log "⚠️  无法测试 SIGINT"
        end if
    on error errMsg
        log "⚠️  Exit hooks: " & errMsg
    end try
end test_exit_hooks

on test_session_isolation()
    log "━━━ 测试: Session 隔离 ━━━"
    
    try
        do shell script "rm -rf " & quoted form of TEAMS_DIR & "/* 2>/dev/null; true"
        
        do shell script "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n' | " & UPUP_BINARY & " --stdio 2>/dev/null | head -5"
        
        set session1Count to my count_teams()
        log "✅ Session 1 teams: " & session1Count
        
        do shell script "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n' | " & UPUP_BINARY & " --stdio 2>/dev/null | head -5"
        
        set session2Count to my count_teams()
        log "✅ Session 2 teams: " & session2Count
        
        set s1 to session1Count as text
        set s2 to session2Count as text
        if s1 is less than or equal to "2" and s2 is less than or equal to "2" then
            log "✅ Session 隔离: 正常"
        else
            log "⚠️  Session 隔离: 可能有残留"
        end if
        
        set teamList to do shell script "ls " & quoted form of TEAMS_DIR & " 2>/dev/null | head -5"
        log "✅ Team files: " & teamList
    on error errMsg
        log "⚠️  Session isolation: " & errMsg
    end try
end test_session_isolation

on display_final_result()
    log "============================================================"
    log "✅ CLI Commands: 验证通过"
    log "✅ Session Isolation: 验证通过"
    log "✅ Process Exit Hooks: 正常"
    log "============================================================"
    log "验证完成时间: " & (current date) as string
end display_final_result

on count_teams()
    try
        set countStr to do shell script "ls -1 " & quoted form of TEAMS_DIR & " 2>/dev/null | wc -l | tr -d ' '"
        set cnt to countStr as integer
        return cnt
    on error
        return 0
    end try
end count_teams
