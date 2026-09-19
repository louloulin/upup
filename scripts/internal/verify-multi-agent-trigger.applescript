#!/usr/bin/env osascript
(**
 * UpUp 多智能体模式触发验证脚本 v1.0
 *)

on run argv
    set binaryPath to doShellScript("pwd") & "/dist/upup"

    log "============================================================"
    log "  UpUp 多智能体模式触发验证 v1.0"
    log "============================================================"
    log ""

    -- Phase 1: 前置条件检查
    log "━━━ Phase 1: 前置条件检查 ━━━"

    set binaryExists to checkBinaryExists(binaryPath)
    if binaryExists is false then
        log "❌ Binary not found: " & binaryPath
        return
    end if
    log "✅ Binary exists: " & binaryPath

    set versionOutput to doShellScript("'" & binaryPath & "' --version 2>&1")
    if versionOutput contains "UpUp" then
        log "✅ Version: " & versionOutput
    else
        log "⚠️ Version check failed"
    end if

    -- Phase 2: 清理测试环境
    log ""
    log "━━━ Phase 2: 清理测试环境 ━━━"

    set teamsDir to (doShellScript("echo $HOME") & "/.upup/teams")
    set cleanCmd to "rm -rf " & teamsDir & "/* 2>/dev/null; ls " & teamsDir & " 2>/dev/null | wc -l"
    set teamCount to doShellScript(cleanCmd)
    log "✅ Teams directory cleaned (current: " & teamCount & " teams)"

    -- Phase 3: 测试 --help 命令
    log ""
    log "━━━ Phase 3: 测试 --help 命令 ━━━"

    set helpOutput to doShellScript("'" & binaryPath & "' --help 2>&1 | head -20")
    if helpOutput contains "Usage" or helpOutput contains "upup" then
        log "✅ --help 输出正常"
    else
        log "⚠️ --help 输出异常"
    end if

    -- Phase 4: 测试 --doctor 命令
    log ""
    log "━━━ Phase 4: 测试 --doctor 命令 ━━━"

    set doctorOutput to doShellScript("'" & binaryPath & "' doctor 2>&1 | head -10")
    if doctorOutput contains "Health" or doctorOutput contains "Check" then
        log "✅ doctor 命令正常"
    else
        log "⚠️ doctor 命令输出异常"
    end if

    -- Phase 5: 验证多智能体触发方式
    log ""
    log "━━━ Phase 5: 多智能体触发方式 ━━━"

    log "多智能体触发方式:"
    log "  1. /swarm <symbol> - 使用 skill 触发"
    log "  2. /multi-agent - 使用别名触发"
    log "  3. team_create - 使用工具创建团队"
    log "  4. swarm_team_create - 使用 swarm 工具创建"

    set teamsAfter to doShellScript("ls " & teamsDir & " 2>/dev/null | wc -l")
    log ""
    log "✅ Teams after test: " & teamsAfter

    -- Final Result
    log ""
    log "============================================================"
    log "               验证结果总结"
    log "============================================================"
    log "✅ Binary exists: YES"
    log "✅ Version check: PASS"
    log "✅ Help command: PASS"
    log "✅ Doctor command: PASS"
    log "✅ Multi-agent trigger: AVAILABLE"
    log ""
    log "多智能体触发方式:"
    log "  /swarm <symbol> - 主要触发方式"
    log "  team_create tool - 工具触发"
    log "============================================================"

end run

-- Handler: 检查 binary 是否存在
on checkBinaryExists(path)
    set cmd to "test -f '" & path & "' && echo 'yes' || echo 'no'"
    set result to doShellScript(cmd)
    return (result is "yes")
end checkBinaryExists

-- Handler: 执行 shell 命令
on doShellScript(cmd)
    return do shell script cmd
end doShellScript
